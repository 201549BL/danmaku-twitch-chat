const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function harness({ready=true}={}) {
  const sent=[],failures=[],bitmaps=[],surfaces=[];
  let worker,removed=0,revoked=0;
  const classes=new Set(), fontListeners=new Map();
  const canvas={style:{},transferControlToOffscreen:()=>({}),remove:()=>removed++};
  const container={offsetWidth:800,offsetHeight:600,dataset:{},appendChild(){},classList:{contains:name=>classes.has(name)}};
  const context={AbortController,Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>revoked++},DANMAKU_GPU_WORKER:{source:()=>''},
    window:{devicePixelRatio:1,matchMedia:()=>({matches:false})},getComputedStyle:()=>({getPropertyValue:()=> 'Custom Font'}),
    document:{baseURI:'https://example.test/src/content/',createElement:()=>canvas,fonts:{ready:Promise.resolve(),addEventListener:(name,fn)=>fontListeners.set(name,fn),removeEventListener:name=>fontListeners.delete(name)}},
    chrome:{runtime:{getURL:()=> 'https://example.test/ember.webp'}},
    Worker:class {constructor(){worker=this;this.terminated=0;}postMessage(value){sent.push(value);if(value.type==='init' && ready)queueMicrotask(()=>this.onmessage({data:{type:'ready',maxDimension:8192}}));}terminate(){this.terminated++;}},
    OffscreenCanvas:class {constructor(width,height){this.width=width;this.height=height;surfaces.push([width,height]);}transferToImageBitmap(){const bitmap={width:this.width,height:this.height,closed:0,close(){this.closed++;}};bitmaps.push(bitmap);return bitmap;}getContext(){return {measureText:value=>({width:value.length*8,actualBoundingBoxAscent:20,actualBoundingBoxDescent:4}),scale(){},fillText(){},drawImage(){}};}},
  };
  vm.runInNewContext(fs.readFileSync('src/content/gpu-presentation.js','utf8')+'\nglobalThis.api=DANMAKU_GPU;',context);
  const abort=new AbortController();
  const promise=context.api.create(container,error=>failures.push(error),{signal:abort.signal});
  promise.catch(()=>{});
  const reply=data=>worker.onmessage({data});
  const session=ready ? await promise : null;
  const renderer={activeMessages:[],getLaneTopPx:()=>12,presentationClock:()=>({revision:0,epochMs:1000,logicalMs:0,paused:false})};
  async function layout() {
    const result=session.prepare({fontSize:24,runs:[{type:'text',value:'hi'}]});await flush();
    const request=sent.at(-1);reply({type:'prepared',id:request.id,width:16,height:24});return result;
  }
  return {session,promise,abort,reply,renderer,layout,sent,worker,failures,bitmaps,surfaces,fontListeners,container,context,get removed(){return removed;},get revoked(){return revoked;}};
}
test('unchanged presentations send nothing and changes coalesce to one pending latest scene',async()=>{
  const h=await harness(),layout=await h.layout();
  const record={layout,message:{},startedAt:0,mode:'scroll',favorite:false,width:16,xLeft:0,durationMs:3000,lane:{index:0},content:{fontSize:24,opacity:1}};
  h.renderer.activeMessages=[record];
  h.session.present([record],h.renderer);
  for(let i=0;i<100;i++){record.elapsedMs=i*16;h.session.present([record],h.renderer);}
  assert.equal(h.sent.filter(m=>m.type==='present').length,1);
  record.xLeft=10;h.session.present([record],h.renderer);record.xLeft=20;h.session.present([record],h.renderer);
  assert.equal(h.sent.filter(m=>m.type==='present').length,1);
  h.reply({type:'applied',epoch:1});
  const scenes=h.sent.filter(m=>m.type==='present');assert.equal(scenes.length,2);assert.equal(scenes[1].scene.records[0].xLeft,20);
  h.session.destroy();h.session.destroy();assert.equal(h.worker.terminated,1);assert.equal(h.removed,1);assert.equal(h.revoked,1);
});
test('cancelled host requests keep capacity until worker settlement',async()=>{
  const h=await harness(),abort=new AbortController();
  const work=Array.from({length:20},()=>h.session.prepare({fontSize:24,runs:[]},{signal:abort.signal}));
  work.forEach(p=>p.catch(()=>{}));await flush();abort.abort();
  await assert.rejects(h.session.prepare({fontSize:24,runs:[]}),/limit/);
  assert.equal(h.sent.filter(m=>m.type==='cancel').length,20);
  const requests=h.sent.filter(m=>m.type==='prepare');requests.forEach(m=>h.reply({type:'prepared',id:m.id,error:'cancelled'}));
  await Promise.allSettled(work);
  const layout=await h.layout();layout.close();layout.close();assert.equal(h.sent.filter(m=>m.type==='release').length,1);h.session.destroy();
});
test('startup abort terminates the worker, removes transferred canvas, and rejects startup',async()=>{
  const h=await harness({ready:false});h.abort.abort();await assert.rejects(h.promise,/cancelled/);
  assert.equal(h.worker.terminated,1);assert.equal(h.removed,1);assert.equal(h.revoked,1);assert.equal(h.failures.length,0);
});
test('worker failure rejects outstanding diagnostics and preparation exactly once',async()=>{
  const h=await harness();const prepare=h.session.prepare({fontSize:24,runs:[]});prepare.catch(()=>{});await flush();
  const diagnostic=h.session.diagnostics();diagnostic.catch(()=>{});
  h.reply({type:'error',error:'device lost'});h.reply({type:'error',error:'device lost'});
  await assert.rejects(prepare,/closed/);await assert.rejects(diagnostic,/closed/);
  assert.equal(h.failures.length,1);assert.equal(h.fontListeners.size,0);assert.equal(h.worker.terminated,1);
});
test('raster dimension budget rejects before allocating the large surface',async()=>{
  const h=await harness();await assert.rejects(h.session.prepare({fontSize:24,runs:[{type:'text',value:'x'.repeat(2000)}]}),/dimensions/);
  assert.ok(h.surfaces.every(([width])=>width===1));assert.equal(h.bitmaps.length,0);h.session.destroy();
});
test('font completion invalidates the public geometry key',async()=>{
  const h=await harness();const before=h.session.geometry();h.fontListeners.get('loadingdone')();assert.notEqual(h.session.geometry(),before);h.session.destroy();
});

