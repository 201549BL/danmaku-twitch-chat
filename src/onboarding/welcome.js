const params = new URLSearchParams(window.location.search);
DANMAKU_I18N.localizeDocument(document);
const refreshTabId = Number.parseInt(params.get('tab') || '', 10);
const needsRefresh = params.get('reason') === 'refresh' && Number.isInteger(refreshTabId);
const primaryAction = document.querySelector('[data-primary-action]');
const refreshNotice = document.querySelector('[data-refresh-notice]');
const status = document.querySelector('[data-status]');

if (needsRefresh) {
  refreshNotice.hidden = false;
  primaryAction.textContent = DANMAKU_I18N.t(
    'welcomeRefreshAction',
    'Refresh Twitch and continue'
  );
}

primaryAction.addEventListener('click', async () => {
  primaryAction.disabled = true;
  status.textContent = needsRefresh
    ? DANMAKU_I18N.t('welcomeRefreshing', 'Refreshing Twitch…')
    : DANMAKU_I18N.t('welcomeOpening', 'Opening Twitch…');
  try {
    if (needsRefresh) {
      await chrome.tabs.reload(refreshTabId);
      await chrome.tabs.update(refreshTabId, { active: true });
    } else {
      await chrome.tabs.create({ url: 'https://www.twitch.tv/directory' });
    }
    window.close();
  } catch (error) {
    primaryAction.disabled = false;
    status.textContent = needsRefresh
      ? DANMAKU_I18N.t(
          'welcomeRefreshFailed',
          'Could not refresh that tab. Return to Twitch and refresh it manually.'
        )
      : DANMAKU_I18N.t(
          'welcomeOpenFailed',
          'Could not open Twitch. Visit twitch.tv to get started.'
        );
  }
});
