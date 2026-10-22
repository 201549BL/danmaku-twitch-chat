function DANMAKU_GPU_WORKER_RUNTIME(scope, sceneFactory, mediaFactory, effectsFactory, adaptRecords = records => records) {
  const sceneAPI=sceneFactory(mediaFactory(scope),effectsFactory());
  const layouts=new Map(), pending=new Map();
  let session, disposed=false, scene=null, epoch=0, frameId=null, frameCount=0, appliedEpoch=0;
  const samples=new Array(4096), errors=[];
  let sampleCount=0, sampleCursor=0;
  const activeRecords=[];
  const now=()=>scope.performance.timeOrigin+scope.performance.now();
  const post=value=>{if(!disposed)scope.postMessage(value);};
  const fail=error=>{errors.push(String(error?.message || error));if(errors.length>8)errors.shift();post({type:'error',error:errors.at(-1)});};
  function dispose() {
    if(disposed)return;
    disposed=true;
    if(frameId!==null)scope.cancelAnimationFrame(frameId);
    for(const entry of pending.values())entry.abort();
    pending.clear();
    session?.destroy();layouts.clear();scene=null;
  }
  function draw(timestamp) {
    frameId=null;
    if(disposed || !session || !scene)return;
    try {
      const time=now(), clock=scene.clock;
      const logical=clock.logicalMs+(clock.paused ? 0 : Math.max(0,time-clock.epochMs));
      activeRecords.length=0;
      for(const record of adaptRecords(scene.records,logical)) {
        record.layout=layouts.get(record.id);
        record.elapsedMs=Math.max(0,logical-record.startedAt);
        if(record.layout && record.elapsedMs<record.durationMs)activeRecords.push(record);
      }
      session.draw(activeRecords,scene.viewport);
      frameCount++;
      if(appliedEpoch!==epoch){appliedEpoch=epoch;post({type:'applied',epoch});}
      samples[sampleCursor]={raf:scope.performance.timeOrigin+timestamp,submit:now(),epoch,count:activeRecords.length};
      sampleCursor=(sampleCursor+1)%samples.length;sampleCount=Math.min(sampleCount+1,samples.length);
      if(scene.clock.paused) return;
      frameId=scope.requestAnimationFrame(draw);
    } catch(error) {fail(error);}
  }
  function schedule() {if(frameId===null)frameId=scope.requestAnimationFrame(draw);}
  scope.onmessage=async ({data})=>{
    if(disposed)return;
    try {
      if(data.type==='init') {
        if(session)throw new Error('Worker already initialized');
        const abort=new AbortController();pending.set(0,abort);
        session=await sceneAPI.create(data.canvas,fail,{signal:abort.signal,emberUrl:data.emberUrl});
        pending.delete(0);
        if(disposed){session.destroy();return;}
        post({type:'ready',maxDimension:session.maxTextureDimension2D});
      } else if(data.type==='prepare') {
        if(pending.size>=20 || !session) {for(const run of data.content.runs)run.bitmap?.close();post({type:'prepared',id:data.id,error:'GPU preparation limit exceeded'});return;}
        const abort=new AbortController();pending.set(data.id,abort);
        try {
          const layout=await session.prepare(data.content,{signal:abort.signal});
          if(disposed || abort.signal.aborted) {layout.close();post({type:'prepared',id:data.id,error:'GPU preparation cancelled'});}
          else {layouts.set(data.id,layout);post({type:'prepared',id:data.id,width:layout.width,height:layout.height});}
        } catch(error) {post({type:'prepared',id:data.id,error:String(error.message || error),errorCode:error.code});}
        finally {pending.delete(data.id);}
      } else if(data.type==='cancel') {pending.get(data.id)?.abort();}
      else if(data.type==='release') {layouts.get(data.id)?.close();layouts.delete(data.id);if(scene)scene.records=scene.records.filter(record=>record.id!==data.id);schedule();}
      else if(data.type==='present') {scene=data.scene;epoch=data.epoch;schedule();}
      else if(data.type==='diagnostics') {
        post({type:'diagnostics',id:data.id,value:{samples:Array.from({length:sampleCount},(_,i)=>samples[(sampleCursor-sampleCount+i+samples.length)%samples.length]),frameCount,epoch,recordCount:scene?.records.length || 0,modes:[...new Set(scene?.records.map(record=>record.mode) || [])],errors:errors.slice()}});
        if(data.reset){sampleCount=0;sampleCursor=0;frameCount=0;}
      } else if(data.type==='destroy')dispose();
    } catch(error) {fail(error);}
  };
  return {dispose};
}
const DANMAKU_GPU_WORKER = {
  source() {
    return `(${DANMAKU_GPU_WORKER_RUNTIME.toString()})(self,${DANMAKU_GPU_SCENE.toString()},${DANMAKU_GPU_MEDIA_FACTORY.toString()},${DANMAKU_USERNAME_EFFECTS_FACTORY.toString()});`;
  },
};
