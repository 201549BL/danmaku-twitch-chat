class DanmakuSettings {
  constructor() {
    this.settings = { ...DANMAKU_CONSTANTS.DEFAULTS };
    this.listeners = new Set();
    this._saveTimer = null;
    this._saveDebounceMs = 400;
    this._storageListenerInstalled = false;
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
    this._installStorageListener();
    return this.settings;
  }

  _installStorageListener() {
    if (this._storageListenerInstalled) return;
    if (!chrome?.storage?.onChanged?.addListener) return;
    this._storageListenerInstalled = true;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.danmakuSettings) return;
      const next = changes.danmakuSettings.newValue;
      if (!next) return;
      const merged = { ...DANMAKU_CONSTANTS.DEFAULTS, ...next };
      if (this._shallowEqual(merged, this.settings)) return;
      this.settings = merged;
      this.notifyListeners();
    });
  }

  _shallowEqual(a, b) {
    const keysA = Object.keys(a);
    if (keysA.length !== Object.keys(b).length) return false;
    for (const k of keysA) {
      if (a[k] !== b[k]) return false;
    }
    return true;
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

  setMany(obj) {
    let changed = false;
    for (const [key, value] of Object.entries(obj)) {
      const clamped = this.clampValue(key, value);
      if (this.settings[key] !== clamped) {
        this.settings[key] = clamped;
        changed = true;
      }
    }
    if (changed) {
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
      case 'highlightBadges': {
        const known = new Set(
          (DANMAKU_CONSTANTS.HIGHLIGHT_BADGE_ROLES || []).map((r) => r.key)
        );
        const arr = Array.isArray(value) ? value : [];
        const seen = new Set();
        const out = [];
        for (const v of arr) {
          const k = String(v || '').toLowerCase();
          if (known.has(k) && !seen.has(k)) {
            seen.add(k);
            out.push(k);
          }
        }
        return out;
      }
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
