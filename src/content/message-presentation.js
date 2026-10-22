const DANMAKU_PRESENTATION = (() => {
  const MAX_PENDING_PREPARATIONS = 20;
  const text = (value, color, weight = 500, extra = {}) => ({type: 'text', value, color, weight, ...extra});
  function content(renderer, message, mode, favorite) {
    const get = key => danmakuSettings.get(key);
    const mention = renderer.isSelfMention(message);
    const runs = [];
    if (message.replyTo && get('showReplyContext')) {
      runs.push(text(`↳ @${message.replyTo.username}`, 'rgba(255,255,255,.85)'));
      const quote = message.replyTo.quote;
      if (quote) runs.push(text(` ${quote.length > 20 ? quote.substring(0,20) + '…' : quote}`, 'rgba(255,255,255,.5)', 500, {italic:true}));
      runs.push(text(' ', 'rgba(255,255,255,.65)', 500, {after:4}));
    }
    if (get('showUsernames') && (!get('showUsernamesFavoritesOnly') || favorite)) {
      if (get('showBadges')) for (const badge of message.badges || []) if (badge.src) runs.push({type:'image',src:badge.src,alt:badge.alt || '',badge:true});
      const style = get('usernameEffectStyle');
      const effect = DANMAKU_USERNAME_EFFECTS.resolveEffect(style === 'signature' ? 'signature' : style === 'custom' ? get('usernameEffect') : 'none', message.username, get('signatureEffectPool'));
      const palette = DANMAKU_USERNAME_EFFECTS.resolvePalette(style === 'signature' ? 'auto' : get('usernameEffectPalette'),message.username,get('signaturePalettePool'));
      runs.push(text(message.username + ': ', message.color || '#ffffff',700, {
        username:message.username, effect:DANMAKU_USERNAME_EFFECTS.shouldApply(get('usernameEffectScope'),false,0,favorite) ? effect : 'none',palette,
      }));
    }
    let remaining = get('maxMessageLength');
    const color = favorite ? message.color : mention ? '#fff7c8' : '#ffffff';
    const segments = message.segments?.length ? message.segments : [{type:'text',value:message.text || ''}];
    for (const segment of segments) {
      if (segment.type === 'image' && segment.src) runs.push({type:'image',src:segment.src,alt:segment.alt || '',badge:false});
      if (segment.type !== 'text') continue;
      if (remaining <= 0) { runs.push(text('...',color)); break; }
      const value = segment.value || '';
      runs.push(text(value.length > remaining ? value.substring(0,remaining) + '...' : value,color));
      if (value.length > remaining) break;
      remaining -= value.length;
    }
    return {runs,mode,favorite,mention,fontSize:renderer.getFontSizePx(),fontFamily:get('fontFamily') || 'Segoe UI',opacity:get('opacity')};
  }
  class Owner {
    constructor(renderer) {
      this.renderer = renderer;
      this.requested = null;
      this.state = 'dom';
      this.generation = 0;
      this.tickets = new Map();
      this.pendingPreparations = new Set();
      this.session = null;
      this.container = null;
      this.select(danmakuSettings.get('renderer'));
    }
    status(reason = '') {
      const detail = {requested:this.requested,effective:this.state === 'gpu' ? 'webgpu' : 'dom',reason};
      if (this.renderer.overlay.container?.dataset) this.renderer.overlay.container.dataset.danmakuRenderer = detail.effective;
      window.__danmakuRendererStatus = detail;
      window.dispatchEvent(new CustomEvent('danmaku-renderer-status',{detail}));
    }
    get wantsGPU() {
      return this.requested === 'webgpu' || this.requested === 'auto';
    }
    select(value) {
      const requested = value === 'webgpu' || value === 'auto' ? value : 'dom';
      if (this.requested === requested && this.state !== 'destroyed') return;
      this.requested = requested;
      this.reset();
      this.state = 'dom';
      this.status(this.wantsGPU ? 'Preparing GPU renderer' : '');
      this.renderer._scheduleTick();
    }
    restore() {
      const logical=this.renderer.logicalTime?.();
      for (const record of this.renderer.activeMessages) {
        if(record.startedAt!==undefined && logical!==undefined)record.elapsedMs=Math.max(0,logical-record.startedAt);
        if (record.element) {
          record.element.style.visibility = '';
          if (record.element.parentNode !== this.renderer.overlay.container) this.renderer.overlay.container?.appendChild(record.element);
          continue;
        }
        const element = this.renderer.createMessageElement(record.message,record.lane,record.mode,record.favorite);
        if (record.content) {
          const parent = element.querySelector('.danmaku-drift-inner') || element;
          parent.replaceChildren();
          for (const run of record.content.runs) {
            const node = document.createElement(run.type === 'image' ? 'img' : 'span');
            if (run.type === 'image') {
              node.className = run.badge ? 'danmaku-badge' : 'danmaku-emote';node.src = run.src;node.alt = run.alt;
            } else {
              node.textContent = run.value;
              node.style.color = run.color;node.style.fontWeight = run.weight;
              if (run.italic) node.style.fontStyle = 'italic';
              if (run.after) node.style.marginRight = `${run.after}px`;
              if (run.username) {
                node.className = 'danmaku-username';
                if (run.effect && run.effect !== 'none') DANMAKU_USERNAME_EFFECTS.decorateElement(node,{username:run.username,text:run.value,color:run.color,effect:run.effect,palette:run.palette,mode:record.mode,enhanced:record.favorite});
              }
            }
            parent.appendChild(node);
          }
          element.style.fontSize = `${record.content.fontSize}px`;
          element.style.setProperty('--max-opacity',record.content.opacity);
          if (!DANMAKU_CONSTANTS.STATIONARY_MODES.includes(record.mode)) element.style.opacity = record.content.opacity;
        }
        element.style.animationDuration = `${record.durationMs}ms`;
        element.style.animationDelay = `-${record.elapsedMs}ms`;
        element.style.setProperty('--scroll-distance',`${this.renderer.overlay.container.offsetWidth + record.width}px`);
        element.style.setProperty('--xoffset',`${record.xLeft + record.width / 2 - this.renderer.overlay.container.offsetWidth / 2}px`);
        const inner = element.querySelector('.danmaku-drift-inner');
        if (inner) inner.style.animationDelay = `-${record.elapsedMs}ms`;
        const username = element.querySelector('.danmaku-username');
        if (username) {
          const delay = parseFloat(username.style.getPropertyValue('--danmaku-effect-delay')) || 0;
          username.style.setProperty('--danmaku-effect-delay',`${delay - record.elapsedMs / 1000}s`);
        }
        this.renderer.overlay.container.appendChild(element);
        record.element = element;
      }
    }
    reset() {
      this.generation++;
      this.pendingPreparations.clear();
      this.startupAbort?.abort();
      this.startupAbort = null;
      this.geometryKey = null;
      this.state = 'dom';
      this.renderer.updateLanes?.();
      this.restore();
      this.session?.destroy();
      this.session = null;
      for (const ticket of this.tickets.values()) {ticket.state = 'cancelled'; ticket.abort?.abort(); ticket.layout?.close();}
      this.tickets.clear();
    }
    fail(error) {
      if (this.state === 'destroyed' || this.state === 'failed') return;
      console.warn('[Danmaku] GPU fallback',error);
      this.reset();
      this.state = 'failed';
      this.status('GPU unavailable. Using DOM renderer.');
    }
    invalidateQueued() {
      const active = new Set(this.renderer.activeMessages.map(record => record.message));
      for (const message of this.renderer.messageQueue) {
        if (active.has(message)) continue;
        const ticket = this.tickets.get(message);
        if (!ticket) continue;
        ticket.state = 'cancelled';
        ticket.abort?.abort();
        ticket.layout?.close();
        this.tickets.delete(message);
      }
    }
    prepare(key, descriptor) {
      if (!this.session || (this.state !== 'gpu' && this.state !== 'preparing')) return null;
      let ticket = this.tickets.get(key);
      if (ticket) return ticket;
      if (this.pendingPreparations.size >= MAX_PENDING_PREPARATIONS) return null;
      ticket = {state:'pending',started:Date.now(),content:descriptor,abort:new AbortController()};
      this.tickets.set(key,ticket);
      const generation = this.generation;
      this.pendingPreparations.add(ticket);
      this.session.prepare(descriptor,{signal:ticket.abort.signal}).then(layout => {
        if (generation !== this.generation || ticket.state !== 'pending') {layout.close(); return;}
        ticket.state = 'ready'; ticket.layout = layout;
      }).catch(error => {
        const live = this.renderer.messageQueue.includes(key) || this.renderer.activeMessages.some(record => record.message === key);
        if (generation !== this.generation || ticket.state !== 'pending' || !live) return;
        if (error.code === 'GPU_MEDIA_UNAVAILABLE') {
          ticket.state = 'dom';
          ticket.abort.abort();
        } else this.fail(error);
      }).finally(() => {
        this.pendingPreparations.delete(ticket);
      });
      return ticket;
    }
    frame() {
      if (this.state === 'destroyed') return;
      const container = this.renderer.overlay.container;
      if (container !== this.container) {
        this.reset(); this.container = container;
        this.state = 'dom';
      }
      if (!container || !this.wantsGPU || this.state === 'failed') return;
      if (this.state === 'dom') {
        this.state = 'starting';
        this.stagingStarted = Date.now();
        this.status('Preparing GPU renderer');
        const generation = this.generation;
        this.startupAbort = new AbortController();
        const timeout = setTimeout(() => {if (generation === this.generation) this.fail(new Error('GPU startup timed out'));},10000);
        const create = typeof DANMAKU_GPU === 'undefined' ? () => Promise.reject(new Error('GPU module unavailable')) : DANMAKU_GPU.create;
        create(container,error => {if (generation === this.generation) this.fail(error);},{signal:this.startupAbort.signal}).then(session => {
          clearTimeout(timeout);
          if (generation !== this.generation) {session.destroy(); return;}
          this.session = session; this.state = 'preparing';
        }).catch(error => {clearTimeout(timeout); if (generation === this.generation) this.fail(error);});
      }
      if (!this.session) return;
      if (this.state === 'preparing' && Date.now() - this.stagingStarted > 10000) {this.fail(new Error('GPU scene preparation timed out')); return;}
      const geometry = `${this.session.geometry()}:${this.renderer.getFontSizePx()}`;
      if (this.geometryKey && this.geometryKey !== geometry) {
        this.reset(); this.state = 'dom'; this.geometryKey = geometry;
        for (const record of this.renderer.activeMessages) record.content = {...record.content,fontSize:this.renderer.getFontSizePx()};
        this.status('Preparing GPU renderer'); return;
      }
      this.geometryKey = geometry;
      const live = new Set([...this.renderer.activeMessages.map(r=>r.message),...this.renderer.messageQueue]);
      for (const [key,ticket] of this.tickets) if (!live.has(key)) {ticket.state = 'cancelled'; ticket.abort?.abort(); ticket.layout?.close(); this.tickets.delete(key);}
      const records = this.renderer.activeMessages;
      const staging = records.map(record => {
        record.content ||= content(this.renderer,record.message,record.mode,record.favorite);
        return this.prepare(record.message,record.content);
      });
      if (this.state === 'gpu') for (const message of this.renderer.messageQueue) {
        if (this.pendingPreparations.size >= MAX_PENDING_PREPARATIONS) break;
        if (!this.tickets.has(message)) this.prepare(message,content(this.renderer,message,danmakuSettings.get('animationMode'),this.renderer.isFavorite(message)));
      }
      const settled = staging.every(ticket => ticket?.state === 'ready' || ticket?.state === 'dom');
      for (const ticket of this.pendingPreparations) if (Date.now()-ticket.started > 10000) {this.fail(new Error('Media preparation timed out')); return;}
      if (this.state === 'preparing' && !settled) return;
      const gpuRecords = records.filter(record => this.tickets.get(record.message)?.state === 'ready');
      for (const record of gpuRecords) record.width = this.tickets.get(record.message).layout.width;
      try {
        const drawn = this.session.present(gpuRecords.map(record => ({...record,layout:this.tickets.get(record.message).layout})),this.renderer);
        if (this.state === 'preparing') {
          if (drawn === false) return;
          this.state = 'gpu';
          this.renderer.updateLanes?.();
          for (const record of gpuRecords) {record.element?.remove(); record.element = null;}
          this.session.show(); this.status();
        }
      } catch (error) {this.fail(error);}
    }
    clear() {
      this.reset();
      if (this.state !== 'destroyed') this.state = 'dom';
    }
    destroy() {this.reset(); this.state = 'destroyed';}
  }
  return {content,Owner};
})();
