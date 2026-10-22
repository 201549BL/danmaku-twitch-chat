const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source=fs.readFileSync('src/content/gpu-worker.js','utf8');
function harness({defer=false,onDraw=()=>{}}={}) {
  const messages=[],draws=[],preparations=[],layouts=[];
  let now=0, callback, destroyed=0;
  const scope={performance:{timeOrigin:1000,now:()=>now},postMessage:value=>messages.push(value),requestAnimationFrame:fn=>{callback=fn;return 1;},cancelAnimationFrame:()=>{callback=null;}};
  const context={AbortController};vm.runInNewContext(source+'\nglobalThis.runtime=DANMAKU_GPU_WORKER_RUNTIME;',context);
  const core={create:async()=>({maxTextureDimension2D:8192,prepare(content,{signal}) {
    const layout={width:20,height:20,closed:0,close(){this.closed++;}};layouts.push(layout);
    if(!defer)return Promise.resolve(layout);
    return new Promise((resolve,reject)=>preparations.push({signal,reject,resolve:()=>resolve(layout)}));
  },draw(records){onDraw();draws.push(records.map(record=>({elapsedMs:record.elapsedMs,id:record.id})));},destroy(){destroyed++;}})};
  context.runtime(scope,()=>core,()=>({}),()=>({}));
  const send=data=>scope.onmessage({data});
  const frame=time=>{now=time;const fn=callback;callback=null;fn?.(time);};
  return {send,frame,messages,draws,preparations,layouts,get destroyed(){return destroyed;},get scheduled(){return Boolean(callback);}};
}
const scene=(paused=false,logicalMs=0,epochMs=1000)=>({clock:{paused,logicalMs,epochMs},viewport:{},records:[{id:1,startedAt:0,durationMs:1000,mode:'scroll'}]});
test('worker keeps advancing without host messages, freezes on pause, resumes continuously and expires finite records',async()=>{
  const h=harness();await h.send({type:'init'});await h.send({type:'prepare',id:1,content:{}});
  await h.send({type:'present',epoch:1,scene:scene()});
  h.frame(100);h.frame(160);assert.deepEqual(h.draws.map(draw=>draw[0].elapsedMs),[100,160]);
  await h.send({type:'present',epoch:2,scene:scene(true,160,1160)});h.frame(900);
  assert.equal(h.draws.at(-1)[0].elapsedMs,160);assert.equal(h.scheduled,false);
  await h.send({type:'present',epoch:3,scene:scene(false,160,1900)});h.frame(950);
  assert.equal(h.draws.at(-1)[0].elapsedMs,210);h.frame(1800);assert.equal(h.draws.at(-1).length,0);
  assert.equal(h.messages.filter(m=>m.type==='applied').length,3);
});
test('released resources cannot be restored by an older scene snapshot',async()=>{
  const h=harness();await h.send({type:'init'});await h.send({type:'prepare',id:1,content:{}});
  await h.send({type:'present',epoch:1,scene:scene()});h.frame(10);
  await h.send({type:'release',id:1});await h.send({type:'present',epoch:2,scene:scene()});h.frame(20);
  assert.equal(h.draws.at(-1).length,0);assert.equal(h.layouts[0].closed,1);
});
test('cancelled preparations retain the twenty request bound until settlement and close late layouts',async()=>{
  const h=harness({defer:true});await h.send({type:'init'});
  const pending=Array.from({length:20},(_,i)=>h.send({type:'prepare',id:i+1,content:{runs:[]}}));
  for(let id=1;id<=20;id++)await h.send({type:'cancel',id});
  assert.ok(h.preparations.every(p=>p.signal.aborted));
  await h.send({type:'prepare',id:21,content:{runs:[]}});
  assert.match(h.messages.at(-1).error,/limit/);assert.equal(h.preparations.length,20);
  h.preparations.forEach(p=>p.resolve());await Promise.all(pending);
  assert.ok(h.layouts.every(layout=>layout.closed===1));
  await h.send({type:'present',epoch:1,scene:scene()});h.frame(50);assert.equal(h.draws.at(-1).length,0);
  await h.send({type:'destroy'});await h.send({type:'destroy'});assert.equal(h.destroyed,1);
});
test('diagnostics retain a bounded chronological ring and reset on demand',async()=>{
  const h=harness();await h.send({type:'init'});await h.send({type:'present',epoch:7,scene:scene()});
  for(let time=0;time<4200;time++)h.frame(time);
  await h.send({type:'diagnostics',id:20,reset:true});
  const result=h.messages.at(-1).value;
  assert.equal(result.samples.length,4096);assert.equal(result.frameCount,4200);
  assert.equal(result.samples[0].raf,1104);assert.equal(result.samples.at(-1).submit,5199);assert.equal(result.epoch,7);
  await h.send({type:'diagnostics',id:21});assert.equal(h.messages.at(-1).value.samples.length,0);
});


test('worker acknowledges each paused scene only after drawing it once', async () => {
  const acknowledgementsAtDraw = [];
  const h = harness({onDraw: () => acknowledgementsAtDraw.push(h.messages.filter(message => message.type === 'applied').length)}); await h.send({type:'init'}); await h.send({type:'prepare',id:1,content:{}});
  for (const epoch of [1, 2]) {
    await h.send({type:'present',epoch,scene:scene(true)});
    assert.equal(h.messages.filter(message => message.type === 'applied').length, epoch - 1);
    assert.equal(h.draws.length, epoch - 1);
    h.frame(epoch * 10);
    assert.equal(h.draws.length, epoch);
    assert.equal(h.messages.at(-1).type, 'applied');
    assert.equal(h.messages.at(-1).epoch, epoch);
    assert.equal(h.scheduled, false);
  }
  assert.deepEqual(acknowledgementsAtDraw, [0, 1]);
});


test('worker preserves preparation media codes without reporting a session error',async()=>{
  const h=harness({defer:true});await h.send({type:'init'});
  const work=h.send({type:'prepare',id:1,content:{runs:[]}});
  h.preparations[0].reject(Object.assign(new Error('Failed to fetch'),{code:'GPU_MEDIA_UNAVAILABLE'}));await work;
  assert.equal(h.messages.at(-1).type,'prepared');assert.equal(h.messages.at(-1).errorCode,'GPU_MEDIA_UNAVAILABLE');
  assert.equal(h.messages.some(message=>message.type==='error'),false);assert.equal(h.destroyed,0);
});
