import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../workspace/app.js',import.meta.url),'utf8');
const begin=source.indexOf(' let sourceRefreshEpoch=0;');
const end=source.indexOf('\n function selectedSource()',begin);
assert.ok(begin>=0&&end>begin,'Production source-picker boundary must remain explicit');
const helpersStart=source.indexOf(' function readableTitle(');
const helpersEnd=source.indexOf('\n function preserveIdentityFocus(',helpersStart);
assert.ok(helpersStart>=0&&helpersEnd>helpersStart,'Human-readable picker helpers must be included');
const helperSource=source.slice(helpersStart,helpersEnd);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const A={id:1,title:'Same title',url:'https://chatgpt.com/c/source_A_123'};
const B={id:2,title:'Same title',url:'https://chatgpt.com/c/source_B_123'};
function harness(fetchRows,active){
 const picker={value:'2',children:[],replaceChildren(){this.children=[];this.value='';},append(option){this.children.push(option);if(!this.value)this.value=option.value;}};
 const elements={source:picker,'source-empty-help':{hidden:false},capture:{disabled:false}};
 class Option{constructor(title,value){this.text=title;this.value=String(value);this.dataset={};}}
 const ctx=vm.createContext({call:fetchRows,chrome:{tabs:{query:active}},Option,URL,location:{href:'chrome-extension://fixture/workspace/index.html'},$:id=>elements[id]});
 vm.runInContext("let sourceOptionsSignature=null,sourceLookupKey=null,sourceLookupCaptureId=null;\n"+helperSource+'\n'+source.slice(begin,end)+'\nglobalThis.refresh=sources;',ctx);
 return{picker,refresh:ctx.refresh};
}
test('a delayed active-tab lookup cannot overwrite a newly selected source',async()=>{
 const pending=deferred(),entered=deferred();
 const h=harness(async()=>[A,B],()=>{entered.resolve();return pending.promise;});
 const refresh=h.refresh();await entered.promise;
 h.picker.value='1';pending.resolve([{id:2}]);await refresh;
 assert.equal(h.picker.value,'1');
 assert.equal(h.picker.children.find(x=>x.value==='1').dataset.sourceUrl,A.url);
});
test('late source enumeration cannot replace a newer source list or its selection',async()=>{
 const first=deferred();let calls=0;
 const h=harness(()=>++calls===1?first.promise:Promise.resolve([A,B]),async()=>[{id:2}]);
 const stale=h.refresh();await h.refresh();h.picker.value='1';
 first.resolve([{...B,title:'stale title'}]);await stale;
 assert.equal(h.picker.value,'1');
 assert.deepEqual(h.picker.children.map(x=>x.dataset.sourceUrl),[A.url,B.url]);
 assert.deepEqual(h.picker.children.map(x=>x.text),['Same title · 标签页 1','Same title · 标签页 2']);
});
