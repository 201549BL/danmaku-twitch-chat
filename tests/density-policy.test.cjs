const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function harness(overrides = {}) {
  let now = 1000, storageChanged, restored = 0;
  const classes = new Set();
  const container = { offsetHeight: 720, offsetWidth: 1280, dataset: {}, appendChild() {}, classList: { contains: name => classes.has(name), toggle(name, on) { on ? classes.add(name) : classes.delete(name); } } };
  const context = { console, Date: {now: () => now}, setTimeout: () => 1, clearTimeout() {}, AbortController,
    chrome: {storage: {local: {get: async () => ({danmakuSettings: overrides}), set: async () => {}}, onChanged: {addListener(fn) {storageChanged = fn;}}}},
    window: {dispatchEvent() {}}, CustomEvent: class {},
  };
  const files = ['shared/constants.js', 'shared/settings.js', 'content/username-effects.js', 'content/message-presentation.js', 'content/renderer.js'];
  vm.runInNewContext(files.map(file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8')).join('\n') + '\nglobalThis.api={settings:danmakuSettings, constants:DANMAKU_CONSTANTS, Renderer:DanmakuRenderer, presentation:DANMAKU_PRESENTATION};', context);
  const {settings, constants, Renderer, presentation} = context.api;
  settings.setMany(overrides);
  const renderer = new Renderer({container});
  renderer._scheduleTick = () => {};
  renderer.createMessageElement = () => {restored++; return {offsetWidth: 50, style: {setProperty() {}}, querySelector() {return null;}, remove() {}, addEventListener() {}};};
  renderer.updateLanes();
  return {renderer, settings, constants, presentation, classes, container, context,
    step(ms) {now += ms; renderer.processQueue();}, restored: () => restored,
    storage(value) {storageChanged({danmakuSettings: {newValue: value}}, 'local');},
  };
}
test('persisted and live density counts normalize finite integers at all settings boundaries', async () => {
  const h = harness({rows: Infinity, maxActiveMessages: '999', maxMessagesPerSecond: 120.9});
  await h.settings.load();
  assert.equal(h.settings.get('rows'), 3);
  assert.equal(h.settings.get('maxActiveMessages'), 300);
  assert.equal(h.settings.get('maxMessagesPerSecond'), 120);
  h.settings.set('maxMessagesPerSecond', NaN);
  assert.equal(h.settings.get('maxMessagesPerSecond'), 5);
  h.settings.setMany({rows: 48.9, maxActiveMessages: -1});
  assert.equal(h.settings.get('rows'), 48);
  assert.equal(h.settings.get('maxActiveMessages'), 1);
  h.storage({rows: 99, maxActiveMessages: Infinity, maxMessagesPerSecond: -2});
  assert.equal(h.settings.get('rows'), 48);
  assert.equal(h.settings.get('maxActiveMessages'), 50);
  assert.equal(h.settings.get('maxMessagesPerSecond'), 1);
});
test('density follows actual GPU ownership and preserves requested rows inside bounded regions', () => {
  const h = harness({renderer: 'webgpu', rows: 48, regionHeight: 100, fontSize: 12});
  assert.equal(h.renderer.lanes.length, 10);
  h.renderer._presentation = {state:'gpu'};
  h.renderer.updateLanes();
  assert.equal(h.renderer.lanes.length, 48);
  const geometry = h.renderer.laneGeometry();
  assert.ok(geometry.top(47) + geometry.footprint <= 720);
  assert.equal(h.renderer.laneGeometry(), geometry);
  h.settings.setMany({regionTop:95, regionHeight:100}); h.renderer.updateLanes();
  assert.equal(h.renderer.lanes.length, 48);
  const edge = h.renderer.laneGeometry();
  assert.ok(edge.top(0) >= 684);
  assert.ok(edge.top(47) + edge.footprint <= 720);
  assert.equal(edge.overlapping, true);
});
test('settings and resize reconciliation retain occupied lane objects and trim out-of-range records', () => {
  const h = harness({rows: 10, regionHeight: 100});
  const lane = h.renderer.lanes[0]; lane.lastMessageEndTime = 5000; lane.occupants.push({endTime:5000});
  h.settings.set('opacity', 0.5); h.renderer.updateLanes();
  assert.equal(h.renderer.lanes[0], lane); assert.equal(lane.lastMessageEndTime, 5000); assert.equal(lane.occupants.length, 1);
  h.renderer.activeMessages.push({lane:h.renderer.lanes[9], element:{style:{}, remove() {}}, favorite:false});
  h.settings.set('regionHeight', 5); h.renderer.updateLanes();
  assert.equal(h.renderer.lanes.length, 10);
  assert.equal(h.renderer.activeMessages.length, 1);
  assert.equal(h.renderer.lanes[0], lane);
  h.settings.set('rows', 9); h.renderer.updateLanes();
  assert.equal(h.renderer.lanes.length, 9);
  assert.equal(h.renderer.activeMessages.length, 0); assert.equal(h.renderer.lanes[0], lane);
});
test('requested rows overlap in cramped regions and clear warnings when space increases', () => {
  const h = harness({rows: 10, regionHeight: 5});
  assert.equal(h.renderer.lanes.length, 10);
  assert.equal(h.renderer.laneGeometry().overlapping, true);
  h.settings.set('regionHeight', 100);
  h.renderer.updateLanes();
  assert.equal(h.renderer.lanes.length, 10);
  assert.equal(h.renderer.laneGeometry().overlapping, false);
  h.settings.setMany({rows: 1, regionHeight: 5});
  h.renderer.updateLanes();
  assert.equal(h.renderer.laneGeometry().overlapping, false);
});
test('row guides preserve backend row counts and show red warnings only for overlapping rows', () => {
  const h = harness({rows: 10, regionHeight: 5});
  const element = () => ({className: '', style: {}, children: [], appendChild(child) {this.children.push(child);}, set innerHTML(value) {this.children = [];}});
  const context = {DANMAKU_CONSTANTS: h.constants, danmakuSettings: h.settings, document: {createElement: element}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/content/region-editor.js'), 'utf8') + '\nglobalThis.Editor = DanmakuRegionEditor;', context);
  const editor = new context.Editor();
  editor.overlay = {container: h.container};
  editor.rowGuides = element();
  editor.updateRowGuides();
  assert.equal(editor.rowGuides.children.length, 10);
  assert.ok(editor.rowGuides.children.every(guide => guide.className.includes('danmaku-row-guide-warn')));
  assert.equal(editor.rowGuides.children[9].children[0].textContent, 'Row 10');
  h.settings.set('regionHeight', 100);
  editor.updateRowGuides();
  assert.equal(editor.rowGuides.children.length, 10);
  assert.ok(editor.rowGuides.children.every(guide => guide.className === 'danmaku-row-guide'));
  h.settings.set('rows', 48);
  editor.updateRowGuides();
  assert.equal(editor.rowGuides.children.length, 10);
  h.container.dataset.danmakuRenderer = 'webgpu';
  editor.updateRowGuides();
  assert.equal(editor.rowGuides.children.length, 48);
  assert.ok(editor.rowGuides.children.every(guide => guide.className.includes('danmaku-row-guide-warn')));
});
test('GPU fallback trims under DOM limits before restoring any elements and keeps requested limits', () => {
  const h = harness({renderer:'webgpu', rows:48, regionHeight:100, fontSize:12, maxActiveMessages:300});
  const owner = new h.presentation.Owner(h.renderer); h.renderer._presentation = owner; owner.state='gpu';
  h.renderer.updateLanes();
  for(let i=0; i<300; i++) h.renderer.activeMessages.push({lane:h.renderer.lanes[0], message:{}, mode:'scroll', width:50, durationMs:10000, elapsedMs:0, favorite:false});
  owner.reset();
  assert.equal(owner.state,'dom'); assert.equal(h.renderer.activeMessages.length,100); assert.equal(h.restored(),100);
  assert.equal(h.renderer.lanes.length,10); assert.equal(h.settings.get('maxActiveMessages'),300); assert.equal(h.settings.get('rows'),48);
});
test('a font-size change retires stale message dimensions and reservations before fallback', () => {
  const h = harness({renderer:'webgpu', rows:10, regionHeight:100, fontSize:48});
  const owner = new h.presentation.Owner(h.renderer); h.renderer._presentation = owner; owner.state='gpu';
  h.renderer.updateLanes();
  const lane = h.renderer.lanes[0];
  lane.lastMessageEndTime = 5000; lane.occupants.push({endTime:5000});
  let removed = 0;
  h.renderer.activeMessages.push({lane, element:{remove() {removed++;}}, content:{fontSize:48}, favorite:false});
  const queued = {username:'waiting'}; h.renderer.messageQueue.push(queued);
  h.container.offsetHeight = 360; h.renderer.updateLanes();
  assert.equal(removed, 1); assert.equal(h.renderer.activeMessages.length, 0);
  assert.equal(lane.lastMessageEndTime, 0); assert.equal(lane.occupants.length, 0);
  assert.equal(h.renderer.messageQueue[0], queued);
  owner.reset(); assert.equal(h.restored(), 0);
});
test('GPU effect descriptors preserve everyone effects at maximum traffic pressure', () => {
  const h=harness({usernameEffectStyle:'custom',usernameEffect:'duotoneEmber',usernameEffectScope:'everyone'});
  h.renderer._smoothedPressure=1;
  const descriptor=h.presentation.content(h.renderer,{username:'hello',text:'world'},'scroll',false);
  assert.equal(descriptor.runs.find(run=>run.username).effect,'duotoneEmber');
  h.settings.set('usernameEffectScope','favorites');
  assert.equal(h.presentation.content(h.renderer,{username:'hello'},'scroll',false).runs.find(run=>run.username).effect,'none');
});
for(const [hz,rate] of [[24,120],[30,120],[60,120],[144,5]]) test(`real queue scheduler admits ${rate}/s at ${hz}Hz without idle or stalled debt`, () => {
  const h=harness({maxMessagesPerSecond:rate, dynamicMode:false});
  h.renderer._presentation={state:'gpu',frame(){},clear(){}};
  let count=0, ready=true, largest=0;
  h.renderer.renderMessage=()=>{if(!ready)return false;count++; return true;};
  const frame=(dt)=>{h.renderer.messageQueue=Array.from({length:40},()=>({}));const before=count;h.step(dt);largest=Math.max(largest,count-before);};
  frame(0); const baseline=count;
  for(let i=0;i<hz;i++)frame(1000/hz);
  assert.ok(Math.abs(count-baseline-rate)<=1, `admitted ${count-baseline}`);
  ready=false; frame(100000); ready=true; const before=count;frame(100000);
  assert.equal(count-before,1);
  h.classes.add('danmaku-paused');frame(100000);const paused=count;
  h.classes.delete('danmaku-paused');frame(100000);
  assert.ok(count-paused<=Math.max(1,Math.ceil(rate/60)));assert.ok(largest<=8);
  h.renderer.clear();assert.equal(h.renderer._admissionCredits,0);
});
test('GPU high base rate never falls to the historical dynamic cap', () => {
  const h=harness({maxMessagesPerSecond:120});h.renderer._presentation={state:'gpu'};
  h.renderer._smoothedPressure=0.01;assert.equal(h.renderer._effectiveMaxMessagesPerSecond(),120);
  h.renderer._presentation.state='dom';assert.equal(h.renderer._effectiveMaxMessagesPerSecond(),20.6);
});

for (const renderer of ['auto', 'webgpu', 'dom']) test(`${renderer} schedules empty overlay startup only when GPU is requested`, () => {
  const h = harness({renderer});
  let scheduled = 0;
  h.renderer._scheduleTick = () => { scheduled++; };
  h.renderer._presentation = new h.presentation.Owner(h.renderer);
  scheduled = 0;
  h.renderer._presentation.frame = () => {};
  h.step(16);
  assert.equal(scheduled, renderer === 'dom' ? 0 : 1);
  h.renderer._presentation.state = 'failed';
  h.step(16);
  assert.equal(scheduled, renderer === 'dom' ? 0 : 1);
});

test('width-only resizing retains GPU lanes and records above DOM limits', () => {
  const h = harness({renderer:'webgpu', rows:48, regionHeight:100, fontSize:12, maxActiveMessages:300});
  const owner = new h.presentation.Owner(h.renderer); h.renderer._presentation = owner;
  owner.state = 'gpu'; owner.container = h.container;
  let destroyed = 0;
  owner.session = {geometry: () => '1:Custom Font:0', present() {}, destroy() {destroyed++;}};
  h.renderer.updateLanes();
  const records = Array.from({length:150}, (_, i) => ({message:{},lane:h.renderer.lanes[i % 48],content:{fontSize:12},width:50}));
  h.renderer.activeMessages.push(...records);
  for (const record of records) owner.tickets.set(record.message, {state:'ready',layout:{width:50}});
  owner.frame();
  const lanes = [...h.renderer.lanes];
  h.container.offsetWidth = 1600; h.renderer.updateLanes(); owner.frame();
  assert.equal(owner.state, 'gpu'); assert.equal(destroyed, 0); assert.equal(h.restored(), 0);
  assert.equal(h.renderer.activeMessages.length, 150); assert.equal(h.renderer.lanes.length, 48);
  assert.ok(records.every((record, i) => h.renderer.activeMessages[i] === record));
  assert.ok(lanes.every((lane, i) => h.renderer.lanes[i] === lane));
});

test('renderer settings notifications discard queued layouts without replacing active tickets', () => {
  const h = harness({renderer:'webgpu'});
  const owner = new h.presentation.Owner(h.renderer); h.renderer._presentation = owner; owner.state = 'gpu';
  const message = {username:'queued'}, active = {username:'active'};
  h.renderer.messageQueue.push(message);
  h.renderer.activeMessages.push({message:active,lane:h.renderer.lanes[0]});
  let closed = 0;
  const ticket = {state:'ready',abort:new AbortController(),layout:{close() {closed++;}}};
  const activeTicket = {state:'ready'};
  owner.tickets.set(message,ticket); owner.tickets.set(active,activeTicket);
  h.renderer._dynamicTag = {style:{},classList:{remove() {}}};
  h.settings.set('opacity', .4); h.renderer.onSettingsChange();
  assert.equal(closed, 1); assert.equal(ticket.abort.signal.aborted, true);
  assert.equal(owner.tickets.has(message), false); assert.equal(owner.tickets.get(active), activeTicket);
  assert.equal(owner.state, 'gpu');
});

for (const requested of ['webgpu', 'auto']) test(`${requested} startup completes with busy chat while GPU layouts are still preparing`, async () => {
  const h = harness({renderer:requested, rows:24, regionHeight:100, duration:3, maxActiveMessages:100, maxMessagesPerSecond:20, showUsernames:false});
  const preparations = [];
  let elapsed = 0;
  h.context.DANMAKU_GPU = {create: async () => ({
    geometry: () => 'stable', destroy() {}, show() {}, present() {return true;},
    prepare() {return new Promise(resolve => preparations.push({at:elapsed + 100, resolve}));},
  })};
  h.renderer._presentation = new h.presentation.Owner(h.renderer);
  h.renderer.messageQueue.push({text:'initial'});
  h.step(0);
  await Promise.resolve();
  assert.equal(h.renderer._presentation.state, 'preparing');
  assert.equal(h.renderer.lanes.length, 10);
  for (elapsed = 50; elapsed <= 10500 && h.renderer._presentation.state !== 'gpu'; elapsed += 50) {
    for (const pending of preparations.splice(0)) {
      if (pending.at <= elapsed) pending.resolve({width:50, close() {}});
      else preparations.push(pending);
    }
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    h.renderer.messageQueue.push({text:`message ${elapsed}`});
    h.step(50);
  }
  assert.equal(h.renderer._presentation.state, 'gpu');
  assert.equal(h.renderer.lanes.length, 24);
  assert.equal(h.settings.get('rows'), 24);
  assert.ok(h.renderer.messageQueue.length > 0);
  for (let i = 0; i < 4; i++) {
    for (const pending of preparations.splice(0)) pending.resolve({width:50, close() {}});
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    h.step(50);
  }
  assert.ok(h.renderer.activeMessages.some(record => record.element === null), 'queued messages render on GPU after promotion');
});

for (const requested of ['webgpu','auto']) test(`${requested} failed media stays visible alongside queued GPU text and 24 lanes`, async () => {
  const h = harness({renderer:requested,rows:24,regionHeight:100,maxActiveMessages:300,maxMessagesPerSecond:120,showUsernames:false});
  const preparations = [];
  h.context.DANMAKU_GPU = {create:async()=>({geometry:()=> 'stable',destroy(){},show(){},present(){return true;},prepare(content){return new Promise((resolve,reject)=>preparations.push({content,resolve,reject}));}})};
  h.renderer._presentation = new h.presentation.Owner(h.renderer);
  h.step(0);await Promise.resolve();h.step(10);
  const failed = {segments:[{type:'image',src:'https://cdn.betterttv.net/emote/560577560874de34757d2dc0/1x.webp'}]}, text = {text:'GPU text'};
  h.renderer.messageQueue.push(failed,text);h.step(10);
  const snapshot = h.renderer._presentation.tickets.get(failed).content;
  preparations[0].reject(Object.assign(new Error('Failed to fetch'),{code:'GPU_MEDIA_UNAVAILABLE'}));
  preparations[1].resolve({width:123,close(){}});
  await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();
  h.step(10);h.step(10);
  assert.equal(h.renderer.messageQueue.length,0);assert.equal(h.renderer.activeMessages.length,2);
  const [dom,gpu] = h.renderer.activeMessages;
  assert.ok(dom.element);assert.equal(dom.width,50);assert.equal(dom.content,snapshot);
  assert.equal(gpu.element,null);assert.equal(gpu.width,123);
  assert.equal(h.renderer._presentation.state,'gpu');assert.equal(h.renderer.lanes.length,24);
});

test('DOM subset cap drops failed media and lets the queue reach GPU messages', () => {
  const h = harness({rows:24,regionHeight:100,maxActiveMessages:300,maxMessagesPerSecond:120,showUsernames:false});
  const failed = {text:'failed'}, text = {text:'GPU'};
  const tickets = new Map([[failed,{state:'dom',content:{runs:[]}}],[text,{state:'ready',content:{runs:[]},layout:{width:123}}]]);
  h.renderer._presentation = {state:'gpu',frame(){},prepare:message=>tickets.get(message)};
  h.renderer.updateLanes();
  for(let i=0;i<100;i++)h.renderer.activeMessages.push({element:{style:{}},message:{},lane:h.renderer.lanes[0],favorite:false});
  h.renderer.messageQueue.push(failed,text);h.step(0);h.step(10);
  assert.equal(h.renderer.dropsActive,1);assert.equal(h.renderer.messageQueue.length,0);
  assert.equal(h.renderer.activeMessages.filter(record=>record.element).length,100);
  assert.equal(h.renderer.activeMessages.length,101);assert.equal(h.renderer.activeMessages.at(-1).message,text);
  assert.equal(h.renderer.activeMessages.at(-1).element,null);
  assert.equal(h.renderer.lanes.length,24);
});
