import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../workspace/app.js',import.meta.url),'utf8');
const part=source.slice(source.indexOf(' let sourceRefreshSequence'),source.indexOf('\n function selectedSource'));
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};}
function harness(){
 const selector={value:'B',options:[],replaceChildren(){this.options=[];this.value='';},append(option){this.options.push(option);if(!this.value)this.value=option.value;}};
 const waits=[],rows=[{id:'A',url:'https://chatgpt.com/c/conversation_A',title:'A'},{id:'B',url:'https://chatgpt.com/c/conversation_B',title:'B'}];
 const ctx=vm.createContext({URL,Option:class{constructor(text,value){this.text=text;this.value=value;this.dataset={};}},
  location:{href:'chrome-extension://example/workspace/index.html'},
  $:id=>id==='source'?selector:{},
  call:async()=>rows,
  chrome:{tabs:{query:()=>{const d=deferred();waits.push(d);return d.promise;}}}
 });
 vm.runInContext('let sourceOptionsSignature=null,sourceLookupKey=null,sourceLookupCaptureId=null;'+part+'\nglobalThis.run=sources;',ctx);
 return{ctx,selector,waits};
}
test('source refresh never overwrites a user choice made while tab discovery is awaiting',async()=>{
 const h=harness(),run=h.ctx.run();h.selector.value='A';h.waits[0].resolve([{id:'B'}]);await run;assert.equal(h.selector.value,'A');
});
test('late older source refresh cannot overwrite the latest completed refresh',async()=>{
 const h=harness(),first=h.ctx.run(),second=h.ctx.run();h.selector.value='A';h.waits[1].resolve([{id:'B'}]);await second;h.selector.value='B';h.waits[0].resolve([{id:'A'}]);await first;assert.equal(h.selector.value,'B');
});
