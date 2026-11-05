import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const src=fs.readFileSync(new URL('../src/tl-core.js',import.meta.url),'utf8');
const env=vm.createContext({TextEncoder,TextDecoder,URL,URLSearchParams,crypto:webcrypto,atob,btoa,Uint8Array,ArrayBuffer,DataView,Blob});
vm.runInContext(src,env);const C=env.TLCore;
test('unsanitized URLs keep the exact original input spelling',()=>{
 for(const x of ['https://x.com?a=1','http://x.com?a=1','https://example.org:443/%2Ffoo?hello=1&two=%2F#section','https://x.com:443?tokenize=abc&a=1']){
  assert.equal(C.scrubText(x),x);
 }
});
test('signed query fields are removed without rewriting unrelated bytes',()=>{
 assert.equal(C.scrubText('https://x.com?access_token=secret&a=%2f&X-Amz-Signature=bad#part'),'https://x.com?a=%2f#part');
 assert.equal(C.scrubText('http://x.com/?%58-Amz-Signature=secret&ok=1'),'http://x.com/?ok=1');
 assert.equal(C.scrubText('https://x.com/?token=abc#part'),'https://x.com/#part');
 assert.equal(C.scrubText('https://x.com/?bad%xx=1&token=secret'),'https://x.com/');
});
test('Windows filename sanitization refuses reserved basenames and trailing dots',()=>{
 for(const name of ['CON','nul.txt','LPT9.doc','COM1','AUX.'])assert.ok(C.safeName(name).startsWith('_'),name);
 assert.equal(C.safeName('report.pdf.'),'report.pdf_');
 assert.equal(C.safeName('data.txt  '),'data.txt');
 assert.equal(C.safeName('report?.pdf'),'report_.pdf');
 assert.ok(C.safeName('x'.repeat(180)+'.').length<=180);
});
