const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/content/gpu-media.js'), 'utf8');

function harness({ durations = [100000, 200000, 300000], repetitions = Infinity, width = 24, bytes = Buffer.from('GIF89a'), type = 'image/gif', preferAnimation = true, supported = true, stallDecode } = {}) {
  const frames = [];
  const decoders = [];
  const requests = [];
  class ImageDecoder {
    static async isTypeSupported(actual) { assert.equal(actual, type); return supported; }
    constructor(options) {
      assert.equal(options.type, type);
      assert.deepEqual(Buffer.from(options.data), bytes);
      assert.equal(options.preferAnimation, preferAnimation);
      this.tracks = { ready: Promise.resolve(), selectedTrack: { frameCount: durations.length, repetitionCount: repetitions } };
      this.closed = 0;
      decoders.push(this);
    }
    async decode({ frameIndex, completeFramesOnly }) {
      assert.equal(completeFramesOnly, true);
      if (stallDecode) await stallDecode(frameIndex);
      const frame = { index: frameIndex, displayWidth: width, displayHeight: 24, duration: durations[frameIndex], closed: 0, close() { this.closed++; } };
      frames.push(frame);
      return { complete: true, image: frame };
    }
    close() { this.closed++; }
  }
  const context = { ImageDecoder, DOMException, fetch: async (url, options) => { requests.push(options); return new Response(bytes); } };
  vm.runInNewContext(source, context);
  return { api: context.DANMAKU_GPU_MEDIA, frames, decoders, requests };
}

test('actual variable durations, loop boundaries, and backwards seeks select composited frames', async () => {
  const h = harness();
  const media = await h.api.open('https://cdn.example/emote');
  assert.equal(media.width, 24);
  for (const [time, index] of [[0, 0], [99, 0], [100, 1], [299, 1], [300, 2], [599, 2], [600, 0], [800, 1], [0, 0]]) {
    const frame = await media.frame(time);
    assert.equal(frame.index, index);
    assert.equal(frame.closed, 0);
    assert.ok(h.frames.filter(frame => !frame.closed).length <= 2);
  }
  assert.equal(h.requests[0].credentials, 'omit');
  assert.equal(h.requests[0].mode, 'cors');
  media.close(); media.close();
  assert.ok(h.frames.every(frame => frame.closed === 1));
  assert.equal(h.decoders[0].closed, 1);
  await assert.rejects(media.frame(1), { name: 'AbortError' });
});

test('finite repetition counts include the first play and retain the final frame', async () => {
  const h = harness({ repetitions: 1 });
  const media = await h.api.open('image');
  assert.equal((await media.frame(600)).index, 0);
  assert.equal((await media.frame(1200)).index, 2);
  assert.equal((await media.frame(999999)).index, 2);
  media.close();
});

test('static image does not require animation duration or repetition metadata', async () => {
  const h = harness({ durations: [null], repetitions: undefined });
  const media = await h.api.open('image');
  assert.equal((await media.frame(50000)).index, 0);
  media.close();
});

test('short animation durations match HTML image timing and infinite loops', async () => {
  const h = harness({ durations: [0, 10000, 10001] });
  const media = await h.api.open('image');
  for (const [time, index] of [[0, 0], [99.999, 0], [100, 1], [199.999, 1], [200, 2], [210, 2], [210.001, 0], [310.002, 1], [0, 0]]) {
    assert.equal((await media.frame(time)).index, index, `frame at ${time}ms`);
  }
  media.close();
  assert.ok(h.frames.every(frame => frame.closed === 1));
});

test('clamped durations govern finite repetitions and the final frame', async () => {
  const h = harness({ durations: [0, 10000], repetitions: 1 });
  const media = await h.api.open('image');
  for (const [time, index] of [[199, 1], [200, 0], [299, 0], [300, 1], [400, 1], [999999, 1]]) {
    assert.equal((await media.frame(time)).index, index, `frame at ${time}ms`);
  }
  media.close();
});

for (const duration of [null, undefined, -1, NaN, Infinity, -Infinity]) {
  test(`invalid animation duration ${duration} fails and closes frames and decoder`, async () => {
    const h = harness({ durations: [100000, duration] });
    await assert.rejects(h.api.open('image'), /unknown animation frame duration/);
    assert.ok(h.frames.every(frame => frame.closed === 1));
    assert.equal(h.decoders[0].closed, 1);
  });
}

test('unsupported signatures and codecs cannot silently become static images', async () => {
  const unknown = harness({ bytes: Buffer.from('<svg/>') });
  await assert.rejects(unknown.api.open('image'), /unsupported image signature/);
  const codec = harness({ supported: false });
  await assert.rejects(codec.api.open('image'), /unsupported decoder/);
  assert.equal(codec.decoders.length, 0);
});

