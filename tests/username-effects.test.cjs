const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function loadSettings(
  storedEffect,
  storedScope,
  storedPalette,
  storedStyle,
  signatureEffectPool,
  signaturePalettePool,
  signatureKnownEffects,
  signatureKnownPalettes,
  hasStoredSettings = true
) {
  const storedSettings = {
    usernameEffect: storedEffect,
    usernameEffectPalette: storedPalette,
    usernameEffectScope: storedScope,
  };
  if (storedStyle !== undefined) storedSettings.usernameEffectStyle = storedStyle;
  if (signatureEffectPool !== undefined) storedSettings.signatureEffectPool = signatureEffectPool;
  if (signaturePalettePool !== undefined) storedSettings.signaturePalettePool = signaturePalettePool;
  if (signatureKnownEffects !== undefined) storedSettings.signatureKnownEffects = signatureKnownEffects;
  if (signatureKnownPalettes !== undefined) storedSettings.signatureKnownPalettes = signatureKnownPalettes;
  const constants = fs.readFileSync(
    new URL('../src/shared/constants.js', `file://${__filename}`),
    'utf8'
  );
  const settings = fs.readFileSync(
    new URL('../src/shared/settings.js', `file://${__filename}`),
    'utf8'
  );
  const storageWrites = [];
  const context = {
    console,
    setTimeout,
    clearTimeout,
    storageWrites,
    chrome: {
      storage: {
        local: {
          get: async () => hasStoredSettings ? { danmakuSettings: storedSettings } : {},
          set: async (value) => storageWrites.push(value),
        },
        onChanged: { addListener: () => {} },
      },
    },
  };
  vm.runInNewContext(
    `${constants}\n${settings}\nglobalThis.settings = danmakuSettings;\nglobalThis.constants = DANMAKU_CONSTANTS;`,
    context
  );
  return context;
}

test('username effect registry has unique stable keys', () => {
  const { constants } = loadSettings('none');
  const keys = Array.from(constants.TEXT_EFFECTS, (effect) => effect.key);

  assert.deepEqual(keys, [
    'duotoneFlow',
    'duotoneEmber',
    'duotoneGlitch',
  ]);
  assert.equal(new Set(keys).size, keys.length);
});

test('username palette registry exposes the three selected relationships', () => {
  const { constants } = loadSettings('none');
  const keys = Array.from(constants.TEXT_EFFECT_PALETTES, (palette) => palette.key);

  assert.deepEqual(keys, ['monochrome', 'analogous', 'complementary']);
  assert.equal(constants.DEFAULTS.usernameEffectPalette, 'analogous');
});

test('username style registry exposes the simplified progressive choices', () => {
  const { constants } = loadSettings();
  const keys = Array.from(constants.TEXT_EFFECT_STYLES, (style) => style.key);
  const labels = Array.from(constants.TEXT_EFFECT_STYLES, (style) => style.label);

  assert.deepEqual(keys, ['original', 'custom', 'signature']);
  assert.deepEqual(labels, ['Off', 'Fixed', 'Personalized']);
  assert.equal(constants.DEFAULTS.usernameEffectStyle, 'signature');
  assert.equal(constants.DEFAULTS.usernameEffect, 'duotoneFlow');
});

test('stored unknown username effects fall back to original color', async () => {
  const { settings } = loadSettings('not-a-real-effect');

  await settings.load();

  assert.equal(settings.get('usernameEffectStyle'), 'original');
  assert.equal(settings.get('usernameEffect'), 'duotoneFlow');
});

test('known username effects survive settings validation', async () => {
  const { settings } = loadSettings('duotoneEmber', 'everyone');

  await settings.load();

  assert.equal(settings.get('usernameEffectStyle'), 'custom');
  assert.equal(settings.get('usernameEffect'), 'duotoneEmber');
  settings.set('usernameEffect', 'duotoneGlitch');
  assert.equal(settings.get('usernameEffect'), 'duotoneGlitch');
  assert.equal(settings.get('usernameEffectScope'), 'everyone');
});

