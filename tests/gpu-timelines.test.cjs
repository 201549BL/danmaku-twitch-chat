const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync('src/content/username-effects.js','utf8') + '\n' + fs.readFileSync('src/content/gpu-scene.js','utf8') + '\nglobalThis.subject = DANMAKU_GPU_SCENE(null,DANMAKU_USERNAME_EFFECTS); globalThis.effects = DANMAKU_USERNAME_EFFECTS;', context);
const {subject,effects} = context;
const close = (actual,expected) => assert.ok(Math.abs(actual-expected)<1e-5, `${actual} differs from ${expected}`);
function record(mode,elapsedMs) {return {mode,elapsedMs,durationMs:10000,width:200,xLeft:150};}

test('scroll and reverse traverse the complete overlay plus message width',()=>{
  assert.deepEqual(JSON.parse(JSON.stringify(subject.motion(record('scroll',2500),1000,20))),{x:700,y:0,scale:1,opacity:1});
  assert.deepEqual(JSON.parse(JSON.stringify(subject.motion(record('reverse',2500),1000,20))),{x:100,y:0,scale:1,opacity:1});
  close(subject.motion(record('scroll',10000),1000,20).x,-200);
  close(subject.motion(record('reverse',10000),1000,20).x,1000);
});

test('stationary entrance and exit use CSS ease-out on each keyframe segment',()=>{
  const pop=subject.motion(record('popFade',600),1000,20);
  close(pop.x,150); close(pop.opacity,.6846431874274608); close(pop.scale,.9526964781141191);
  close(subject.motion(record('popFade',9100),1000,20).opacity,.3153568125725392);
  const slide=subject.motion(record('slideUp',750),1000,20);
  close(slide.y,9.460704377176176); close(slide.opacity,.6846431874274608);
  close(subject.motion(record('slideUp',9000),1000,20).y,-8.21571824912953);
});

test('drift reaches each signed wobble extremum without changing horizontal timing',()=>{
  close(subject.motion(record('drift',1500),1000,20).y,-14);
  close(subject.motion(record('drift',3000),1000,20).y,0);
  close(subject.motion(record('drift',4500),1000,20).y,14);
  close(subject.motion(record('drift',6000),1000,20).y,0);
  close(subject.motion(record('drift',750),1000,20).y,-7);
});

test('both sparse Glitch slice timelines match every shipped CSS keyframe and hold until the next',()=>{
  const css=fs.readFileSync('src/content/overlay.css','utf8');
  const username='timing-test';
  const profile=effects.getProfile(username,'scroll');
  const duration=2700*Number(profile.durationScale), delay=parseFloat(profile.delay)*1000;
  for(const name of ['upper','lower']) {
    const body=css.match(new RegExp('@keyframes danmaku-effect-glitch-'+name+' \\{([\\s\\S]*?)\\n\\}'))[1];
    const frames=[];
    for(const match of body.matchAll(/([\d%, ]+)\s*\{ opacity: ([\d.]+); transform: translateX\((-?[\d.]+)(?:px)?\); \}/g)) {
      for(const percent of match[1].split(',')) frames.push([parseFloat(percent)/100,Number(match[2]),Number(match[3])]);
    }
    frames.sort((a,b)=>a[0]-b[0]);
    assert.equal(frames.length,14);
    for(let i=0;i<frames.length-1;i++) {
      const [phase,opacity,offset]=frames[i];
      const midpoint=(phase+frames[i+1][0])/2;
      const elapsed=duration*(2+midpoint)+delay;
      assert.deepEqual(Array.from(subject.effectTime({username},'scroll',elapsed,false)[name]),[opacity,offset]);
    }
  }
});

test('reduced motion freezes effect layers at their CSS static positions',()=>{
  const frozen=JSON.parse(JSON.stringify(subject.effectTime({username:'sample'},'reverse',90000,true)));
  assert.deepEqual(frozen,{flow:.5,ember:.5,upper:[0,0],lower:[0,0]});
  close(subject.motion(record('scroll',5000),1000,20).x,400);
});

test('username profiles reverse Flow and Ember while preserving elapsed phase',()=>{
  const run={username:'sample'};
  const normal=subject.effectTime(run,'scroll',1234,false);
  const reverse=subject.effectTime(run,'reverse',1234,false);
  close(normal.flow+reverse.flow,1);close(normal.ember+reverse.ember,1);
});