test('teardown and pretransfer cancellation reject promptly while document fonts are pending',async()=>{
  for(const action of ['destroy','cancel']) {
    const h=await harness();let fontsReady;
    h.context.document.fonts.ready=new Promise(resolve=>{fontsReady=resolve;});
    const abort=new AbortController();const preparation=h.session.prepare({fontSize:24,runs:[{type:'text',value:'waiting'}]},{signal:abort.signal});
    if(action==='destroy')h.session.destroy();else abort.abort();
    await assert.rejects(preparation,/closed|cancelled/);
    fontsReady();await flush();assert.equal(h.bitmaps.length,0);assert.equal(h.sent.filter(m=>m.type==='prepare').length,0);h.session.destroy();
  }
});


test('present reports readiness only after the latest coalesced scene is drawn', async () => {
  const h = await harness();
  assert.equal(h.session.present([], h.renderer), false);
  assert.equal(h.session.present([], h.renderer), false);
  h.container.offsetWidth = 900;
  assert.equal(h.session.present([], h.renderer), false);
  h.reply({type:'applied', epoch:1});
  assert.equal(h.session.present([], h.renderer), false);
  h.reply({type:'applied', epoch:2});
  assert.equal(h.session.present([], h.renderer), true);
  assert.equal(h.sent.filter(message => message.type === 'present').length, 2);
  h.session.destroy();
});


test('viewport resizing preserves raster identity and sends the changed viewport', async () => {
  const h = await harness(), before = h.session.geometry();
  h.session.present([], h.renderer); h.reply({type:'applied',epoch:1});
  h.container.offsetWidth = 1200; h.container.offsetHeight = 700;
  assert.equal(h.session.geometry(), before);
  h.session.present([], h.renderer);
  const scenes = h.sent.filter(message => message.type === 'present');
  assert.equal(scenes.length, 2);
  assert.equal(scenes[1].scene.viewport.width, 1200);
  assert.equal(scenes[1].scene.viewport.height, 700);
  assert.equal(h.worker.terminated, 0);
  h.context.window.devicePixelRatio = 2; assert.notEqual(h.session.geometry(), before);
  const dprKey = h.session.geometry(); h.fontListeners.get('loadingdone')();
  assert.notEqual(h.session.geometry(), dprKey);
  h.session.destroy();
});