test('username effects default to favorites and migrate the old off scope', async () => {
  const missing = loadSettings('duotoneFlow');
  await missing.settings.load();
  assert.equal(missing.settings.get('usernameEffectScope'), 'favorites');

  const unknown = loadSettings('duotoneFlow', 'somewhere');
  await unknown.settings.load();
  assert.equal(unknown.settings.get('usernameEffectScope'), 'favorites');

  const oldOff = loadSettings('duotoneGlitch', 'off');
  await oldOff.settings.load();
  assert.equal(oldOff.settings.get('usernameEffectStyle'), 'original');
  assert.equal(oldOff.settings.get('usernameEffectScope'), 'favorites');
});

test('legacy signature settings migrate to the combined signature style', async () => {
  const legacy = loadSettings('signature', 'everyone', 'auto');
  await legacy.settings.load();

  assert.equal(legacy.settings.get('usernameEffectStyle'), 'signature');
  assert.equal(legacy.settings.get('usernameEffect'), 'duotoneFlow');
  assert.equal(legacy.settings.get('usernameEffectPalette'), 'analogous');
  assert.equal(legacy.settings.get('usernameEffectScope'), 'everyone');
});

test('switching styles preserves remembered custom effect and palette choices', async () => {
  const { settings } = loadSettings(
    'duotoneEmber',
    'everyone',
    'complementary',
    'custom'
  );
  await settings.load();

  settings.set('usernameEffectStyle', 'signature');
  assert.equal(settings.get('usernameEffect'), 'duotoneEmber');
  assert.equal(settings.get('usernameEffectPalette'), 'complementary');

  settings.set('usernameEffectStyle', 'custom');
  assert.equal(settings.get('usernameEffect'), 'duotoneEmber');
  assert.equal(settings.get('usernameEffectPalette'), 'complementary');
});

test('username palettes default to analogous and reject unknown values', async () => {
  const missing = loadSettings('duotoneFlow');
  await missing.settings.load();
  assert.equal(missing.settings.get('usernameEffectPalette'), 'analogous');

  const unknown = loadSettings('duotoneFlow', 'favorites', 'triadic');
  await unknown.settings.load();
  assert.equal(unknown.settings.get('usernameEffectPalette'), 'analogous');

  unknown.settings.set('usernameEffectPalette', 'monochrome');
  assert.equal(unknown.settings.get('usernameEffectPalette'), 'monochrome');
});

test('signature pools persist valid unique choices and recover from empty pools', async () => {
  const configured = loadSettings(
    'duotoneFlow',
    'favorites',
    'analogous',
    'signature',
    ['duotoneGlitch', 'unknown', 'duotoneGlitch', 'duotoneFlow'],
    ['complementary', 'unknown']
  );
  await configured.settings.load();

  assert.deepEqual(
    Array.from(configured.settings.get('signatureEffectPool')),
    ['duotoneGlitch', 'duotoneFlow']
  );
  assert.deepEqual(
    Array.from(configured.settings.get('signaturePalettePool')),
    ['complementary']
  );
  let notifications = 0;
  configured.settings.addListener(() => notifications++);
  configured.settings.set('signatureEffectPool', ['duotoneGlitch', 'duotoneFlow']);
  assert.equal(notifications, 0);

  const empty = loadSettings(
    'duotoneFlow',
    'favorites',
    'analogous',
    'signature',
    [],
    []
  );
  await empty.settings.load();
  assert.deepEqual(
    Array.from(empty.settings.get('signatureEffectPool')),
    ['duotoneFlow', 'duotoneEmber', 'duotoneGlitch']
  );
  assert.deepEqual(
    Array.from(empty.settings.get('signaturePalettePool')),
    ['monochrome', 'analogous', 'complementary']
  );
});

