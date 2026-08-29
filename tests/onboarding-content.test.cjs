const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

test('welcome page teaches both ways to open settings', () => {
  const html = fs.readFileSync(
    new URL('../src/onboarding/welcome.html', `file://${__filename}`),
    'utf8'
  );

  assert.match(html, /Open settings anytime/);
  assert.match(html, /From Chrome/);
  assert.match(html, /click the Danmaku extension icon/);
  assert.match(html, /From the Twitch player/);
  assert.match(html, /Right-click the Danmaku button/);
});

test('settings keeps the timed prompt near the top and permanent help near diagnostics', () => {
  const source = fs.readFileSync(
    new URL('../src/content/settings-panel.js', `file://${__filename}`),
    'utf8'
  );
  const context = {
    console,
    setTimeout,
    clearTimeout,
    DANMAKU_CONSTANTS: {},
  };
  vm.runInNewContext(`${source}\nglobalThis.Panel = DanmakuSettingsPanel;`, context);
  const html = new context.Panel().template();

  const promptIndex = html.indexOf('data-feedback-prompt');
  const translationPromptIndex = html.indexOf('data-translation-prompt');
  const appearanceIndex = html.indexOf('<summary>Appearance</summary>');
  const helpIndex = html.indexOf('<summary>Help &amp; feedback</summary>');
  const diagnosticsIndex = html.indexOf('<summary>Test &amp; diagnostics</summary>');

  assert.ok(promptIndex > 0 && promptIndex < appearanceIndex);
  assert.ok(translationPromptIndex > 0 && translationPromptIndex < appearanceIndex);
  assert.ok(helpIndex > appearanceIndex && helpIndex < diagnosticsIndex);
  assert.match(html, /How is Danmaku working for you\?/);
  assert.match(html, /Rate extension/);
  assert.match(html, /Report a problem/);
  assert.match(html, /Usage guide/);
  assert.match(html, /Privacy policy/);
  assert.match(html, /View full changelog/);
  assert.match(html, /data-translation-callout/);
  assert.match(html, /Suggest a correction/);
});

test('translation feedback callout only appears for supported localized interfaces', () => {
  const source = fs.readFileSync(
    new URL('../src/content/settings-panel.js', `file://${__filename}`),
    'utf8'
  );
  let locale = 'en-US';
  let seen = false;
  const context = {
    console,
    setTimeout,
    clearTimeout,
    DANMAKU_CONSTANTS: {},
    DANMAKU_I18N: {
      getLocale: () => locale,
      text: (value) => value,
      t: (_key, fallback) => fallback,
    },
    DANMAKU_TRANSLATION_FEEDBACK: {
      hasSeen: async () => seen,
      markSeen: async () => { seen = true; },
    },
  };
  vm.runInNewContext(`${source}\nglobalThis.Panel = DanmakuSettingsPanel;`, context);
  const panel = new context.Panel();
  const callout = { hidden: false };
  const prompt = { hidden: false };
  panel.panel = {
    querySelector(selector) {
      if (selector === '[data-translation-callout]') return callout;
      if (selector === '[data-translation-prompt]') return prompt;
      return null;
    },
  };

  panel.configureTranslationFeedback();
  assert.equal(callout.hidden, true);
  assert.equal(prompt.hidden, true);
  assert.equal(panel.translationFeedbackLocale, null);

  locale = 'ja';
  panel.configureTranslationFeedback();
  assert.equal(callout.hidden, false);
  assert.equal(prompt.hidden, true);
  assert.equal(panel.translationFeedbackLocale, 'ja');

  locale = 'zh-CN';
  panel.configureTranslationFeedback();
  assert.equal(callout.hidden, false);
  assert.equal(panel.translationFeedbackLocale, 'zh_CN');

  locale = 'fr';
  panel.configureTranslationFeedback();
  assert.equal(callout.hidden, true);
  assert.equal(prompt.hidden, true);
  assert.equal(panel.translationFeedbackLocale, null);
});

test('top translation prompt remains hidden after acknowledgement', async () => {
  const source = fs.readFileSync(
    new URL('../src/content/settings-panel.js', `file://${__filename}`),
    'utf8'
  );
  let seen = false;
  const context = {
    console,
    setTimeout,
    clearTimeout,
    DANMAKU_CONSTANTS: {},
    DANMAKU_I18N: {
      getLocale: () => 'ja',
      text: (value) => value,
      t: (_key, fallback) => fallback,
    },
    DANMAKU_TRANSLATION_FEEDBACK: {
      hasSeen: async () => seen,
      markSeen: async () => { seen = true; },
    },
  };
  vm.runInNewContext(`${source}\nglobalThis.Panel = DanmakuSettingsPanel;`, context);
  const panel = new context.Panel();
  const callout = { hidden: true };
  const prompt = { hidden: true };
  panel.panel = {
    querySelector(selector) {
      if (selector === '[data-translation-callout]') return callout;
      if (selector === '[data-translation-prompt]') return prompt;
      return null;
    },
  };

  panel.configureTranslationFeedback();
  await panel.updateTranslationFeedbackPrompt();
  assert.equal(prompt.hidden, false);

  panel.dismissTranslationFeedbackPrompt();
  await Promise.resolve();
  assert.equal(seen, true);
  await panel.updateTranslationFeedbackPrompt();
  assert.equal(prompt.hidden, true);
  assert.equal(callout.hidden, false);
});

test('translation issue form asks for current and suggested wording', () => {
  const form = fs.readFileSync(
    new URL('../.github/ISSUE_TEMPLATE/translation-feedback.yml', `file://${__filename}`),
    'utf8'
  );

  assert.match(form, /label: Current wording/);
  assert.match(form, /label: Suggested wording/);
  assert.match(form, /label: Where did you see the text\?/);
});
