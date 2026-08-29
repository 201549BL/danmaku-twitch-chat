const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function createHarness(initialValue) {
  let stored = initialValue;
  const source = fs.readFileSync(
    new URL('../src/shared/engagement.js', `file://${__filename}`),
    'utf8'
  );
  const chrome = {
    storage: {
      local: {
        async get(key) { return { [key]: stored }; },
        async set(value) { stored = value.danmakuEngagement; },
      },
    },
  };
  const context = { chrome };
  vm.runInNewContext(`${source}\nglobalThis.engagement = DANMAKU_ENGAGEMENT;`, context);
  return {
    engagement: context.engagement,
    get stored() { return stored; },
  };
}

test('records successful sessions without collecting browsing details', async () => {
  const harness = createHarness();
  await harness.engagement.recordSuccessfulSession(1000);
  await harness.engagement.recordSuccessfulSession(2000);

  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.stored)),
    {
      firstSuccessfulUseAt: 1000,
      lastSuccessfulUseAt: 2000,
      successfulSessions: 2,
      reviewPromptDismissed: false,
    }
  );
});

test('requires three sessions and seven days before showing the review prompt', () => {
  const harness = createHarness();
  const sevenDays = harness.engagement.MIN_AGE_MS;
  const eligible = {
    firstSuccessfulUseAt: 1000,
    lastSuccessfulUseAt: 2000,
    successfulSessions: 3,
    reviewPromptDismissed: false,
  };

  assert.equal(harness.engagement.isReviewPromptEligible(eligible, 1000 + sevenDays - 1), false);
  assert.equal(harness.engagement.isReviewPromptEligible(eligible, 1000 + sevenDays), true);
  assert.equal(
    harness.engagement.isReviewPromptEligible({ ...eligible, successfulSessions: 2 }, 1000 + sevenDays),
    false
  );
});

test('never shows the review prompt again after dismissal', async () => {
  const harness = createHarness({
    firstSuccessfulUseAt: 1000,
    lastSuccessfulUseAt: 2000,
    successfulSessions: 4,
    reviewPromptDismissed: false,
  });

  await harness.engagement.dismissReviewPrompt();

  assert.equal(harness.stored.reviewPromptDismissed, true);
  assert.equal(await harness.engagement.shouldShowReviewPrompt(1000 + 10 * 24 * 60 * 60 * 1000), false);
});