test('loading snapshots personalization choices once instead of inheriting future defaults', async () => {
  const legacy = loadSettings('duotoneFlow', 'favorites', 'analogous', 'signature');
  await legacy.settings.load();

  assert.equal(legacy.storageWrites.length, 1);
  assert.deepEqual(
    Array.from(legacy.storageWrites[0].danmakuSettings.signatureEffectPool),
    ['duotoneFlow', 'duotoneEmber', 'duotoneGlitch']
  );
  assert.deepEqual(
    Array.from(legacy.storageWrites[0].danmakuSettings.signaturePalettePool),
    ['monochrome', 'analogous', 'complementary']
  );
  assert.equal(
    legacy.storageWrites[0].danmakuSettings.signatureKnownEffects.includes('duotoneTestPulse'),
    false
  );

  const alreadySnapshotted = loadSettings(
    'duotoneFlow',
    'favorites',
    'analogous',
    'signature',
    ['duotoneFlow'],
    ['analogous'],
    ['duotoneFlow', 'duotoneEmber', 'duotoneGlitch'],
    ['monochrome', 'analogous', 'complementary']
  );
  await alreadySnapshotted.settings.load();
  assert.equal(alreadySnapshotted.storageWrites.length, 0);

  const newInstall = loadSettings(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    false
  );
  await newInstall.settings.load();
  assert.equal(newInstall.settings.get('usernameEffectStyle'), 'signature');
  assert.equal(newInstall.storageWrites.length, 1);
  assert.deepEqual(
    Array.from(newInstall.settings.get('signatureKnownEffects')),
    ['duotoneFlow', 'duotoneEmber', 'duotoneGlitch']
  );
});

test('personalization options mark an unseen dummy effect as New', () => {
  const source = fs.readFileSync(
    new URL('../src/content/settings-panel.js', `file://${__filename}`),
    'utf8'
  );
  const values = {
    signatureEffectPool: ['duotoneFlow', 'duotoneEmber', 'duotoneGlitch'],
    signaturePalettePool: ['monochrome', 'analogous', 'complementary'],
    signatureKnownEffects: ['duotoneFlow', 'duotoneEmber', 'duotoneGlitch'],
    signatureKnownPalettes: ['monochrome', 'analogous', 'complementary'],
  };
  const makeCheckbox = (value) => {
    const badge = { hidden: true };
    return {
      badge,
      checked: false,
      getAttribute: (name) => name === 'data-value' ? value : null,
      parentElement: { querySelector: () => badge },
    };
  };
  const flow = makeCheckbox('duotoneFlow');
  const testPulse = makeCheckbox('duotoneTestPulse');
  const palettes = values.signaturePalettePool.map(makeCheckbox);
  const summary = { textContent: '' };
  const panelElement = {
    querySelectorAll: (selector) => selector.includes('effect-toggle')
      ? [flow, testPulse]
      : palettes,
    querySelector: (selector) => selector === '[data-signature-mix-summary]'
      ? summary
      : null,
  };
  const context = {
    console,
    setTimeout,
    clearTimeout,
    DANMAKU_CONSTANTS: {},
    danmakuSettings: { get: (key) => values[key] },
  };
  vm.runInNewContext(`${source}\nglobalThis.Panel = DanmakuSettingsPanel;`, context);
  const panel = new context.Panel();
  panel.panel = panelElement;

  panel.updateSignatureMixControls();

  assert.equal(flow.badge.hidden, true);
  assert.equal(testPulse.badge.hidden, false);
  assert.equal(testPulse.checked, false);
});

