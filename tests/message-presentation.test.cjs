const nodeTest = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/content/message-presentation.js'), 'utf8');
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function element() {
  const properties = new Map([['--danmaku-effect-delay', '-2s']]);
  const style = { setProperty: (key, value) => properties.set(key, value), getPropertyValue: key => properties.get(key) };
  const inner = { style: {}, replaceChildren() {}, appendChild() {} };
  return { style, inner, removed: 0, remove() { this.removed++; }, querySelector(selector) { return selector === '.danmaku-drift-inner' ? inner : { style }; } };
}
function harness(requested = 'webgpu') {
  const settings = {renderer:requested,animationMode:'scroll',maxMessageLength:500,opacity:1};
  const starts = [], preparations = [], events = [], timers = new Map();
  let now = 1000, timerId = 0;
  const container = () => ({ dataset: {}, offsetWidth: 800, children: [], appendChild(el) { this.children.push(el); } });
  const renderer = { overlay: { container: container() }, activeMessages: [], messageQueue: [], _scheduleTick() {}, getFontSizePx: () => 24, isSelfMention: () => false, isFavorite: () => false, createMessageElement: () => element() };
  const context = {
    AbortController,
    DANMAKU_CONSTANTS: { STATIONARY_MODES: [] }, console: { warn() {} }, Date: { now: () => now },
    danmakuSettings: { get: key => settings[key] },
    window: { dispatchEvent: event => events.push(event.detail) }, CustomEvent: class { constructor(type, { detail }) { this.detail = detail; } },
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; }, clearTimeout: id => timers.delete(id),
    DANMAKU_GPU: { create(container, fail, {signal}) { const pending = deferred(); starts.push({ ...pending, container, fail, signal }); return pending.promise; } },
  };
  vm.runInNewContext(source + '\nglobalThis.Owner = DANMAKU_PRESENTATION.Owner;', context);
  const owner = new context.Owner(renderer);
  function session() {
    return { destroyed: 0, shown: 0, draws: [], geometry: () => '800x600@1', destroy() { this.destroyed++; }, show() { this.shown++; }, present(records) { this.draws.push(records); }, prepare(descriptor) { const pending = deferred(); preparations.push({ ...pending, descriptor }); return pending.promise; } };
  }
  function record() {
    const value = { message: {}, content: { runs: [] }, lane: 2, mode: 'drift', favorite: true, width: 150, xLeft: 120, elapsedMs: 1250, durationMs: 6000, element: element() };
    renderer.activeMessages.push(value); return value;
  }
  async function start() { owner.frame(); const gpu = session(); starts.at(-1).resolve(gpu); await flush(); return gpu; }
  const layout = () => ({ width: 150, closed: 0, close() { this.closed++; } });
  return { settings, owner, renderer, starts, preparations, events, timers, container, session, record, start, layout, advance: ms => { now += ms; } };
}

