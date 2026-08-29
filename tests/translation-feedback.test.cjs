const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function createHarness(initialValue) {
  let stored = initialValue;
  const source = fs.readFileSync(
    new URL('../src/shared/translation-feedback.js', `file://${__filename}`),
    'utf8'
  );
  const chrome = {
    storage: {
      local: {
        async get(key) { return { [key]: stored }; },
        async set(value) { stored = value.danmakuTranslationFeedback; },
      },
    },
  };
  const context = { chrome };
  vm.runInNewContext(
    `${source}\nglobalThis.translationFeedback = DANMAKU_TRANSLATION_FEEDBACK;`,
    context
  );
  return {
    feedback: context.translationFeedback,
    get stored() { return stored; },
  };
}

test('translation prompt acknowledgement is remembered per locale', async () => {
  const harness = createHarness();

  assert.equal(await harness.feedback.hasSeen('ja'), false);
  await harness.feedback.markSeen('ja');
  assert.equal(await harness.feedback.hasSeen('ja'), true);
  assert.equal(await harness.feedback.hasSeen('zh_CN'), false);

  await harness.feedback.markSeen('zh_CN');
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.stored)),
    { seenLocales: ['ja', 'zh_CN'] }
  );
});

test('translation feedback state recovers from malformed stored values', async () => {
  const harness = createHarness({ seenLocales: ['ja', 'ja', null, 42] });

  assert.deepEqual(
    JSON.parse(JSON.stringify(await harness.feedback.read())),
    { seenLocales: ['ja'] }
  );
  assert.equal(await harness.feedback.hasSeen(null), true);
});