test('personalization hover previews can isolate an effect or color pairing', () => {
  const source = fs.readFileSync(
    new URL('../src/content/settings-panel.js', `file://${__filename}`),
    'utf8'
  );
  assert.match(source, /addEventListener\('mouseenter', showPreview\)/);
  assert.match(source, /addEventListener\('focusin', showPreview\)/);

  const preview = { innerHTML: '', children: [], appendChild(child) { this.children.push(child); } };
  const label = { textContent: '' };
  const decorated = [];
  const context = {
    console,
    setTimeout,
    clearTimeout,
    document: {
      createElement: () => ({
        className: '',
        dataset: {},
        style: { color: '', setProperty: () => {} },
        classList: { add: () => {} },
        textContent: '',
      }),
    },
    window: { innerWidth: 1200, innerHeight: 1000 },
    DANMAKU_CONSTANTS: {},
    danmakuSettings: {
      get: (key) => ({
        usernameEffectStyle: 'signature',
        signatureEffectPool: ['duotoneFlow', 'duotoneEmber', 'duotoneGlitch'],
        signaturePalettePool: ['monochrome', 'analogous', 'complementary'],
      })[key],
    },
    DANMAKU_USERNAME_EFFECTS: {
      resolveEffect: () => 'duotoneFlow',
      resolvePalette: () => 'analogous',
      decorateElement: (_element, options) => decorated.push(options),
    },
  };
  vm.runInNewContext(`${source}\nglobalThis.Panel = DanmakuSettingsPanel;`, context);
  const panel = new context.Panel();
  panel.panel = {
    querySelector: (selector) => selector === '[data-username-effect-preview]'
      ? preview
      : selector === '[data-username-preview-label]'
        ? label
        : null,
    getBoundingClientRect: () => ({ left: 700, right: 1036 }),
  };

  panel.renderUsernameEffectPreview({ effect: 'duotoneEmber', label: 'Ember' });
  assert.equal(label.textContent, 'Ember effect');
  assert.equal(decorated.length, 3);
  assert.equal(decorated.every((entry) => entry.effect === 'duotoneEmber'), true);

  decorated.length = 0;
  preview.children.length = 0;
  panel.renderUsernameEffectPreview({ palette: 'complementary', label: 'Opposite hues' });
  assert.equal(label.textContent, 'Opposite hues pairing');
  assert.equal(decorated.length, 3);
  assert.equal(decorated.every((entry) => entry.palette === 'complementary'), true);

  panel.optionPreview = {
    hidden: true,
    style: {},
    querySelector: panel.panel.querySelector,
    getBoundingClientRect: () => ({ width: 250, height: 80 }),
  };
  panel.showOptionPreview(
    { effect: 'duotoneGlitch', label: 'Glitch' },
    { getBoundingClientRect: () => ({ top: 980, height: 20 }) }
  );
  assert.equal(panel.optionPreview.hidden, false);
  assert.equal(panel.optionPreview.style.left, '438px');
  assert.equal(panel.optionPreview.style.top, '910px');
});

function loadRenderer(
  usernameEffect,
  usernameEffectScope = 'favorites',
  usernameEffectPalette = 'analogous',
  usernameEffectStyle = 'custom',
  signatureEffectPool = ['duotoneFlow', 'duotoneEmber', 'duotoneGlitch'],
  signaturePalettePool = ['monochrome', 'analogous', 'complementary']
) {
  const source = fs.readFileSync(
    new URL('../src/content/renderer.js', `file://${__filename}`),
    'utf8'
  );
  const usernameEffects = fs.readFileSync(
    new URL('../src/content/username-effects.js', `file://${__filename}`),
    'utf8'
  );
  const values = {
    animationMode: 'scroll',
    duration: 10,
    fontSize: 24,
    highlightUsername: '',
    maxMessageLength: 160,
    opacity: 0.9,
    regionHeight: 13,
    regionTop: 0,
    rows: 3,
    showBadges: false,
    showReplyContext: true,
    showUsernames: true,
    showUsernamesFavoritesOnly: false,
    usernameEffect,
    usernameEffectPalette,
    usernameEffectScope,
    usernameEffectStyle,
    signatureEffectPool,
    signaturePalettePool,
    dynamicMode: true,
  };
  const createElement = (tagName) => {
    const classes = new Set();
    const properties = new Map();
    return {
      tagName,
      className: '',
      children: [],
      dataset: {},
      classList: {
        add: (...names) => names.forEach((name) => classes.add(name)),
        contains: (name) => classes.has(name),
      },
      style: {
        cssText: '',
        color: '',
        setProperty: (name, value) => properties.set(name, value),
        getPropertyValue: (name) => properties.get(name) || '',
      },
      appendChild(child) {
        this.children.push(child);
      },
    };
  };
  const context = {
    console,
    document: { createElement },
    DANMAKU_CONSTANTS: {
      REFERENCE_PLAYER_HEIGHT: 720,
      STATIONARY_MODES: [],
      TEXT_EFFECTS: [
        { key: 'duotoneFlow' },
        { key: 'duotoneEmber', texture: 'assets/text-effects/ember.webp' },
        { key: 'duotoneGlitch' },
      ],
    },
    chrome: {
      runtime: {
        getURL: (path) => `chrome-extension://test-extension/${path}`,
      },
    },
    danmakuSettings: { get: (key) => values[key] },
  };
  vm.runInNewContext(
    `${usernameEffects}\n${source}\nglobalThis.DanmakuRenderer = DanmakuRenderer;globalThis.usernameEffects = DANMAKU_USERNAME_EFFECTS;`,
    context
  );
  const renderer = new context.DanmakuRenderer({ container: { offsetHeight: 720 } });
  renderer._testUsernameEffects = context.usernameEffects;
  return renderer;
}

