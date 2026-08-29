class DanmakuPlayerToggle {
  constructor(options = {}) {
    this.onOpenSettings = options.onOpenSettings || null;
    this.button = null;
    this.controlsContainer = null;
    this.attachCheckInterval = null;
    this._settingsListener = () => this.updateState();
  }

  init() {
    this.findAndAttach();
    if (this.attachCheckInterval === null) {
      this.attachCheckInterval = setInterval(() => this.findAndAttach(), 1000);
    }
    danmakuSettings.addListener(this._settingsListener);
  }

  findAndAttach() {
    const candidates = Array.from(
      document.querySelectorAll('[data-a-target="player-controls"]')
    ).map((controls) => ({
      controls,
      rightControls: controls.querySelector('.player-controls__right-control-group'),
    })).filter(({ rightControls }) => rightControls);

    const visibleCandidates = candidates.filter(({ controls }) => this.isVisible(controls));
    const currentVisible = visibleCandidates.find(
      ({ rightControls }) => rightControls === this.controlsContainer
    );
    const target =
      currentVisible ||
      visibleCandidates[visibleCandidates.length - 1] ||
      candidates[0];

    if (target) {
      this.attach(target.rightControls);
    }
  }

  isVisible(element) {
    if (element.isConnected === false) return false;
    if (typeof element.getClientRects !== 'function') return true;
    return element.getClientRects().length > 0;
  }

  attach(container) {
    if (this.button?.parentNode === container) return;
    this.controlsContainer = container;

    if (!this.button) {
      this.button = document.createElement('button');
      this.button.className = 'danmaku-player-toggle';
      this.button.setAttribute('aria-label', 'Toggle Danmaku Chat Overlay');
      this.button.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M3 5h18v2H3V5zm0 6h12v2H3v-2zm0 6h18v2H3v-2z"/>
        </svg>
        <span class="danmaku-player-toggle-tooltip">
          <span data-tooltip-title>Danmaku: ON</span>
          <span class="danmaku-player-toggle-tooltip-hint">Right-click for settings</span>
        </span>
      `;
      if (typeof DANMAKU_I18N !== 'undefined') DANMAKU_I18N.localizeTree(this.button);

      this.button.addEventListener('click', (e) => this.onClick(e));
      this.button.addEventListener('contextmenu', (e) => this.onRightClick(e));
    }

    container.insertBefore(this.button, container.firstChild);
    this.updateState();
  }

  onClick(e) {
    if (e.shiftKey) {
      this.onOpenSettings?.();
      return;
    }
    const current = danmakuSettings.get('enabled');
    danmakuSettings.set('enabled', !current);
  }

  onRightClick(e) {
    e.preventDefault();
    this.onOpenSettings?.();
  }

  updateState() {
    if (!this.button) return;
    const enabled = danmakuSettings.get('enabled');
    this.button.classList.toggle('danmaku-player-toggle--off', !enabled);
    const titleEl = this.button.querySelector('[data-tooltip-title]');
    if (titleEl) {
      const source = enabled ? 'Danmaku: ON' : 'Danmaku: OFF';
      titleEl.textContent = typeof DANMAKU_I18N === 'undefined'
        ? source
        : DANMAKU_I18N.text(source);
    }
  }

  destroy() {
    danmakuSettings.removeListener(this._settingsListener);
    if (this.attachCheckInterval !== null) {
      clearInterval(this.attachCheckInterval);
      this.attachCheckInterval = null;
    }
    if (this.button) {
      this.button.remove();
      this.button = null;
    }
    this.controlsContainer = null;
  }
}
