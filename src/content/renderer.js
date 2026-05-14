class DanmakuRenderer {
  constructor(overlay) {
    this.overlay = overlay;
    this.activeMessages = [];
    this.lanes = [];
    this.messageQueue = [];
    this.droppedCount = 0;
    this.lastRenderTime = 0;
    this.renderInterval = null;
  }

  init() {
    this.updateLanes();
    this.startRenderLoop();
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

  startRenderLoop() {
    const fps = 60;
    this.renderInterval = setInterval(() => this.processQueue(), 1000 / fps);
  }

  processQueue() {
    if (this.messageQueue.length === 0) return;

    const now = Date.now();
    const maxPerSecond = danmakuSettings.get('maxMessagesPerSecond');
    const minInterval = 1000 / maxPerSecond;

    if (now - this.lastRenderTime < minInterval) return;

    const message = this.messageQueue.shift();
    if (message) {
      this.renderMessage(message);
      this.lastRenderTime = now;
    }
  }

  addMessage(message) {
    const maxQueue = 20;
    if (this.messageQueue.length >= maxQueue) {
      this.messageQueue.shift();
      this.droppedCount++;
    }
    this.messageQueue.push(message);
  }

  renderMessage(message) {
    if (!this.overlay || !this.overlay.container) return;

    const maxActive = danmakuSettings.get('maxActiveMessages');
    if (this.activeMessages.length >= maxActive) {
      this.droppedCount++;
      return;
    }

    const mode = danmakuSettings.get('animationMode');
    const isStationary = DANMAKU_CONSTANTS.STATIONARY_MODES.includes(mode);

    const lane = isStationary ? this.findStationaryLane() : this.findScrollLane();
    if (!lane) {
      this.droppedCount++;
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
  }

  destroy() {
    if (this.renderInterval) {
      clearInterval(this.renderInterval);
      this.renderInterval = null;
    }
    this.clear();
    this.lanes = [];
  }

  onSettingsChange() {
    this.updateLanes();
  }

  getStats() {
    return {
      active: this.activeMessages.length,
      queued: this.messageQueue.length,
      dropped: this.droppedCount,
    };
  }
}