test('renderer preserves the Twitch color and derives a secondary color', () => {
  const renderer = loadRenderer('duotoneEmber', 'everyone');
  const element = renderer.createMessageElement(
    { username: 'OceanCaster', color: '#1e90ff', text: 'hello' },
    { index: 0 },
    'scroll'
  );
  const username = element.children.find((child) => child.className === 'danmaku-username');

  assert.ok(username);
  assert.equal(username.style.color, '#1e90ff');
  assert.equal(username.style.getPropertyValue('--danmaku-username-color'), '#1e90ff');
  assert.equal(username.style.getPropertyValue('--danmaku-secondary-color'), 'hsl(245 82% 63%)');
  assert.equal(
    username.style.getPropertyValue('--danmaku-effect-texture'),
    'url("chrome-extension://test-extension/assets/text-effects/ember.webp")'
  );
  assert.equal(username.classList.contains('danmaku-username-effect--duotoneEmber'), true);
  assert.equal(username.dataset.danmakuUsernameText, 'OceanCaster: ');
});

test('renderer derives monochrome and complementary palettes from the same Twitch color', () => {
  const effects = loadRenderer('duotoneFlow')._testUsernameEffects;

  assert.equal(effects.getSecondaryColor('#1e90ff', 'monochrome'), 'hsl(210 70% 68%)');
  assert.equal(
    effects.getSecondaryColor('#1e90ff', 'complementary'),
    'hsl(15 82% 63%)'
  );
});

test('renderer derives palettes from Twitch CSS rgb and rgba colors', () => {
  const effects = loadRenderer('duotoneFlow')._testUsernameEffects;

  assert.equal(
    effects.getSecondaryColor('rgb(30, 144, 255)', 'analogous'),
    'hsl(245 82% 63%)'
  );
  assert.equal(
    effects.getSecondaryColor('rgba(30, 144, 255, 0.8)', 'complementary'),
    'hsl(15 82% 63%)'
  );
});

test('signature selections are stable and case-insensitive', () => {
  const effects = loadRenderer('duotoneFlow')._testUsernameEffects;
  const installedEffects = ['duotoneFlow', 'duotoneEmber', 'duotoneGlitch'];

  assert.equal(effects.resolveEffect('signature', 'OceanCaster', installedEffects), 'duotoneFlow');
  assert.equal(effects.resolveEffect('signature', 'oceancaster', installedEffects), 'duotoneFlow');
  assert.equal(effects.resolvePalette('auto', 'OceanCaster'), 'analogous');
  assert.equal(
    effects.resolveEffect('signature', 'OceanCaster', installedEffects),
    effects.resolveEffect('signature', 'OceanCaster', installedEffects)
  );
});

