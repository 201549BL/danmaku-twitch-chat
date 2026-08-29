const DANMAKU_RELEASE_NOTES = {
  STORAGE_KEY: 'danmakuReleaseNotes',
  ITEMS: [
    {
      key: 'releaseNoteOnboarding',
      fallback: 'A guided welcome page and one-click recovery for Twitch tabs that need a refresh.',
    },
    {
      key: 'releaseNoteFeedback',
      fallback: 'Always-available help, feedback, and rating links in settings.',
    },
    {
      key: 'releaseNoteLocalization',
      fallback: 'Japanese, Simplified Chinese, and Traditional Chinese interface support.',
    },
  ],

  currentVersion() {
    return chrome.runtime.getManifest().version;
  },

  normalize(raw) {
    const value = raw || {};
    return {
      pendingVersion: typeof value.pendingVersion === 'string' ? value.pendingVersion : null,
      dismissedVersion: typeof value.dismissedVersion === 'string' ? value.dismissedVersion : null,
    };
  },

  async read() {
    const stored = await chrome.storage.local.get(this.STORAGE_KEY);
    return this.normalize(stored[this.STORAGE_KEY]);
  },

  async shouldShow() {
    const state = await this.read();
    const version = this.currentVersion();
    return state.pendingVersion === version && state.dismissedVersion !== version;
  },

  async dismiss() {
    const current = await this.read();
    const version = this.currentVersion();
    const next = {
      ...current,
      pendingVersion: current.pendingVersion === version ? null : current.pendingVersion,
      dismissedVersion: version,
    };
    await chrome.storage.local.set({ [this.STORAGE_KEY]: next });
    return next;
  },
};
