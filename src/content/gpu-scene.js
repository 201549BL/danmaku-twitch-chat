function DANMAKU_GPU_SCENE(DANMAKU_GPU_MEDIA, DANMAKU_USERNAME_EFFECTS) {
  function bezier(x, x1, y1, x2, y2) {
    const sample = (t,a,b) => 3*(1-t)*(1-t)*t*a + 3*(1-t)*t*t*b + t*t*t;
    let low = 0, high = 1;
    for (let i=0;i<24;i++) {const t=(low+high)/2; if(sample(t,x1,x2)<x) low=t; else high=t;}
    return sample((low+high)/2,y1,y2);
  }
  const ease = x => bezier(Math.max(0,Math.min(1,x)),0,0,.58,1);
  const smooth = x => bezier(Math.max(0,Math.min(1,x)),.42,0,.58,1);
  function motion(record, width, fontSize) {
    const p = Math.min(1,record.elapsedMs/record.durationMs);
    let x = record.mode === 'reverse' ? -record.width + (width+record.width)*p : width-(width+record.width)*p;
    let y = 0, scale = 1, opacity = 1;
    if (record.mode === 'drift') {
      const phase=(record.elapsedMs%6000)/1500, n=Math.floor(phase), t=smooth(phase-n);
      const values=[0,-.7,0,.7,0]; y=fontSize*(values[n]+(values[n+1]-values[n])*t);
    }
    if (record.mode === 'popFade' || record.mode === 'slideUp') {
      x=record.xLeft;
      const entry=record.mode === 'popFade' ? .12 : .15, exit=record.mode === 'popFade' ? .82 : .8;
      const a=ease(p/entry), b=ease((p-exit)/(1-exit));
      opacity=p<entry ? a : p>exit ? 1-b : 1;
      if(record.mode === 'popFade') scale=p<entry ? .85+.15*a : 1;
      else y=fontSize*(p<entry ? 1.5*(1-a) : p>exit ? -.6*b : 0);
    }
    return {x,y,scale,opacity};
  }
  const upper=[[0,0,0],[.06,0,0],[.07,.95,3],[.08,.8,-2],[.10,0,0],[.42,0,0],[.43,.9,-3],[.44,.75,2],[.46,0,0],[.78,0,0],[.79,.95,2],[.80,.7,-1],[.82,0,0],[1,0,0]];
  const lower=[[0,0,0],[.07,0,0],[.08,.9,-3],[.09,.7,1],[.11,0,0],[.41,0,0],[.42,.85,3],[.43,.7,-2],[.45,0,0],[.79,0,0],[.80,.9,-2],[.81,.65,2],[.83,0,0],[1,0,0]];
  function effectTime(run,mode,elapsed,reduced) {
    const profile=DANMAKU_USERNAME_EFFECTS.getProfile(run.username,mode);
    const time=elapsed/1000-parseFloat(profile.delay), duration=Number(profile.durationScale);
    let flow=(time/(3.8*duration))%2;
    if(flow>1) flow=2-flow;
    if(profile.gradientDirection==='alternate-reverse') flow=1-flow;
    let ember=(time/(7*duration))%1;
    if(profile.textureDirection==='reverse') ember=1-ember;
    const glitch=(time/(2.7*duration))%1;
    const step=frames=>frames.filter(f=>f[0]<=glitch).at(-1).slice(1);
    return reduced ? {flow:.5,ember:.5,upper:[0,0],lower:[0,0]} : {flow:smooth(flow),ember,upper:step(upper),lower:step(lower)};
  }
  const shader = `
struct Params {
  rect: vec4f,
  viewport: vec4f,
  primary: vec4f,
  secondary: vec4f,
  effect: vec4f,
  slices: vec4f,
  glyph: vec4f,
};
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;
@group(0) @binding(3) var ember: texture_2d<f32>;
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) index: u32) -> Vertex {
  let corners=array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
  let uv=corners[index];
  let point=p.rect.xy+uv*p.rect.zw;
  return Vertex(vec4f(point/p.viewport.xy*vec2f(2,-2)+vec2f(-1,1),0,1),uv);
}
fn mask(uv:vec2f) -> f32 { return textureSampleLevel(source,linearSampler,uv,0).a; }
fn colorAt(uv:vec2f) -> vec3f {
  var color=p.primary.rgb;
  let local=uv*p.rect.zw/p.viewport.w-p.glyph.xy;
  if(p.effect.x==1) {
    let size=p.glyph.zw;
    let bg=vec2f(size.x*2.4,size.y);
    let q=local+vec2f(size.x*1.4*p.effect.y,0);
    let direction=vec2f(0.9396926,0.3420201);
    let length=abs(bg.x*direction.x)+abs(bg.y*direction.y);
    let t=dot(q-bg*.5,direction)/length+.5;
    let shine=mix(p.secondary.rgb,vec3f(1),.76);
    if(t<.24 || t>.76) {color=p.primary.rgb;}
    else if(t<.42) {color=mix(p.primary.rgb,p.secondary.rgb,(t-.24)/.18);}
    else if(t<.5) {color=mix(p.secondary.rgb,shine,(t-.42)/.08);}
    else if(t<.58) {color=mix(shine,p.secondary.rgb,(t-.5)/.08);}
    else {color=mix(p.secondary.rgb,p.primary.rgb,(t-.58)/.18);}
  }
  if(p.effect.x==2) {
    let textureColor=textureSampleLevel(ember,linearSampler,fract(local/128+vec2f(0,p.effect.z)),0);
    let blended=p.secondary.rgb*(1-textureColor.a+textureColor.rgb);
    let top=clamp((blended*1.35-.5)*1.4+.5,vec3f(0),vec3f(1));
    color=1-(1-color)*(1-top);
  }
  return color;
}
fn graphic(uv:vec2f) -> vec4f {
  let cssTexel=p.effect.w/vec2f(textureDimensions(source));
  let alpha=mask(uv);
  var glyph=vec4f(colorAt(uv)*alpha,alpha);
  if(p.effect.x==3) {
    let local=(uv*p.rect.zw/p.viewport.w-p.glyph.xy)/p.glyph.zw;
    if(local.y>=.08 && local.y<=.42) {
      let a=mask(uv-vec2f(p.slices.y,0)*cssTexel)*p.slices.x;
      glyph=vec4f(p.secondary.rgb*a,a)+glyph*(1-a);
    }
    if(local.y>=.58 && local.y<=.88) {
      let a=mask(uv-vec2f(p.slices.w,0)*cssTexel)*p.slices.z;
      glyph=vec4f(mix(p.secondary.rgb,vec3f(1),.68)*a,a)+glyph*(1-a);
    }
  }
  return glyph;
}
fn expanded(uv:vec2f) -> vec4f {
  let cssTexel=p.effect.w/vec2f(textureDimensions(source));
  var color=vec4f(0);
  for(var y:i32=-2;y<=2;y++) {for(var x:i32=-2;x<=2;x++) {
    color=max(color,graphic(uv+vec2f(f32(x),f32(y))*.575*cssTexel));
  }}
  return color;
}
@fragment fn fragment(input:Vertex) -> @location(0) vec4f {
  if(p.effect.x<-.5) {let a=mask(input.uv);return vec4f(p.primary.rgb*a,a)*p.viewport.z;}
  if(p.effect.x<.5) {return textureSample(source,linearSampler,input.uv)*p.viewport.z;}
  let cssTexel=p.effect.w/vec2f(textureDimensions(source));
  let border=expanded(input.uv)*vec4f(.24,.24,.24,1);
  var depth=vec4f(0);
  if(p.primary.a<.5) {depth=expanded(input.uv-vec2f(0,1.6)*cssTexel)*vec4f(.08*.98,.08*.98,.08*.98,.98);}
  let outline=border+depth*(1-border.a);
  let glyph=graphic(input.uv);
  return (glyph+outline*(1-glyph.a))*p.viewport.z;
}`;
  async function create(canvas,onFailure,{signal,emberUrl} = {}) {
    if (!navigator.gpu) throw new Error('WebGPU is unavailable');
    const adapter=await navigator.gpu.requestAdapter();
    if(signal?.aborted) throw new Error('GPU startup cancelled');
    if(!adapter) throw new Error('No GPU adapter');
    const device=await adapter.requestDevice();
    let disposed=false;
    if(signal?.aborted) {device.destroy();throw new Error('GPU startup cancelled');}
    device.lost.then(info=>{if(!disposed) onFailure(new Error(info.message || 'GPU device lost'));});
    device.addEventListener('uncapturederror',event=>{if(!disposed) onFailure(event.error);});
    let context;
    const format=navigator.gpu.getPreferredCanvasFormat();
    try {
      context=canvas.getContext('webgpu');
      if(!context) throw new Error('WebGPU canvas unavailable');
      context.configure({device,format,alphaMode:'premultiplied'});
    } catch(error) {disposed=true;device.destroy();throw error;}
    const layouts=new Set(), abort=new AbortController();
    const cancelStartup=()=>{abort.abort();device.destroy();};
    signal?.addEventListener('abort',cancelStartup,{once:true});
    const checkStartup=()=>{if(signal?.aborted) throw new Error('GPU startup cancelled');};
    let bytes=0, mediaBytes=0, mediaLoading=0;
    const mediaWaiters=[];
    async function openMedia(url, signal) {
      if(mediaLoading>=4) await new Promise(resolve=>mediaWaiters.push(resolve));
      if(disposed || signal?.aborted) {mediaWaiters.shift()?.();throw new Error('GPU session closed');}
      mediaLoading++;
      try {
        const media=await DANMAKU_GPU_MEDIA.open(url,{signal:signal || abort.signal});
        const size=(media.byteLength || 0)+media.width*media.height*8;
        if(disposed || mediaBytes+size>64*1024*1024) {media.close();throw new Error('GPU media budget exceeded');}
        mediaBytes+=size;
        let closed=false;
        return {...media,close(){if(closed)return;closed=true;mediaBytes-=size;media.close();}};
      } finally {mediaLoading--;mediaWaiters.shift()?.();}
    }
    const maxBytes=96*1024*1024;
    function checkTextureSize(width,height) {
      if(!Number.isFinite(width) || !Number.isFinite(height) || width<1 || height<1 || width>device.limits.maxTextureDimension2D || height>device.limits.maxTextureDimension2D || width*height*4+bytes>maxBytes) throw new Error('GPU texture budget exceeded');
    }
    function texture(width,height) {
      width=Math.ceil(width); height=Math.ceil(height);
      checkTextureSize(width,height);
      const resource=device.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
      bytes+=width*height*4;
      let closed=false;
      return {resource,close(){if(closed)return;closed=true;bytes-=width*height*4;resource.destroy();}};
    }
    let emberTexture;
    try {
      const module=device.createShaderModule({code:shader});
      const info=await module.getCompilationInfo();
      checkStartup();
      const errors=info.messages.filter(message=>message.type==='error');
      if(errors.length) throw new Error(errors.map(message=>message.message).join('\n'));
      device.pushErrorScope('validation');
      const pipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'vertex'},fragment:{module,entryPoint:'fragment',targets:[{format,blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}}]},primitive:{topology:'triangle-list'}});
      const validation=await device.popErrorScope();
      checkStartup();
      if(validation) throw new Error(validation.message);
      const sampler=device.createSampler({magFilter:'linear',minFilter:'linear',addressModeU:'repeat',addressModeV:'repeat'});
      const emberMedia=await DANMAKU_GPU_MEDIA.open(emberUrl,{signal:abort.signal});
      try {
        emberTexture=texture(emberMedia.width,emberMedia.height);
        device.queue.copyExternalImageToTexture({source:await emberMedia.frame(0)},{texture:emberTexture.resource,premultipliedAlpha:true},[emberMedia.width,emberMedia.height]);
      } finally {emberMedia.close();}
      checkStartup();
      const colorCanvas=new OffscreenCanvas(1,1), colorContext=colorCanvas.getContext('2d',{willReadFrequently:true});
      const colors=new Map();
      function rgba(value) {
        if(colors.has(value)) return colors.get(value);
        colorContext.clearRect(0,0,1,1); colorContext.fillStyle=value || '#ffffff'; colorContext.fillRect(0,0,1,1);
        const result=Array.from(colorContext.getImageData(0,0,1,1).data,x=>x/255);
        if(colors.size >= 512) colors.delete(colors.keys().next().value);
        colors.set(value,result); return result;
      }
      async function prepare(content,{signal} = {}) {
        const resources=[], items=[];
        const {dpr,size,base,xHeight}=content;
        let lineAscent=base, lineDescent=size-base;
        let x=0;
        try {
          for(const run of content.runs) {
            if(disposed || signal?.aborted) throw new Error('GPU session closed');
            if(run.type==='image') {
              const media=run.bitmap ? null : await openMedia(run.src,signal); if(media)resources.push(media);
              if(disposed || signal?.aborted) throw new Error('GPU session closed');
              const height=run.bitmap ? run.height : size*(run.badge ? 1 : 1.4), width=run.bitmap ? run.width : height*media.width/media.height;
              const source=run.bitmap || media;
              const tex=texture(source.width,source.height); resources.push(tex);
              const image=run.bitmap || await media.frame(0);
              device.queue.copyExternalImageToTexture({source:image},{texture:tex.resource,premultipliedAlpha:true},[source.width,source.height]);
              items.push({run,tex,media,x:x+(run.badge ? 0 : 2),y:base-xHeight/2-height/2,width,height,lastFrame:image,pending:false});
              lineAscent=Math.max(lineAscent,height/2+xHeight/2);lineDescent=Math.max(lineDescent,height/2-xHeight/2);
              x+=width+4;
            } else {
              const {bitmap,width,height,padding,glyphWidth,glyphHeight,advance}=run;
              const tex=texture(bitmap.width,bitmap.height);resources.push(tex);
              device.queue.copyExternalImageToTexture({source:bitmap},{texture:tex.resource,premultipliedAlpha:true},[bitmap.width,bitmap.height]);
              items.push({run:run.run,tex,x:x-padding,y:-padding,width,height,padding,glyphWidth,glyphHeight});
              x+=advance;
            }
          }
          for(const item of items) {
            item.y+=lineAscent-base;
            item.effect=({duotoneFlow:1,duotoneEmber:2,duotoneGlitch:3}[item.run.effect] || 0);
            const values=item.values=new Float32Array(28);
            if(item.run.effect && item.run.effect!=='none') values.set(rgba(item.run.color),8);
            if(item.effect) values.set(rgba(DANMAKU_USERNAME_EFFECTS.getSecondaryColor(item.run.color,item.run.palette)),12);
            values[24]=values[25]=item.padding || 0;
            values[26]=item.glyphWidth || item.width;
            values[27]=item.glyphHeight || item.height;
            item.uniform=device.createBuffer({size:112,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
            resources.push({close:()=>item.uniform.destroy()});
            item.bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:item.uniform}},{binding:1,resource:item.tex.resource.createView()},{binding:2,resource:sampler},{binding:3,resource:emberTexture.resource.createView()}]});
          }
          let closed=false;
          const layout={width:x,height:lineAscent+lineDescent,items,dpr,close(){if(closed)return;closed=true;for(const resource of resources)resource.close();layouts.delete(layout);}};
          if(disposed || signal?.aborted) {layout.close();throw new Error('GPU session closed');}
          layouts.add(layout);return layout;
        } catch(error) {for(const resource of resources)resource.close();throw error;} finally {for(const run of content.runs)run.bitmap?.close();}
      }
      function draw(records,{width,height,dpr,reduced}) {
        if(disposed) return;
        if(!width || !height) return;
        if(width*dpr>device.limits.maxTextureDimension2D || height*dpr>device.limits.maxTextureDimension2D || width*height*dpr*dpr*4>64*1024*1024) throw new Error('GPU canvas budget exceeded');
        if(canvas.width!==Math.ceil(width*dpr) || canvas.height!==Math.ceil(height*dpr)) {canvas.width=Math.ceil(width*dpr);canvas.height=Math.ceil(height*dpr);}
        const encoder=device.createCommandEncoder();
        const pass=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),clearValue:[0,0,0,0],loadOp:'clear',storeOp:'store'}]});
        pass.setPipeline(pipeline);
        for(const record of [...records].sort((a,b)=>Number(a.favorite)-Number(b.favorite))) {
          const m=motion(record,width,record.content.fontSize);
          const top=record.top;
          for(const item of record.layout.items) {
            if(item.media && !item.pending) {
              item.pending=true;
              item.media.frame(record.elapsedMs).then(source=>{
                if(!disposed && layouts.has(record.layout) && source!==item.lastFrame) {
                  device.queue.copyExternalImageToTexture({source},{texture:item.tex.resource,premultipliedAlpha:true},[item.media.width,item.media.height]);item.lastFrame=source;
                }
              }).catch(error=>{if(!disposed && layouts.has(record.layout))onFailure(error);}).finally(()=>{item.pending=false;});
            }
            const effect=item.effect;
            const values=item.values;
            values[0]=m.x+record.width*(1-m.scale)/2+item.x*m.scale;
            values[1]=top+m.y+record.layout.height*(1-m.scale)/2+item.y*m.scale;
            values[2]=item.width*m.scale;values[3]=item.height*m.scale;
            values[4]=width;values[5]=height;values[6]=m.opacity*record.content.opacity;values[7]=m.scale;
            values[11]=record.favorite ? 1 : 0;
            values[16]=effect;values[17]=values[18]=values[20]=values[21]=values[22]=values[23]=0;
            values[19]=dpr;
            if(effect>0) {
              if(!item.profile || item.profile.mode!==record.mode) {
                const profile=DANMAKU_USERNAME_EFFECTS.getProfile(item.run.username,record.mode);
                item.profile={mode:record.mode,delay:parseFloat(profile.delay),duration:Number(profile.durationScale),flowReverse:profile.gradientDirection==='alternate-reverse',emberReverse:profile.textureDirection==='reverse'};
              }
              const profile=item.profile, time=record.elapsedMs/1000-profile.delay;
              if(effect===1) {
                let flow=(time/(3.8*profile.duration))%2;
                if(flow>1) flow=2-flow;
                if(profile.flowReverse) flow=1-flow;
                values[17]=reduced ? .5 : smooth(flow);
              } else if(effect===2) {
                const ember=(time/(7*profile.duration))%1;
                values[18]=reduced ? .5 : profile.emberReverse ? 1-ember : ember;
              } else if(!reduced) {
                const glitch=(time/(2.7*profile.duration))%1;
                let u=0,l=0;
                while(u+1<upper.length && upper[u+1][0]<=glitch) u++;
                while(l+1<lower.length && lower[l+1][0]<=glitch) l++;
                values[20]=upper[u][1];values[21]=upper[u][2];
                values[22]=lower[l][1];values[23]=lower[l][2];
              }
            }
            device.queue.writeBuffer(item.uniform,0,values);
            pass.setBindGroup(0,item.bind);pass.draw(6);
          }
        }
        pass.end();device.queue.submit([encoder.finish()]);
      }
      signal?.removeEventListener('abort',cancelStartup);
      return {prepare,draw,maxTextureDimension2D:device.limits.maxTextureDimension2D,destroy(){if(disposed)return;disposed=true;abort.abort();for(const resolve of mediaWaiters.splice(0))resolve();for(const layout of [...layouts])layout.close();emberTexture?.close();context.unconfigure();device.destroy();}};
    } catch(error) {signal?.removeEventListener('abort',cancelStartup);disposed=true;abort.abort();for(const layout of layouts)layout.close();emberTexture?.close();context.unconfigure();device.destroy();throw error;}
  }
  return {create,motion,effectTime,bezier,shader};
}
