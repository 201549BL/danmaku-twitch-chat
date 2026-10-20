const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function build(message, changes = {}, favorite = false) {
  const settings = {showUsernames:true,showBadges:true,maxMessageLength:5,usernameEffectStyle:'original',fontFamily:'system',opacity:.8,...changes};
  const context = vm.createContext({danmakuSettings:{get:key=>settings[key]}});
  vm.runInContext(fs.readFileSync('src/content/username-effects.js','utf8') + '\n' + fs.readFileSync('src/content/message-presentation.js','utf8') + '\nglobalThis.make = DANMAKU_PRESENTATION.content;',context);
  const renderer = {isSelfMention:()=>Boolean(changes.mention),getFontSizePx:()=>28,_smoothedPressure:0};
  return JSON.parse(JSON.stringify(context.make(renderer,message,'scroll',favorite)));
}
test('content preserves ordered emotes while truncating only body text',()=>{
  const content=build({username:'River',color:'#55c9f5',badges:[{src:'badge.png',alt:'VIP'}],segments:[{type:'text',value:'Hi '},{type:'image',src:'wave.gif',alt:'wave'},{type:'text',value:'world'}]});
  assert.deepEqual(content.runs.map(run=>run.type==='image' ? [run.src,run.badge] : [run.value,run.weight,run.color]),[
    ['badge.png',true],['River: ',700,'#55c9f5'],['Hi ',500,'#ffffff'],['wave.gif',false],['wo...',500,'#ffffff'],
  ]);
  assert.equal(content.fontSize,28);assert.equal(content.opacity,.8);
});
test('favorite-only username visibility also gates badges, preserving mention and favorite body colors',()=>{
  const message={username:'River',color:'#55c9f5',text:'hello',badges:[{src:'badge.png'}]};
  assert.deepEqual(build(message,{showUsernamesFavoritesOnly:true,mention:true}).runs,[{type:'text',value:'hello',color:'#fff7c8',weight:500}]);
  const favorite=build(message,{showUsernamesFavoritesOnly:true,mention:true},true);
  assert.equal(favorite.runs[0].src,'badge.png');assert.equal(favorite.runs[2].color,'#55c9f5');
});
test('reply quote keeps its distinct font and truncation before the username',()=>{
  const content=build({username:'River',text:'body',replyTo:{username:'Meadow',quote:'123456789012345678901234'}},{showReplyContext:true});
  assert.deepEqual(content.runs.slice(0,3),[
    {type:'text',value:'↳ @Meadow',color:'rgba(255,255,255,.85)',weight:500},
    {type:'text',value:' 12345678901234567890…',color:'rgba(255,255,255,.5)',weight:500,italic:true},
    {type:'text',value:' ',color:'rgba(255,255,255,.65)',weight:500,after:4},
  ]);
});
