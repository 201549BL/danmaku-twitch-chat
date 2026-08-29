class DanmakuOverlay {
  constructor() {
    this.container = null;
    this.playerContainer = null;
    this.fullscreenHandler = null;
  }

  init() {
    this.findAndAttachToPlayer();
    this.setupFullscreenHandler();
  }

  findAndAttachToPlayer() {
    const player = this.findPlayerContainer();
    if (player) {
      this.attachToPlayer(player);
      return true;
    }

    let retries = 0;
    const maxRetries = 20;
    const retryInterval = setInterval(() => {
      const p = this.findPlayerContainer();
      if (p) {
        clearInterval(retryInterval);
        this.attachToPlayer(p);
      } else if (++retries >= maxRetries) {
        clearInterval(retryInterval);
      }
    }, 500);
  }

  findPlayerContainer() {
    return (
      document.querySelector(DANMAKU_CONSTANTS.SELECTORS.PLAYER_CONTAINER) ||
      document.querySelector(DANMAKU_CONSTANTS.SELECTORS.PLAYER)
    );
  }

  attachToPlayer(player) {
    this.cleanup();
    this.playerContainer = player;
    this.ensurePositionedAncestor(player);

    this.container = document.createElement('div');
    this.container.id = 'danmaku-overlay';
    this.container.className = 'danmaku-overlay';
    player.appendChild(this.container);
    this.appendTextEffectFilter();

    this.updateAppearance();
    this.updateVisibility();
  }

  quoteFontFamily(value) {
    const escaped = String(value)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/[\n\r\f]/g, ' ');
    return `"${escaped}"`;
  }

  updateAppearance() {
    if (!this.container) return;
    const fontFamily = danmakuSettings.get('fontFamily');
    if (!fontFamily || fontFamily === 'system') {
      this.container.style.removeProperty('--danmaku-font-family');
      return;
    }
    this.container.style.setProperty(
      '--danmaku-font-family',
      this.quoteFontFamily(fontFamily)
    );
  }

  appendTextEffectFilter() {
    if (!this.container) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('danmaku-effect-filter-defs');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.innerHTML = [
      this.textEffectFilterMarkup('danmaku-text-border-filter', true),
      this.textEffectFilterMarkup('danmaku-text-border-flat-filter', false),
    ].join('');
    this.container.appendChild(svg);
  }

  textEffectFilterMarkup(id, includeDepth) {
    const depth = includeDepth
      ? `
        <feOffset in="expandedColor" dy="1.6" result="depthShape"></feOffset>
        <feComponentTransfer in="depthShape" result="depth">
          <feFuncR type="linear" slope="0.08"></feFuncR>
          <feFuncG type="linear" slope="0.08"></feFuncG>
          <feFuncB type="linear" slope="0.08"></feFuncB>
          <feFuncA type="linear" slope="0.98"></feFuncA>
        </feComponentTransfer>`
      : '';
    const depthMergeNode = includeDepth ? '<feMergeNode in="depth"></feMergeNode>' : '';
    const height = includeDepth ? '180%' : '170%';
    return `
      <filter id="${id}" x="-30%" y="-35%" width="160%" height="${height}" color-interpolation-filters="sRGB">
        <feMorphology in="SourceGraphic" operator="dilate" radius="1.15" result="expandedColor"></feMorphology>
        <feComponentTransfer in="expandedColor" result="border">
          <feFuncR type="linear" slope="0.24"></feFuncR>
          <feFuncG type="linear" slope="0.24"></feFuncG>
          <feFuncB type="linear" slope="0.24"></feFuncB>
          <feFuncA type="identity"></feFuncA>
        </feComponentTransfer>${depth}
        <feMerge>
          ${depthMergeNode}
          <feMergeNode in="border"></feMergeNode>
          <feMergeNode in="SourceGraphic"></feMergeNode>
        </feMerge>
      </filter>`;
  }

  ensurePositionedAncestor(player) {
    const computedStyle = window.getComputedStyle(player);
    if (computedStyle.position === 'static') {
      player.style.position = 'relative';
    }
  }

  setupFullscreenHandler() {
    this.fullscreenHandler = () => {
      setTimeout(() => {
        this.handleFullscreenChange();
      }, 100);
    };

    document.addEventListener('fullscreenchange', this.fullscreenHandler);
    document.addEventListener('webkitfullscreenchange', this.fullscreenHandler);
  }

  handleFullscreenChange() {
    const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;

    if (fullscreenElement) {
      const playerInFullscreen =
        fullscreenElement.querySelector(DANMAKU_CONSTANTS.SELECTORS.PLAYER_CONTAINER) ||
        fullscreenElement.matches(DANMAKU_CONSTANTS.SELECTORS.PLAYER_CONTAINER) ||
        fullscreenElement.closest(DANMAKU_CONSTANTS.SELECTORS.PLAYER_CONTAINER);

      if (playerInFullscreen || fullscreenElement.contains(this.playerContainer)) {
        this.ensureOverlayInFullscreen(fullscreenElement);
      }
    }

    this.updateVisibility();
  }

  ensureOverlayInFullscreen(fullscreenElement) {
    if (!this.container) return;

    if (!fullscreenElement.contains(this.container)) {
      const player = this.findPlayerContainer();
      if (player && fullscreenElement.contains(player)) {
        this.ensurePositionedAncestor(player);
        player.appendChild(this.container);
        this.playerContainer = player;
      }
    }
  }

  updateVisibility() {
    if (!this.container) return;

    const fullscreenOnly = danmakuSettings.get('fullscreenOnly');
    const enabled = danmakuSettings.get('enabled');
    const isFullscreen = !!document.fullscreenElement || !!document.webkitFullscreenElement;

    const shouldShow = enabled && (!fullscreenOnly || isFullscreen);
    this.container.style.display = shouldShow ? 'block' : 'none';
  }

  cleanup() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  destroy() {
    this.cleanup();
    if (this.fullscreenHandler) {
      document.removeEventListener('fullscreenchange', this.fullscreenHandler);
      document.removeEventListener('webkitfullscreenchange', this.fullscreenHandler);
      this.fullscreenHandler = null;
    }
    this.playerContainer = null;
  }

  isReady() {
    return !!this.container && !!this.playerContainer;
  }
}
