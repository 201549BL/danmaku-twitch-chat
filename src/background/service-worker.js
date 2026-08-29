const TWITCH_URL_RE = /^https:\/\/www\.twitch\.tv\//;
const WELCOME_PAGE = 'src/onboarding/welcome.html';
let fontListPromise = null;

function welcomeUrl(params = {}) {
  const url = new URL(chrome.runtime.getURL(WELCOME_PAGE));
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url.href;
}

chrome.runtime.onInstalled.addListener((details) => {
  const version = chrome.runtime.getManifest().version;
  if (details.reason === 'install') {
    chrome.storage.local.set({
      danmakuReleaseNotes: { pendingVersion: null, dismissedVersion: version },
    });
    chrome.tabs.create({ url: welcomeUrl() });
    return;
  }
  if (details.reason === 'update') {
    chrome.storage.local.set({
      danmakuReleaseNotes: { pendingVersion: version, dismissedVersion: null },
    });
  }
});

async function getInstalledFontNames() {
  const fonts = await chrome.fontSettings.getFontList();
  const seen = new Set();
  const names = [];
  for (const font of fonts || []) {
    const name = String(font?.displayName || '').trim();
    const normalized = name.toLocaleLowerCase();
    if (!name || seen.has(normalized)) continue;
    seen.add(normalized);
    names.push(name);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action === 'open-external-link') {
    const allowedUrls = new Set([
      `https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews`,
      'https://github.com/201549BL/danmaku-twitch-chat/issues/new/choose',
      'https://github.com/201549BL/danmaku-twitch-chat#usage',
      'https://github.com/201549BL/danmaku-twitch-chat/blob/main/PRIVACY.md',
      'https://github.com/201549BL/danmaku-twitch-chat/blob/main/CHANGELOG.md',
      'https://github.com/201549BL/danmaku-twitch-chat/issues/new?template=translation-feedback.yml&title=%5Bja%5D%20Translation%20feedback',
      'https://github.com/201549BL/danmaku-twitch-chat/issues/new?template=translation-feedback.yml&title=%5Bzh_CN%5D%20Translation%20feedback',
      'https://github.com/201549BL/danmaku-twitch-chat/issues/new?template=translation-feedback.yml&title=%5Bzh_TW%5D%20Translation%20feedback',
    ]);
    if (!allowedUrls.has(message.url)) {
      sendResponse({ ok: false, error: 'invalid-url' });
      return;
    }
    chrome.tabs.create({ url: message.url })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false, error: 'open-failed' }));
    return true;
  }

  if (message?.action !== 'get-font-list') return;

  if (!fontListPromise) {
    fontListPromise = getInstalledFontNames().catch((error) => {
      fontListPromise = null;
      throw error;
    });
  }
  fontListPromise
    .then((fonts) => sendResponse({ fonts }))
    .catch((error) => {
      console.warn('[Danmaku] Failed to read installed fonts:', error);
      sendResponse({ fonts: [], error: 'unavailable' });
    });
  return true;
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab?.url && TWITCH_URL_RE.test(tab.url)) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'open-settings' });
    } catch (e) {
      // Existing Twitch tabs do not receive newly installed content scripts.
      // Give the user an explicit, one-click recovery path instead of failing silently.
      chrome.tabs.create({
        url: welcomeUrl({ reason: 'refresh', tab: tab.id }),
      });
    }
    return;
  }
  chrome.tabs.create({ url: 'https://www.twitch.tv/' });
});
