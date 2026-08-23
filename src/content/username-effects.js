const DANMAKU_USERNAME_EFFECTS = {
  FAVORITES_ONLY_PRESSURE: 0.35,
  EFFECT_MIX: [
    { key: 'duotoneFlow', weight: 50 },
    { key: 'duotoneEmber', weight: 25 },
    { key: 'duotoneGlitch', weight: 25 },
  ],
  PALETTE_MIX: [
    { key: 'analogous', weight: 50 },
    { key: 'monochrome', weight: 25 },
    { key: 'complementary', weight: 25 },
  ],

  hash(value) {
    let hash = 2166136261;
    for (const char of String(value || '').trim().toLowerCase()) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  },

  chooseRendezvous(options, identity) {
    // Catalog order is irrelevant, and a new option only moves identities that it wins.
    let selected;
    let lowestCost = Infinity;
    for (const option of options) {
      if (!(option.weight > 0)) continue;
      const hash = this.hash(`${identity}:${option.key}`);
      const random = (hash + 1) / 4294967297;
      const cost = -Math.log(random) / option.weight;
      if (
        cost < lowestCost ||
        (cost === lowestCost && (!selected || option.key < selected))
      ) {
        selected = option.key;
        lowestCost = cost;
      }
    }
    return selected;
  },

  allowedOptions(options, allowedKeys) {
    if (!Array.isArray(allowedKeys) || !allowedKeys.length) return options;
    const allowed = new Set(allowedKeys);
    const selected = options.filter((option) => allowed.has(option.key));
    return selected.length ? selected : options;
  },

  resolveEffect(effect, username, allowedKeys) {
    if (effect !== 'signature') return effect;
    const options = this.allowedOptions(this.EFFECT_MIX, allowedKeys);
    return this.chooseRendezvous(options, `effect:${username}`);
  },

  resolvePalette(palette, username, allowedKeys) {
    if (palette !== 'auto') return palette;
    const options = this.allowedOptions(this.PALETTE_MIX, allowedKeys);
    return this.chooseRendezvous(options, `palette:${username}`);
  },

  decorateElement(
    element,
    { username, text = username, color, effect, palette, mode = 'scroll', enhanced = false }
  ) {
    const effectDefinition = (DANMAKU_CONSTANTS.TEXT_EFFECTS || []).find(
      (entry) => entry.key === effect
    );
    if (!element || !effectDefinition) return false;

    element.classList.add(`danmaku-username-effect--${effect}`);
    if (enhanced) element.classList.add('danmaku-username-effect--enhanced');
    element.dataset.danmakuUsernameEffect = effect;
    element.dataset.danmakuUsernamePalette = palette;
    element.dataset.danmakuUsernameText = text;
    element.style.color = color;
    element.style.setProperty('--danmaku-username-color', color || '#ffffff');
    element.style.setProperty('--danmaku-secondary-color', this.getSecondaryColor(color, palette));
    if (effectDefinition.texture) {
      const textureUrl = chrome.runtime.getURL(effectDefinition.texture);
      element.style.setProperty('--danmaku-effect-texture', `url("${textureUrl}")`);
    }
    const profile = this.getProfile(username, mode);
    element.style.setProperty('--danmaku-effect-duration-scale', profile.durationScale);
    element.style.setProperty('--danmaku-effect-delay', profile.delay);
    element.style.setProperty('--danmaku-gradient-direction', profile.gradientDirection);
    element.style.setProperty('--danmaku-texture-direction', profile.textureDirection);
    return true;
  },

  getProfile(username, mode) {
    const hash = this.hash(username);

    const durationScale = 0.88 + (hash % 25) / 100;
    const delaySeconds = -((hash >>> 8) % 7000) / 1000;
    const reverse = Boolean(hash & 1) !== (mode === 'reverse');
    return {
      durationScale: durationScale.toFixed(2),
      delay: `${delaySeconds.toFixed(3)}s`,
      gradientDirection: reverse ? 'alternate-reverse' : 'alternate',
      textureDirection: reverse ? 'reverse' : 'normal',
    };
  },

  parseColor(color) {
    const value = String(color || '').trim();
    const hex = value.replace(/^#/, '');
    if (/^[0-9a-f]{3,4}$/i.test(hex)) {
      return Array.from(hex.slice(0, 3), (part) => parseInt(part + part, 16));
    }
    if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) {
      return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
    }

    if (!/^rgba?\(/i.test(value)) return null;
    const channels = value.match(/-?\d*\.?\d+%?/g);
    if (!channels || channels.length < 3) return null;
    return channels.slice(0, 3).map((channel) => {
      const number = parseFloat(channel);
      const scaled = channel.endsWith('%') ? number * 2.55 : number;
      return Math.max(0, Math.min(255, scaled));
    });
  },

  getSecondaryColor(color, palette = 'analogous') {
    const channels = this.parseColor(color);
    if (!channels) return color || '#ffffff';
    const [r, g, b] = channels.map((channel) => channel / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const lightness = (max + min) / 2;
    let hue = 0;
    if (delta) {
      if (max === r) hue = 60 * (((g - b) / delta) % 6);
      else if (max === g) hue = 60 * ((b - r) / delta + 2);
      else hue = 60 * ((r - g) / delta + 4);
    }
    if (hue < 0) hue += 360;
    const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
    const hueShift = palette === 'monochrome' ? 0 : palette === 'complementary' ? 165 : 35;
    const secondaryHue = Math.round((hue + hueShift) % 360);
    const secondarySaturation = palette === 'monochrome'
      ? Math.round(Math.max(48, Math.min(76, saturation * 70)))
      : Math.round(Math.max(62, Math.min(82, saturation * 82)));
    const secondaryLightness = palette === 'monochrome'
      ? Math.round(lightness > 0.64 ? 56 : Math.max(64, Math.min(72, lightness * 100 + 12)))
      : Math.round(Math.max(60, Math.min(70, lightness * 100 + 7)));
    return `hsl(${secondaryHue} ${secondarySaturation}% ${secondaryLightness}%)`;
  },

  shouldLimitToFavorites(scope, dynamicMode, pressure) {
    return (
      scope === 'everyone' &&
      dynamicMode &&
      pressure >= this.FAVORITES_ONLY_PRESSURE
    );
  },

  shouldApply(scope, dynamicMode, pressure, favorite) {
    if (scope === 'off') return false;
    if (scope !== 'everyone') return scope === 'favorites' && favorite;
    return !this.shouldLimitToFavorites(scope, dynamicMode, pressure) || favorite;
  },
};
