const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function createHarness(initialValue) {
  let stored = initialValue;
  const source = fs.readFileSync(
    new URL('../src/shared/release-notes.js', `file://${__filename}`),
    'utf8'
  );
  const chrome = {
    runtime: { getManifest: () => ({ version: '1.7.0' }) },
    storage: {
      local: {
        async get(key) { return { [key]: stored }; },
        async set(value) { stored = value.danmakuReleaseNotes; },
      },
    },
  };
  const context = { chrome };
  vm.runInNewContext(`${source}\nglobalThis.notes = DANMAKU_RELEASE_NOTES;`, context);
  return {
    notes: context.notes,
    get stored() { return stored; },
  };
}

test('shows release notes only for the pending current version', async () => {
  const pending = createHarness({ pendingVersion: '1.7.0', dismissedVersion: null });
  assert.equal(await pending.notes.shouldShow(), true);

  const old = createHarness({ pendingVersion: '1.6.0', dismissedVersion: null });
  assert.equal(await old.notes.shouldShow(), false);
});

test('dismissing release notes clears the prompt for the current version', async () => {
  const harness = createHarness({ pendingVersion: '1.7.0', dismissedVersion: null });

  await harness.notes.dismiss();

  assert.equal(harness.stored.pendingVersion, null);
  assert.equal(harness.stored.dismissedVersion, '1.7.0');
  assert.equal(await harness.notes.shouldShow(), false);
});
