import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('reselecting a save scope has its own source-safe failure code',()=>{
 const app=read('workspace/app.js');
 assert.match(app,/SAVE_SCOPE_CHANGED/);assert.match(app,/LIVE_SAVE_MODE_CHANGED/);
 assert.match(app,/open-target'\)\.hidden=true/);
 assert.match(app,/staging-details'\)\.open=true/);
});
test('task source cannot silently inherit another workspace selector',()=>{
 const flow=read('workspace/flow.js');
 assert.doesNotMatch(flow,/get\('source'\)\.value/);
});
test('download cleanup cannot revoke an object URL while the download is active',()=>{
 const app=read('workspace/app.js');
 assert.match(app,/item\?\.state!=='in_progress'\)cleanup\(\)/);
});
test('sidebar initializes home route with an explicit accessible active state',()=>{
 const app=read('workspace/app.js'),html=read('workspace/index.html');
 assert.match(app,/switchView\('home'\);guard\(initializeWorkspace\)/);
 assert.match(html,/<body class="feature-tools">/);
 assert.doesNotMatch(html,/<footer aria-live/);
});
