const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function loadSettings(storedFontFamily, hasStoredSettings = true) {
  const constants = fs.readFileSync(
    new URL('../src/shared/constants.js', `file://${__filename}`),
    'utf8'
  );
  const settings = fs.readFileSync(
    new URL('../src/shared/settings.js', `file://${__filename}`),
    'utf8'
  );
  const storedSettings = {
    fontFamily: storedFontFamily,
    signatureEffectPool: ['duotoneFlow', 'duotoneEmber', 'duotoneGlitch'],
    signaturePalettePool: ['monochrome', 'analogous', 'complementary'],
    signatureKnownEffects: ['duotoneFlow', 'duotoneEmber', 'duotoneGlitch'],
    signatureKnownPalettes: ['monochrome', 'analogous', 'complementary'],
  };
  const context = {
    console,
    setTimeout,
    clearTimeout,
    chrome: {
      storage: {
        local: {
          get: async () => hasStoredSettings ? { danmakuSettings: storedSettings } : {},
          set: async () => {},
        },
        onChanged: { addListener: () => {} },
      },
    },
  };
  vm.runInNewContext(
    `${constants}\n${settings}\nglobalThis.settings = danmakuSettings;`,
    context
  );
  return context.settings;
}

test('font selection defaults to the system stack and preserves installed font names', async () => {
  const fresh = loadSettings(undefined, false);
  await fresh.load();
  assert.equal(fresh.get('fontFamily'), 'system');

  const installed = loadSettings('Atkinson Hyperlegible');
  await installed.load();
  assert.equal(installed.get('fontFamily'), 'Atkinson Hyperlegible');
});

test('font selection rejects malformed stored values', async () => {
  const controlCharacters = loadSettings('Unsafe\nFont');
  await controlCharacters.load();
  assert.equal(controlCharacters.get('fontFamily'), 'system');

  const nonString = loadSettings({ family: 'Inter' });
  await nonString.load();
  assert.equal(nonString.get('fontFamily'), 'system');
});

test('service worker returns a sorted, deduplicated installed-font list', async () => {
  const source = fs.readFileSync(
    new URL('../src/background/service-worker.js', `file://${__filename}`),
    'utf8'
  );
  let messageListener;
  let fontListCalls = 0;
  const context = {
    console,
    chrome: {
      action: { onClicked: { addListener: () => {} } },
      runtime: {
        id: 'test-extension-id',
        getURL: (path) => `chrome-extension://test-extension-id/${path}`,
        onInstalled: { addListener: () => {} },
        onMessage: { addListener: (listener) => { messageListener = listener; } },
      },
      tabs: { sendMessage: async () => {}, create: () => {} },
      fontSettings: {
        getFontList: async () => {
          fontListCalls++;
          return [
            { fontId: 'inter', displayName: 'Inter' },
            { fontId: 'arial', displayName: 'Arial' },
            { fontId: 'inter-duplicate', displayName: 'inter' },
            { fontId: 'empty', displayName: '  ' },
          ];
        },
      },
    },
    URL,
  };
  vm.runInNewContext(source, context);

  const requestFonts = () => new Promise((resolve) => {
    const keepChannelOpen = messageListener(
      { action: 'get-font-list' },
      {},
      resolve
    );
    assert.equal(keepChannelOpen, true);
  });

  const first = await requestFonts();
  const second = await requestFonts();
  assert.deepEqual(Array.from(first.fonts), ['Arial', 'Inter']);
  assert.deepEqual(Array.from(second.fonts), ['Arial', 'Inter']);
  assert.equal(fontListCalls, 1);
});

test('settings panel populates installed fonts without interpolating HTML', async () => {
  const source = fs.readFileSync(
    new URL('../src/content/settings-panel.js', `file://${__filename}`),
    'utf8'
  );
  const options = [];
  const select = {
    disabled: false,
    value: '',
    appendChild(option) { options.push(option); },
    set innerHTML(_value) { options.length = 0; },
  };
  const status = { textContent: '' };
  const context = {
    console,
    setTimeout,
    clearTimeout,
    document: {
      createElement: () => ({ value: '', textContent: '' }),
    },
    chrome: {
      runtime: {
        sendMessage: async () => ({ fonts: ['Arial', 'Inter'] }),
      },
    },
    DANMAKU_CONSTANTS: {},
    danmakuSettings: {
      get: () => 'Inter',
      set: () => assert.fail('available selected font should not be reset'),
    },
  };
  vm.runInNewContext(`${source}\nglobalThis.Panel = DanmakuSettingsPanel;`, context);
  const panel = new context.Panel();
  panel.panel = {
    querySelector(selector) {
      if (selector === '[data-setting="fontFamily"]') return select;
      if (selector === '[data-font-status]') return status;
      return null;
    },
  };

  await panel.loadFontOptions();

  assert.deepEqual(options.map((option) => option.textContent), ['Default', 'Arial', 'Inter']);
  assert.equal(select.value, 'Inter');
  assert.equal(select.disabled, false);
  assert.match(status.textContent, /never uploaded/);
});

test('overlay applies a safely quoted font family and restores the default stack', () => {
  const source = fs.readFileSync(
    new URL('../src/content/overlay.js', `file://${__filename}`),
    'utf8'
  );
  let selected = 'Font "Name"';
  const properties = new Map();
  const context = {
    danmakuSettings: { get: () => selected },
  };
  vm.runInNewContext(`${source}\nglobalThis.DanmakuOverlay = DanmakuOverlay;`, context);
  const overlay = new context.DanmakuOverlay();
  overlay.container = {
    style: {
      setProperty: (key, value) => properties.set(key, value),
      removeProperty: (key) => properties.delete(key),
    },
  };

  overlay.updateAppearance();
  assert.equal(properties.get('--danmaku-font-family'), '"Font \\"Name\\""');

  selected = 'system';
  overlay.updateAppearance();
  assert.equal(properties.has('--danmaku-font-family'), false);
});

test('manifest declares fontSettings without broadening host access', () => {
  const manifest = JSON.parse(fs.readFileSync(
    new URL('../manifest.json', `file://${__filename}`),
    'utf8'
  ));

  assert.deepEqual(manifest.permissions, ['fontSettings', 'storage']);
  assert.deepEqual(manifest.host_permissions, ['https://www.twitch.tv/*']);
});
