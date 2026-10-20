const DANMAKU_RELEASE_NOTES = {
  STORAGE_KEY: 'danmakuReleaseNotes',
  ITEMS: [
    {
      key: 'releaseNoteWebgpu',
      fallback: 'Auto rendering for new installs, with automatic DOM fallback when WebGPU is unavailable.',
    },
    {
      key: 'releaseNoteDenseChat',
      fallback: 'Denser WebGPU chat with animated usernames, emotes, and badges.',
    },
    {
      key: 'releaseNoteRendererChoice',
      fallback: 'Find Renderer in Advanced. Your existing renderer choice stays unchanged.',
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
