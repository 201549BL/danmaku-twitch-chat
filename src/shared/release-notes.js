const DANMAKU_RELEASE_NOTES = {
  STORAGE_KEY: 'danmakuReleaseNotes',
  ITEMS: [
    {
      key: 'releaseNoteWebgpu',
      fallback: 'Added WebGPU, a new way to display chat that uses your graphics card to help keep messages moving smoothly when chat gets busy.',
    },
    {
      key: 'releaseNoteDenseChat',
      fallback: 'You can show up to 300 messages at once and keep username animations on, alongside emotes and badges.',
    },
    {
      key: 'releaseNoteRendererChoice',
      fallback: 'To try it, open Settings > Advanced > Renderer and choose WebGPU.',
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
