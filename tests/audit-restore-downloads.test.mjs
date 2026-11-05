import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('restoration distinguishes actual database readback evidence from mere zip parse',()=>{
 const archive=read('src/tl-archive.js'),app=read('workspace/app.js');
 for(const code of ['RESTORE_DATABASE_READBACK_FAILED','RESTORE_SNAPSHOT_READBACK_FAILED','RESTORE_ASSET_READBACK_FAILED','RESTORE_PASSAGE_READBACK_FAILED','RESTORE_BLOB_READBACK_FAILED','RESTORE_RECEIPT_WRITE_FAILED']){
  assert.match(archive,new RegExp(code));assert.match(app,new RegExp(code));
 }
 assert.match(archive,/imported:true,code/);
 assert.doesNotMatch(archive,/catch\{\s*\/\/ Import has already committed\./);
});
test('task and experiment backup use browser downloads completion states, not naked anchor click',()=>{
 const flow=read('workspace/flow.js'),experiments=read('workspace/experiments.js');
 for(const source of [flow,experiments]){
  assert.match(source,/chrome\.downloads\.download\(/);
  assert.match(source,/chrome\.downloads\.onChanged\.addListener/);
  assert.match(source,/state\?\.current==='interrupted'/);
 }
 assert.doesNotMatch(flow,/a\.click\(\);setTimeout\(\(\)=>URL\.revokeObjectURL/);
 assert.doesNotMatch(experiments,/link\.click\(\); link\.remove/);
});
