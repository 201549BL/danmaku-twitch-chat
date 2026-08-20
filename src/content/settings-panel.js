const ANIM_DESCRIPTIONS = {
  scroll: 'Classic right-to-left scroll across the player.',
  reverse: 'Same as scroll but left-to-right.',
  drift: 'Right-to-left scroll with a slow vertical wobble.',
  popFade: 'Messages pop in at a random spot, hold briefly, then fade out.',
  slideUp: 'Messages slide in from below, hold, then drift up and fade.',
};

class DanmakuSettingsPanel {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.getStats = callbacks.getStats || (() => null);
    this.panel = null;
    this.opened = false;
    this.autoMockOn = false;
    this.dragState = null;
    this._boundOnMouseMove = (e) => this.onDrag(e);
    this._boundOnMouseUp = () => this.endDrag();
    this._boundOnFullscreen = () => this.handleFullscreenChange();
    this._settingsListener = () => {
      this.loadValues();
      this.scheduleSavedFlash();
    };
    this._statusTimer = null;
    this._savedFlashTimer = null;
    this._statsPollId = null;
  }

  scheduleSavedFlash() {
    if (!this.opened) return;
    if (this._savedFlashTimer) clearTimeout(this._savedFlashTimer);
    this._savedFlashTimer = setTimeout(() => {
      this._savedFlashTimer = null;
      this.flashStatus('Saved');
    }, 500);
  }

  init() {
    this.build();
    this.attach();
    this.buildBadgeChips();
    this.bindEvents();
    this.loadValues();
  }

  buildBadgeChips() {
    const container = this.panel.querySelector('[data-badge-chips]');
    if (!container) return;
    const roles = DANMAKU_CONSTANTS.HIGHLIGHT_BADGE_ROLES || [];
    container.innerHTML = '';
    for (const role of roles) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dsp-btn dsp-btn-sm';
      btn.setAttribute('data-action', 'highlight-badge');
      btn.setAttribute('data-role', role.key);
      btn.textContent = role.label;
      container.appendChild(btn);
    }
  }

  build() {
    this.panel = document.createElement('div');
    this.panel.id = 'danmaku-settings-panel';
    this.panel.innerHTML = this.template();
    this.panel.style.display = 'none';
  }

  template() {
    return `
      <div class="dsp-header" data-drag-handle>
        <span class="dsp-title">Danmaku</span>
        <button class="dsp-close" type="button" title="Close settings" aria-label="Close settings">×</button>
      </div>
      <div class="dsp-body">
        <section class="dsp-section">
          <h3>Overlay</h3>
          <label class="dsp-row">
            <span>Enabled</span>
            <input type="checkbox" data-setting="enabled" />
          </label>
          <label class="dsp-row">
            <span>Fullscreen only</span>
            <input type="checkbox" data-setting="fullscreenOnly" />
          </label>
        </section>

        <section class="dsp-section">
          <h3>Appearance</h3>
          <div class="dsp-row dsp-row-vertical">
            <div class="dsp-row-label"><span>Text size</span><em data-display="fontSize"></em></div>
            <input type="range" data-setting="fontSize" min="12" max="48" step="1" />
          </div>
          <div class="dsp-row dsp-row-vertical">
            <div class="dsp-row-label"><span>Message rows</span><em data-display="rows"></em></div>
            <input type="range" data-setting="rows" min="1" max="10" step="1" />
          </div>
          <div class="dsp-row dsp-row-vertical">
            <div class="dsp-row-label"><span>Opacity</span><em data-display="opacity"></em></div>
            <input type="range" data-setting="opacity" min="0.1" max="1" step="0.05" />
          </div>
        </section>

        <section class="dsp-section">
          <h3>Placement</h3>
          <div class="dsp-segmented" aria-label="Overlay placement presets">
            <button class="dsp-btn dsp-btn-sm" type="button" data-action="region-preset" data-preset="top">Top</button>
            <button class="dsp-btn dsp-btn-sm" type="button" data-action="region-preset" data-preset="middle">Middle</button>
            <button class="dsp-btn dsp-btn-sm" type="button" data-action="region-preset" data-preset="bottom">Bottom</button>
            <button class="dsp-btn dsp-btn-sm" type="button" data-action="region-preset" data-preset="full">Full</button>
          </div>
          <details class="dsp-disclosure dsp-inline-disclosure">
            <summary>Fine-tune placement</summary>
            <div class="dsp-disclosure-body">
              <div class="dsp-row dsp-row-vertical">
                <div class="dsp-row-label"><span>Top edge</span><em data-display="regionTop"></em></div>
                <input type="range" data-setting="regionTop" min="0" max="100" step="1" />
              </div>
              <div class="dsp-row dsp-row-vertical">
                <div class="dsp-row-label"><span>Height</span><em data-display="regionHeight"></em></div>
                <input type="range" data-setting="regionHeight" min="5" max="100" step="1" />
              </div>
            </div>
          </details>
        </section>

        <section class="dsp-section">
          <h3>Motion</h3>
          <label class="dsp-field">
            <span>Style</span>
            <select data-setting="animationMode">
              <option value="scroll">Scroll</option>
              <option value="reverse">Reverse</option>
              <option value="drift">Drift</option>
              <option value="popFade">Pop &amp; fade</option>
              <option value="slideUp">Slide up</option>
            </select>
          </label>
          <p class="dsp-anim-desc" data-anim-desc></p>
          <label class="dsp-row" title="Adapts message rate and speed when chat gets busy">
            <span>Adapt to busy chat</span>
            <input type="checkbox" data-setting="dynamicMode" />
          </label>
        </section>

        <details class="dsp-disclosure">
          <summary>Favorite chatters</summary>
          <div class="dsp-disclosure-body">
            <p class="dsp-hint dsp-hint-leading">Choose the people and roles you want to prioritize when chat gets busy.</p>
            <label class="dsp-field">
              <span>Usernames</span>
              <input type="text" data-setting="highlightUsers" placeholder="friend1, friend2" />
            </label>
            <div class="dsp-field-label">Badge roles</div>
            <div class="dsp-preset-row" data-badge-chips></div>
          </div>
        </details>

        <details class="dsp-disclosure">
          <summary>Message content</summary>
          <div class="dsp-disclosure-body">
            <label class="dsp-field">
              <span>Usernames</span>
              <select data-action="username-display" data-control="username-display">
                <option value="all">Show for everyone</option>
                <option value="favorites">Show for favorite chatters</option>
                <option value="hidden">Hide usernames</option>
              </select>
            </label>
            <label class="dsp-row">
              <span>Show badges</span>
              <input type="checkbox" data-setting="showBadges" />
            </label>
            <label class="dsp-row" title="Include the replied-to user and a short quote">
              <span>Show reply context</span>
              <input type="checkbox" data-setting="showReplyContext" />
            </label>
            <label class="dsp-row">
              <span>Pause on hover</span>
              <input type="checkbox" data-setting="pauseOnHover" />
            </label>
            <label class="dsp-row" title="Freeze the overlay when a VOD is paused">
              <span>Pause with VOD</span>
              <input type="checkbox" data-setting="pauseOnVideoPause" />
            </label>
          </div>
        </details>

        <details class="dsp-disclosure">
          <summary>Mentions</summary>
          <div class="dsp-disclosure-body">
            <label class="dsp-field">
              <span>Highlight mentions of</span>
              <input type="text" data-setting="highlightUsername" placeholder="Your Twitch username" />
            </label>
          </div>
        </details>

        <details class="dsp-disclosure">
          <summary>Advanced</summary>
          <div class="dsp-disclosure-body">
            <div class="dsp-row dsp-row-vertical" data-motion-control="scroll">
              <div class="dsp-row-label"><span>Travel time</span><em data-display="duration"></em></div>
              <input type="range" data-setting="duration" min="3" max="30" step="1" />
            </div>
            <div class="dsp-row dsp-row-vertical" data-motion-control="stationary">
              <div class="dsp-row-label"><span>On-screen time</span><em data-display="popFadeLifetime"></em></div>
              <input type="range" data-setting="popFadeLifetime" min="1" max="15" step="0.5" />
            </div>
            <div class="dsp-row dsp-row-vertical">
              <div class="dsp-row-label"><span>Messages per second</span><em data-display="maxMessagesPerSecond"></em></div>
              <input type="range" data-setting="maxMessagesPerSecond" min="1" max="20" step="1" />
            </div>
            <div class="dsp-row dsp-row-vertical">
              <div class="dsp-row-label"><span>Message length</span><em data-display="maxMessageLength"></em></div>
              <input type="range" data-setting="maxMessageLength" min="20" max="500" step="10" />
            </div>
          </div>
        </details>

        <details class="dsp-disclosure">
          <summary>Test &amp; diagnostics</summary>
          <div class="dsp-disclosure-body">
            <p class="dsp-diag-status" data-diag-status>No messages dropped recently.</p>
            <ul class="dsp-diag-list" data-diag-list></ul>
            <div class="dsp-preview-row">
              <button class="dsp-btn" type="button" data-action="mock-one">Send mock</button>
              <button class="dsp-btn" type="button" data-action="mock-burst">Burst ×10</button>
              <button class="dsp-btn" type="button" data-action="mock-spam">Stress test</button>
              <button class="dsp-btn" type="button" data-action="mock-highlight">Test favorites</button>
              <button class="dsp-btn" type="button" data-action="clear">Clear</button>
            </div>
            <label class="dsp-row">
              <span>Continuous mock messages</span>
              <input type="checkbox" data-action="auto-mock" />
            </label>
          </div>
        </details>

        <div class="dsp-footer">
          <button class="dsp-btn" type="button" data-action="reset">Reset to defaults</button>
          <span class="dsp-status" data-status></span>
        </div>
      </div>
    `;
  }

  attach() {
    document.body.appendChild(this.panel);
  }

  bindEvents() {
    this.panel.querySelector('.dsp-close').addEventListener('click', () => this.close());

    this.panel.querySelectorAll('[data-setting]').forEach((input) => {
      const event = input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(event, (e) => this.onInput(e));
    });

    this.panel.querySelectorAll('[data-action]').forEach((el) => {
      const action = el.getAttribute('data-action');
      const event = el.tagName === 'INPUT' || el.tagName === 'SELECT' ? 'change' : 'click';
      el.addEventListener(event, (e) => this.onAction(action, e));
    });

    const handle = this.panel.querySelector('[data-drag-handle]');
    handle.addEventListener('mousedown', (e) => this.startDrag(e));
    document.addEventListener('mousemove', this._boundOnMouseMove);
    document.addEventListener('mouseup', this._boundOnMouseUp);

    document.addEventListener('fullscreenchange', this._boundOnFullscreen);
    document.addEventListener('webkitfullscreenchange', this._boundOnFullscreen);

    danmakuSettings.addListener(this._settingsListener);
  }

  loadValues() {
    if (!this.panel) return;
    this.panel.querySelectorAll('[data-setting]').forEach((input) => {
      const key = input.getAttribute('data-setting');
      const value = danmakuSettings.get(key);
      if (input.type === 'checkbox') {
        input.checked = !!value;
      } else if (input.type === 'text' && input === document.activeElement) {
        // Don't clobber the caret while the user is typing in a text field
      } else {
        input.value = value;
      }
      this.updateDisplay(key, value);
    });
    this.updateUsernameDisplayControl();
    this.updateAnimationControls();
    this.updateRegionPresetButtons();
    this.updateBadgeChips();
  }

  updateBadgeChips() {
    if (!this.panel) return;
    const selected = new Set(danmakuSettings.get('highlightBadges') || []);
    this.panel.querySelectorAll('[data-action="highlight-badge"]').forEach((btn) => {
      const role = btn.getAttribute('data-role');
      const active = selected.has(role);
      btn.classList.toggle('dsp-btn-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  onInput(e) {
    const input = e.target;
    const key = input.getAttribute('data-setting');
    let value;
    if (input.type === 'checkbox') value = input.checked;
    else if (input.type === 'range' || input.type === 'number') value = parseFloat(input.value);
    else value = input.value;
    danmakuSettings.set(key, value);
    this.updateDisplay(key, danmakuSettings.get(key));
  }

  updateDisplay(key, value) {
    const display = this.panel.querySelector(`[data-display="${key}"]`);
    if (!display) return;
    if (key === 'opacity') display.textContent = `${Math.round(value * 100)}%`;
    else if (key === 'duration' || key === 'popFadeLifetime') display.textContent = `${value}s`;
    else if (key === 'fontSize') display.textContent = `${value}px`;
    else if (key === 'regionTop' || key === 'regionHeight') display.textContent = `${Math.round(value)}%`;
    else display.textContent = value;
  }

  updateAnimationControls() {
    if (!this.panel) return;
    const mode = danmakuSettings.get('animationMode');
    const desc = this.panel.querySelector('[data-anim-desc]');
    if (desc) desc.textContent = ANIM_DESCRIPTIONS[mode] || '';
    const stationary = (DANMAKU_CONSTANTS.STATIONARY_MODES || []).includes(mode);
    this.panel.querySelectorAll('[data-motion-control="scroll"]').forEach((el) => {
      el.hidden = stationary;
    });
    this.panel.querySelectorAll('[data-motion-control="stationary"]').forEach((el) => {
      el.hidden = !stationary;
    });
  }

  updateRegionPresetButtons() {
    if (!this.panel) return;
    const top = danmakuSettings.get('regionTop');
    const height = danmakuSettings.get('regionHeight');
    this.panel.querySelectorAll('[data-action="region-preset"]').forEach((btn) => {
      const preset = DANMAKU_CONSTANTS.REGION_PRESETS[btn.getAttribute('data-preset')];
      const active = !!preset && preset.regionTop === top && preset.regionHeight === height;
      btn.classList.toggle('dsp-btn-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  updateUsernameDisplayControl() {
    if (!this.panel) return;
    const control = this.panel.querySelector('[data-control="username-display"]');
    if (!control) return;
    if (!danmakuSettings.get('showUsernames')) control.value = 'hidden';
    else if (danmakuSettings.get('showUsernamesFavoritesOnly')) control.value = 'favorites';
    else control.value = 'all';
  }

  onAction(action, e) {
    switch (action) {
      case 'mock-one':
        this.callbacks.onMockMessage?.();
        break;
      case 'mock-burst':
        for (let i = 0; i < 10; i++) {
          setTimeout(() => this.callbacks.onMockMessage?.(), i * 120);
        }
        break;
      case 'mock-spam': {
        const ok = this.callbacks.onMockSpam?.();
        if (ok === false) this.flashStatus('Open a stream to test dynamic mode');
        break;
      }
      case 'mock-highlight': {
        const result = this.callbacks.onMockHighlight?.();
        if (result === false) this.flashStatus('Open a stream to test highlights');
        else if (result === 0) this.flashStatus('Enable a badge role or add a username first');
        break;
      }
      case 'clear':
        this.callbacks.onClearMessages?.();
        break;
      case 'auto-mock':
        this.autoMockOn = e.target.checked;
        this.callbacks.onAutoMock?.(this.autoMockOn);
        break;
      case 'username-display': {
        const value = e.target.value;
        danmakuSettings.setMany({
          showUsernames: value !== 'hidden',
          showUsernamesFavoritesOnly: value === 'favorites',
        });
        break;
      }
      case 'region-preset': {
        const preset = e.currentTarget.getAttribute('data-preset');
        const values = DANMAKU_CONSTANTS.REGION_PRESETS[preset];
        if (values) {
          danmakuSettings.set('regionTop', values.regionTop);
          danmakuSettings.set('regionHeight', values.regionHeight);
        }
        break;
      }
      case 'highlight-badge': {
        const role = e.currentTarget.getAttribute('data-role');
        if (!role) break;
        const current = new Set(danmakuSettings.get('highlightBadges') || []);
        if (current.has(role)) current.delete(role);
        else current.add(role);
        danmakuSettings.set('highlightBadges', Array.from(current));
        this.updateBadgeChips();
        break;
      }
      case 'reset':
        this.reset();
        break;
    }
  }

  async reset() {
    for (const [key, value] of Object.entries(DANMAKU_CONSTANTS.DEFAULTS)) {
      danmakuSettings.set(key, value);
    }
    await danmakuSettings.save();
    this.loadValues();
    this.flashStatus('Reset to defaults');
  }

  flashStatus(text) {
    const status = this.panel.querySelector('[data-status]');
    if (!status) return;
    status.textContent = text;
    if (this._statusTimer) clearTimeout(this._statusTimer);
    this._statusTimer = setTimeout(() => {
      status.textContent = '';
    }, 1500);
  }

  toggle() {
    this.opened ? this.close() : this.open();
  }

  open() {
    this.panel.style.display = 'flex';
    this.opened = true;
    this.updateDiagnostics();
    if (this._statsPollId === null) {
      this._statsPollId = setInterval(() => this.updateDiagnostics(), 1000);
    }
  }

  close() {
    this.panel.style.display = 'none';
    this.opened = false;
    if (this._statsPollId !== null) {
      clearInterval(this._statsPollId);
      this._statsPollId = null;
    }
  }

  updateDiagnostics() {
    if (!this.panel) return;
    const status = this.panel.querySelector('[data-diag-status]');
    const list = this.panel.querySelector('[data-diag-list]');
    if (!status || !list) return;

    const stats = this.getStats();
    if (!stats) {
      status.textContent = 'No stream attached.';
      list.innerHTML = '';
      return;
    }

    const { recent } = stats;
    if (recent.total === 0) {
      status.textContent = 'No messages dropped in the last 10 s.';
      list.innerHTML = '';
      return;
    }

    status.textContent = `${recent.total} message${recent.total === 1 ? '' : 's'} dropped in the last 10 s:`;
    const reasons = [
      {
        key: 'queue',
        label: 'Rate limit',
        hint: 'Chat is arriving faster than the renderer drains it. Raise "Max msgs/sec".',
      },
      {
        key: 'lane',
        label: 'Lane saturation',
        hint: 'All rows are busy. Add rows or lower "Duration".',
      },
      {
        key: 'active',
        label: 'Active message cap',
        hint: 'Internal ceiling reached; usually only on wide players with long durations.',
      },
    ];

    list.innerHTML = '';
    for (const r of reasons.filter((r) => recent[r.key] > 0).sort((a, b) => recent[b.key] - recent[a.key])) {
      const li = document.createElement('li');
      const label = document.createElement('strong');
      label.textContent = `${r.label} ×${recent[r.key]}`;
      const hint = document.createElement('span');
      hint.textContent = ` — ${r.hint}`;
      li.appendChild(label);
      li.appendChild(hint);
      list.appendChild(li);
    }
  }

  startDrag(e) {
    if (e.button !== 0) return;
    if (e.target.closest('.dsp-close')) return;
    const rect = this.panel.getBoundingClientRect();
    this.dragState = {
      startX: e.clientX,
      startY: e.clientY,
      origLeft: rect.left,
      origTop: rect.top,
    };
    this.panel.classList.add('dsp-dragging');
    e.preventDefault();
  }

  onDrag(e) {
    if (!this.dragState) return;
    const dx = e.clientX - this.dragState.startX;
    const dy = e.clientY - this.dragState.startY;
    const maxLeft = window.innerWidth - 80;
    const maxTop = window.innerHeight - 40;
    const left = Math.max(0, Math.min(maxLeft, this.dragState.origLeft + dx));
    const top = Math.max(0, Math.min(maxTop, this.dragState.origTop + dy));
    this.panel.style.left = `${left}px`;
    this.panel.style.top = `${top}px`;
    this.panel.style.right = 'auto';
    this.panel.style.bottom = 'auto';
  }

  endDrag() {
    if (!this.dragState) return;
    this.dragState = null;
    this.panel.classList.remove('dsp-dragging');
  }

  handleFullscreenChange() {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    const target = fsEl || document.body;
    if (this.panel && this.panel.parentNode !== target) {
      target.appendChild(this.panel);
    }
  }

  destroy() {
    danmakuSettings.removeListener(this._settingsListener);
    document.removeEventListener('mousemove', this._boundOnMouseMove);
    document.removeEventListener('mouseup', this._boundOnMouseUp);
    document.removeEventListener('fullscreenchange', this._boundOnFullscreen);
    document.removeEventListener('webkitfullscreenchange', this._boundOnFullscreen);
    if (this._statusTimer) clearTimeout(this._statusTimer);
    if (this._savedFlashTimer) clearTimeout(this._savedFlashTimer);
    if (this._statsPollId !== null) {
      clearInterval(this._statsPollId);
      this._statsPollId = null;
    }
    if (this.panel) this.panel.remove();
    this.panel = null;
  }
}