function fileType(major, compatible = [], { extended = false, version = '\0\0\0\0' } = {}) {
  const header = extended ? 16 : 8;
  const bytes = Buffer.alloc(header + 8 + compatible.length * 4);
  bytes.writeUInt32BE(extended ? 1 : bytes.length);
  bytes.write('ftyp', 4);
  if (extended) bytes.writeUInt32BE(bytes.length, 12);
  bytes.write(major + version + compatible.join(''), header, 'ascii');
  return bytes;
}

test('AVIF file type brands select the AVIF decoder for stills and animations', async () => {
  for (const [bytes, preferAnimation] of [
    [fileType('avif'), false], [fileType('avis'), true],
    [fileType('mif1', ['miaf', 'avif']), false],
    [fileType('msf1', ['miaf', 'avis']), true],
    [fileType('mif1', ['avif'], { extended: true }), false],
    [fileType('avif', ['avis']), true], [fileType('avis', ['avif']), true],
    [fileType('mif1', ['avif', 'avis']), true],
    [fileType('avif', [], { version: 'avis' }), false],
    [Buffer.concat([fileType('avif'), Buffer.from('avis')]), false],
  ]) {
    const h = harness({ bytes, type: 'image/avif', preferAnimation });
    const media = await h.api.open('https://cdn.example/emote.webp');
    assert.equal((await media.frame(100)).index, 1);
    media.close();
    assert.ok(h.frames.every(frame => frame.closed === 1));
  }
});

test('real still and animated AVIF bytes reach the decoder unchanged', async () => {
  for (const [name, durations, preferAnimation] of [['red.avif', [null], false], ['red-blue.avif', [100000, 200000], true]]) {
    const bytes = fs.readFileSync(require('node:path').join(__dirname, 'fixtures', name));
    const h = harness({ bytes, type: 'image/avif', durations, preferAnimation });
    const media = await h.api.open('image');
    assert.equal(media.byteLength, bytes.length);
    assert.equal((await media.frame(100)).index, durations.length - 1);
    media.close();
  }
});

test('AVIF sniffing rejects unrelated formats, malformed boxes and misplaced brands', async () => {
  const truncated = fileType('avif').subarray(0, 15);
  const oversized = fileType('avif');
  oversized.writeUInt32BE(4096);
  const misaligned = Buffer.concat([fileType('mif1', ['avif']), Buffer.from([0])]);
  misaligned.writeUInt32BE(misaligned.length);
  for (const bytes of [
    Buffer.from('<html>avif</html>'), Buffer.from('<svg>avis</svg>'),
    fileType('heic', ['mif1']), fileType('isom', ['mp41']),
    fileType('mif1', [], { version: 'avif' }),
    Buffer.concat([fileType('mif1'), Buffer.from('avif')]),
    truncated, oversized, misaligned,
  ]) {
    const h = harness({ bytes });
    await assert.rejects(h.api.open('image'), /unsupported image signature/);
    assert.equal(h.decoders.length, 0);
  }
});

test('unsupported AVIF decoder still fails explicitly', async () => {
  const h = harness({ bytes: fileType('avif'), type: 'image/avif', supported: false });
  await assert.rejects(h.api.open('image'), /unsupported decoder image\/avif/);
  assert.equal(h.decoders.length, 0);
});

test('byte and decoded pixel budgets reject oversized input', async () => {
  const bytes = harness({ bytes: Buffer.alloc(8 * 1024 * 1024 + 1) });
  await assert.rejects(bytes.api.open('image'), /byte budget/);
  const pixels = harness({ width: 200000 });
  await assert.rejects(pixels.api.open('image'), /pixel budget/);
  assert.ok(pixels.frames.every(frame => frame.closed === 1));
});

test('abort during decode disposes a late frame and decoder', async () => {
  let release;
  let started;
  const decoding = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const h = harness({ stallDecode: async () => { started(); await gate; } });
  const controller = new AbortController();
  const opening = h.api.open('image', { signal: controller.signal });
  await decoding;
  controller.abort(); release();
  await assert.rejects(opening, { name: 'AbortError' });
  assert.ok(h.frames.every(frame => frame.closed === 1));
  assert.equal(h.decoders[0].closed, 1);
});

test('close while a cache miss is decoding disposes late output', async () => {
  let calls = 0;
  let release;
  let started;
  const decoding = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const h = harness({ stallDecode: async () => {
    if (++calls > 3) { started(); await gate; }
  } });
  const media = await h.api.open('image');
  const loading = media.frame(350);
  await decoding;
  media.close(); release();
  await assert.rejects(loading, { name: 'AbortError' });
  assert.ok(h.frames.every(frame => frame.closed === 1));
  assert.equal(h.decoders[0].closed, 1);
});
