import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('one explicit experimental opt-in survives without a redundant visibility gate',()=>{
 const flow=read('workspace/flow.js'),css=read('workspace/style.css'),html=read('workspace/index.html'),page=read('workspace/experiments.html'),service=read('src/experiment-service.js');
 assert.doesNotMatch(flow,/experiments:false/);
 assert.doesNotMatch(flow,/\['experiments','并行对照实验'/);
 assert.doesNotMatch(css,/feature-experiments/);
 // Capture-page duplicate was deliberately removed; one direct Advanced entry remains.
 assert.doesNotMatch(html,/id="open-experiments"/);
 assert.match(flow,/button\('打开并行实验','settings-open-experiments'/);
 assert.match(page,/id="ff-enable"/);
 assert.match(service,/FF_SET_ENABLED/);
 assert.match(service,/if\(!await enabled\(api\)\)throw new Error\('EXPERIMENTS_DISABLED'\)/);
});
