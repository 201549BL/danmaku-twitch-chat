const DYNAMIC_WINDOW_RECENT_MS = 3000;
const DYNAMIC_WINDOW_BASELINE_MS = 60000;
const DYNAMIC_MIN_RECENT_RATE = 2;
const DYNAMIC_MIN_BASELINE_RATE = 1;
const DYNAMIC_RATIO_FLOOR = 1.2;
const DYNAMIC_RATIO_CEIL = 4.0;
const DYNAMIC_RISE_ALPHA = 0.4;
const DYNAMIC_FALL_ALPHA = 0.25;
const DYNAMIC_SHOW_THRESHOLD = 0.2;
const DYNAMIC_RATE_MULTIPLIER_MAX = 2.5;
const DYNAMIC_RATE_CAP = 20;
const DYNAMIC_DURATION_REDUCTION_MAX = 0.3;

class DanmakuRenderer {
  constructor(overlay) {
    this.overlay = overlay;
    this.activeMessages = [];
    this.lanes = [];
    this.messageQueue = [];
    this.dropsQueue = 0;
    this.dropsLane = 0;
    this.dropsActive = 0;
    this._dropTimestamps = [];
    this.lastRenderTime = 0;
    this._rafId = null;
    this._tick = () => this.processQueue();

    this._messageTimes = [];
    this._smoothedPressure = 0;
    this._dynamicTickId = null;
    this._dynamicTag = null;
  }

  _recordDrop(reason) {
    const now = Date.now();
    if (reason === 'queue') this.dropsQueue++;
    else if (reason === 'lane') this.dropsLane++;
    else if (reason === 'active') this.dropsActive++;
    this._dropTimestamps.push({ time: now, reason });
    while (this._dropTimestamps.length > 0 && now - this._dropTimestamps[0].time > 10000) {
      this._dropTimestamps.shift();
    }
  }

  getDropStats() {
    const now = Date.now();
    while (this._dropTimestamps.length > 0 && now - this._dropTimestamps[0].time > 10000) {
      this._dropTimestamps.shift();
    }
    const recent = { queue: 0, lane: 0, active: 0, total: 0 };
    for (const e of this._dropTimestamps) {
      recent[e.reason]++;
      recent.total++;
    }
    return {
      total: { queue: this.dropsQueue, lane: this.dropsLane, active: this.dropsActive },
      recent,
    };
  }

  init() {
    this.updateLanes();
    this._buildDynamicTag();
    this._dynamicTickId = setInterval(() => this._tickDynamic(), 500);
  }

  _effectiveMaxMessagesPerSecond() {
    const base = danmakuSettings.get('maxMessagesPerSecond');
    const p = this._smoothedPressure;
    if (p <= 0) return base;
    const boost = 1 + (DYNAMIC_RATE_MULTIPLIER_MAX - 1) * p;
    return Math.min(DYNAMIC_RATE_CAP, base * boost);
  }

  _effectiveDuration() {
    const base = danmakuSettings.get('duration');
    const p = this._smoothedPressure;
    if (p <= 0) return base;
    return base * (1 - DYNAMIC_DURATION_REDUCTION_MAX * p);
  }

  updateLanes() {
    const rows = danmakuSettings.get('rows');
    this.lanes = [];
    for (let i = 0; i < rows; i++) {
      this.lanes.push({
        index: i,
        lastMessageEndTime: 0,
        occupants: [],
      });
    }
  }

