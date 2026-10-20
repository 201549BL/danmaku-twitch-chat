const DANMAKU_GPU_RASTER = (() => {
  async function prepare(content, {fontFamily,dpr,maxDimension,reserve,check}) {
    if(document.fonts?.ready) await document.fonts.ready;
    check();
    const size=content.fontSize, runs=[];
    const font=(run,size)=>`${run.italic ? 'italic ' : ''}${run.weight || 500} ${size}px ${fontFamily}, Tahoma, Geneva, Verdana, sans-serif`;
    const measure=new OffscreenCanvas(1,1).getContext('2d');
    measure.font=font({weight:600},size);
    const strut=measure.measureText('Hg'), xHeight=measure.measureText('x').actualBoundingBoxAscent;
    const strutAscent=strut.fontBoundingBoxAscent ?? strut.actualBoundingBoxAscent;
    const strutDescent=strut.fontBoundingBoxDescent ?? strut.actualBoundingBoxDescent;
    const base=(size-strutAscent-strutDescent)/2+strutAscent;
    try {
      for(const run of content.runs) {
        check();
        if(run.type==='image') {runs.push(run);continue;}
        measure.font=font(run,size);
        const effect=run.effect && run.effect!=='none';
        const value=effect && run.username ? run.value.trimEnd() : run.value;
        const metrics=measure.measureText(value), width=metrics.width;
        const padding=content.mention ? 20 : 5;
        const height=Math.max(size,metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent);
        const rasterWidth=Math.max(1,Math.ceil((width+padding*2)*dpr)), rasterHeight=Math.max(1,Math.ceil((height+padding*2)*dpr));
        if(rasterWidth>maxDimension || rasterHeight>maxDimension) throw new Error('GPU raster dimensions exceeded');
        reserve(rasterWidth*rasterHeight*4);
        const surface=new OffscreenCanvas(rasterWidth,rasterHeight);
        const ctx=surface.getContext('2d');ctx.scale(dpr,dpr);ctx.font=font(run,size);ctx.textBaseline='alphabetic';
        const ascent=metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
        const descent=metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
        const baseline=(size-ascent-descent)/2+ascent;
        const y=padding+baseline;
        if(!effect) {
          const offset=surface.width*2;
          ctx.shadowOffsetX=offset;
          ctx.fillStyle='#000000';
          const shadows=content.mention ? [['rgba(255,215,0,.55)',16],['rgba(255,215,0,.95)',8]] : [['rgba(0,0,0,.8)',4]];
          for(const [color,blur] of shadows) {
            ctx.shadowColor=color;ctx.shadowBlur=blur*dpr;
            ctx.fillText(value,padding-offset/dpr,y);
          }
          ctx.shadowOffsetX=0;ctx.shadowBlur=0;ctx.shadowColor='transparent';
          ctx.fillStyle=content.mention ? '#8a5a00' : '#000000';
          for(const [dx,dy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) ctx.fillText(value,padding+dx,y+dy);
        }
        ctx.fillStyle=effect ? '#ffffff' : run.color || '#ffffff';ctx.fillText(value,padding,y);

        const bitmap=surface.transferToImageBitmap();
        runs.push({type:'text',run,bitmap,width:surface.width/dpr,height:surface.height/dpr,padding,glyphWidth:width,glyphHeight:size,advance:measure.measureText(run.value).width+(run.after || 0)});
      }
      return {runs,dpr,size,base,xHeight};
    } catch(error) {for(const run of runs)run.bitmap?.close();throw error;}
  }
  return {prepare};
})();

const DANMAKU_GPU = (() => {
  async function create(container,onFailure,{signal} = {}) {
    if(signal?.aborted)throw new Error('GPU startup cancelled');
    const canvas=document.createElement('canvas');
    canvas.className='danmaku-gpu-canvas';
    canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;visibility:hidden;';
    let worker, url, disposed=false, ready=false, nextId=0, stagingBytes=0, maxDimension=0, fontVersion=0;
    let inFlight=false, desired=null, lastScene=null, epoch=0, renderer, visible=false;
    const pending=new Map(), diagnostics=new Map(), handles=new WeakMap();
    const fontsChanged=()=>fontVersion++;
    const fontFamily=()=>getComputedStyle(container).getPropertyValue('--danmaku-font-family').trim() || "'Segoe UI'";
    let resolveStartup,rejectStartup;
    const startup=new Promise((resolve,reject)=>{resolveStartup=resolve;rejectStartup=reject;});
    startup.catch(()=>{});
    const revoke=()=>{if(url){URL.revokeObjectURL(url);url=null;}};
    function destroy() {
      if(disposed)return;
      disposed=true;
      observer?.disconnect();
      reducedQuery?.removeEventListener?.('change',controlsChanged);
      document.fonts?.removeEventListener('loadingdone',fontsChanged);
      signal?.removeEventListener('abort',cancelStartup);
      revoke();
      worker?.terminate();
      const error=new Error('GPU session closed');
      rejectStartup(error);
      for(const entry of pending.values())entry.reject(error);
      for(const entry of diagnostics.values())entry.reject(error);
      pending.clear();diagnostics.clear();
      canvas.remove();container.dataset.danmakuRenderer='dom';
    }
    function fail(error) {if(disposed)return;rejectStartup(error);destroy();if(ready)onFailure(error);}
    function cancelStartup(){fail(new Error('GPU startup cancelled'));}
    function sendScene() {
      if(inFlight || !desired || disposed)return;
      const scene=desired;desired=null;inFlight=true;
      worker.postMessage({type:'present',epoch:++epoch,scene});
    }
    const reducedQuery=window.matchMedia('(prefers-reduced-motion: reduce)');
    function controlsChanged(){if(renderer)present(renderer.activeMessages.map(record=>({ ...record,layout:recordLayouts.get(record.message) })),renderer);}
    const recordLayouts=new Map();
    const observer=typeof MutationObserver==='undefined' ? null : new MutationObserver(controlsChanged);
    try {
      const offscreen=canvas.transferControlToOffscreen();
      url=URL.createObjectURL(new Blob([DANMAKU_GPU_WORKER.source()],{type:'text/javascript'}));
      worker=new Worker(url);
      worker.onerror=event=>fail(new Error(event.message || 'GPU worker failed'));
      worker.onmessageerror=()=>fail(new Error('GPU worker message failed'));
      worker.onmessage=({data})=>{
        if(disposed)return;
        if(data.type==='ready') {maxDimension=data.maxDimension;ready=true;revoke();resolveStartup();}
        else if(data.type==='error')fail(new Error(data.error));
        else if(data.type==='applied') {inFlight=false;sendScene();if(visible)canvas.style.visibility='';}
        else if(data.type==='prepared') {
          const entry=pending.get(data.id);
          if(!entry){if(!data.error)worker.postMessage({type:'release',id:data.id});return;}
          pending.delete(data.id);
          if(data.error)entry.reject(new Error(data.error));
          else if(entry.signal?.aborted){worker.postMessage({type:'release',id:data.id});entry.reject(new Error('GPU preparation cancelled'));}
          else {
            let closed=false;
            const layout={width:data.width,height:data.height,close(){if(closed)return;closed=true;if(!disposed)worker.postMessage({type:'release',id:data.id});handles.delete(layout);}};
            handles.set(layout,data.id);entry.resolve(layout);
          }
        } else if(data.type==='diagnostics') {const entry=diagnostics.get(data.id);diagnostics.delete(data.id);entry?.resolve(data.value);}
      };
      container.appendChild(canvas);
      signal?.addEventListener('abort',cancelStartup,{once:true});
      const emberUrl=typeof chrome!=='undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('assets/text-effects/ember.webp') : new URL('../../assets/text-effects/ember.webp',document.baseURI).href;
      worker.postMessage({type:'init',canvas:offscreen,emberUrl},[offscreen]);
      await startup;
      document.fonts?.addEventListener('loadingdone',fontsChanged);
      reducedQuery.addEventListener?.('change',controlsChanged);
      observer?.observe(container,{attributes:true,attributeFilter:['class']});
    } catch(error) {destroy();throw error;}
    async function prepare(content,{signal:prepareSignal} = {}) {
      if(disposed)throw new Error('GPU session closed');
      if(pending.size>=20)throw new Error('GPU preparation limit exceeded');
      const id=++nextId;
      let transferred=false,reserved=0,raster;
      const check=()=>{if(disposed || prepareSignal?.aborted)throw new Error('GPU preparation cancelled');};
      const promise=new Promise((resolve,reject)=>pending.set(id,{resolve,reject,signal:prepareSignal}));
      promise.catch(()=>{});
      const cancel=()=>{if(transferred && !disposed)worker.postMessage({type:'cancel',id});else {pending.get(id)?.reject(new Error('GPU preparation cancelled'));pending.delete(id);}};
      prepareSignal?.addEventListener('abort',cancel,{once:true});
      try {
        const rasterWork=DANMAKU_GPU_RASTER.prepare(content,{fontFamily:fontFamily(),dpr:window.devicePixelRatio || 1,maxDimension,check,reserve(bytes){if(stagingBytes+bytes>64*1024*1024)throw new Error('GPU raster budget exceeded');stagingBytes+=bytes;reserved+=bytes;}}).then(result=>{
          try {check();} catch(error) {for(const run of result.runs)run.bitmap?.close();throw error;}
          raster=result;return result;
        });
        await Promise.race([rasterWork,promise]);
        check();
        worker.postMessage({type:'prepare',id,content:raster},raster.runs.filter(run=>run.bitmap).map(run=>run.bitmap));
        transferred=true;
      } catch(error) {
        if(!transferred)for(const run of raster?.runs || [])run.bitmap?.close();
        pending.get(id)?.reject(error);pending.delete(id);
      }
      try {return await promise;} finally {stagingBytes-=reserved;prepareSignal?.removeEventListener('abort',cancel);}
    }
    function present(records,owner) {
      if(disposed)return false;
      renderer=owner;
      recordLayouts.clear();for(const record of records)recordLayouts.set(record.message,record.layout);
      const clock=owner.presentationClock();
      const scene={clock,viewport:{width:container.offsetWidth,height:container.offsetHeight,dpr:window.devicePixelRatio || 1,reduced:reducedQuery.matches},records:records.filter(record=>handles.has(record.layout)).map(record=>({id:handles.get(record.layout),startedAt:record.startedAt,mode:record.mode,favorite:record.favorite,width:record.width,xLeft:record.xLeft,durationMs:record.durationMs,top:owner.getLaneTopPx(record.lane.index),content:{fontSize:record.content.fontSize,opacity:record.content.opacity}}))};
      const equal=(a,b)=>Object.keys(a).every(key=>a[key]===b[key]);
      if(lastScene && equal(scene.clock,lastScene.clock) && equal(scene.viewport,lastScene.viewport) && scene.records.length===lastScene.records.length && scene.records.every((record,index)=>{
        const before=lastScene.records[index];
        return equal(record.content,before.content) && Object.keys(record).every(key=>key==='content' || record[key]===before[key]);
      }))return !inFlight && !desired;
      lastScene=scene;desired=scene;sendScene();
      return false;
    }
    return {prepare,present,geometry:()=>`${window.devicePixelRatio || 1}:${fontFamily()}:${fontVersion}`,show(){visible=true;if(!inFlight)canvas.style.visibility='';container.dataset.danmakuRenderer='webgpu';},destroy,diagnostics({reset=false}={}) {
      if(disposed)return Promise.reject(new Error('GPU session closed'));
      if(diagnostics.size)return Promise.reject(new Error('GPU diagnostics already pending'));
      const id=++nextId;
      return new Promise((resolve,reject)=>{diagnostics.set(id,{resolve,reject});worker.postMessage({type:'diagnostics',id,reset});});
    }};
  }
  return {create};
})();
