const DYNAMIC_WINDOW_RECENT_MS = 3000;
const DYNAMIC_WINDOW_BASELINE_MS = 60000;
const DYNAMIC_MIN_RECENT_RATE = 2;
const DYNAMIC_MIN_BASELINE_RATE = 1;
const DYNAMIC_RATIO_FLOOR = 1.2;
const DYNAMIC_RATIO_CEIL = 4.0;
const DYNAMIC_RISE_ALPHA = 0.4;
const DYNAMIC_FALL_ALPHA = 0.25;
const DYNAMIC_SHOW_THRESHOLD = 0.2;
const DYNAMIC_LOAD_FLOOR = 0.75;
const DYNAMIC_LOAD_CEIL = 2.5;
const DYNAMIC_QUEUE_FULL_PRESSURE = 12;
const DYNAMIC_RATE_MULTIPLIER_MAX = 4;
const DYNAMIC_DURATION_REDUCTION_MAX = 0.55;
const DYNAMIC_LIFETIME_REDUCTION_MAX = 0.45;
const DYNAMIC_MIN_DURATION = 2.5;
const DYNAMIC_MIN_LIFETIME = 1.5;
const MESSAGE_QUEUE_MAX = 20;
const MESSAGE_QUEUE_DYNAMIC_MAX = 40;

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
    this._clock = {revision:0,epochMs:this._epochNow(),logicalMs:0,paused:false};
    this._lastLogicalMs = 0;
    this._presentation = null;

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
    if (typeof DANMAKU_PRESENTATION !== 'undefined') this._presentation = new DANMAKU_PRESENTATION.Owner(this);
    this.updateLanes();
    this._buildDynamicTag();
    this._dynamicTickId = setInterval(() => this._tickDynamic(), 500);
  }

  _effectiveMaxMessagesPerSecond() {
    const policy = this.densityPolicy();
    const base = Math.min(policy.rate, danmakuSettings.get('maxMessagesPerSecond'));
    const boost = 1 + (DYNAMIC_RATE_MULTIPLIER_MAX - 1) * this._smoothedPressure;
    return Math.min(policy.burstRate, base * Math.max(1, boost));
  }

  densityPolicy() {
    return DANMAKU_CONSTANTS.DENSITY[this._presentation?.state === 'gpu' ? 'gpu' : 'dom'];
  }

  laneGeometry() {
    const height = this.overlay?.container?.offsetHeight || DANMAKU_CONSTANTS.REFERENCE_PLAYER_HEIGHT;
    const gpu = this._presentation?.state === 'gpu';
    const key = `${height}:${gpu}:${danmakuSettings.get('fontSize')}:${danmakuSettings.get('rows')}:${danmakuSettings.get('regionTop')}:${danmakuSettings.get('regionHeight')}`;
    if (this._laneGeometryKey !== key) {
      this._laneGeometryKey = key;
      this._laneGeometry = DANMAKU_CONSTANTS.laneGeometry(danmakuSettings, height, gpu);
    }
    return this._laneGeometry;
  }

  _effectiveDuration() {
    const base = danmakuSettings.get('duration');
    const p = this._smoothedPressure;
    if (p <= 0) return base;
    return Math.max(DYNAMIC_MIN_DURATION, base * (1 - DYNAMIC_DURATION_REDUCTION_MAX * p));
  }

  _effectiveStationaryLifetime() {
    const base = danmakuSettings.get('popFadeLifetime');
    const p = this._smoothedPressure;
    if (p <= 0) return base;
    return Math.max(DYNAMIC_MIN_LIFETIME, base * (1 - DYNAMIC_LIFETIME_REDUCTION_MAX * p));
  }

  updateLanes() {
    const geometry = this.laneGeometry();
    const hardCap = this.densityPolicy().active;
    const baseCap = Math.min(hardCap, danmakuSettings.get('maxActiveMessages'));
    const key = `${this._laneGeometryKey}:${baseCap}`;
    if (this._lanePolicyKey === key) return;
    this._lanePolicyKey = key;
    const fontSize = this.getFontSizePx();
    if (this._laneFontSize !== undefined && this._laneFontSize !== fontSize) {
      for (const record of [...this.activeMessages]) this.removeMessage(record.element, record);
      for (const lane of this.lanes) {
        lane.lastMessageEndTime = 0;
        lane.occupants = [];
      }
    }
    this._laneFontSize = fontSize;
    const cap = Math.min(hardCap, baseCap + Math.min(10, this.activeMessages.filter(record => record.favorite).length));
    for (const record of [...this.activeMessages]) {
      if (record.lane.index >= geometry.count) this.removeMessage(record.element, record);
    }
    while (this.activeMessages.length > cap) {
      const record = this.activeMessages.find(record => !record.favorite) || this.activeMessages[0];
      this.removeMessage(record.element, record);
    }
    this.lanes = Array.from({length: geometry.count}, (_, index) => this.lanes[index] || {index, lastMessageEndTime: 0, occupants: []});
    for (const record of this.activeMessages) if (record.element) record.element.style.top = `${geometry.top(record.lane.index)}px`;
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
    return this.laneGeometry().top(laneIndex);
  }

  _observeClock() {
    const container=this.overlay?.container;
    if(container===this._clockContainer)return;
    this._clockObserver?.disconnect();
    this._clockContainer=container;
    if(container && typeof MutationObserver!=='undefined') {
      this._clockObserver=new MutationObserver(()=>this.presentationClock());
      this._clockObserver.observe(container,{attributes:true,attributeFilter:['class']});
    }
  }

  _scheduleTick() {
    this._observeClock();
    if (this._rafId !== null) return;
    this._rafId = requestAnimationFrame(this._tick);
  }

  _epochNow() {
    return typeof performance === 'undefined' ? Date.now() : performance.timeOrigin+performance.now();
  }

  presentationClock() {
    const paused=Boolean(this.overlay?.container?.classList?.contains('danmaku-paused') || this.overlay?.container?.classList?.contains('danmaku-paused-video'));
    if(paused!==this._clock.paused) {
      const now=this._epochNow();
      const logicalMs=this._clock.logicalMs+(this._clock.paused ? 0 : Math.max(0,now-this._clock.epochMs));
      this._clock={revision:this._clock.revision+1,epochMs:now,logicalMs,paused};
    }
    return this._clock;
  }

  logicalTime() {
    const clock=this.presentationClock();
    return clock.logicalMs+(clock.paused ? 0 : Math.max(0,this._epochNow()-clock.epochMs));
  }

  processQueue() {
    this._rafId = null;
    this.updateLanes();
    const logical=this.logicalTime();
    for (const record of [...this.activeMessages]) {
      record.startedAt ??= this._lastLogicalMs-(record.elapsedMs || 0);
      record.elapsedMs = Math.max(0,logical-record.startedAt);
      if (record.durationMs && record.elapsedMs >= record.durationMs) this.removeMessage(record.element, record);
    }
    this._lastLogicalMs=logical;
    this._presentation?.frame();

    const now = Date.now();
    const interval = 1000 / this._effectiveMaxMessagesPerSecond();
    const elapsed = Math.max(0, now - (this._admissionFrame ?? now));
    this._admissionFrame = now;
    if (!this.messageQueue.length || this.presentationClock().paused) {
      this._admissionCredits = 0;
    } else {
      const stalled = elapsed > Math.max(interval, 100);
      const accrual = this._admissionBlocked ? 0 : elapsed / interval;
      this._admissionCredits = stalled ? 1 : Math.min(8, (this._admissionCredits ?? 1) + accrual);
      this._admissionBlocked = false;
      for (let admitted = 0; admitted < 8 && this.messageQueue.length && this._admissionCredits >= 1; admitted++) {
        if (!this.renderMessage(this.messageQueue[0])) { this._admissionCredits = 1; this._admissionBlocked = true; break; }
        this.messageQueue.shift();
        this._admissionCredits--;
        this.lastRenderTime = now;
      }
    }

    if (this.messageQueue.length > 0 || this.activeMessages.length > 0 || (this._presentation?.wantsGPU && this._presentation.state !== 'failed')) this._scheduleTick();
  }

  addMessage(message) {
    this._recordArrival();
    const dynamic = danmakuSettings.get('dynamicMode');
    const maxQueue = dynamic ? MESSAGE_QUEUE_DYNAMIC_MAX : MESSAGE_QUEUE_MAX;
    if (this.messageQueue.length >= maxQueue) {
      let dropIdx = this.messageQueue.findIndex((m) => !this.isFavorite(m));
      if (dropIdx === -1) dropIdx = 0;
      this.messageQueue.splice(dropIdx, 1);
      this._recordDrop('queue');
    }
    this.messageQueue.push(message);
    if (dynamic) this._updateDynamicPressure();
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

  _syncUsernameEffectPressureMode() {
    if (!this.overlay?.container) return;
    const limitToFavorites = DANMAKU_USERNAME_EFFECTS.shouldLimitToFavorites(
      danmakuSettings.get('usernameEffectScope'),
      danmakuSettings.get('dynamicMode'),
      this._smoothedPressure
    );
    this.overlay.container.classList.toggle(
      'danmaku-effects-favorites-only',
      limitToFavorites
    );
  }

  _tickDynamic() {
    if (!danmakuSettings.get('dynamicMode')) {
      if (this._smoothedPressure > 0) {
        this._smoothedPressure = 0;
        this._updateDynamicTag();
        this._syncUsernameEffectPressureMode();
      }
      return;
    }

    this._updateDynamicPressure();
  }

  _calculateDynamicTarget(recentRate, baselineRate) {
    if (recentRate < DYNAMIC_MIN_RECENT_RATE) return 0;

    const ratio = recentRate / Math.max(baselineRate, DYNAMIC_MIN_BASELINE_RATE);
    const burstPressure = Math.max(
      0,
      Math.min(1, (ratio - DYNAMIC_RATIO_FLOOR) / (DYNAMIC_RATIO_CEIL - DYNAMIC_RATIO_FLOOR))
    );

    const baseRate = Math.max(1, danmakuSettings.get('maxMessagesPerSecond'));
    const load = recentRate / baseRate;
    const loadPressure = Math.max(
      0,
      Math.min(1, (load - DYNAMIC_LOAD_FLOOR) / (DYNAMIC_LOAD_CEIL - DYNAMIC_LOAD_FLOOR))
    );
    const queuePressure = Math.min(1, this.messageQueue.length / DYNAMIC_QUEUE_FULL_PRESSURE);

    return Math.max(burstPressure, loadPressure, queuePressure);
  }

  _updateDynamicPressure() {
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

    const target = this._calculateDynamicTarget(recentRate, baselineRate);

    const alpha = target > this._smoothedPressure ? DYNAMIC_RISE_ALPHA : DYNAMIC_FALL_ALPHA;
    this._smoothedPressure += alpha * (target - this._smoothedPressure);
    if (this._smoothedPressure < 0.01) this._smoothedPressure = 0;

    this._updateDynamicTag();
    this._syncUsernameEffectPressureMode();
  }

  renderMessage(message) {
    if (!this.overlay || !this.overlay.container) return false;
    if (this._presentation?.state === 'preparing') return false;

    const hardCap = this.densityPolicy().active;
    const maxActive = Math.min(hardCap, danmakuSettings.get('maxActiveMessages'));
    const favorite = this.isFavorite(message);
    const activeCap = Math.min(hardCap, favorite ? maxActive + 10 : maxActive);
    if (this.activeMessages.length >= activeCap) {
      return false;
    }

    const mode = danmakuSettings.get('animationMode');
    const isStationary = DANMAKU_CONSTANTS.STATIONARY_MODES.includes(mode);

    const content = this._presentation ? DANMAKU_PRESENTATION.content(this, message, mode, favorite) : null;
    const gpu = this._presentation?.state === 'gpu';
    const ticket = gpu ? this._presentation.prepare(message, content) : null;
    if (gpu && ticket?.state !== 'ready' && ticket?.state !== 'dom') return false;
    if (ticket?.state === 'dom' && this.activeMessages.filter(record => record.element).length >= DANMAKU_CONSTANTS.DENSITY.dom.active) {
      this._recordDrop('active');
      return true;
    }
    const lane = isStationary ? this.findStationaryLane() : this.findScrollLane();
    if (!lane) return false;
    const element = gpu && ticket.state === 'ready' ? null : this.createMessageElement(message, lane, mode, favorite);
    if (element) this.overlay.container.appendChild(element);

    const containerWidth = this.overlay.container.offsetWidth;
    const msgWidth = element ? element.offsetWidth : ticket.layout.width;
    let xLeft = 0;
    const durationMs = (isStationary ? this._effectiveStationaryLifetime() : this._effectiveDuration()) * 1000;

    if (isStationary) {
      xLeft = this.pickStationaryX(lane, msgWidth, containerWidth);
      const offset = xLeft + msgWidth / 2 - containerWidth / 2;
      element?.style.setProperty('--xoffset', `${offset}px`);

      const lifetime = this._effectiveStationaryLifetime() * 1000;
      const endTime = Date.now() + lifetime;
      lane.occupants.push({ leftPx: xLeft, rightPx: xLeft + msgWidth, endTime });
      lane.lastMessageEndTime = endTime;
    } else {
      element?.style.setProperty('--scroll-distance', `${containerWidth + msgWidth}px`);
      const duration = this._effectiveDuration() * 1000;
      lane.lastMessageEndTime = Date.now() + (duration * msgWidth) / (containerWidth + msgWidth);
    }

    this.activeMessages.push({
      element,
      message,
      lane,
      startTime: Date.now(),
      content: ticket?.content || content, mode, favorite, width: msgWidth, xLeft, durationMs, elapsedMs: 0, startedAt:this.logicalTime(),
    });

    element?.addEventListener('animationend', (event) => {
      this._handleMessageAnimationEnd(element, event);
    });
    this._scheduleTick();
    return true;
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
    const favoritesOnlyUsernames = danmakuSettings.get('showUsernamesFavoritesOnly');
    const showUsernames =
      danmakuSettings.get('showUsernames') && (!favoritesOnlyUsernames || favorite);
    const showBadges = danmakuSettings.get('showBadges');
    const maxLength = danmakuSettings.get('maxMessageLength');

    if (DANMAKU_CONSTANTS.STATIONARY_MODES.includes(mode)) {
      const lifetime = this._effectiveStationaryLifetime();
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

    if (message.replyTo && danmakuSettings.get('showReplyContext')) {
      this.appendReplyChip(contentParent, message.replyTo);
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
      usernameSpan.style.setProperty('--danmaku-username-color', message.color || '#ffffff');
      const usernameEffectStyle = danmakuSettings.get('usernameEffectStyle');
      let configuredEffect = 'none';
      let configuredPalette = danmakuSettings.get('usernameEffectPalette');
      if (usernameEffectStyle === 'signature') {
        configuredEffect = 'signature';
        configuredPalette = 'auto';
      } else if (usernameEffectStyle === 'custom') {
        configuredEffect = danmakuSettings.get('usernameEffect');
      }
      const usernameEffect = DANMAKU_USERNAME_EFFECTS.resolveEffect(
        configuredEffect,
        message.username,
        danmakuSettings.get('signatureEffectPool')
      );
      const usernamePalette = DANMAKU_USERNAME_EFFECTS.resolvePalette(
        configuredPalette,
        message.username,
        danmakuSettings.get('signaturePalettePool')
      );
      const effectDefinition = (DANMAKU_CONSTANTS.TEXT_EFFECTS || []).find(
        (effect) => effect.key === usernameEffect
      );
      if (
        effectDefinition &&
        usernameEffect !== 'none' &&
        DANMAKU_USERNAME_EFFECTS.shouldApply(
          danmakuSettings.get('usernameEffectScope'),
          false,
          0,
          favorite
        )
      ) {
        DANMAKU_USERNAME_EFFECTS.decorateElement(usernameSpan, {
          username: message.username,
          text: message.username + ': ',
          color: message.color,
          effect: usernameEffect,
          palette: usernamePalette,
          mode,
          enhanced: favorite,
        });
      }
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

  appendReplyChip(parent, replyTo) {
    const chip = document.createElement('span');
    chip.className = 'danmaku-reply';

    const userSpan = document.createElement('span');
    userSpan.className = 'danmaku-reply-user';
    userSpan.textContent = `↳ @${replyTo.username}`;
    chip.appendChild(userSpan);

    if (replyTo.quote) {
      const max = 20;
      const q = replyTo.quote;
      const truncated = q.length > max ? q.substring(0, max) + '…' : q;
      const quoteSpan = document.createElement('span');
      quoteSpan.className = 'danmaku-reply-quote';
      quoteSpan.textContent = ` ${truncated}`;
      chip.appendChild(quoteSpan);
    }

    chip.appendChild(document.createTextNode(' '));
    parent.appendChild(chip);
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

  removeMessage(element, record) {
    const index = this.activeMessages.findIndex((m) => record ? m === record : m.element === element);
    if (index !== -1) {
      this.activeMessages.splice(index, 1);
    }
    element?.remove();
  }

  _handleMessageAnimationEnd(element, event) {
    if (event.target !== element) return;
    if (!this._presentation) this.removeMessage(element);
  }

  clear() {
    this.activeMessages.forEach((m) => m.element?.remove());
    this.activeMessages = [];
    this.messageQueue = [];
    this._admissionCredits = 0;
    this._admissionFrame = Date.now();
    this._admissionBlocked = false;
    this._presentation?.clear();
    this._lastLogicalMs = this.logicalTime();
    this.lanes.forEach((lane) => {
      lane.lastMessageEndTime = 0;
      lane.occupants = [];
    });
  }

  destroy() {
    this._clockObserver?.disconnect();
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
    this._presentation?.destroy();
    this.lanes = [];
    this._messageTimes = [];
    this._smoothedPressure = 0;
  }

  onSettingsChange() {
    this._presentation?.select(danmakuSettings.get('renderer'));
    this._presentation?.invalidateQueued();
    this.updateLanes();
    this._updateDynamicTag();
    this._syncUsernameEffectPressureMode();
  }
}
