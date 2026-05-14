class TwitchDetector {
  constructor() {
    this.currentChannel = null;
    this.isStreamPage = false;
    this.isVodPage = false;
    this.onChannelChange = null;
    this.lastUrl = null;
    this._origPushState = null;
    this._origReplaceState = null;
    this._popstateHandler = null;
  }

  init(onChannelChange) {
    this.onChannelChange = onChannelChange;
    this.checkCurrentPage();
    this.setupNavigationListener();
  }

  checkCurrentPage() {
    const url = window.location.href;
    if (url === this.lastUrl) return;
    this.lastUrl = url;

    const { channel, isVod } = this.parseChannelFromUrl(url);

    const pageChanged = channel !== this.currentChannel || isVod !== this.isVodPage;
    if (pageChanged) {
      const oldChannel = this.currentChannel;
      this.currentChannel = channel;
      this.isStreamPage = !!channel;
      this.isVodPage = isVod;

      if (this.onChannelChange) {
        this.onChannelChange({
          channel,
          isStreamPage: this.isStreamPage,
          isVod: this.isVodPage,
          previousChannel: oldChannel,
        });
      }
    }
  }

  parseChannelFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;

      if (
        pathname === '/' ||
        pathname.startsWith('/directory') ||
        pathname.startsWith('/search') ||
        pathname.startsWith('/settings') ||
        pathname.startsWith('/drops') ||
        pathname.startsWith('/wallet') ||
        pathname.startsWith('/subscriptions') ||
        pathname.startsWith('/inventory') ||
        pathname.startsWith('/prime') ||
        pathname.startsWith('/turbo')
      ) {
        return { channel: null, isVod: false };
      }

      const parts = pathname.split('/').filter(Boolean);
      if (parts.length === 0) return { channel: null, isVod: false };

      // VOD pages: /videos/12345
      if (parts[0] === 'videos' && parts.length >= 2) {
        return { channel: `vod_${parts[1]}`, isVod: true };
      }

      const channel = parts[0].toLowerCase();
      if (channel.length > 0 && !channel.startsWith('_')) {
        return { channel, isVod: false };
      }
    } catch (e) {
      console.warn('[Danmaku] Failed to parse URL:', e);
    }
    return { channel: null, isVod: false };
  }

  setupNavigationListener() {
    if (this._origPushState) return;
    this._origPushState = history.pushState;
    this._origReplaceState = history.replaceState;
    const detector = this;

    history.pushState = function (...args) {
      detector._origPushState.apply(this, args);
      detector.checkCurrentPage();
    };

    history.replaceState = function (...args) {
      detector._origReplaceState.apply(this, args);
      detector.checkCurrentPage();
    };

    this._popstateHandler = () => this.checkCurrentPage();
    window.addEventListener('popstate', this._popstateHandler);
  }

  destroy() {
    if (this._origPushState) {
      history.pushState = this._origPushState;
      this._origPushState = null;
    }
    if (this._origReplaceState) {
      history.replaceState = this._origReplaceState;
      this._origReplaceState = null;
    }
    if (this._popstateHandler) {
      window.removeEventListener('popstate', this._popstateHandler);
      this._popstateHandler = null;
    }
  }

  getChannel() {
    return this.currentChannel;
  }
}
