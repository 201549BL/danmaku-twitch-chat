class DanmakuSettings {
  constructor() {
    this.settings = { ...DANMAKU_CONSTANTS.DEFAULTS };
    this.listeners = new Set();
    this._saveTimer = null;
    this._saveDebounceMs = 400;
  }

  async load() {
    try {
      const stored = await chrome.storage.local.get('danmakuSettings');
      if (stored.danmakuSettings) {
        this.settings = { ...DANMAKU_CONSTANTS.DEFAULTS, ...stored.danmakuSettings };
      }
    } catch (e) {
      console.warn('[Danmaku] Failed to load settings:', e);
    }
    return this.settings;
  }

  async save() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    try {
      await chrome.storage.local.set({ danmakuSettings: this.settings });
    } catch (e) {
      console.warn('[Danmaku] Failed to save settings:', e);
    }
  }

  scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.save();
    }, this._saveDebounceMs);
  }

  get(key) {
    return this.settings[key] ?? DANMAKU_CONSTANTS.DEFAULTS[key];
  }

  set(key, value) {
    const clamped = this.clampValue(key, value);
    if (this.settings[key] !== clamped) {
      this.settings[key] = clamped;
      this.notifyListeners();
      this.scheduleSave();
    }
  }

  clampValue(key, value) {
    const limits = DANMAKU_CONSTANTS.LIMITS;
    switch (key) {
      case 'fontSize':
        return Math.max(limits.minFontSize, Math.min(limits.maxFontSize, value));
      case 'rows':
        return Math.max(limits.minRows, Math.min(limits.maxRows, value));
      case 'duration':
        return Math.max(limits.minDuration, Math.min(limits.maxDuration, value));
      case 'opacity':
        return Math.max(limits.minOpacity, Math.min(limits.maxOpacity, value));
      case 'regionTop':
        return Math.max(limits.minRegionTop, Math.min(limits.maxRegionTop, value));
      case 'regionHeight':
        return Math.max(limits.minRegionHeight, Math.min(limits.maxRegionHeight, value));
      case 'popFadeLifetime':
        return Math.max(limits.minPopFadeLifetime, Math.min(limits.maxPopFadeLifetime, value));
      case 'animationMode':
        return DANMAKU_CONSTANTS.ANIMATION_MODES.includes(value) ? value : 'scroll';
      case 'maxActiveMessages':
        return Math.max(1, Math.min(limits.maxActiveMessages, value));
      default:
        return value;
    }
  }

  addListener(callback) {
    this.listeners.add(callback);
  }

  removeListener(callback) {
    this.listeners.delete(callback);
  }

  notifyListeners() {
    this.listeners.forEach((cb) => cb(this.settings));
  }

  getAll() {
    return { ...this.settings };
  }
}

const danmakuSettings = new DanmakuSettings();
