const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/content/renderer.js'), 'utf8');
function harness() {
  let now = 1000;
  const classes = new Set(), frames = [];
  const context = { Date: { now: () => now }, danmakuSettings: { get: key => ({maxMessagesPerSecond:5,rows:3,fontSize:24,regionTop:0,regionHeight:13,maxActiveMessages:50})[key] } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/shared/constants.js'), 'utf8') + '\n' + source + '\nglobalThis.Renderer = DanmakuRenderer;', context);
  const renderer = new context.Renderer({ container: { classList: { contains: name => classes.has(name) } } });
  renderer._scheduleTick = () => {};
  renderer._presentation = { frame: () => frames.push(renderer.activeMessages.map(record => record.elapsedMs)), clear() {} };
  return { renderer, classes, frames, step(ms) { now += ms; renderer.processQueue(); } };
}
for (const pauseClass of ['danmaku-paused', 'danmaku-paused-video']) {
  test(`${pauseClass} freezes retained clocks without adding paused time on resume`, () => {
    const h = harness();
    const record = { lane: {index:0}, elapsedMs: 250, durationMs: 3000 };
    h.renderer.activeMessages.push(record);
    h.step(500); assert.equal(record.elapsedMs, 750);
    h.classes.add(pauseClass); h.renderer.presentationClock(); h.step(10000); h.step(10000);
    assert.equal(record.elapsedMs, 750); assert.equal(h.frames.at(-1)[0], 750);
    h.classes.delete(pauseClass); h.renderer.presentationClock(); h.step(100);
    assert.equal(record.elapsedMs, 850); assert.equal(h.frames.at(-1)[0], 850);
  });
}
test('pending GPU layout keeps queue head and throughput timestamp until admission succeeds', () => {
  const h = harness(); const first = { id: 1 }, second = { id: 2 };
  h.renderer.messageQueue.push(first, second);
  let ready = false; const attempts = [];
  h.renderer.renderMessage = message => { attempts.push(message); return ready; };
  h.step(500); h.step(500);
  assert.equal(h.renderer.messageQueue.length, 2); assert.equal(h.renderer.lastRenderTime, 0);
  assert.ok(attempts.every(message => message === first));
  ready = true; h.step(1);
  assert.equal(h.renderer.messageQueue.length, 1); assert.equal(h.renderer.messageQueue[0], second);
  h.step(199); assert.equal(h.renderer.messageQueue.length, 1);
  h.step(1); assert.equal(h.renderer.messageQueue.length, 0);
});
