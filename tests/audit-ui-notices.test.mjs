import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('startup failure retains sections and shows an explicit retry',()=>{
 const app=read('workspace/app.js');
 assert.match(app,/const failed=\[\]/);
 assert.match(app,/for\(const \[label,task\]/);
 assert.match(app,/if\(failed.length\)\{\$\('retry-workspace'\)\.hidden=false/);
});
test('all user-facing workspaces retain dismissible error messages',()=>{
 for(const p of ['workspace/app.js','workspace/flow.js','workspace/experiments.js'])assert.match(read(p),/status-dismiss/);
});
