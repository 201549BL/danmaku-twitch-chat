class DanmakuRegionEditor {
  constructor(options = {}) {
    this.onOpenSettings = options.onOpenSettings || null;
    this.getStats = options.getStats || (() => null);
    this.overlay = null;
    this.container = null;
    this.rowGuides = null;
    this.hovered = false;
    this.dragState = null;
    this.resizeObserver = null;
    this._statsPollId = null;
    this._boundOnMouseMove = (e) => this.onMouseMove(e);
    this._boundOnMouseUp = () => this.endDrag();
    this._settingsListener = () => this.update();
  }

  attach(overlay) {
    if (!overlay || !overlay.container) return;
    if (this.container) return;
    this.overlay = overlay;
    this.build();
    danmakuSettings.addListener(this._settingsListener);
    document.addEventListener('mousemove', this._boundOnMouseMove);
    document.addEventListener('mouseup', this._boundOnMouseUp);
    this.resizeObserver = new ResizeObserver(() => this.update());
    this.resizeObserver.observe(this.overlay.container);
    this._statsPollId = setInterval(() => this.updateDropsBadge(), 1000);
  }

  build() {
    this.rowGuides = document.createElement('div');
    this.rowGuides.className = 'danmaku-row-guides';
    this.overlay.container.appendChild(this.rowGuides);

    this.container = document.createElement('div');
    this.container.className = 'danmaku-region-editor';
    this.container.innerHTML = `
      <div class="dre-handle dre-handle-top" data-edge="top"></div>
      <div class="dre-handle dre-handle-bottom" data-edge="bottom"></div>
      <div class="dre-toolbar" data-edge="middle" title="Drag to move region">
        <div class="dre-quick">
          <button class="dre-quick-btn" type="button" data-quick-action="rows-dec" title="Fewer rows">−</button>
          <span class="dre-quick-label">Rows <em data-quick-value="rows"></em></span>
          <button class="dre-quick-btn" type="button" data-quick-action="rows-inc" title="More rows">+</button>
        </div>
        <div class="dre-quick">
          <button class="dre-quick-btn" type="button" data-quick-action="font-dec" title="Smaller text">−</button>
          <span class="dre-quick-label">Size <em data-quick-value="fontSize"></em></span>
          <button class="dre-quick-btn" type="button" data-quick-action="font-inc" title="Larger text">+</button>
        </div>
        <span class="dre-drops" data-drops title="Messages dropped in the last 10 seconds. Open settings for details." hidden></span>
        <button class="dre-settings-btn" type="button" data-action="open-settings" title="Open danmaku settings">⚙</button>
      </div>
    `;
    this.overlay.container.appendChild(this.container);

    this.container.querySelectorAll('[data-edge]').forEach((handle) => {
      handle.addEventListener('mousedown', (e) =>
        this.startDrag(e, handle.getAttribute('data-edge'))
      );
    });

    const settingsBtn = this.container.querySelector('[data-action="open-settings"]');
    settingsBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    settingsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onOpenSettings?.();
    });

    this.container.querySelectorAll('[data-quick-action]').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleQuickAction(btn.getAttribute('data-quick-action'));
      });
    });

    this.update();
    this.applyActive();
  }

  handleQuickAction(action) {
    switch (action) {
      case 'rows-inc':
        danmakuSettings.set('rows', danmakuSettings.get('rows') + 1);
        break;
      case 'rows-dec':
        danmakuSettings.set('rows', danmakuSettings.get('rows') - 1);
        break;
      case 'font-inc':
        danmakuSettings.set('fontSize', danmakuSettings.get('fontSize') + 2);
        break;
      case 'font-dec':
        danmakuSettings.set('fontSize', danmakuSettings.get('fontSize') - 2);
        break;
    }
  }

  updateQuickValues() {
    if (!this.container) return;
    const rowsEl = this.container.querySelector('[data-quick-value="rows"]');
    const fontEl = this.container.querySelector('[data-quick-value="fontSize"]');
    if (rowsEl) rowsEl.textContent = danmakuSettings.get('rows');
    if (fontEl) fontEl.textContent = `${danmakuSettings.get('fontSize')}px`;
  }

  updateDropsBadge() {
    const badge = this.container?.querySelector('[data-drops]');
    if (!badge) return;
    const stats = this.getStats();
    const n = stats?.recent?.total || 0;
    if (n === 0) {
      badge.hidden = true;
      badge.textContent = '';
      badge.classList.remove('dre-drops-heavy');
      return;
    }
    badge.hidden = false;
    badge.textContent = `⚠ ${n} dropped/10s`;
    badge.classList.toggle('dre-drops-heavy', n >= 20);
  }

  onMouseMove(e) {
    this.onDrag(e);
    if (this.dragState) return;
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      this.setHover(false);
      return;
    }
    const inside =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;
    this.setHover(inside);
  }

  setHover(on) {
    if (this.hovered === on) return;
    this.hovered = on;
    this.applyActive();
    this.applyPauseState();
  }

  applyActive() {
    if (!this.container) return;
    const active = this.hovered || !!this.dragState;
    this.container.classList.toggle('dre-active', active);
    if (this.rowGuides) this.rowGuides.classList.toggle('dre-active', active);
  }

  applyPauseState() {
    const overlayEl = this.overlay?.container;
    if (!overlayEl) return;
    const shouldPause = !!(this.hovered && danmakuSettings.get('pauseOnHover'));
    overlayEl.classList.toggle('danmaku-paused', shouldPause);
  }

  update() {
    this.updateBandPosition();
    this.updateRowGuides();
    this.updateQuickValues();
    this.applyPauseState();
  }

  updateBandPosition() {
    if (!this.container) return;
    const top = danmakuSettings.get('regionTop');
    const height = danmakuSettings.get('regionHeight');
    this.container.style.top = `${top}%`;
    this.container.style.height = `${height}%`;
  }

  updateRowGuides() {
    if (!this.rowGuides || !this.overlay?.container) return;
    const rows = danmakuSettings.get('rows');
    const fontSize = danmakuSettings.get('fontSize');
    const regionTop = danmakuSettings.get('regionTop');
    const regionHeight = danmakuSettings.get('regionHeight');
    const playerH = this.overlay.container.offsetHeight || 0;
    const fontSizePx = (fontSize * playerH) / DANMAKU_CONSTANTS.REFERENCE_PLAYER_HEIGHT;
    const regionTopPx = (regionTop / 100) * playerH;
    const regionHeightPx = (regionHeight / 100) * playerH;
    const laneSpacing = rows > 1 ? (regionHeightPx - fontSizePx) / (rows - 1) : 0;
    const overlapping = rows > 1 && laneSpacing < fontSizePx;

    this.rowGuides.innerHTML = '';

    for (let i = 0; i < rows; i++) {
      const top =
        rows <= 1
          ? regionTopPx + Math.max(0, (regionHeightPx - fontSizePx) / 2)
          : regionTopPx + i * laneSpacing;

      const guide = document.createElement('div');
      guide.className = 'danmaku-row-guide';
      if (overlapping) guide.classList.add('danmaku-row-guide-warn');
      guide.style.top = `${top}px`;
      guide.style.height = `${fontSizePx}px`;

      const label = document.createElement('span');
      label.className = 'danmaku-row-guide-label';
      label.textContent = `Row ${i + 1}`;
      guide.appendChild(label);

      this.rowGuides.appendChild(guide);
    }
  }

  startDrag(e, edge) {
    if (e.button !== 0 || !this.overlay?.container) return;
    const rect = this.overlay.container.getBoundingClientRect();
    this.dragState = {
      edge,
      overlayHeight: rect.height,
      startY: e.clientY,
      origTop: danmakuSettings.get('regionTop'),
      origHeight: danmakuSettings.get('regionHeight'),
    };
    this.container.classList.add('dre-dragging');
    this.applyActive();
    e.preventDefault();
    e.stopPropagation();
  }

  onDrag(e) {
    if (!this.dragState) return;
    if (this.dragState.overlayHeight <= 0) return;

    const dyPct = ((e.clientY - this.dragState.startY) / this.dragState.overlayHeight) * 100;
    const { edge, origTop, origHeight } = this.dragState;

    if (edge === 'top') {
      const origBottom = origTop + origHeight;
      const newTop = Math.max(0, Math.min(origBottom - 5, origTop + dyPct));
      danmakuSettings.set('regionTop', newTop);
      danmakuSettings.set('regionHeight', origBottom - newTop);
    } else if (edge === 'bottom') {
      const newHeight = Math.max(5, Math.min(100 - origTop, origHeight + dyPct));
      danmakuSettings.set('regionHeight', newHeight);
    } else if (edge === 'middle') {
      const newTop = Math.max(0, Math.min(100 - origHeight, origTop + dyPct));
      danmakuSettings.set('regionTop', newTop);
    }
  }

  endDrag() {
    if (!this.dragState) return;
    this.dragState = null;
    if (this.container) this.container.classList.remove('dre-dragging');
    this.applyActive();
  }

  destroy() {
    danmakuSettings.removeListener(this._settingsListener);
    document.removeEventListener('mousemove', this._boundOnMouseMove);
    document.removeEventListener('mouseup', this._boundOnMouseUp);
    if (this._statsPollId !== null) {
      clearInterval(this._statsPollId);
      this._statsPollId = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.overlay?.container) {
      this.overlay.container.classList.remove('danmaku-paused');
    }
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    if (this.rowGuides) {
      this.rowGuides.remove();
      this.rowGuides = null;
    }
    this.overlay = null;
  }
}
