const DANMAKU_ENGAGEMENT = {
  STORAGE_KEY: 'danmakuEngagement',
  MIN_SUCCESSFUL_SESSIONS: 3,
  MIN_AGE_MS: 7 * 24 * 60 * 60 * 1000,

  normalize(raw) {
    const value = raw || {};
    return {
      firstSuccessfulUseAt: Number.isFinite(value.firstSuccessfulUseAt)
        ? value.firstSuccessfulUseAt
        : null,
      lastSuccessfulUseAt: Number.isFinite(value.lastSuccessfulUseAt)
        ? value.lastSuccessfulUseAt
        : null,
      successfulSessions: Number.isFinite(value.successfulSessions)
        ? Math.max(0, Math.floor(value.successfulSessions))
        : 0,
      reviewPromptDismissed: value.reviewPromptDismissed === true,
    };
  },

  async read() {
    const stored = await chrome.storage.local.get(this.STORAGE_KEY);
    return this.normalize(stored[this.STORAGE_KEY]);
  },

  async write(value) {
    const normalized = this.normalize(value);
    await chrome.storage.local.set({ [this.STORAGE_KEY]: normalized });
    return normalized;
  },

  async recordSuccessfulSession(now = Date.now()) {
    const current = await this.read();
    return this.write({
      ...current,
      firstSuccessfulUseAt: current.firstSuccessfulUseAt ?? now,
      lastSuccessfulUseAt: now,
      successfulSessions: current.successfulSessions + 1,
    });
  },

  isReviewPromptEligible(state, now = Date.now()) {
    const value = this.normalize(state);
    return !value.reviewPromptDismissed &&
      value.successfulSessions >= this.MIN_SUCCESSFUL_SESSIONS &&
      value.firstSuccessfulUseAt !== null &&
      now - value.firstSuccessfulUseAt >= this.MIN_AGE_MS;
  },

  async shouldShowReviewPrompt(now = Date.now()) {
    return this.isReviewPromptEligible(await this.read(), now);
  },

  async dismissReviewPrompt() {
    const current = await this.read();
    return this.write({ ...current, reviewPromptDismissed: true });
  },
};
