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
      const raw = stored.danmakuSettings;
      const needsPersonalizationSnapshot = !raw ||
        !Object.prototype.hasOwnProperty.call(raw, 'signatureEffectPool') ||
        !Object.prototype.hasOwnProperty.call(raw, 'signaturePalettePool') ||
        !Object.prototype.hasOwnProperty.call(raw, 'signatureKnownEffects') ||
        !Object.prototype.hasOwnProperty.call(raw, 'signatureKnownPalettes');
      this.settings = this.normalizeSettings(raw);
      if (needsPersonalizationSnapshot) {
        await chrome.storage.local.set({ danmakuSettings: this.settings });
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
      const merged = this.normalizeSettings(next);
      if (this._shallowEqual(merged, this.settings)) return;
      this.settings = merged;
      this.notifyListeners();
    });
  }

  _shallowEqual(a, b) {
    const keysA = Object.keys(a);
    if (keysA.length !== Object.keys(b).length) return false;
    for (const k of keysA) {
      if (!this._valueEqual(a[k], b[k])) return false;
    }
    return true;
  }

  _valueEqual(a, b) {
    if (a === b) return true;
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, index) => value === b[index]);
  }

  normalizeSettings(raw) {
    const source = raw || {};
    const normalized = { ...DANMAKU_CONSTANTS.DEFAULTS, ...source };
    if (raw && !Object.prototype.hasOwnProperty.call(source, 'usernameEffectStyle')) {
      const knownLegacyEffect = (DANMAKU_CONSTANTS.TEXT_EFFECTS || []).some(
        (effect) => effect.key === source.usernameEffect
      );
      if (source.usernameEffectScope === 'off' || !source.usernameEffect || source.usernameEffect === 'none') {
        normalized.usernameEffectStyle = 'original';
      } else if (source.usernameEffect === 'signature') {
        normalized.usernameEffectStyle = 'signature';
      } else if (knownLegacyEffect) {
        normalized.usernameEffectStyle = 'custom';
      } else {
        normalized.usernameEffectStyle = 'original';
      }
    }
    if (raw && !Object.prototype.hasOwnProperty.call(source, 'signatureEffectPool')) {
      normalized.signatureEffectPool = DANMAKU_CONSTANTS.PERSONALIZATION_BASELINE.effects;
    }
    if (raw && !Object.prototype.hasOwnProperty.call(source, 'signaturePalettePool')) {
      normalized.signaturePalettePool = DANMAKU_CONSTANTS.PERSONALIZATION_BASELINE.palettes;
    }
    if (raw && !Object.prototype.hasOwnProperty.call(source, 'signatureKnownEffects')) {
      normalized.signatureKnownEffects = [
        ...DANMAKU_CONSTANTS.PERSONALIZATION_BASELINE.effects,
        ...(Array.isArray(source.signatureEffectPool) ? source.signatureEffectPool : []),
      ];
    }
    if (raw && !Object.prototype.hasOwnProperty.call(source, 'signatureKnownPalettes')) {
      normalized.signatureKnownPalettes = [
        ...DANMAKU_CONSTANTS.PERSONALIZATION_BASELINE.palettes,
        ...(Array.isArray(source.signaturePalettePool) ? source.signaturePalettePool : []),
      ];
    }
    for (const key of [
      'usernameEffectStyle',
      'usernameEffect',
      'usernameEffectPalette',
      'usernameEffectScope',
      'signatureEffectPool',
      'signaturePalettePool',
      'signatureKnownEffects',
      'signatureKnownPalettes',
    ]) {
      normalized[key] = this.clampValue(key, normalized[key]);
    }
    return normalized;
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

  clampPool(value, entries, fallback) {
    const known = new Set((entries || []).map((entry) => entry.key));
    const selected = [];
    for (const key of Array.isArray(value) ? value : []) {
      if (known.has(key) && !selected.includes(key)) selected.push(key);
    }
    return selected.length ? selected : [...fallback];
  }

  clampKnownOptions(value, entries) {
    const known = new Set((entries || []).map((entry) => entry.key));
    const selected = [];
    for (const key of Array.isArray(value) ? value : []) {
      if (known.has(key) && !selected.includes(key)) selected.push(key);
    }
    return selected;
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
    if (!this._valueEqual(this.settings[key], clamped)) {
      this.settings[key] = clamped;
      this.notifyListeners();
      this.scheduleSave();
    }
  }

  setMany(obj) {
    let changed = false;
    for (const [key, value] of Object.entries(obj)) {
      const clamped = this.clampValue(key, value);
      if (!this._valueEqual(this.settings[key], clamped)) {
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
      case 'usernameEffectStyle': {
        const known = new Set(
          (DANMAKU_CONSTANTS.TEXT_EFFECT_STYLES || []).map((style) => style.key)
        );
        return known.has(value) ? value : 'original';
      }
      case 'usernameEffect': {
        const known = new Set((DANMAKU_CONSTANTS.TEXT_EFFECTS || []).map((effect) => effect.key));
        return known.has(value) ? value : 'duotoneFlow';
      }
      case 'usernameEffectPalette': {
        const known = new Set(
          (DANMAKU_CONSTANTS.TEXT_EFFECT_PALETTES || []).map((palette) => palette.key)
        );
        return known.has(value) ? value : 'analogous';
      }
      case 'usernameEffectScope':
        return (DANMAKU_CONSTANTS.TEXT_EFFECT_SCOPES || []).includes(value)
          ? value
          : 'favorites';
      case 'signatureEffectPool':
        return this.clampPool(
          value,
          DANMAKU_CONSTANTS.TEXT_EFFECTS,
          DANMAKU_CONSTANTS.DEFAULTS.signatureEffectPool
        );
      case 'signaturePalettePool':
        return this.clampPool(
          value,
          DANMAKU_CONSTANTS.TEXT_EFFECT_PALETTES,
          DANMAKU_CONSTANTS.DEFAULTS.signaturePalettePool
        );
      case 'signatureKnownEffects':
        return this.clampKnownOptions(value, DANMAKU_CONSTANTS.TEXT_EFFECTS);
      case 'signatureKnownPalettes':
        return this.clampKnownOptions(value, DANMAKU_CONSTANTS.TEXT_EFFECT_PALETTES);
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
