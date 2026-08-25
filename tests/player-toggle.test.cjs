const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

class FakeClassList {
  toggle() {}
}

class FakeElement {
  constructor(name) {
    this.name = name;
    this.children = [];
    this.parentNode = null;
    this.classList = new FakeClassList();
    this.visible = true;
  }

  setAttribute() {}
  addEventListener() {}

  insertBefore(child) {
    child.remove();
    child.parentNode = this;
    this.children.unshift(child);
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  get firstChild() {
    return this.children[0] || null;
  }

  getClientRects() {
    return this.visible ? [{}] : [];
  }

  querySelector(selector) {
    if (selector === '.player-controls__right-control-group') return this.rightControls || null;
    if (selector === '[data-tooltip-title]') return null;
    return null;
  }
}

function createHarness() {
  let playerControls = [];
  const intervals = new Map();
  const timeouts = new Map();
  let nextIntervalId = 1;
  const document = {
    querySelector(selector) {
      if (selector === '[data-a-target="player-controls"]') return playerControls[0] || null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-a-target="player-controls"]') return playerControls;
      return [];
    },
    createElement() {
      return new FakeElement('danmaku-toggle');
    },
  };
  const source = fs.readFileSync(
    new URL('../src/content/player-toggle.js', `file://${__filename}`),
    'utf8'
  );
  const context = {
    document,
    setTimeout(callback) {
      const id = nextIntervalId++;
      timeouts.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
    setInterval(callback) {
      const id = nextIntervalId++;
      intervals.set(id, callback);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    danmakuSettings: {
      addListener() {},
      removeListener() {},
      get() { return true; },
      set() {},
    },
  };
  vm.runInNewContext(`${source}\nglobalThis.DanmakuPlayerToggle = DanmakuPlayerToggle;`, context);

  return {
    DanmakuPlayerToggle: context.DanmakuPlayerToggle,
    setPlayerControls(value) {
      playerControls = value ? [value] : [];
    },
    setPlayerControlCandidates(values) {
      playerControls = values;
    },
    tick() {
      for (const callback of [...intervals.values()]) callback();
    },
    get intervalCount() {
      return intervals.size;
    },
  };
}

function makePlayerControls(name) {
  const controls = new FakeElement(`${name}-controls`);
  controls.rightControls = new FakeElement(`${name}-right-controls`);
  return controls;
}

test('reattaches the toggle when Twitch replaces player controls after an ad', () => {
  const harness = createHarness();
  const beforeAd = makePlayerControls('before-ad');
  harness.setPlayerControls(beforeAd);
  const toggle = new harness.DanmakuPlayerToggle();
  toggle.init();
  assert.equal(beforeAd.rightControls.children.length, 1);

  const afterAd = makePlayerControls('after-ad');
  harness.setPlayerControls(afterAd);
  harness.tick();

  assert.equal(afterAd.rightControls.children.length, 1);
  assert.equal(toggle.button.parentNode, afterAd.rightControls);
});

test('moves the toggle to the visible ribbon when Twitch retains hidden player controls', () => {
  const harness = createHarness();
  const staleControls = makePlayerControls('stale');
  harness.setPlayerControls(staleControls);
  const toggle = new harness.DanmakuPlayerToggle();
  toggle.init();

  staleControls.visible = false;
  const visibleControls = makePlayerControls('visible');
  harness.setPlayerControlCandidates([staleControls, visibleControls]);
  harness.tick();

  assert.equal(staleControls.rightControls.children.length, 0);
  assert.equal(visibleControls.rightControls.children.length, 1);
  assert.equal(toggle.button.parentNode, visibleControls.rightControls);
});

test('keeps looking for controls until they appear', () => {
  const harness = createHarness();
  const toggle = new harness.DanmakuPlayerToggle();
  toggle.init();

  for (let i = 0; i < 40; i++) harness.tick();
  const delayedControls = makePlayerControls('delayed');
  harness.setPlayerControls(delayedControls);
  harness.tick();

  assert.equal(delayedControls.rightControls.children.length, 1);
});

test('stops attachment checks and removes the button when destroyed', () => {
  const harness = createHarness();
  const controls = makePlayerControls('current');
  harness.setPlayerControls(controls);
  const toggle = new harness.DanmakuPlayerToggle();
  toggle.init();

  toggle.destroy();

  assert.equal(harness.intervalCount, 0);
  assert.equal(controls.rightControls.children.length, 0);
});
