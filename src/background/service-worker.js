const TWITCH_URL_RE = /^https:\/\/www\.twitch\.tv\//;

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