  isSelfMention(message) {
    const raw = danmakuSettings.get('highlightUsername');
    if (!raw) return false;
    const name = String(raw).trim().toLowerCase();
    if (!name) return false;
    const text = message.text || '';
    if (!text) return false;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`@${escaped}\\b`, 'i').test(text);
  }

  isFavorite(message) {
    const usersRaw = danmakuSettings.get('highlightUsers');
    if (usersRaw) {
      const username = String(message.username || '').toLowerCase();
      if (username) {
        const list = String(usersRaw)
          .split(/[,\s]+/)
          .map((s) => s.trim().replace(/^@/, '').toLowerCase())
          .filter(Boolean);
        if (list.includes(username)) return true;
      }
    }

    const badgeRoles = danmakuSettings.get('highlightBadges');
    if (Array.isArray(badgeRoles) && badgeRoles.length && Array.isArray(message.badges)) {
      const roles = DANMAKU_CONSTANTS.HIGHLIGHT_BADGE_ROLES || [];
      const wanted = new Set(badgeRoles);
      const matchers = roles.filter((r) => wanted.has(r.key)).map((r) => r.match);
      if (matchers.length) {
        for (const b of message.badges) {
          const alt = String(b.alt || '').toLowerCase();
          if (!alt) continue;
          if (matchers.some((m) => alt.includes(m))) return true;
        }
      }
    }
    return false;
  }

  getFontSizePx() {
    const fontSize = danmakuSettings.get('fontSize');
    const playerH =
      this.overlay?.container?.offsetHeight || DANMAKU_CONSTANTS.REFERENCE_PLAYER_HEIGHT;
    return (fontSize * playerH) / DANMAKU_CONSTANTS.REFERENCE_PLAYER_HEIGHT;
  }

  getLaneTopPx(laneIndex) {
    const rows = danmakuSettings.get('rows');
    const regionTop = danmakuSettings.get('regionTop');
    const regionHeight = danmakuSettings.get('regionHeight');
    const playerH = this.overlay?.container?.offsetHeight || 0;
    const regionTopPx = (regionTop / 100) * playerH;
    const regionHeightPx = (regionHeight / 100) * playerH;
    const fontSizePx = this.getFontSizePx();
    if (rows <= 1) {
      return regionTopPx + Math.max(0, (regionHeightPx - fontSizePx) / 2);
    }
    const laneSpacing = (regionHeightPx - fontSizePx) / (rows - 1);
    return regionTopPx + laneIndex * laneSpacing;
  }

  _scheduleTick() {
    if (this._rafId !== null) return;
    this._rafId = requestAnimationFrame(this._tick);
  }

  processQueue() {
    this._rafId = null;
    if (this.messageQueue.length === 0) return;

    const maxPerSecond = this._effectiveMaxMessagesPerSecond();
    const minInterval = 1000 / maxPerSecond;

    while (this.messageQueue.length > 0) {
      const now = Date.now();
      if (now - this.lastRenderTime < minInterval) break;
      const message = this.messageQueue.shift();
      if (!message) break;
      this.renderMessage(message);
      this.lastRenderTime = now;
    }

    if (this.messageQueue.length > 0) this._scheduleTick();
  }

  addMessage(message) {
    this._recordArrival();
    const maxQueue = 20;
    if (this.messageQueue.length >= maxQueue) {
      let dropIdx = this.messageQueue.findIndex((m) => !this.isFavorite(m));
      if (dropIdx === -1) dropIdx = 0;
      this.messageQueue.splice(dropIdx, 1);
      this._recordDrop('queue');
    }
    this.messageQueue.push(message);
    this._scheduleTick();
  }

  _recordArrival() {
    const now = Date.now();
    this._messageTimes.push(now);
    while (this._messageTimes.length && now - this._messageTimes[0] > DYNAMIC_WINDOW_BASELINE_MS) {
      this._messageTimes.shift();
    }
  }

  _buildDynamicTag() {
    if (this._dynamicTag || !this.overlay?.container) return;
    this._dynamicTag = document.createElement('div');
    this._dynamicTag.className = 'danmaku-dynamic-tag';
    this.overlay.container.appendChild(this._dynamicTag);
    this._updateDynamicTag();
  }

  _updateDynamicTag() {
    this._buildDynamicTag();
    if (!this._dynamicTag) return;
    const regionTop = danmakuSettings.get('regionTop');
    this._dynamicTag.style.top = `${regionTop}%`;

    const visible = this._smoothedPressure >= DYNAMIC_SHOW_THRESHOLD;
    if (visible) {
      const base = Math.max(1, danmakuSettings.get('maxMessagesPerSecond'));
      const ratio = this._effectiveMaxMessagesPerSecond() / base;
      this._dynamicTag.textContent = `×${ratio.toFixed(1)}`;
      this._dynamicTag.classList.add('danmaku-dynamic-tag-active');
    } else {
      this._dynamicTag.classList.remove('danmaku-dynamic-tag-active');
    }
  }

  _tickDynamic() {
    if (!danmakuSettings.get('dynamicMode')) {
      if (this._smoothedPressure > 0) {
        this._smoothedPressure = 0;
        this._updateDynamicTag();
      }
      return;
    }

    const now = Date.now();
    while (this._messageTimes.length && now - this._messageTimes[0] > DYNAMIC_WINDOW_BASELINE_MS) {
      this._messageTimes.shift();
    }
    const recentCount = this._messageTimes.reduce(
      (n, t) => (now - t < DYNAMIC_WINDOW_RECENT_MS ? n + 1 : n),
      0
    );
    const recentRate = recentCount / (DYNAMIC_WINDOW_RECENT_MS / 1000);
    const baselineRate = this._messageTimes.length / (DYNAMIC_WINDOW_BASELINE_MS / 1000);

    let target = 0;
    if (recentRate >= DYNAMIC_MIN_RECENT_RATE) {
      const ratio = recentRate / Math.max(baselineRate, DYNAMIC_MIN_BASELINE_RATE);
      target = (ratio - DYNAMIC_RATIO_FLOOR) / (DYNAMIC_RATIO_CEIL - DYNAMIC_RATIO_FLOOR);
      target = Math.max(0, Math.min(1, target));
    }

    const alpha = target > this._smoothedPressure ? DYNAMIC_RISE_ALPHA : DYNAMIC_FALL_ALPHA;
    this._smoothedPressure += alpha * (target - this._smoothedPressure);
    if (this._smoothedPressure < 0.01) this._smoothedPressure = 0;

    this._updateDynamicTag();
  }

  renderMessage(message) {
    if (!this.overlay || !this.overlay.container) return;

    const maxActive = danmakuSettings.get('maxActiveMessages');
    const favorite = this.isFavorite(message);
    const activeCap = favorite ? maxActive + 10 : maxActive;
    if (this.activeMessages.length >= activeCap) {
      this._recordDrop('active');
      return;
    }

    const mode = danmakuSettings.get('animationMode');
    const isStationary = DANMAKU_CONSTANTS.STATIONARY_MODES.includes(mode);

    const lane = isStationary ? this.findStationaryLane() : this.findScrollLane();
    if (!lane) {
      this._recordDrop('lane');
      return;
    }

    const element = this.createMessageElement(message, lane, mode, favorite);
    this.overlay.container.appendChild(element);

    const containerWidth = this.overlay.container.offsetWidth;
    const msgWidth = element.offsetWidth;

    if (isStationary) {
      const xLeft = this.pickStationaryX(lane, msgWidth, containerWidth);
      const offset = xLeft + msgWidth / 2 - containerWidth / 2;
      element.style.setProperty('--xoffset', `${offset}px`);

      const lifetime = danmakuSettings.get('popFadeLifetime') * 1000;
      const endTime = Date.now() + lifetime;
      lane.occupants.push({ leftPx: xLeft, rightPx: xLeft + msgWidth, endTime });
      lane.lastMessageEndTime = endTime;
    } else {
      element.style.setProperty('--scroll-distance', `${containerWidth + msgWidth}px`);
      const duration = this._effectiveDuration() * 1000;
      lane.lastMessageEndTime = Date.now() + (duration * msgWidth) / (containerWidth + msgWidth);
    }

    this.activeMessages.push({
      element,
      message,
      lane,
      startTime: Date.now(),
    });

    element.addEventListener('animationend', () => {
      this.removeMessage(element);
    });
  }

  findScrollLane() {
    const now = Date.now();
    const availableLanes = this.lanes.filter((lane) => now > lane.lastMessageEndTime);

    if (availableLanes.length === 0) return null;

    return availableLanes.reduce((best, lane) =>
      lane.lastMessageEndTime < best.lastMessageEndTime ? lane : best
    );
  }

  findStationaryLane() {
    const now = Date.now();
    let bestLane = null;
    let leastCount = Infinity;
    for (const lane of this.lanes) {
      lane.occupants = (lane.occupants || []).filter((o) => o.endTime > now);
      if (lane.occupants.length < leastCount) {
        leastCount = lane.occupants.length;
        bestLane = lane;
      }
    }
    return bestLane;
  }

  pickStationaryX(lane, msgWidth, containerWidth) {
    const occupants = lane.occupants || [];
    if (msgWidth >= containerWidth) return 0;

    const padding = 12;
    const sorted = [...occupants].sort((a, b) => a.leftPx - b.leftPx);
    const gaps = [];
    let cursor = 0;
    for (const o of sorted) {
      if (o.leftPx - padding > cursor) {
        gaps.push({ left: cursor, right: o.leftPx - padding });
      }
      cursor = Math.max(cursor, o.rightPx + padding);
    }
    if (cursor < containerWidth) {
      gaps.push({ left: cursor, right: containerWidth });
    }

    const fitting = gaps.filter((g) => g.right - g.left >= msgWidth);

    if (fitting.length === 0) {
      return Math.random() * Math.max(0, containerWidth - msgWidth);
    }

    const weights = fitting.map((g) => g.right - g.left - msgWidth + 1);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < fitting.length; i++) {
      if (r < weights[i]) {
        const g = fitting[i];
        return g.left + Math.random() * (g.right - g.left - msgWidth);
      }
      r -= weights[i];
    }
    const last = fitting[fitting.length - 1];
    return last.left;
  }

  createMessageElement(message, lane, mode = 'scroll', favorite = false) {
    const el = document.createElement('div');
    el.className = `danmaku-message danmaku-message--${mode}`;
    if (favorite) {
      el.classList.add('danmaku-message--favorite');
    }
    if (this.isSelfMention(message)) {
      el.classList.add('danmaku-message--mention');
    }

    const fontSizePx = this.getFontSizePx();
    const opacity = danmakuSettings.get('opacity');
    const showUsernames = danmakuSettings.get('showUsernames');
    const showBadges = danmakuSettings.get('showBadges');
    const maxLength = danmakuSettings.get('maxMessageLength');

    if (DANMAKU_CONSTANTS.STATIONARY_MODES.includes(mode)) {
      const lifetime = danmakuSettings.get('popFadeLifetime');
      el.style.cssText = `
        top: ${this.getLaneTopPx(lane.index)}px;
        font-size: ${fontSizePx}px;
        animation-duration: ${lifetime}s;
        --max-opacity: ${opacity};
      `;
    } else {
      const duration = this._effectiveDuration();
      el.style.cssText = `
        top: ${this.getLaneTopPx(lane.index)}px;
        font-size: ${fontSizePx}px;
        opacity: ${opacity};
        animation-duration: ${duration}s;
      `;
    }

    let contentParent = el;
    if (mode === 'drift') {
      const inner = document.createElement('span');
      inner.className = 'danmaku-drift-inner';
      el.appendChild(inner);
      contentParent = inner;
    }

    if (showUsernames) {
      if (showBadges && Array.isArray(message.badges) && message.badges.length) {
        for (const b of message.badges) {
          if (!b.src) continue;
          const img = document.createElement('img');
          img.className = 'danmaku-badge';
          img.src = b.src;
          img.alt = b.alt || '';
          contentParent.appendChild(img);
        }
      }
      const usernameSpan = document.createElement('span');
      usernameSpan.className = 'danmaku-username';
      usernameSpan.style.color = message.color;
      usernameSpan.textContent = message.username + ': ';
      contentParent.appendChild(usernameSpan);
    }

    const textSpan = document.createElement('span');
    textSpan.className = 'danmaku-text';
    if (favorite) textSpan.style.color = message.color;
    this.fillMessageBody(textSpan, message, maxLength);
    contentParent.appendChild(textSpan);

    return el;
  }

  fillMessageBody(parent, message, maxLength) {
    if (Array.isArray(message.segments) && message.segments.length > 0) {
      let textChars = 0;
      let truncated = false;
      for (const seg of message.segments) {
        if (truncated) break;
        if (seg.type === 'text') {
          const remaining = maxLength - textChars;
          if (remaining <= 0) {
            parent.appendChild(document.createTextNode('...'));
            truncated = true;
            break;
          }
          let val = seg.value;
          if (val.length > remaining) {
            val = val.substring(0, remaining) + '...';
            truncated = true;
          }
          parent.appendChild(document.createTextNode(val));
          textChars += val.length;
        } else if (seg.type === 'image' && seg.src) {
          const img = document.createElement('img');
          img.className = 'danmaku-emote';
          img.src = seg.src;
          img.alt = seg.alt || '';
          parent.appendChild(img);
        }
      }
      return;
    }

    let displayText = message.text || '';
    if (displayText.length > maxLength) {
      displayText = displayText.substring(0, maxLength) + '...';
    }
    parent.textContent = displayText;
  }

  removeMessage(element) {
    const index = this.activeMessages.findIndex((m) => m.element === element);
    if (index !== -1) {
      this.activeMessages.splice(index, 1);
    }
    element.remove();
  }

  clear() {
    this.activeMessages.forEach((m) => m.element.remove());
    this.activeMessages = [];
    this.messageQueue = [];
    this.lanes.forEach((lane) => {
      lane.lastMessageEndTime = 0;
      lane.occupants = [];
    });
  }

  destroy() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._dynamicTickId !== null) {
      clearInterval(this._dynamicTickId);
      this._dynamicTickId = null;
    }
    if (this._dynamicTag) {
      this._dynamicTag.remove();
      this._dynamicTag = null;
    }
    this.clear();
    this.lanes = [];
    this._messageTimes = [];
    this._smoothedPressure = 0;
  }

  onSettingsChange() {
    this.updateLanes();
    this._updateDynamicTag();
  }
}