test('signature rendezvous selection follows the configured 50/25/25 weighting', () => {
  const effects = loadRenderer('duotoneFlow')._testUsernameEffects;
  const counts = new Map(effects.EFFECT_MIX.map((option) => [option.key, 0]));

  for (let index = 0; index < 10000; index++) {
    const selected = effects.chooseRendezvous(effects.EFFECT_MIX, `effect:user${index}`);
    counts.set(selected, counts.get(selected) + 1);
  }

  assert.ok(counts.get('duotoneFlow') > 4700 && counts.get('duotoneFlow') < 5300);
  assert.ok(counts.get('duotoneEmber') > 2200 && counts.get('duotoneEmber') < 2800);
  assert.ok(counts.get('duotoneGlitch') > 2200 && counts.get('duotoneGlitch') < 2800);
});

test('signature mix renormalizes its weighting across the selected pools', () => {
  const effects = loadRenderer('duotoneFlow')._testUsernameEffects;
  const effectPool = effects.allowedOptions(
    effects.EFFECT_MIX,
    ['duotoneFlow', 'duotoneGlitch']
  );

  for (let index = 0; index < 100; index++) {
    assert.ok(
      ['duotoneFlow', 'duotoneGlitch'].includes(
        effects.chooseRendezvous(effectPool, `effect:user${index}`)
      )
    );
  }
  assert.equal(effects.resolveEffect('signature', 'any name', ['duotoneGlitch']), 'duotoneGlitch');
  assert.equal(effects.resolvePalette('auto', 'any name', ['monochrome']), 'monochrome');
});

test('adding a rendezvous option only moves chatters assigned to the new option', () => {
  const effects = loadRenderer('duotoneFlow')._testUsernameEffects;
  const extended = [...effects.EFFECT_MIX, { key: 'newEffect', weight: 25 }];
  let moved = 0;

  for (let index = 0; index < 1000; index++) {
    const identity = `effect:user${index}`;
    const before = effects.chooseRendezvous(effects.EFFECT_MIX, identity);
    const after = effects.chooseRendezvous(extended, identity);
    const reordered = effects.chooseRendezvous([...extended].reverse(), identity);
    assert.equal(reordered, after);
    if (after !== before) {
      moved++;
      assert.equal(after, 'newEffect');
    }
  }

  assert.ok(moved > 0);
});

test('renderer applies the concrete signature effect and palette to the username', () => {
  const renderer = loadRenderer('duotoneFlow', 'everyone', 'analogous', 'signature');
  const element = renderer.createMessageElement(
    { username: 'OceanCaster', color: 'rgb(30, 144, 255)', text: 'hello' },
    { index: 0 },
    'scroll'
  );
  const username = element.children.find((child) => child.className === 'danmaku-username');

  assert.equal(username.dataset.danmakuUsernameEffect, 'duotoneFlow');
  assert.equal(username.dataset.danmakuUsernamePalette, 'analogous');
  assert.equal(username.classList.contains('danmaku-username-effect--duotoneFlow'), true);
  assert.equal(username.classList.contains('danmaku-username-effect--signature'), false);
});

test('renderer honors customized signature pools', () => {
  const renderer = loadRenderer(
    'duotoneFlow',
    'everyone',
    'analogous',
    'signature',
    ['duotoneGlitch'],
    ['complementary']
  );
  const element = renderer.createMessageElement(
    { username: 'OceanCaster', color: '#1e90ff', text: 'hello' },
    { index: 0 },
    'scroll'
  );
  const username = element.children.find((child) => child.className === 'danmaku-username');

  assert.equal(username.dataset.danmakuUsernameEffect, 'duotoneGlitch');
  assert.equal(username.dataset.danmakuUsernamePalette, 'complementary');
});

