import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../workspace/app.js',import.meta.url),'utf8');
const a=src.indexOf(' function preserveIdentityFocus('),b=src.indexOf('\n async function guard(',a);
assert.ok(a>=0&&b>a,'Must exercise production focus helper');
const ctx=vm.createContext({document:{activeElement:null}});
vm.runInContext(src.slice(a,b)+'\nglobalThis.keepFocus=preserveIdentityFocus;',ctx);
const focus=(id,role,tag='BUTTON',disabled=false)=>({tagName:tag,disabled,dataset:{focusId:id,focusRole:role},focus(opts){this.wasFocused=true;this.opts=opts;}});
test('focus survives a matching archive identity but never moves to another archive',()=>{
 const old=focus('capture:A','open'),newA=focus('capture:A','open'),newB=focus('capture:B','open');
 const box={children:[old],contains:el=>box.children.includes(el),querySelectorAll:()=>box.children};
 ctx.document.activeElement=old;const restore=ctx.keepFocus(box);
 box.children=[newB,newA];restore();
 assert.equal(newA.wasFocused,true);assert.equal(newB.wasFocused,undefined);
 assert.equal(newA.opts.preventScroll,true);
});
test('deleted, disabled or role-changed items never receive stale focus',()=>{
 for(const children of [[focus('capture:B','open')],[focus('capture:A','checkbox')],[focus('capture:A','open','BUTTON',true)]]){
  const old=focus('capture:A','open'),box={children:[old],contains:el=>box.children.includes(el),querySelectorAll:()=>box.children};
  ctx.document.activeElement=old;const restore=ctx.keepFocus(box);
  box.children=children;restore();
  assert.equal(children[0].wasFocused,undefined);
 }
});
test('task and experiment rows use stable IDs rather than titles or ordinals',()=>{
 const flow=fs.readFileSync(new URL('../workspace/flow.js',import.meta.url),'utf8');
 const experiments=fs.readFileSync(new URL('../workspace/experiments.js',import.meta.url),'utf8');
 assert.match(flow,/data-task-action/);
 assert.match(flow,/focusedTask&&focusedAction/);
 assert.match(experiments,/const focusId=document.activeElement\?\.dataset\?\.experimentId/);
 assert.match(experiments,/el.dataset.experimentId===focusId/);
});
