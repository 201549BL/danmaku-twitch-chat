class DanmakuController {
  constructor() {
    this.detector = null;
    this.observer = null;
    this.overlay = null;
    this.renderer = null;
    this.regionEditor = null;
    this.settingsPanel = null;
    this.mockChat = null;
    this.initialized = false;
    this.isVod = false;
    this._pendingInitToken = null;
  }

  async start() {
    await danmakuSettings.load();
    danmakuSettings.addListener(() => this.onSettingsChange());

    this.detector = new TwitchDetector();
    this.detector.init((event) => this.onChannelChange(event));

    this.initSettingsPanel();
    this.setupMessageListener();
    this.autoDetectUsername();

    console.log('[Danmaku] Extension initialized');
  }

  setupMessageListener() {
    if (!chrome?.runtime?.onMessage?.addListener) return;
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.action === 'open-settings') {
        this.settingsPanel?.open();
      }
    });
  }

  autoDetectUsername() {
    if (danmakuSettings.get('highlightUsername')) return;
    let attempts = 0;
    const maxAttempts = 6;
    const tryDetect = () => {
      if (danmakuSettings.get('highlightUsername')) return;
      attempts++;
      const name = this.detectTwitchUsername();
      if (name) {
        danmakuSettings.set('highlightUsername', name);
        console.log('[Danmaku] Auto-detected Twitch username:', name);
        return;
      }
      if (attempts < maxAttempts) {
        setTimeout(tryDetect, 2500);
      }
    };
    setTimeout(tryDetect, 1500);
  }

  detectTwitchUsername() {
    return (
      this.detectUsernameFromDOM() ||
      this.detectUsernameFromLocalStorage() ||
      this.detectUsernameFromCookies() ||
      null
    );
  }

  detectUsernameFromDOM() {
    const selectors = [
      '[data-a-target="user-menu-toggle"] [data-a-target="user-display-name"]',
      '[data-a-target="user-display-name"]',
      'a[data-a-target="user-channel-link"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const text = el?.textContent?.trim();
      if (text && this.looksLikeUsername(text)) {
        return text.toLowerCase();
      }
    }
    return null;
  }

  detectUsernameFromLocalStorage() {
    try {
      const keys = ['last_login', 'login', 'name'];
      for (const key of keys) {
        const val = localStorage.getItem(key);
        if (val && this.looksLikeUsername(val)) {
          return val.toLowerCase();
        }
      }
    } catch (e) {}
    return null;
  }

  detectUsernameFromCookies() {
    try {
      const cookies = {};
      for (const part of document.cookie.split(';')) {
        const idx = part.indexOf('=');
        if (idx < 0) continue;
        const k = part.slice(0, idx).trim();
        const v = decodeURIComponent(part.slice(idx + 1).trim());
        cookies[k] = v;
      }
      const keys = ['login', 'name'];
      for (const key of keys) {
        const val = cookies[key];
        if (val && this.looksLikeUsername(val)) {
          return val.toLowerCase();
        }
      }
    } catch (e) {}
    return null;
  }

  looksLikeUsername(s) {
    return /^[a-zA-Z0-9_]{3,25}$/.test(s);
  }

  initSettingsPanel() {
    if (this.settingsPanel) return;
    this.mockChat = new MockChatGenerator((msg) => this.injectMockMessage(msg));
    this.settingsPanel = new DanmakuSettingsPanel({
      onMockMessage: () => this.mockChat.emitOne(),
      onClearMessages: () => this.renderer?.clear(),
      onAutoMock: (on) => (on ? this.mockChat.start(1000) : this.mockChat.stop()),
    });
    this.settingsPanel.init();
  }

  injectMockMessage(msg) {
    if (!this.renderer || !this.overlay?.isReady()) return;
    this.renderer.addMessage(msg);
  }

  onChannelChange(event) {
    console.log('[Danmaku] Channel change:', event);

    if (event.isStreamPage && event.channel) {
      if (this.initialized && event.previousChannel) {
        this.shutdown();
      }
      this.isVod = event.isVod || false;
      const token = Symbol('init');
      this._pendingInitToken = token;
      setTimeout(() => {
        if (this._pendingInitToken !== token) return;
        this._pendingInitToken = null;
        this.initialize();
      }, 500);
    } else {
      this._pendingInitToken = null;
      this.shutdown();
    }
  }

  initialize() {
    if (this.initialized) return;

    this.overlay = new DanmakuOverlay();
    this.overlay.init();

    this.renderer = new DanmakuRenderer(this.overlay);
    this.renderer.init();

    this.observer = new ChatObserver();
    this.observer.init(
      (message) => this.onChatMessage(message),
      this.isVod,
      this.detector?.getChannel()
    );

    this.regionEditor = new DanmakuRegionEditor({
      onOpenSettings: () => this.settingsPanel?.open(),
    });
    this.regionEditor.attach(this.overlay);

    this.initialized = true;
    console.log('[Danmaku] Components initialized, isVod:', this.isVod);
  }

  onChatMessage(message) {
    if (!danmakuSettings.get('enabled')) return;
    if (!this.renderer) return;

    this.renderer.addMessage(message);
  }

  onSettingsChange() {
    if (this.renderer) {
      this.renderer.onSettingsChange();
    }
    if (this.overlay) {
      this.overlay.updateVisibility();
    }
  }

  shutdown() {
    if (this.observer) {
      this.observer.destroy();
      this.observer = null;
    }
    if (this.regionEditor) {
      this.regionEditor.destroy();
      this.regionEditor = null;
    }
    if (this.renderer) {
      this.renderer.destroy();
      this.renderer = null;
    }
    if (this.overlay) {
      this.overlay.destroy();
      this.overlay = null;
    }
    this.initialized = false;
    console.log('[Danmaku] Shutdown complete');
  }

  destroy() {
    this.shutdown();
    if (this.mockChat) {
      this.mockChat.destroy();
      this.mockChat = null;
    }
    if (this.settingsPanel) {
      this.settingsPanel.destroy();
      this.settingsPanel = null;
    }
    if (this.detector) {
      this.detector.destroy();
      this.detector = null;
    }
  }
}

const danmakuController = new DanmakuController();
danmakuController.start();
