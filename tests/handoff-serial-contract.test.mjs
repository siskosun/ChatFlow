import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const worker=fs.readFileSync(new URL('../src/tl-service.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../workspace/app.js',import.meta.url),'utf8');
test('handoff changes are serialized through one state writer',()=>{
 assert.match(worker,/function serializeHandoffWrite\(task\)/);
 assert.match(worker,/return serializeHandoffWrite\(async\(\)=>\{/);
 assert.match(worker,/serializeHandoffWrite\(\(\)=>applyHandoffEvidence/);
 assert.doesNotMatch(worker,/let (openQueue|claimQueue|receiptQueue)=/);
});
test('preparation is content-addressed and duplicate actions are dropped',()=>{
 assert.match(worker,/prepareFingerprint/);
 assert.match(worker,/if\(previous\)return previous/);
 assert.match(app,/function singleFlight\(id,fn\)/);
 assert.match(app,/frozenFingerprint=fingerprint\(\)/);
});
