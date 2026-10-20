const DANMAKU_RELEASE_NOTES = {
  STORAGE_KEY: 'danmakuReleaseNotes',
  ITEMS: [
    {
      key: 'releaseNoteWebgpu',
      fallback: 'New WebGPU option for busy chat. Find it in Advanced > Renderer.',
    },
    {
      key: 'releaseNoteDenseChat',
      fallback: 'Show up to 300 messages across 48 rows, including animated usernames, emotes, and badges.',
    },
    {
      key: 'releaseNoteRendererChoice',
      fallback: 'New installs use Auto. It switches to the original renderer if WebGPU is unavailable. Your current renderer setting stays the same.',
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
