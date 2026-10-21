const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = ['gpu-scene.js','gpu-presentation.js'].map(file=>fs.readFileSync(path.join(__dirname, '../src/content/',file),'utf8')).join('\n');
const flush = () => new Promise(resolve => setImmediate(resolve));

async function harness() {
  const failures = [], pendingFrames = [], uploads = [], rasterText = [], writes = [], profiles = [], secondaryColors = [];
  const noop = () => {};
  const device = {
    lost: new Promise(() => {}), addEventListener: noop, destroy: noop,
    limits: { maxTextureDimension2D: 8192 },
    createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [] }) }),
    pushErrorScope: noop, popErrorScope: async () => null,
    createRenderPipelineAsync: async () => ({ getBindGroupLayout: noop }),
    createSampler: noop, createBindGroup: noop,
    createTexture: () => ({ createView: noop, destroy: noop }),
    createBuffer: () => ({ destroy: noop }),
    queue: { copyExternalImageToTexture: value => uploads.push(value), writeBuffer: (buffer, offset, values) => writes.push({ buffer, values, snapshot: Array.from(values) }), submit: noop },
    createCommandEncoder: () => ({
      beginRenderPass: () => ({ setPipeline: noop, setBindGroup: noop, draw: noop, end: noop }), finish: noop,
    }),
  };
  const gpuContext = { configure: noop, unconfigure: noop, getCurrentTexture: () => ({ createView: noop }) };
  const container = { offsetWidth: 800, offsetHeight: 600, appendChild: noop, dataset: {}, classList: { contains: () => false } };
  const context = {
    AbortController,
    navigator: { gpu: { requestAdapter: async () => ({ requestDevice: async () => device }), getPreferredCanvasFormat: () => 'rgba8unorm' } },
    document: { createElement: () => ({ style: {}, getContext: () => gpuContext, remove: noop }) },
    window: { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) },
    getComputedStyle: () => ({ getPropertyValue: () => 'sans-serif' }),
    GPUTextureUsage: {}, GPUBufferUsage: {},
    OffscreenCanvas: class {
      constructor(width, height) { this.width = width; this.height = height; }
      transferToImageBitmap() {return {width:this.width,height:this.height,close:noop};}
      getContext() {
        return {
          measureText: value => ({ width: value.length * 8, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 4 }),
          scale: noop, fillText: value => rasterText.push(value),
          clearRect: noop, fillRect: noop, getImageData() { return { data: [...(/^#[0-9a-f]{6}$/i.test(this.fillStyle) ? this.fillStyle : '#abcdef').slice(1).match(/../g).map(x => parseInt(x, 16)), 255] }; },
        };
      }
    },
    DANMAKU_USERNAME_EFFECTS: { getSecondaryColor: () => '#ffffff' },
    DANMAKU_GPU_MEDIA: {
      async open() {
        return {
          width: 24, height: 24, close: noop,
          frame(elapsed) {
            if (!elapsed) return Promise.resolve({});
            return new Promise((resolve, reject) => pendingFrames.push({ resolve, reject }));
          },
        };
      },
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/content/username-effects.js'), 'utf8') + '\nglobalThis.effects = DANMAKU_USERNAME_EFFECTS;', context);
  const getProfile = context.effects.getProfile.bind(context.effects);
  const getSecondaryColor = context.effects.getSecondaryColor.bind(context.effects);
  context.effects.getProfile = (...args) => { profiles.push(args); return getProfile(...args); };
  context.effects.getSecondaryColor = (...args) => { secondaryColors.push(args); return getSecondaryColor(...args); };
  vm.runInNewContext(source + '\nglobalThis.api = DANMAKU_GPU_SCENE(DANMAKU_GPU_MEDIA,DANMAKU_USERNAME_EFFECTS);globalThis.raster = DANMAKU_GPU_RASTER;', context);
  const session = await context.api.create({getContext:()=>gpuContext}, error => failures.push(error),{emberUrl:'ember.webp'});
  const prepare=session.prepare;
  session.prepare=async content=>prepare(await context.raster.prepare(content,{fontFamily:'sans-serif',dpr:1,maxDimension:8192,reserve:noop,check:noop}));
  const content = { fontSize: 24, opacity: 1, runs: [{ type: 'image', src: 'emote.gif' }] };
  const layout = await session.prepare(content);
  const record = { content, layout, elapsedMs: 500, durationMs: 10000, width: layout.width, mode: 'scroll', top:0, lane: { index: 0 } };
  return { session, record, context, container, writes, profiles, secondaryColors, failures, pendingFrames, uploads, rasterText, draw: () => session.draw([record], {width:800,height:600,dpr:1,reduced:context.window.matchMedia().matches,suppress:container.classList.contains()}) };
}

for (const closed of [true, false]) {
  test(`pending media rejection ${closed ? 'after layout removal is ignored' : 'on an active layout reports failure'}`, async () => {
    const h = await harness();
    h.draw();
    assert.equal(h.pendingFrames.length, 1);
    if (closed) h.record.layout.close();
    const error = new Error('decoder closed during pending frame');
    h.pendingFrames[0].reject(error);
    await flush();
    assert.deepEqual(h.failures, closed ? [] : [error]);
    h.session.destroy();
  });
}

test('pending media success after layout removal does not upload a released texture', async () => {
  const h = await harness();
  h.draw();
  h.record.layout.close();
  const uploadCount = h.uploads.length;
  h.pendingFrames[0].resolve({});
  await flush();
  assert.equal(h.uploads.length, uploadCount);
  assert.deepEqual(h.failures, []);
  h.session.destroy();
});

for (const effect of ['duotoneFlow', 'duotoneEmber', 'duotoneGlitch', 'none']) {
  test(`username preserves inline spacing and effect bounds for ${effect}`, async () => {
    const h = await harness();
    const run = { type: 'text', value: 'Aurora: ', username: 'Aurora', effect, weight: 700 };
    const content = { fontSize: 24, runs: [run, { type: 'text', value: 'hello' }] };
    const layout = await h.session.prepare(content);
    const trimmed = await h.session.prepare({ ...content, runs: [{ ...run, value: 'Aurora:' }, content.runs[1]] });
    const spaceWidth = 8;
    assert.equal(layout.width, trimmed.width + spaceWidth);
    assert.equal(layout.items[0].glyphWidth, trimmed.items[0].glyphWidth + (effect === 'none' ? spaceWidth : 0));
    assert.equal(layout.items[1].x, trimmed.items[1].x + spaceWidth);
    assert.equal(h.rasterText[0], effect === 'none' ? 'Aurora: ' : 'Aurora:');
    h.session.destroy();
  });
}

const close = (actual, expected) => assert.equal(actual, Math.fround(expected));
for (const effect of ['duotoneFlow', 'duotoneEmber', 'duotoneGlitch']) {
  test(`${effect} uniforms preserve timelines, mode changes, traffic effects, and reduced motion`, async () => {
    const h = await harness();
    const run = { type: 'text', value: 'Aurora:', username: 'Aurora', color: '#804020', effect };
    const content = { fontSize: 24, opacity: .7, mode: 'scroll', runs: [run] };
    const layout = await h.session.prepare(content);
    Object.assign(h.record, { content, layout, width: layout.width, xLeft: 120 });
    const colorsAfterPrepare = h.secondaryColors.length;
    let firstValues;
    for (const mode of ['scroll', 'reverse', 'drift', 'popFade', 'slideUp']) {
      h.record.mode = mode;
      for (const elapsed of [0, 189, 216, 297, 1000, 2200, 8100, 9100, 10000]) {
        h.record.elapsedMs = elapsed;
        const t = h.context.api.effectTime(run, mode, elapsed, false);
        h.draw();
        const write = h.writes.at(-1), v = write.snapshot;
        firstValues ||= write.values;
        assert.equal(write.values, firstValues);
        assert.equal(v[16], ['duotoneFlow', 'duotoneEmber', 'duotoneGlitch'].indexOf(effect) + 1);
        if (effect === 'duotoneFlow') close(v[17], t.flow);
        if (effect === 'duotoneEmber') close(v[18], t.ember);
        if (effect === 'duotoneGlitch') [...t.upper, ...t.lower].forEach((value, i) => close(v[20+i], value));
        const m = h.context.api.motion(h.record, 800, 24), item = layout.items[0];
        close(v[0], m.x + layout.width * (1-m.scale)/2 + item.x*m.scale);
        close(v[1], m.y + layout.height * (1-m.scale)/2 + item.y*m.scale);
        close(v[6], m.opacity*.7);
      }
    }
    assert.equal(h.secondaryColors.length, colorsAfterPrepare);
    const cachedCalls = h.profiles.length;
    h.draw();h.draw();assert.equal(h.profiles.length, cachedCalls);
    h.record.mode = 'reverse';h.draw();assert.equal(h.profiles.length, cachedCalls + 1);
    h.context.window.matchMedia = () => ({ matches: true });h.draw();
    let v = h.writes.at(-1).snapshot;
    if (effect === 'duotoneFlow') assert.equal(v[17], .5);
    if (effect === 'duotoneEmber') assert.equal(v[18], .5);
    assert.deepEqual(v.slice(20,24), [0,0,0,0]);
    h.container.classList.contains = () => true;h.draw();v = h.writes.at(-1).snapshot;
    assert.equal(v[16], ['duotoneFlow', 'duotoneEmber', 'duotoneGlitch'].indexOf(effect) + 1);
    [128/255,64/255,32/255].forEach((value, i) => close(v[8+i], value));
    h.record.favorite = true;h.draw();v = h.writes.at(-1).snapshot;
    assert.ok(v[16] > 0);assert.equal(v[11], 1);
    h.session.destroy();
  });
}

test('plain text and image draws skip username profile and secondary color work', async () => {
  const h = await harness();h.draw();
  const content = { fontSize: 24, opacity: 1, runs: [{ type: 'text', value: 'hello', effect: 'none' }] };
  const layout = await h.session.prepare(content);
  Object.assign(h.record, { content, layout });h.draw();h.draw();
  assert.deepEqual(h.profiles, []);assert.deepEqual(h.secondaryColors, []);
  assert.equal(h.writes.at(-1).snapshot[16], 0);
  h.session.destroy();
});


test('transferred SVG image uploads once and keeps image alignment without an animation decoder',async()=>{
  const h=await harness();let closed=0;
  const bitmap={width:101,height:51,close(){closed++;}};
  h.context.DANMAKU_GPU_MEDIA.open=async()=>{throw new Error('Unexpected image decoder');};
  const content={fontSize:24,opacity:1,runs:[{type:'image',src:'rasterized',bitmap,width:67.2,height:33.6}]};
  const layout=await h.session.prepare(content);
  assert.equal(closed,1);assert.equal(layout.width,71.2);assert.equal(layout.items[0].width,67.2);assert.equal(layout.items[0].height,33.6);
  assert.equal(layout.items[0].media,null);assert.equal(h.uploads.at(-1).source,bitmap);
  const before=h.uploads.length;
  h.record.layout=layout;h.draw();await flush();
  assert.equal(h.uploads.length,before);assert.equal(h.pendingFrames.length,0);
  layout.close();assert.equal(closed,1);h.session.destroy();
});