test('original style ignores remembered custom effect and palette choices', () => {
  const renderer = loadRenderer('duotoneGlitch', 'everyone', 'complementary', 'original');
  const element = renderer.createMessageElement(
    { username: 'OceanCaster', color: '#1e90ff', text: 'hello' },
    { index: 0 },
    'scroll'
  );
  const username = element.children.find((child) => child.className === 'danmaku-username');

  assert.equal(username.classList.contains('danmaku-username-effect--duotoneGlitch'), false);
  assert.equal(username.style.getPropertyValue('--danmaku-secondary-color'), '');
});

test('renderer ignores an unknown effect key', () => {
  const renderer = loadRenderer('duotoneFlow unexpected-class', 'everyone');
  const element = renderer.createMessageElement(
    { username: 'OceanCaster', color: '#1e90ff', text: 'hello' },
    { index: 0 },
    'scroll'
  );
  const username = element.children.find((child) => child.className === 'danmaku-username');

  assert.equal(username.classList.contains('danmaku-username-effect--duotoneFlow'), false);
});

test('effect timing is stable per username and flips with message direction', () => {
  const effects = loadRenderer('duotoneFlow')._testUsernameEffects;
  const first = effects.getProfile('OceanCaster', 'scroll');
  const again = effects.getProfile('OceanCaster', 'scroll');
  const reversed = effects.getProfile('OceanCaster', 'reverse');

  assert.equal(first.durationScale, again.durationScale);
  assert.equal(first.delay, again.delay);
  assert.equal(first.textureDirection, again.textureDirection);
  assert.notEqual(first.textureDirection, reversed.textureDirection);
});

test('favorite chatters receive the enhanced version of the selected effect', () => {
  const renderer = loadRenderer('duotoneGlitch');
  const element = renderer.createMessageElement(
    { username: 'GoldenVIP', color: '#ffd700', text: 'hello' },
    { index: 0 },
    'scroll',
    true
  );
  const username = element.children.find((child) => child.className === 'danmaku-username');

  assert.equal(username.classList.contains('danmaku-username-effect--enhanced'), true);
});

test('favorite-only scope leaves ordinary chatter names lightweight', () => {
  const renderer = loadRenderer('duotoneFlow');
  const element = renderer.createMessageElement(
    { username: 'OceanCaster', color: '#1e90ff', text: 'hello' },
    { index: 0 },
    'scroll'
  );
  const username = element.children.find((child) => child.className === 'danmaku-username');

  assert.equal(username.classList.contains('danmaku-username-effect--duotoneFlow'), false);
});

test('busy chat restricts everyone scope to favorites', () => {
  const renderer = loadRenderer('duotoneFlow', 'everyone');
  renderer._smoothedPressure = 0.8;
  const ordinary = renderer.createMessageElement(
    { username: 'OceanCaster', color: '#1e90ff', text: 'hello' },
    { index: 0 },
    'scroll'
  );
  const favorite = renderer.createMessageElement(
    { username: 'GoldenVIP', color: '#ffd700', text: 'hello' },
    { index: 0 },
    'scroll',
    true
  );
  const ordinaryName = ordinary.children.find((child) => child.className === 'danmaku-username');
  const favoriteName = favorite.children.find((child) => child.className === 'danmaku-username');

  assert.equal(ordinaryName.classList.contains('danmaku-username-effect--duotoneFlow'), false);
  assert.equal(favoriteName.classList.contains('danmaku-username-effect--duotoneFlow'), true);
});

test('a child username animation cannot remove its parent message', () => {
  const renderer = loadRenderer('duotoneGlitch');
  const element = { removeCalled: false, remove() { this.removeCalled = true; } };
  renderer.activeMessages.push({ element });

  renderer._handleMessageAnimationEnd(element, { target: { className: 'danmaku-username' } });
  assert.equal(renderer.activeMessages.length, 1);
  assert.equal(element.removeCalled, false);

  renderer._handleMessageAnimationEnd(element, { target: element });
  assert.equal(renderer.activeMessages.length, 0);
  assert.equal(element.removeCalled, true);
});

