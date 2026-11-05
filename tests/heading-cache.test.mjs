import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
let hashCalls=0;
class Hash {update(x){hashCalls++;this.source=String(x);return this;}hex(){return this.source+':hash';}}
class FakeObserver {
 static all=[];
 constructor(handler){this.handler=handler;this.pending=[];FakeObserver.all.push(this);}
 observe(root){this.root=root;}
 takeRecords(){const copy=this.pending;this.pending=[];return copy;}
 change(){this.pending.push({type:'characterData'});}
}
const ctx=vm.createContext({TLCore:{check(ok,code){if(!ok)throw Error(code);},SHA256:Hash},MutationObserver:FakeObserver});
vm.runInContext(fs.readFileSync(new URL('../src/tl-headings.js',import.meta.url),'utf8'),ctx);
const H=ctx.TLHeadings;
function node(text){return{tagName:'H2',textContent:text,closest:()=>null};}
function fixture(text){const n=node('Section');return{isConnected:true,textContent:text,querySelectorAll:()=>[n],contains:x=>x===n,n};}
test('unchanged mounted heading descriptor avoids repeated full-message hashing',()=>{
 const root=fixture('a'.repeat(1024*1024)),visible=()=>true;
 hashCalls=0;
 const saved=H.descriptor(H.read(root,visible)[0]);
 assert.equal(hashCalls,2);
 for(let i=0;i<80;i++)assert.equal(H.resolve(root,saved,visible),root.n);
 assert.equal(hashCalls,2,'no per-frame SHA-256 rehashing');
 root.textContent='changed';FakeObserver.all.at(-1).change();
 assert.equal(H.resolve(root,saved,visible),null,'synchronously invalidate on queued DOM mutation');
 assert.equal(hashCalls,4);
});
test('oversized or disconnected headings resolve to null rather than rejection',()=>{
 const root=fixture('x'),visible=()=>true,saved=H.descriptor(H.read(root,visible)[0]);
 root.textContent='x'.repeat(1024*1024+1);FakeObserver.all.at(-1).change();
 assert.equal(H.resolve(root,saved,visible),null);
 root.isConnected=false;
 assert.equal(H.resolve(root,saved,visible),null);
});
