class DanmakuPlayerToggle {
  constructor(options = {}) {
    this.onOpenSettings = options.onOpenSettings || null;
    this.button = null;
    this.controlsContainer = null;
    this.retryTimeout = null;
    this.retryCount = 0;
    this.maxRetries = 30;
    this._settingsListener = () => this.updateState();
  }

  init() {
    this.findAndAttach();
    danmakuSettings.addListener(this._settingsListener);
  }

  findAndAttach() {
    const controls = document.querySelector('[data-a-target="player-controls"]');
    const rightControls = controls?.querySelector('.player-controls__right-control-group');

    if (rightControls) {
      this.attach(rightControls);
      this.retryCount = 0;
      return;
    }

    this.retryCount++;
    if (this.retryCount < this.maxRetries) {
      this.retryTimeout = setTimeout(() => this.findAndAttach(), 500);
    }
  }

  attach(container) {
    if (this.button) return;
    this.controlsContainer = container;

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

    this.button.addEventListener('click', (e) => this.onClick(e));
    this.button.addEventListener('contextmenu', (e) => this.onRightClick(e));

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
      titleEl.textContent = enabled ? 'Danmaku: ON' : 'Danmaku: OFF';
    }
  }

  destroy() {
    danmakuSettings.removeListener(this._settingsListener);
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    if (this.button) {
      this.button.remove();
      this.button = null;
    }
    this.controlsContainer = null;
  }
}
