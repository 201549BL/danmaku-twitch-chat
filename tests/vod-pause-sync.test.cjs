const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  toggle(name, force) {
    if (force) this.values.add(name);
    else this.values.delete(name);
  }

  remove(name) {
    this.values.delete(name);
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeVideo {
  constructor(paused) {
    this.paused = paused;
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) listener();
  }
}

function loadController(document) {
  const source = fs.readFileSync(
    new URL('../src/content/index.js', `file://${__filename}`),
    'utf8'
  );
  const controllerSource = source
    .replace(/const danmakuController = new DanmakuController\(\);[\s\S]*$/, '')
    .concat('\nglobalThis.DanmakuController = DanmakuController;');
  const context = {
    console,
    document,
    setTimeout,
    clearTimeout,
    DANMAKU_CONSTANTS: {
      SELECTORS: { PLAYER_CONTAINER: '.player', PLAYER: '.fallback-player' },
    },
    danmakuSettings: {
      get(key) {
        assert.equal(key, 'pauseOnVideoPause');
        return true;
      },
    },
  };
  vm.runInNewContext(controllerSource, context);
  return context.DanmakuController;
}

test('VOD pause sync follows Twitch when it replaces the video element', () => {
  const originalVideo = new FakeVideo(true);
  const replacementVideo = new FakeVideo(false);
  let currentVideo = originalVideo;
  const player = { querySelector: () => currentVideo };
  const document = { querySelector: () => player };
  const DanmakuController = loadController(document);
  const controller = new DanmakuController();
  const classList = new FakeClassList();

  controller.isVod = true;
  controller.overlay = { container: { classList } };
  controller._wireVideoPause(originalVideo);
  assert.equal(classList.contains('danmaku-paused-video'), true);

  currentVideo = replacementVideo;
  originalVideo.dispatch('pause');

  assert.equal(
    classList.contains('danmaku-paused-video'),
    false,
    'playing replacement video must not leave message animations paused on the rail'
  );

  replacementVideo.paused = true;
  replacementVideo.dispatch('pause');
  assert.equal(
    classList.contains('danmaku-paused-video'),
    true,
    'pause events must be rebound to the replacement video'
  );
});
