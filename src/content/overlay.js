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

    this.updateVisibility();
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
