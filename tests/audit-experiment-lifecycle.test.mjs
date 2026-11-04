import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('experiment prefill is single-flight with old gesture cleanup',()=>{
 const s=read('src/tl-inject.js');
 assert.match(s,/if\(experimentPreparing\)return/);
 assert.match(s,/experimentGestureCleanup\?\.\(\)/);
 assert.match(s,/lastExperimentAttempt===attempt/);
 assert.match(s,/noticeTimers\s*=\s*new Map/);
 assert.match(s,/earlier\.focus\(\{preventScroll:true\}\)/);
});
test('branch launch commits one full K-branch revision set or records terminal unknown',()=>{
 const s=read('src/experiment-service.js'),db=read('src/experiment-db.js');
 assert.match(s,/if\(!Number\.isInteger\(windowId\)\)throw new Error\('WORKSPACE_WINDOW_REQUIRED'\)/);
 assert.match(s,/await DB\.update\(row\.id,row\.revision,previous=>/);
 assert.match(s,/branchLabels\.length\)/);
 assert.match(s,/status:'unknown',phase:'created'/);
 assert.match(s,/await api\.tabs\.remove\(tabId\)/);
 assert.match(db,/revisionDelta=1/);
});
test('changing experiment resets stale invalid verdict input state',()=>{
 const s=read('workspace/experiments.js');
 assert.match(s,/Programmatic value assignment does not dispatch input/);
 assert.match(s,/input\.setCustomValidity\(invalid\?/);
});
