const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function loadRenderer(overrides = {}) {
  const values = {
    maxMessagesPerSecond: 5,
    duration: 10,
    popFadeLifetime: 4,
    dynamicMode: true,
    ...overrides,
  };
  const source = fs.readFileSync(
    new URL('../src/content/renderer.js', `file://${__filename}`),
    'utf8'
  );
  const usernameEffects = fs.readFileSync(
    new URL('../src/content/username-effects.js', `file://${__filename}`),
    'utf8'
  );
  const classes = new Set();
  const context = {
    console,
    setInterval,
    clearInterval,
    DANMAKU_CONSTANTS: { REFERENCE_PLAYER_HEIGHT: 720, STATIONARY_MODES: [] },
    danmakuSettings: { get: (key) => values[key] },
  };
  vm.runInNewContext(
    `${usernameEffects}\n${source}\nglobalThis.DanmakuRenderer = DanmakuRenderer;`,
    context
  );
  const renderer = new context.DanmakuRenderer({
    container: {
      classList: {
        toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
        contains: (name) => classes.has(name),
      },
    },
  });
  renderer._testClasses = classes;
  return renderer;
}

test('sustained high chat keeps dynamic pressure active', () => {
  const renderer = loadRenderer({ maxMessagesPerSecond: 5 });

  const pressure = renderer._calculateDynamicTarget(10, 10);

  assert.ok(
    pressure > 0.7,
    '10 incoming messages/sec should stay boosted even when the one-minute baseline is also high'
  );
});

test('maximum pressure substantially increases throughput and clears messages faster', () => {
  const renderer = loadRenderer();
  renderer._smoothedPressure = 1;

  assert.equal(renderer._effectiveMaxMessagesPerSecond(), 20);
  assert.equal(renderer._effectiveDuration(), 4.5);
  assert.equal(renderer._effectiveStationaryLifetime(), 2.2);
});

test('a temporarily full lane leaves the message queued', () => {
  const renderer = loadRenderer();
  renderer.messageQueue.push({ id: 'queued' });
  renderer.renderMessage = () => false;
  renderer._scheduleTick = () => {};

  renderer.processQueue();

  assert.equal(renderer.messageQueue.length, 1);
  assert.equal(renderer.messageQueue[0].id, 'queued');
});

test('crossing the busy threshold suppresses effects on already-visible ordinary messages', () => {
  const renderer = loadRenderer({
    usernameEffectScope: 'everyone',
    dynamicMode: true,
  });

  renderer._smoothedPressure = 0.8;
  renderer._syncUsernameEffectPressureMode();
  assert.equal(renderer._testClasses.has('danmaku-effects-favorites-only'), true);

  renderer._smoothedPressure = 0;
  renderer._syncUsernameEffectPressureMode();
  assert.equal(renderer._testClasses.has('danmaku-effects-favorites-only'), false);
});
