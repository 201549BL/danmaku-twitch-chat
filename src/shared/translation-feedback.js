const DANMAKU_TRANSLATION_FEEDBACK = {
  STORAGE_KEY: 'danmakuTranslationFeedback',

  normalize(raw) {
    const seenLocales = Array.isArray(raw?.seenLocales)
      ? [...new Set(raw.seenLocales.filter((locale) => typeof locale === 'string'))]
      : [];
    return { seenLocales };
  },

  async read() {
    const stored = await chrome.storage.local.get(this.STORAGE_KEY);
    return this.normalize(stored[this.STORAGE_KEY]);
  },

  async hasSeen(locale) {
    if (!locale) return true;
    const state = await this.read();
    return state.seenLocales.includes(locale);
  },

  async markSeen(locale) {
    if (!locale) return this.read();
    const state = await this.read();
    if (!state.seenLocales.includes(locale)) state.seenLocales.push(locale);
    await chrome.storage.local.set({ [this.STORAGE_KEY]: state });
    return state;
  },
};
