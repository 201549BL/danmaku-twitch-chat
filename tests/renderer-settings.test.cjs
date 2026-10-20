const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function environment(raw, snapshot) {
  let storageChanged;
  const saves = [];
  const status = { textContent: '' };
  const context = {
    console,
    setTimeout: () => 1,
    clearTimeout: () => {},
    window: { __danmakuRendererStatus: snapshot },
    chrome: { storage: {
      local: { get: async () => ({ danmakuSettings: raw }), set: async (value) => { saves.push(value.danmakuSettings); } },
      onChanged: { addListener: (listener) => { storageChanged = listener; } },
    } },
  };
  const files = ['src/shared/constants.js', 'src/shared/settings.js', 'src/content/settings-panel.js'];
  const source = files.map((file) => fs.readFileSync(new URL(`../${file}`, `file://${__filename}`), 'utf8')).join('\n');
  vm.runInNewContext(`${source}\nglobalThis.settings = danmakuSettings; globalThis.Panel = DanmakuSettingsPanel;`, context);
  const panel = new context.Panel();
  panel.panel = { querySelector: () => status };
  return { settings: context.settings, panel, status, saves,
    storageRecord: (record) => storageChanged({ danmakuSettings: { newValue: record } }, 'local'),
    storageChange: (renderer) => storageChanged({ danmakuSettings: { newValue: { renderer } } }, 'local') };
}

test('renderer strictly normalizes persisted and live preferences', async () => {
  for (const value of [undefined, null, 'gpu', 'WebGPU', '', 1, {}, ['webgpu'], 'dom', 'webgpu', 'auto']) {
    const { settings, storageChange } = environment({ renderer: value });
    await settings.load();
    const expected = value === 'webgpu' || value === 'auto' ? value : 'dom';
    assert.equal(settings.get('renderer'), expected);
    settings.set('renderer', 'webgpu');
    settings.set('renderer', value);
    assert.equal(settings.get('renderer'), expected);
    settings.setMany({ renderer: 'webgpu' });
    settings.setMany({ renderer: value });
    assert.equal(settings.get('renderer'), expected);
    settings.set('renderer', 'webgpu');
    storageChange(value);
    assert.equal(settings.get('renderer'), expected);
  }
});

for (const requested of ['webgpu', 'auto']) test(`${requested} status distinguishes pending, active GPU, and fallback while preserving preference`, async () => {
  const { settings, panel, status } = environment({ renderer: requested });
  await settings.load();
  panel.updateRendererStatus();
  assert.equal(status.textContent, 'Active renderer: DOM — Preparing GPU renderer');
  panel._boundRendererStatus({ detail: { requested, effective: 'webgpu', reason: '' } });
  assert.equal(status.textContent, 'Active renderer: WebGPU');
  panel._boundRendererStatus({ detail: { requested, effective: 'dom', reason: 'GPU unavailable. Using DOM renderer.' } });
  assert.equal(status.textContent, 'Active renderer: DOM — GPU unavailable. Using DOM renderer.');
  assert.equal(settings.get('renderer'), requested);
});

test('new settings panels show the existing effective renderer snapshot', () => {
  const { panel, status } = environment({}, { requested: 'auto', effective: 'webgpu', reason: '' });
  panel.updateRendererStatus();
  assert.equal(status.textContent, 'Active renderer: WebGPU');
});


test('resetting preferences restores the Auto default', async () => {
  const { settings, panel } = environment({ renderer: 'webgpu' });
  await settings.load();
  panel.loadValues = () => {};
  panel.flashStatus = () => {};
  await panel.reset();
  assert.equal(settings.get('renderer'), 'auto');
});


test('fresh absent and null settings load and save Auto', async () => {
  for (const raw of [undefined, null]) {
    const { settings, saves } = environment(raw);
    await settings.load();
    assert.equal(settings.get('renderer'), 'auto');
    assert.equal(saves[0].renderer, 'auto');
    await settings.save();
    assert.equal(saves.at(-1).renderer, 'auto');
  }
});

test('legacy records durably retain DOM and other settings', async () => {
  for (const raw of [{}, {
    signatureEffectPool: ['duotoneFlow'], signaturePalettePool: ['analogous'],
    signatureKnownEffects: ['duotoneFlow'], signatureKnownPalettes: ['analogous'],
    fontSize: 33, rows: 9,
  }]) {
    const { settings, saves, storageRecord } = environment(raw);
    await settings.load();
    assert.equal(settings.get('renderer'), 'dom');
    assert.equal(saves.length, 1);
    assert.equal(saves[0].renderer, 'dom');
    if (raw.fontSize) {
      assert.equal(settings.get('fontSize'), raw.fontSize);
      assert.equal(settings.get('rows'), raw.rows);
    }
    const reloaded = environment(saves[0]);
    await reloaded.settings.load();
    assert.equal(reloaded.settings.get('renderer'), 'dom');
    assert.equal(reloaded.saves.length, 0);
    settings.set('renderer', 'auto');
    storageRecord(raw);
    assert.equal(settings.get('renderer'), 'dom');
  }
});