for (const requested of ['webgpu', 'auto']) {
const test = (name, run) => nodeTest(`${requested}: ${name}`, run);
for (const action of ['clear', 'destroy', 'select']) {
  test(`${action} invalidates GPU startup and disposes a late session`, async () => {
    const h = harness(requested); h.owner.frame();
    if (action === 'select') h.owner.select('dom'); else h.owner[action]();
    assert.equal(h.starts[0].signal.aborted, true);
    const gpu = h.session(); h.starts[0].resolve(gpu); await flush();
    assert.equal(gpu.destroyed, 1); assert.equal(h.owner.session, null);
    assert.equal(h.owner.state, action === 'destroy' ? 'destroyed' : 'dom');
    assert.equal(h.timers.size, 0);
  });
  test(`${action} closes a late prepared layout without reviving GPU`, async () => {
    const h = harness(requested); h.record(); const gpu = await h.start(); h.owner.frame();
    const ticket = [...h.owner.tickets.values()][0];
    if (action === 'select') h.owner.select('dom'); else h.owner[action]();
    const layout = h.layout(); h.preparations[0].resolve(layout); await flush();
    assert.equal(ticket.state, 'cancelled'); assert.equal(layout.closed, 1);
    assert.equal(gpu.destroyed, 1); assert.equal(h.owner.tickets.size, 0);
    assert.equal(h.owner.state, action === 'destroy' ? 'destroyed' : 'dom');
  });
}

test('migration retains all DOM records until every layout is ready, and preserves clocks on fallback', async () => {
  const h = harness(requested); const a = h.record(), b = h.record(); const original = [a.element, b.element];
  const gpu = await h.start(); h.owner.frame();
  h.preparations[0].resolve(h.layout()); await flush(); h.owner.frame();
  assert.equal(gpu.shown, 0); assert.ok(original.every(el => el.removed === 0));
  h.preparations[1].resolve(h.layout()); await flush(); h.owner.frame();
  assert.equal(gpu.shown, 1); assert.ok(original.every(el => el.removed === 1));
  assert.equal(a.element, null); assert.equal(gpu.draws[0][0].elapsedMs, 1250);
  h.owner.fail(new Error('device lost'));
  assert.equal(h.owner.state, 'failed'); assert.equal(gpu.destroyed, 1);
  assert.equal(a.element.style.animationDuration, '6000ms'); assert.equal(a.element.style.animationDelay, '-1250ms');
  assert.equal(a.element.inner.style.animationDelay, '-1250ms');
  assert.equal(a.element.style.getPropertyValue('--danmaku-effect-delay'), '-3.25s');
  assert.equal(a.element.style.getPropertyValue('--scroll-distance'), '950px');
  assert.equal(a.element.style.getPropertyValue('--xoffset'), '-205px');
  assert.equal(a.elapsedMs, 1250); assert.equal(h.events.at(-1).effective, 'dom');
  h.owner.frame(); assert.equal(h.starts.length, 1, 'failed backend must not retry every frame');
});

test('preparation rejection preserves visible DOM and prevents partial GPU migration', async () => {
  const h = harness(requested); const a = h.record(), b = h.record(); const original = [a.element, b.element];
  const gpu = await h.start(); h.owner.frame();
  h.preparations[0].reject(new Error('unsupported media')); await flush();
  const late = h.layout(); h.preparations[1].resolve(late); await flush();
  assert.equal(h.owner.state, 'failed'); assert.equal(gpu.shown, 0);
  assert.ok(original.every(el => el.removed === 0)); assert.equal(late.closed, 1);
  assert.equal(h.events.at(-1).effective, 'dom'); assert.match(h.events.at(-1).reason, /DOM/);
});

test('expired record preparation closes the result and does not resurrect the record', async () => {
  const h = harness(requested); h.record(); await h.start(); h.owner.frame();
  h.renderer.activeMessages = []; h.owner.frame();
  const late = h.layout(); h.preparations[0].resolve(late); await flush();
  assert.equal(late.closed, 1); assert.equal(h.owner.tickets.size, 0); assert.equal(h.renderer.activeMessages.length, 0);
});

test('media timeout falls back with content retained', async () => {
  const h = harness(requested); const record = h.record(); await h.start(); h.owner.frame();
  h.advance(10001); h.owner.frame();
  assert.equal(h.owner.state, 'failed'); assert.equal(record.element.removed, 0);
});

test('replacement container cancels startup targeting the detached overlay', async () => {
  const h = harness(requested); h.owner.frame(); h.renderer.overlay.container = h.container(); h.owner.frame();
  const stale = h.session(); h.starts[0].resolve(stale); await flush();
  assert.equal(stale.destroyed, 1); assert.equal(h.owner.session, null);
  const current = h.session(); h.starts[1].resolve(current); await flush(); h.owner.frame();
  assert.equal(current.shown, 1); assert.equal(h.owner.state, 'gpu');
});

test('a cancelled startup rejection cannot fail a later selected session', async () => {
  const h = harness(requested); h.owner.frame(); h.owner.select('dom'); h.owner.select(requested);
  const current = await h.start(); h.owner.frame();
  h.starts[0].reject(new Error('old startup')); await flush();
  assert.equal(h.owner.state, 'gpu'); assert.equal(current.destroyed, 0);
});

test('a disposed session error callback cannot destroy a later GPU session', async () => {
  const h = harness(requested); await h.start(); h.owner.frame();
  h.owner.select('dom'); h.owner.select(requested);
  const current = await h.start(); h.owner.frame();
  h.starts[0].fail(new Error('old device lost'));
  assert.equal(h.owner.state, 'gpu'); assert.equal(current.destroyed, 0);
});

test('missing GPU module keeps DOM content visible and reports fallback', async () => {
  const h = harness(requested); const record = h.record();
  const context = { AbortController, console: { warn() {} }, danmakuSettings: { get: () => requested }, window: { dispatchEvent() {} }, CustomEvent: class {}, setTimeout: () => 1, clearTimeout() {} };
  vm.runInNewContext(source + '\nglobalThis.Owner = DANMAKU_PRESENTATION.Owner;', context);
  const owner = new context.Owner(h.renderer);
  assert.doesNotThrow(() => owner.frame());
  await flush();
  assert.equal(owner.state, 'failed'); assert.equal(record.element.removed, 0);
  assert.equal(context.window.__danmakuRendererStatus.effective, 'dom');
});

test('geometry invalidation disposes layouts and restages retained records without resetting elapsed time', async () => {
  const h = harness(requested); const record = h.record(); const gpu = await h.start(); h.owner.frame();
  const oldLayout = h.layout(); h.preparations[0].resolve(oldLayout); await flush(); h.owner.frame();
  gpu.geometry = () => '1024x768@2'; h.owner.frame();
  assert.equal(gpu.destroyed, 1); assert.equal(oldLayout.closed, 1);
  assert.equal(h.owner.state, 'dom'); assert.equal(record.elapsedMs, 1250);
  assert.equal(record.element.style.animationDelay, '-1250ms');
  const replacement = await h.start(); replacement.geometry = () => '1024x768@2'; h.owner.frame();
  assert.equal(h.preparations.length, 2); assert.equal(record.element.removed, 0);
  h.preparations[1].resolve(h.layout()); await flush(); h.owner.frame();
  assert.equal(replacement.shown, 1); assert.equal(replacement.draws[0][0].elapsedMs, 1250);
});


test('settings invalidate ready and pending queue snapshots while retaining active identity and capacity', async () => {
  const h = harness(requested), record = h.record();
  const gpu = await h.start(); h.owner.frame();
  const activeLayout = h.layout(); h.preparations[0].resolve(activeLayout); await flush(); h.owner.frame();
  const activeTicket = h.owner.tickets.get(record.message), generation = h.owner.generation;
  h.renderer.messageQueue = Array.from({length:21}, () => ({text:'queued'})); h.owner.frame();
  const ready = h.layout(); h.preparations[1].resolve(ready); await flush();
  const oldTickets = h.renderer.messageQueue.slice(0,20).map(message => h.owner.tickets.get(message));
  h.settings.opacity = .4; h.settings.maxMessageLength = 2; h.renderer.isFavorite = () => true;
  h.owner.invalidateQueued();
  assert.equal(ready.closed, 1);
  assert.ok(oldTickets.every(ticket => ticket.state === 'cancelled' && ticket.abort.signal.aborted));
  assert.equal(h.owner.pendingPreparations.size, 19);
  assert.equal(h.owner.tickets.get(record.message), activeTicket);
  assert.equal(record.content, activeTicket.content);
  assert.equal(activeLayout.closed, 0); assert.equal(record.element, null);
  assert.equal(h.owner.generation, generation); assert.equal(gpu.destroyed, 0);
  h.owner.frame();
  assert.equal(h.preparations.length, 22); assert.equal(h.owner.pendingPreparations.size, 20);
  const fresh = h.preparations.at(-1).descriptor;
  assert.equal(fresh.opacity, .4); assert.equal(fresh.favorite, true); assert.equal(fresh.runs[0].value, 'qu...');
  h.owner.invalidateQueued(); h.owner.frame();
  assert.equal(h.preparations.length, 22, 'cancelled work still occupies the preparation bound');
  h.preparations[2].reject(new Error('late cancelled error'));
  const late = h.layout(); h.preparations[3].resolve(late); await flush();
  assert.equal(late.closed, 1); assert.equal(h.owner.state, 'gpu'); assert.equal(gpu.destroyed, 0);
  h.owner.frame(); assert.equal(h.owner.pendingPreparations.size, 20);
});

test('queued messages prepare concurrently without admission or blocking active drawing', async () => {
  const h = harness(requested); const gpu = await h.start(); h.owner.frame();
  const messages = Array.from({length:20}, (_, i) => ({text:`message ${i}`}));
  h.renderer.messageQueue.push(...messages); h.owner.frame();
  assert.equal(h.preparations.length, 20);
  assert.equal(h.renderer.activeMessages.length, 0);
  assert.deepEqual(h.renderer.messageQueue, messages);
  assert.equal(gpu.draws.length, 2);
  h.owner.frame(); assert.equal(h.preparations.length, 20);
  h.preparations.forEach(p => p.resolve(h.layout())); await flush();
  assert.ok(messages.every(message => h.owner.tickets.get(message).state === 'ready'));
  assert.equal(h.owner.pendingPreparations.size, 0);
});

test('evicted pending messages remain within the preparation limit and cannot fail the session', async () => {
  const h = harness(requested); const gpu = await h.start(); h.owner.frame();
  h.renderer.messageQueue = Array.from({length:20}, () => ({text:'old'})); h.owner.frame();
  h.renderer.messageQueue = Array.from({length:20}, () => ({text:'new'})); h.owner.frame();
  assert.equal(h.preparations.length, 20);
  assert.equal(h.owner.pendingPreparations.size, 20);
  h.preparations[0].reject(new Error('discarded invalid image'));
  const late = h.layout(); h.preparations[1].resolve(late); await flush();
  assert.equal(late.closed, 1);
  assert.equal(h.owner.state, 'gpu'); assert.equal(gpu.destroyed, 0);
  h.owner.frame();
  assert.equal(h.preparations.length, 22);
  assert.equal(h.owner.pendingPreparations.size, 20);
});

test('ready evicted layouts close and clear invalidates outstanding queue preparation', async () => {
  const h = harness(requested); await h.start(); h.owner.frame();
  h.renderer.messageQueue.push({text:'ready'}, {text:'pending'}); h.owner.frame();
  const ready = h.layout(); h.preparations[0].resolve(ready); await flush();
  h.renderer.messageQueue.shift(); h.owner.frame(); assert.equal(ready.closed, 1);
  h.owner.clear(); assert.equal(h.owner.pendingPreparations.size, 0);
  const late = h.layout(); h.preparations[1].resolve(late); await flush();
  assert.equal(late.closed, 1); assert.equal(h.owner.pendingPreparations.size, 0);
});


test('staging active messages has priority and does not prewarm the queue', async () => {
  const h = harness(requested); h.record(); await h.start();
  h.renderer.messageQueue.push({text:'queued'}); h.owner.frame();
  assert.equal(h.preparations.length, 1);
  h.preparations[0].resolve(h.layout()); await flush(); h.owner.frame();
  assert.equal(h.owner.state, 'gpu'); assert.equal(h.preparations.length, 1);
  h.owner.frame(); assert.equal(h.preparations.length, 2);
});

test('late completion from reset cannot consume a new session preparation slot', async () => {
  const h = harness(requested); await h.start(); h.owner.frame();
  h.renderer.messageQueue.push({text:'old'}); h.owner.frame();
  h.owner.clear(); h.renderer.messageQueue = [{text:'new'}];
  await h.start(); h.owner.frame(); h.owner.frame();
  assert.equal(h.owner.pendingPreparations.size, 1);
  const late = h.layout(); h.preparations[0].resolve(late); await flush();
  assert.equal(late.closed, 1); assert.equal(h.owner.pendingPreparations.size, 1);
  h.preparations[1].resolve(h.layout()); await flush();
  assert.equal(h.owner.pendingPreparations.size, 0);
});


test('evicted preparations that never settle retain timeout recovery', async () => {
  const h = harness(requested); const gpu = await h.start(); h.owner.frame();
  h.renderer.messageQueue = Array.from({length:20}, () => ({text:'old'})); h.owner.frame();
  h.renderer.messageQueue = [{text:'new'}]; h.owner.frame();
  h.advance(10001); h.owner.frame();
  assert.equal(h.owner.state, 'failed'); assert.equal(gpu.destroyed, 1);
  assert.equal(h.owner.pendingPreparations.size, 0);
});


test('queue eviction before the next frame cannot turn a rejected preparation into fallback', async () => {
  const h = harness(requested); const gpu = await h.start(); h.owner.frame();
  h.renderer.messageQueue.push({text:'evicted'}); h.owner.frame();
  h.renderer.messageQueue.shift();
  h.preparations[0].reject(new Error('invalid media')); await flush();
  assert.equal(h.owner.state, 'gpu'); assert.equal(gpu.destroyed, 0);
});


test('migration keeps DOM visible until the latest worker scene has drawn', async () => {
  const h = harness(requested), record = h.record(), original = record.element;
  const gpu = await h.start();
  let drawn = false;
  gpu.present = records => { gpu.draws.push(records); return drawn; };
  h.owner.frame();
  h.preparations[0].resolve(h.layout()); await flush();
  h.owner.frame(); h.owner.frame();
  assert.equal(h.owner.state, 'preparing');
  assert.equal(original.removed, 0); assert.equal(gpu.shown, 0);
  drawn = true; h.owner.frame();
  assert.equal(h.owner.state, 'gpu');
  assert.equal(original.removed, 1); assert.equal(gpu.shown, 1);
});


test('empty overlay starts GPU and preserves the requested preference', async () => {
  const h = harness(requested);
  assert.equal(h.owner.requested, requested);
  assert.equal(h.events.at(-1).effective, 'dom');
  assert.equal(h.events.at(-1).reason, 'Preparing GPU renderer');
  const gpu = await h.start();
  h.owner.frame();
  assert.equal(gpu.shown, 1);
  assert.equal(h.events.at(-1).requested, requested);
  assert.equal(h.events.at(-1).effective, 'webgpu');
});

test('startup rejection retains visible DOM and retries only after explicit reset', async () => {
  const h = harness(requested), record = h.record(), original = record.element;
  h.owner.frame();
  h.starts[0].reject(new Error('adapter unavailable')); await flush();
  assert.equal(h.owner.state, 'failed');
  assert.equal(record.element, original);
  assert.equal(original.removed, 0);
  assert.equal(original.style.visibility, '');
  assert.equal(h.events.at(-1).requested, requested);
  assert.equal(h.events.at(-1).effective, 'dom');
  h.owner.frame(); h.owner.select(requested); h.owner.frame();
  assert.equal(h.starts.length, 1);
  h.owner.clear();
  const gpu = await h.start(); h.owner.frame();
  h.preparations.at(-1).resolve(h.layout()); await flush(); h.owner.frame();
  assert.equal(h.owner.state, 'gpu');
  assert.equal(gpu.shown, 1);
  assert.equal(h.events.at(-1).requested, requested);
});

test('startup timeout preserves preference and stops frame retries', () => {
  const h = harness(requested), record = h.record(); h.owner.frame();
  [...h.timers.values()][0]();
  assert.equal(h.owner.state, 'failed');
  assert.equal(record.element.removed, 0);
  assert.equal(h.events.at(-1).requested, requested);
  assert.equal(h.events.at(-1).effective, 'dom');
  h.owner.frame(); assert.equal(h.starts.length, 1);
});

}

nodeTest('DOM selection does not attempt GPU startup', () => {
  const h = harness('dom'); h.owner.frame(); h.owner.frame();
  assert.equal(h.owner.requested, 'dom');
  assert.equal(h.owner.wantsGPU, false);
  assert.equal(h.starts.length, 0);
  assert.equal(h.events.at(-1).effective, 'dom');
});
