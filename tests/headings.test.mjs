import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const env=vm.createContext({URL,TextEncoder,TextDecoder,Uint8Array,Uint32Array,DataView,ArrayBuffer});
for(const name of ['tl-core','tl-headings'])vm.runInContext(fs.readFileSync(new URL('../src/'+name+'.js',import.meta.url),'utf8'),env);
const H=env.TLHeadings;
function root(data){
 const nodes=data.map(([level,text,excluded=false,visible=true])=>({tagName:'H'+level,textContent:text,excluded,visible,closest(){return this.excluded?{}:null;}}));
 return {isConnected:true,textContent:JSON.stringify(data),contains:node=>nodes.includes(node),querySelectorAll:()=>nodes,nodes};
}
test('headings preserve H1-H6, exclude hidden/code labels and distinguish duplicate occurrences',()=>{
 const r=root([[1,'Top'],[2,'Same'],[3,'Three'],[4,'Four'],[5,'Five'],[6,'Deep'],[2,'Same'],[2,'fake',true],[2,'hidden',false,false],[2,'  ']]);
 const entries=H.read(r,e=>e.visible);
 assert.deepEqual(Array.from(entries,e=>e.level),[1,2,3,4,5,6,2]);
 assert.deepEqual(Array.from(entries.filter(e=>e.text==='Same'),e=>e.occurrence),[0,1]);
 const descriptor=H.descriptor(entries.at(-1));assert.equal(descriptor.element,undefined);
 assert.equal(H.resolve(r,descriptor,e=>e.visible),r.nodes[6]);
});
test('equivalent remount is allowed but edited content cannot silently reuse a repeated title',()=>{
 const data=[[2,'Same'],[2,'Same']];const a=root(data),saved=H.descriptor(H.read(a,()=>true)[1]),b=root(data);
 assert.equal(H.resolve(b,saved,()=>true),b.nodes[1]);
 b.textContent+='changed';assert.equal(H.resolve(b,saved,()=>true),null);
 const changed=root([[2,'Other'],[2,'Same']]);assert.equal(H.resolve(changed,saved,()=>true),null);
});
test('malicious-looking titles stay text; descriptors require exact content and topology hashes',()=>{
 const r=root([[2,'<img src=x onerror=alert(1)>']]),entry=H.read(r,()=>true)[0];
 assert.equal(entry.text,'<img src=x onerror=alert(1)>');
 assert.equal(H.resolve(r,{...H.descriptor(entry),outlineHash:'a'.repeat(64)},()=>true),null);
});
test('headings refuse disconnected, excessive and oversized message/label inputs',()=>{
 assert.throws(()=>H.read({...root([]),isConnected:false},()=>true),/HEADING_SOURCE_UNAVAILABLE/);
 assert.throws(()=>H.read(root(Array.from({length:257},()=>[2,'a'])),()=>true),/HEADING_COUNT_LIMIT/);
 assert.throws(()=>H.read({...root([]),textContent:'a'.repeat(1024*1024+1)},()=>true),/HEADING_MESSAGE_LIMIT/);
 assert.throws(()=>H.read(root([[2,'a'.repeat(1001)]]),()=>true),/HEADING_TEXT_LIMIT/);
});
