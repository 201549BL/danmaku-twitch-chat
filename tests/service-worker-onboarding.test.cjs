const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function createHarness({ messageFails = false } = {}) {
  const source = fs.readFileSync(
    new URL('../src/background/service-worker.js', `file://${__filename}`),
    'utf8'
  );
  let installListener;
  let actionListener;
  let messageListener;
  const createdTabs = [];
  const storageWrites = [];
  const chrome = {
    action: {
      onClicked: { addListener(listener) { actionListener = listener; } },
    },
    runtime: {
      id: 'test-extension-id',
      getURL(path) { return `chrome-extension://test-extension-id/${path}`; },
      getManifest() { return { version: '1.7.0' }; },
      onInstalled: { addListener(listener) { installListener = listener; } },
      onMessage: { addListener(listener) { messageListener = listener; } },
    },
    storage: {
      local: {
        async set(value) { storageWrites.push(value); },
      },
    },
    tabs: {
      async sendMessage() {
        if (messageFails) throw new Error('receiving end does not exist');
      },
      async create(options) {
        createdTabs.push(options);
        return options;
      },
    },
    fontSettings: { getFontList: async () => [] },
  };
  vm.runInNewContext(source, { chrome, URL, console });
  return { installListener, actionListener, messageListener, createdTabs, storageWrites };
}

test('opens the welcome page only on first install', () => {
  const harness = createHarness();

  harness.installListener({ reason: 'update' });
  assert.equal(harness.createdTabs.length, 0);

  harness.installListener({ reason: 'install' });
  assert.equal(harness.createdTabs.length, 1);
  assert.equal(
    harness.createdTabs[0].url,
    'chrome-extension://test-extension-id/src/onboarding/welcome.html'
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.storageWrites[1])),
    {
      danmakuReleaseNotes: {
        pendingVersion: null,
        dismissedVersion: '1.7.0',
      },
    }
  );
});

test('marks release notes as pending after an update', () => {
  const harness = createHarness();

  harness.installListener({ reason: 'update', previousVersion: '1.6.0' });

  assert.equal(harness.createdTabs.length, 0);
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.storageWrites[0])),
    {
      danmakuReleaseNotes: {
        pendingVersion: '1.7.0',
        dismissedVersion: null,
      },
    }
  );
});

test('opens a one-click refresh explanation when an existing Twitch tab is stale', async () => {
  const harness = createHarness({ messageFails: true });

  await harness.actionListener({
    id: 42,
    url: 'https://www.twitch.tv/example',
  });

  assert.equal(harness.createdTabs.length, 1);
  const url = new URL(harness.createdTabs[0].url);
  assert.equal(url.pathname, '/src/onboarding/welcome.html');
  assert.equal(url.searchParams.get('reason'), 'refresh');
  assert.equal(url.searchParams.get('tab'), '42');
});

test('opens settings without creating a tab when Twitch is already active', async () => {
  const harness = createHarness();

  await harness.actionListener({
    id: 42,
    url: 'https://www.twitch.tv/example',
  });

  assert.equal(harness.createdTabs.length, 0);
});

test('only opens allowlisted review and feedback destinations', async () => {
  const harness = createHarness();
  const invalid = await new Promise((resolve) => {
    harness.messageListener(
      { action: 'open-external-link', url: 'https://example.com/' },
      {},
      resolve
    );
  });

  assert.equal(invalid.ok, false);
  assert.equal(harness.createdTabs.length, 0);

  const reviewUrl = 'https://chromewebstore.google.com/detail/test-extension-id/reviews';
  const valid = await new Promise((resolve) => {
    const keepOpen = harness.messageListener(
      { action: 'open-external-link', url: reviewUrl },
      {},
      resolve
    );
    assert.equal(keepOpen, true);
  });

  assert.equal(valid.ok, true);
  assert.equal(harness.createdTabs[0].url, reviewUrl);

  const guideUrl = 'https://github.com/201549BL/danmaku-twitch-chat#usage';
  const guide = await new Promise((resolve) => {
    harness.messageListener(
      { action: 'open-external-link', url: guideUrl },
      {},
      resolve
    );
  });
  assert.equal(guide.ok, true);
  assert.equal(harness.createdTabs[1].url, guideUrl);

  const changelogUrl = 'https://github.com/201549BL/danmaku-twitch-chat/blob/main/CHANGELOG.md';
  const changelog = await new Promise((resolve) => {
    harness.messageListener(
      { action: 'open-external-link', url: changelogUrl },
      {},
      resolve
    );
  });
  assert.equal(changelog.ok, true);
  assert.equal(harness.createdTabs[2].url, changelogUrl);

  const translationUrls = [
    'https://github.com/201549BL/danmaku-twitch-chat/issues/new?template=translation-feedback.yml&title=%5Bja%5D%20Translation%20feedback',
    'https://github.com/201549BL/danmaku-twitch-chat/issues/new?template=translation-feedback.yml&title=%5Bzh_CN%5D%20Translation%20feedback',
    'https://github.com/201549BL/danmaku-twitch-chat/issues/new?template=translation-feedback.yml&title=%5Bzh_TW%5D%20Translation%20feedback',
  ];
  for (const translationUrl of translationUrls) {
    const translation = await new Promise((resolve) => {
      harness.messageListener(
        { action: 'open-external-link', url: translationUrl },
        {},
        resolve
      );
    });
    assert.equal(translation.ok, true);
  }
  assert.deepEqual(
    harness.createdTabs.slice(3).map((tab) => tab.url),
    translationUrls
  );
});
