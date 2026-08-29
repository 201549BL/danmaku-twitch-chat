const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const localeNames = ['en', 'ja', 'zh_CN', 'zh_TW'];

function readLocale(name) {
  return JSON.parse(fs.readFileSync(
    new URL(`../_locales/${name}/messages.json`, `file://${__filename}`),
    'utf8'
  ));
}

test('manifest uses Chrome-native localization metadata', () => {
  const manifest = JSON.parse(fs.readFileSync(
    new URL('../manifest.json', `file://${__filename}`),
    'utf8'
  ));
  const english = readLocale('en');

  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.name, '__MSG_extensionName__');
  assert.equal(manifest.description, '__MSG_extensionDescription__');
  assert.equal(manifest.action.default_title, '__MSG_extensionShortName__');
  assert.ok(english.extensionDescription.message.length <= 132);
  assert.ok(manifest.content_scripts[0].js.includes('src/shared/i18n.js'));
  assert.ok(manifest.content_scripts[0].js.includes('src/shared/release-notes.js'));
  assert.ok(manifest.content_scripts[0].js.includes('src/shared/translation-feedback.js'));
});

test('all translated locales contain the complete English message catalog', () => {
  const english = readLocale('en');
  const englishKeys = Object.keys(english).sort();

  for (const localeName of localeNames.slice(1)) {
    const locale = readLocale(localeName);
    assert.deepEqual(Object.keys(locale).sort(), englishKeys, `${localeName} keys differ`);
    for (const key of englishKeys) {
      const expectedPlaceholders = Object.keys(english[key].placeholders || {}).sort();
      const actualPlaceholders = Object.keys(locale[key].placeholders || {}).sort();
      assert.deepEqual(actualPlaceholders, expectedPlaceholders, `${localeName}.${key} placeholders differ`);
      assert.ok(locale[key].message.trim(), `${localeName}.${key} is empty`);
    }
  }
});

test('source-string translator resolves Japanese interface text', () => {
  const source = fs.readFileSync(
    new URL('../src/shared/i18n.js', `file://${__filename}`),
    'utf8'
  );
  const japanese = readLocale('ja');
  const chrome = {
    i18n: {
      getUILanguage: () => 'ja',
      getMessage: (key) => japanese[key]?.message || '',
    },
  };
  const context = { chrome };
  vm.runInNewContext(
    `${source}\nglobalThis.i18n = DANMAKU_I18N; globalThis.sourceKeys = DANMAKU_I18N_SOURCE_KEYS;`,
    context
  );

  assert.equal(context.i18n.getLocale(), 'ja');
  assert.equal(context.i18n.text('Overlay'), 'オーバーレイ');
  assert.equal(context.i18n.text('Right-click for settings'), '右クリックで設定');
});

test('every static settings and onboarding label has an i18n key', () => {
  const i18nSource = fs.readFileSync(
    new URL('../src/shared/i18n.js', `file://${__filename}`),
    'utf8'
  );
  const settingsSource = fs.readFileSync(
    new URL('../src/content/settings-panel.js', `file://${__filename}`),
    'utf8'
  );
  const welcomeHtml = fs.readFileSync(
    new URL('../src/onboarding/welcome.html', `file://${__filename}`),
    'utf8'
  );
  const context = { chrome: { i18n: { getUILanguage: () => 'en', getMessage: () => '' } } };
  vm.runInNewContext(`${i18nSource}\nglobalThis.sourceKeys = DANMAKU_I18N_SOURCE_KEYS;`, context);

  const candidates = new Set();
  for (const source of [settingsSource, welcomeHtml]) {
    for (const match of source.matchAll(/>([^<>`$]+)</g)) {
      const value = match[1].replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
      if (value && !/^[×+−⚙0-9]+$/.test(value)) candidates.add(value);
    }
    for (const match of source.matchAll(/(?:title|aria-label|placeholder)="([^"]+)"/g)) {
      candidates.add(match[1]);
    }
  }

  const missing = [...candidates].filter((value) => !context.sourceKeys.has(value));
  assert.deepEqual(missing, []);
});