test('duotone effects preserve the original fill and use the secondary palette', () => {
  const css = fs.readFileSync(
    new URL('../src/content/overlay.css', `file://${__filename}`),
    'utf8'
  );
  const ruleFor = (key) => {
    const matches = Array.from(
      css.matchAll(
        new RegExp(`^\\.danmaku-username-effect--${key} \\{([\\s\\S]*?)\\n\\}`, 'gm')
      )
    );
    assert.ok(matches.length, `missing CSS rule for ${key}`);
    return matches[matches.length - 1][1];
  };

  assert.match(ruleFor('duotoneFlow'), /var\(--danmaku-secondary-color, #ffffff\)/);
  assert.doesNotMatch(ruleFor('duotoneFlow'), /black/);
  assert.match(
    ruleFor('duotoneEmber'),
    /linear-gradient\([\s\S]*var\(--danmaku-username-color, #ffffff\)/
  );
  assert.match(
    ruleFor('duotoneGlitch'),
    /linear-gradient\([\s\S]*var\(--danmaku-username-color, #ffffff\)/
  );
  assert.match(css, /\.danmaku-username-effect--duotoneEmber::before[\s\S]*?mix-blend-mode: screen/);
  assert.match(css, /\.danmaku-username-effect--duotoneGlitch::before[\s\S]*?--danmaku-secondary-color/);
});

test('busy-chat overlay mode stops existing ordinary username effects', () => {
  const css = fs.readFileSync(
    new URL('../src/content/overlay.css', `file://${__filename}`),
    'utf8'
  );

  assert.match(
    css,
    /\.danmaku-effects-favorites-only[\s\S]*?\.danmaku-message:not\(\.danmaku-message--favorite\)[\s\S]*?background-image: none;[\s\S]*?animation: none;/
  );
  assert.match(
    css,
    /\.danmaku-effects-favorites-only[\s\S]*?\.danmaku-username-effect--duotoneEmber::before[\s\S]*?display: none;/
  );
});

test('effect usernames use the layered SVG morphology border', () => {
  const overlay = fs.readFileSync(
    new URL('../src/content/overlay.js', `file://${__filename}`),
    'utf8'
  );
  const css = fs.readFileSync(
    new URL('../src/content/overlay.css', `file://${__filename}`),
    'utf8'
  );
  const context = {};
  vm.runInNewContext(`${overlay}\nglobalThis.DanmakuOverlay = DanmakuOverlay;`, context);
  const overlayInstance = new context.DanmakuOverlay();
  const layered = overlayInstance.textEffectFilterMarkup('danmaku-text-border-filter', true);
  const flat = overlayInstance.textEffectFilterMarkup('danmaku-text-border-flat-filter', false);

  assert.match(layered, /id="danmaku-text-border-filter"/);
  assert.match(
    layered,
    /<feMorphology[^>]+in="SourceGraphic"[^>]+operator="dilate"[^>]+radius="1\.15"[^>]+result="expandedColor"/
  );
  assert.match(layered, /<feOffset[^>]+dy="1\.6"/);
  assert.match(layered, /<feComponentTransfer[^>]+in="expandedColor"[^>]+result="border"/);
  assert.match(layered, /<feFuncR[^>]+slope="0\.24"/);
  assert.match(layered, /<feComponentTransfer[^>]+in="depthShape"/);
  assert.doesNotMatch(layered, /flood-color="#4e316c"/);
  assert.match(layered, /<feMergeNode in="SourceGraphic"/);
  assert.match(css, /filter: url\(#danmaku-text-border-filter\)/);
  assert.match(flat, /id="danmaku-text-border-flat-filter"/);
  assert.doesNotMatch(flat, /<feOffset/);
  assert.doesNotMatch(flat, /<feMergeNode in="depth"/);
  assert.match(
    css,
    /\.danmaku-username-effect--enhanced \{\s*filter: url\(#danmaku-text-border-flat-filter\);\s*\}/
  );
  assert.doesNotMatch(css, /danmaku-effect-entry-glint/);
  assert.doesNotMatch(css, /\.danmaku-username-effect--enhanced[\s\S]*?drop-shadow/);
});
