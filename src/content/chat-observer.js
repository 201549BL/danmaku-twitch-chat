class ChatObserver {
  constructor() {
    this.observer = null;
    this.chatContainer = null;
    this.onMessage = null;
    this.processedIds = new Set();
    this.retryTimeout = null;
    this.maxRetries = 20;
    this.retryCount = 0;
    this.isVod = false;
    this.iframe = null;
    this.channel = null;
    this.iframeRetryTimeout = null;
  }

  init(onMessage, isVod = false, channel = null) {
    this.onMessage = onMessage;
    this.isVod = isVod;
    this.channel = channel;

    if (isVod || !channel) {
      this.findAndObserveChat();
    } else {
      this.createPopoutIframe();
    }
  }

  createPopoutIframe() {
    this.iframe = document.createElement('iframe');
    this.iframe.id = 'danmaku-chat-iframe';
    this.iframe.style.cssText =
      'position: fixed; left: -9999px; top: -9999px; width: 380px; height: 600px; border: 0; opacity: 0; pointer-events: none;';
    this.iframe.src = `https://www.twitch.tv/popout/${this.channel}/chat`;
    this.iframe.addEventListener('load', () => this.onIframeLoaded());
    document.body.appendChild(this.iframe);
  }

  onIframeLoaded() {
    let retries = 0;
    const maxRetries = 30;
    const tryFind = () => {
      try {
        const doc = this.iframe?.contentDocument;
        if (!doc) return;
        const container = doc.querySelector(DANMAKU_CONSTANTS.SELECTORS.CHAT_CONTAINER);
        if (container) {
          this.attachObserver(container);
          return;
        }
        if (++retries < maxRetries) {
          this.iframeRetryTimeout = setTimeout(tryFind, 1000);
        } else {
          console.warn('[Danmaku] Iframe chat not found, falling back to main page');
          this.fallbackToMainPage();
        }
      } catch (e) {
        console.warn('[Danmaku] Iframe access error:', e);
        this.fallbackToMainPage();
      }
    };
    tryFind();
  }

  fallbackToMainPage() {
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }
    if (this.iframeRetryTimeout) {
      clearTimeout(this.iframeRetryTimeout);
      this.iframeRetryTimeout = null;
    }
    this.findAndObserveChat();
  }

  findAndObserveChat() {
    let container = null;

    if (this.isVod) {
      container = document.querySelector(DANMAKU_CONSTANTS.SELECTORS.VOD_CHAT_CONTAINER);
    }
    if (!container) {
      container = document.querySelector(DANMAKU_CONSTANTS.SELECTORS.CHAT_CONTAINER);
    }
    if (!container && !this.isVod) {
      container = document.querySelector(DANMAKU_CONSTANTS.SELECTORS.VOD_CHAT_CONTAINER);
      if (container) this.isVod = true;
    }

    if (container) {
      this.attachObserver(container);
      this.retryCount = 0;
    } else {
      this.retryCount++;
      if (this.retryCount < this.maxRetries) {
        this.retryTimeout = setTimeout(() => this.findAndObserveChat(), 1000);
      } else {
        console.warn(
          '[Danmaku] Chat container not found after',
          this.maxRetries,
          'retries — Twitch DOM selectors may have changed'
        );
      }
    }
  }

  attachObserver(container) {
    this.disconnect();
    this.chatContainer = container;

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.processNode(node);
          }
        }
      }
    });

    this.observer.observe(container, { childList: true, subtree: true });
  }

  processNode(node) {
    const liveSelector = DANMAKU_CONSTANTS.SELECTORS.CHAT_LINE;
    const vodSelector = DANMAKU_CONSTANTS.SELECTORS.VOD_CHAT_LINE;

    let chatLine = node.matches?.(liveSelector) ? node : node.querySelector?.(liveSelector);
    let isVodMessage = false;

    if (!chatLine) {
      chatLine = node.matches?.(vodSelector) ? node : node.querySelector?.(vodSelector);
      isVodMessage = !!chatLine;
    }

    if (!chatLine) return;

    const messageId = chatLine.getAttribute('data-a-id') ||
                      chatLine.getAttribute('data-timestamp') ||
                      this.generateId(chatLine);
    if (this.processedIds.has(messageId)) return;
    this.processedIds.add(messageId);

    if (this.processedIds.size > 1000) {
      const idsArray = Array.from(this.processedIds);
      this.processedIds = new Set(idsArray.slice(-500));
    }

    requestAnimationFrame(() => {
      if (!chatLine.isConnected) return;
      const message = this.parseMessage(chatLine, messageId, isVodMessage);
      if (message && this.onMessage) {
        this.onMessage(message);
      }
    });
  }

  parseMessage(element, id, isVodMessage = false) {
    let usernameEl, textContainer;

    if (isVodMessage) {
      usernameEl = element.querySelector(DANMAKU_CONSTANTS.SELECTORS.VOD_CHAT_USERNAME);
      textContainer = element.querySelector(DANMAKU_CONSTANTS.SELECTORS.VOD_CHAT_TEXT);
    } else {
      usernameEl = element.querySelector(DANMAKU_CONSTANTS.SELECTORS.CHAT_USERNAME);
      textContainer = element.querySelector(DANMAKU_CONSTANTS.SELECTORS.CHAT_TEXT);
    }

    if (!usernameEl || !textContainer) return null;

    const username = usernameEl.textContent?.trim() || 'Unknown';
    const color = usernameEl.style.color || this.getColorFromElement(usernameEl);
    const badges = this.extractBadges(element);
    const segments = this.extractSegments(textContainer);
    const replyTo = isVodMessage ? null : this.extractReply(element);

    if (segments.length > 0 && segments[0].type === 'text') {
      segments[0].value = segments[0].value.replace(/^:\s*/, '');
      if (!segments[0].value) segments.shift();
    }

    const text = segments
      .map((s) => (s.type === 'text' ? s.value : s.alt ? ` ${s.alt} ` : ' '))
      .join('')
      .trim();

    const hasImage = segments.some((s) => s.type === 'image');
    if (!text && !hasImage) return null;

    return {
      id,
      username,
      displayName: username,
      text,
      segments,
      badges,
      replyTo,
      color: color || '#ffffff',
      timestamp: Date.now(),
      rawElement: element,
    };
  }

  extractReply(chatLine) {
    const bodySelector = DANMAKU_CONSTANTS.SELECTORS.CHAT_TEXT;
    for (const p of chatLine.querySelectorAll('p')) {
      if (p.closest(bodySelector)) continue;
      const text = (p.textContent || '').trim();
      if (!text.startsWith('Replying to')) continue;
      const m = text.match(/@(\w+)\s*:?\s*(.*)$/);
      if (!m) continue;
      const quote = (p.getAttribute('title') || m[2] || '').trim();
      return { username: m[1], quote };
    }

    const aria = chatLine.getAttribute('aria-label') || '';
    const am = aria.match(/^Replying to (\w+)/i);
    if (am) return { username: am[1], quote: '' };

    return null;
  }

  extractBadges(chatLine) {
    const badgeEls = chatLine.querySelectorAll(DANMAKU_CONSTANTS.SELECTORS.CHAT_BADGE);
    const badges = [];
    for (const node of badgeEls) {
      const img = node.tagName === 'IMG' ? node : node.querySelector('img');
      if (img && img.src) {
        badges.push({ src: img.src, alt: img.alt || '' });
      }
    }
    return badges;
  }

  getColorFromElement(element) {
    const computed = window.getComputedStyle(element);
    return computed.color || '#ffffff';
  }

  extractSegments(container) {
    const segments = [];
    let textBuffer = '';

    const flushText = () => {
      if (textBuffer) {
        segments.push({ type: 'text', value: textBuffer });
        textBuffer = '';
      }
    };

    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        textBuffer += node.textContent;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const isEmoteWrapper =
        node.tagName === 'IMG' ||
        node.classList.contains('chat-image') ||
        node.classList.contains('emote-button') ||
        node.classList.contains('bttv-emote') ||
        node.classList.contains('ffz-emote') ||
        node.classList.contains('seventv-emote');

      if (isEmoteWrapper) {
        const img = node.tagName === 'IMG' ? node : node.querySelector('img');
        if (img && img.src) {
          flushText();
          segments.push({ type: 'image', src: img.src, alt: img.alt || '' });
          return;
        }
      }

      for (const child of node.childNodes) walk(child);
    };

    walk(container);
    flushText();
    return segments;
  }

  generateId(element) {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  disconnect() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
  }

  destroy() {
    this.disconnect();
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }
    if (this.iframeRetryTimeout) {
      clearTimeout(this.iframeRetryTimeout);
      this.iframeRetryTimeout = null;
    }
    this.processedIds.clear();
    this.chatContainer = null;
    this.onMessage = null;
  }

}
