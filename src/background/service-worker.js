const TWITCH_URL_RE = /^https:\/\/www\.twitch\.tv\//;
let fontListPromise = null;

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
      // Content script not loaded on this tab yet — nothing to do.
    }
    return;
  }
  chrome.tabs.create({ url: 'https://www.twitch.tv/' });
});