function svgSource(h,{width=36,height=36,decode=async()=>{},bytes=32}={}) {
  const images=[],requests=[];
  h.context.Image=class {
    constructor(){this.naturalWidth=width;this.naturalHeight=height;images.push(this);}
    decode(){return decode();}
  };
  h.context.fetch=async (url,options)=>{
    requests.push({url,options});
    return new Response(new Uint8Array(bytes),{headers:{'content-type':'image/svg+xml'}});
  };
  return {images,requests};
}

test('SVG emoji transfers a bounded raster at display resolution and preserves its aspect ratio',async()=>{
  const h=await harness(),svg=svgSource(h,{width:36,height:18});
  h.context.window.devicePixelRatio=2;
  const result=h.session.prepare({fontSize:25,runs:[{type:'image',src:'https://emoji.test/confetti.SVG?version=2#icon'}]});
  await flush();
  const request=h.sent.at(-1),run=request.content.runs[0];
  assert.equal(request.type,'prepare');assert.equal(run.width,70);assert.equal(run.height,35);
  assert.equal(run.bitmap.width,140);assert.equal(run.bitmap.height,70);
  assert.equal(svg.requests[0].options.mode,'cors');assert.equal(svg.requests[0].options.credentials,'omit');
  assert.equal(svg.images[0].src,'');assert.equal(h.revoked,2);
  h.reply({type:'prepared',id:request.id,width:74,height:35});await result;h.session.destroy();
});

test('SVG byte and raster budgets fail before large canvas allocation',async()=>{
  for(const options of [{bytes:8*1024*1024+1},{width:100000,height:1},{width:0,height:0}]) {
    const h=await harness();svgSource(h,options);
    await assert.rejects(h.session.prepare({fontSize:24,runs:[{type:'image',src:'https://emoji.test/icon.svg'}]}),/budget|dimensions/);
    assert.ok(h.surfaces.every(([width])=>width===1));assert.equal(h.bitmaps.length,0);h.session.destroy();
  }
});

test('SVG decoding cancellation and teardown revoke blobs and cannot upload late images',async()=>{
  for(const action of ['cancel','destroy']) {
    const h=await harness();let finish;
    const svg=svgSource(h,{decode:()=>new Promise(resolve=>finish=resolve)});
    const abort=new AbortController();
    const result=h.session.prepare({fontSize:24,runs:[{type:'image',src:'https://emoji.test/icon.svg'}]},{signal:abort.signal});
    await flush();
    if(action==='cancel')abort.abort();else h.session.destroy();
    await assert.rejects(result,/cancelled|closed/);
    assert.equal(svg.requests[0].options.signal.aborted,true);assert.equal(svg.images[0].src,'');
    finish();await flush();
    assert.equal(h.bitmaps.length,0);assert.equal(h.sent.filter(message=>message.type==='prepare').length,0);
    assert.equal(h.revoked,2);h.session.destroy();
  }
});

test('a raster media URL with SVG text only in its query stays on the animated decoder path',async()=>{
  const h=await harness();const svg=svgSource(h);
  const result=h.session.prepare({fontSize:24,runs:[{type:'image',src:'https://emoji.test/animated.webp?name=icon.svg'}]});await flush();
  const request=h.sent.at(-1);assert.equal(request.content.runs[0].bitmap,undefined);assert.equal(svg.requests.length,0);
  h.reply({type:'prepared',id:request.id,width:38,height:34});await result;h.session.destroy();
});


test('SVG decode failure closes preceding text rasters',async()=>{
  const h=await harness();svgSource(h,{decode:async()=>{throw new Error('invalid SVG');}});
  await assert.rejects(h.session.prepare({fontSize:24,runs:[{type:'text',value:'hi'},{type:'image',src:'https://emoji.test/broken.svg'}]}),/invalid SVG/);
  assert.equal(h.bitmaps.length,1);assert.equal(h.bitmaps[0].closed,1);assert.equal(h.revoked,2);h.session.destroy();
});
