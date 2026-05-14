const SPIKE_WINDOW_RECENT_MS = 3000;
const SPIKE_WINDOW_BASELINE_MS = 60000;
const SPIKE_TRIGGER_RATIO = 2.5;
const SPIKE_RELEASE_RATIO = 1.5;
const SPIKE_MIN_RATE = 3;
const SPIKE_RELEASE_HOLD_MS = 1500;

const EMOTE_WINDOW_MS = 3000;
const EMOTE_TRIGGER_COUNT = 5;
const EMOTE_AGGREGATE_IDLE_MS = 1500;
const EMOTE_AGGREGATE_MAX_MS = 10000;

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
    this._emoteWindow = [];
    this._activeAggregate = null;
    this._spikeState = 'idle';
    this._spikeBelowSince = null;
    this._spikeTickId = null;
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
    this._spikeTickId = setInterval(() => this._tickSpike(), 500);
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

    const maxPerSecond = danmakuSettings.get('maxMessagesPerSecond');
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
    const emote = this._recordIncoming(message);
    if (this._tryRouteToAggregate(message, emote)) return;

    const maxQueue = 20;
    if (this.messageQueue.length >= maxQueue) {
      this.messageQueue.shift();
      this._recordDrop('queue');
    }
    this.messageQueue.push(message);
    this._scheduleTick();
  }

  _getDominantEmote(message) {
    if (!Array.isArray(message?.segments)) return null;
    for (const seg of message.segments) {
      if (seg.type === 'image' && seg.src) {
        return { src: seg.src, alt: seg.alt || '' };
      }
    }
    return null;
  }

  _recordIncoming(message) {
    const now = Date.now();
    this._messageTimes.push(now);
    const emote = this._getDominantEmote(message);
    if (emote) {
      this._emoteWindow.push({ time: now, src: emote.src, alt: emote.alt });
    }
    this._pruneWindows(now);
    return emote;
  }

  _pruneWindows(now) {
    while (this._messageTimes.length && now - this._messageTimes[0] > SPIKE_WINDOW_BASELINE_MS) {
      this._messageTimes.shift();
    }
    while (this._emoteWindow.length && now - this._emoteWindow[0].time > EMOTE_WINDOW_MS) {
      this._emoteWindow.shift();
    }
  }

  _countEmoteInWindow(src) {
    let count = 0;
    for (const e of this._emoteWindow) {
      if (e.src === src) count++;
    }
    return count;
  }

  _tryRouteToAggregate(message, emote) {
    if (!danmakuSettings.get('spikeEffectsEnabled')) return false;
    if (!emote) return false;

    if (this._activeAggregate && this._activeAggregate.src === emote.src) {
      this._activeAggregate.count++;
      this._activeAggregate.lastSeenAt = Date.now();
      this._updateAggregateUI();
      return true;
    }

    if (!this._activeAggregate) {
      const count = this._countEmoteInWindow(emote.src);
      if (count >= EMOTE_TRIGGER_COUNT) {
        this._startAggregate(emote, count);
        return true;
      }
    }
    return false;
  }

  _startAggregate(emote, initialCount) {
    if (!this.overlay?.container) return;
    const el = document.createElement('div');
    el.className = 'danmaku-aggregate';

    const img = document.createElement('img');
    img.src = emote.src;
    img.alt = emote.alt;
    img.className = 'danmaku-aggregate-emote';

    const counter = document.createElement('span');
    counter.className = 'danmaku-aggregate-count';
    counter.textContent = `×${initialCount}`;

    el.appendChild(img);
    el.appendChild(counter);
    this.overlay.container.appendChild(el);

    const now = Date.now();
    this._activeAggregate = {
      src: emote.src,
      alt: emote.alt,
      count: initialCount,
      startedAt: now,
      lastSeenAt: now,
      el,
      counterEl: counter,
    };
  }

  _updateAggregateUI() {
    const agg = this._activeAggregate;
    if (!agg) return;
    agg.counterEl.textContent = `×${agg.count}`;
    agg.el.classList.remove('danmaku-aggregate-bump');
    void agg.el.offsetWidth;
    agg.el.classList.add('danmaku-aggregate-bump');
  }

  _endAggregate() {
    const agg = this._activeAggregate;
    if (!agg) return;
    this._activeAggregate = null;
    agg.el.classList.add('danmaku-aggregate-leaving');
    setTimeout(() => agg.el.remove(), 400);
  }

  _setSpikeClass(active) {
    const el = this.overlay?.container;
    if (!el) return;
    el.classList.toggle('danmaku-overlay--spike', active);
  }

  _tickSpike() {
    if (!danmakuSettings.get('spikeEffectsEnabled')) {
      if (this._activeAggregate) this._endAggregate();
      if (this._spikeState === 'active') {
        this._spikeState = 'idle';
        this._spikeBelowSince = null;
        this._setSpikeClass(false);
      }
      return;
    }

    const now = Date.now();

    if (this._activeAggregate) {
      const idle = now - this._activeAggregate.lastSeenAt;
      const lifetime = now - this._activeAggregate.startedAt;
      if (idle > EMOTE_AGGREGATE_IDLE_MS || lifetime > EMOTE_AGGREGATE_MAX_MS) {
        this._endAggregate();
      }
    }

    this._pruneWindows(now);
    const recentCount = this._messageTimes.reduce(
      (n, t) => (now - t < SPIKE_WINDOW_RECENT_MS ? n + 1 : n),
      0
    );
    const currentRate = recentCount / (SPIKE_WINDOW_RECENT_MS / 1000);
    const baselineRate = this._messageTimes.length / (SPIKE_WINDOW_BASELINE_MS / 1000);

    if (this._spikeState === 'idle') {
      if (currentRate >= SPIKE_MIN_RATE && currentRate > baselineRate * SPIKE_TRIGGER_RATIO) {
        this._spikeState = 'active';
        this._spikeBelowSince = null;
        this._setSpikeClass(true);
      }
    } else {
      const below = currentRate < Math.max(baselineRate * SPIKE_RELEASE_RATIO, 1);
      if (below) {
        if (!this._spikeBelowSince) this._spikeBelowSince = now;
        if (now - this._spikeBelowSince > SPIKE_RELEASE_HOLD_MS) {
          this._spikeState = 'idle';
          this._spikeBelowSince = null;
          this._setSpikeClass(false);
        }
      } else {
        this._spikeBelowSince = null;
      }
    }
  }

  renderMessage(message) {
    if (!this.overlay || !this.overlay.container) return;

    const maxActive = danmakuSettings.get('maxActiveMessages');
    if (this.activeMessages.length >= maxActive) {
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

    const element = this.createMessageElement(message, lane, mode);
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
      const duration = danmakuSettings.get('duration') * 1000;
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

  createMessageElement(message, lane, mode = 'scroll') {
    const el = document.createElement('div');
    el.className = `danmaku-message danmaku-message--${mode}`;
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
      const duration = danmakuSettings.get('duration');
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
    this._endAggregate();
  }

  destroy() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._spikeTickId !== null) {
      clearInterval(this._spikeTickId);
      this._spikeTickId = null;
    }
    this._setSpikeClass(false);
    this.clear();
    this.lanes = [];
    this._messageTimes = [];
    this._emoteWindow = [];
    this._spikeState = 'idle';
    this._spikeBelowSince = null;
  }

  onSettingsChange() {
    this.updateLanes();
  }
}
