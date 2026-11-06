import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync(new URL('../src/tl-diagnostics.js',import.meta.url),'utf8');
function setup(){
 const stored={};
 const local={
  async get(key){return {[key]:stored[key]};},
  async set(values){Object.assign(stored,values);}
 };
 const context=vm.createContext({chrome:{storage:{local}},Date});
 vm.runInContext(code,context,{filename:'tl-diagnostics.js'});
 return {diag:context.TLDiagnostics,stored,local};
}
test('handoff failures are persisted as bounded codes and never as error text',async()=>{
 const {diag,stored}=setup();
 assert.equal(await diag.record('handoff-inject',new Error('USER_DRAFT_PRESENT')),true);
 assert.equal(await diag.record('handoff-inject',new Error('secret token in error: https://example.com/?key=123')),true);
 assert.equal(await diag.record('unsupported-operation',new Error('secret')),false);
 const rows=(await diag.list()).rows;
 assert.equal(rows.length,2);
 assert.equal(rows[0].operation,'handoff-inject');
 assert.equal(rows[0].code,'USER_DRAFT_PRESENT');
 assert.equal(rows[1].code,'HANDOFF_NOT_CONFIRMED');
 const text=JSON.stringify(stored);
 assert.doesNotMatch(text,/example\.com|key=123|secret token|stack|sourceUrl|messageId/);
});
test('malformed stored records are ignored and legacy codes remain readable',async()=>{
 const {diag,stored}=setup();
 const at=Date.now();
 stored.chatflowDiagnosticCodes=[
  {operation:'workspace-refresh',type:'Error',at},
  {operation:'handoff-inject',type:'Error',at,code:'USER_FILES_PRESENT'},
  {operation:'handoff-inject',type:'Error',at,code:'PRIVATE_TOKEN_SECRET'},
  {operation:'workspace-refresh',type:'Error',at,code:'USER_DRAFT_PRESENT'},
  {operation:'hand-off-leak',type:'Error',at,secret:'PRIVATE_TOKEN_SECRET'}
 ];
 const rows=(await diag.list()).rows;
 assert.equal(rows.length,2);
 assert.equal(rows[0].operation,'workspace-refresh');
 assert.equal(rows[1].code,'USER_FILES_PRESENT');
 assert.doesNotMatch(JSON.stringify(rows),/PRIVATE_TOKEN_SECRET/);
});
test('read failures are explicitly reported rather than shown as empty success',async()=>{
 const {diag,local}=setup();
 local.get=async()=>{throw new Error('storage inaccessible');};
 const result=await diag.list();
 assert.equal(result.storageFailed,true);
 assert.equal(result.rows.length,0);
});
