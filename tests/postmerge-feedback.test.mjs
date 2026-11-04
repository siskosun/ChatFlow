import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
function functionFrom(path,from,to,exportName){
 const source=read(path),start=source.indexOf(from),end=source.indexOf(to,start);
 assert.ok(start>=0&&end>start,'Unexpected source boundary: '+path);
 const ctx=vm.createContext({});vm.runInContext(source.slice(start,end)+'\nglobalThis.extracted='+exportName+';',ctx);
 return ctx.extracted;
}
test('workspace error codes are actionable without exposing raw failures',()=>{
 const explain=functionFrom('workspace/app.js',' const errors=',' let statusTimeout','explain');
 assert.match(explain(new Error('USER_CONFIRMATION_REQUIRED')),/勾选/);
 assert.match(explain(new Error('IDB_UPGRADE_BLOCKED_CLOSE_OTHER_WINDOWS')),/关闭其他/);
 assert.match(explain(new Error('REGENERATE_HANDOFF_AFTER_CHANGES')),/重新准备/);
 assert.match(explain(new Error('NO_VISIBLE_MESSAGES')),/没有可访问/);
 assert.match(explain(new Error('UNMAPPED_SAMPLE_CODE')),/UNMAPPED_SAMPLE_CODE/);
 assert.doesNotMatch(explain(new Error('PRIVATE_TOKEN=secret')),/secret|PRIVATE_TOKEN/);
});
test('experiment backend maps known validation failures to stable safe codes',()=>{
 const code=functionFrom('src/tl-service.js','function errorCode(e)','const trusted','errorCode');
 assert.equal(code(new Error('criteria required')),'FF_CRITERIA_REQUIRED');
 assert.equal(code(new Error('verdict already recorded')),'FF_VERDICT_ALREADY_RECORDED');
 assert.equal(code(new Error('invalid confidence')),'FF_INVALID_CONFIDENCE');
 assert.equal(code(new Error('private text 123')),'OPERATION_FAILED');
 assert.equal(code({name:'QuotaExceededError'}),'LOCAL_STORAGE_FULL');
});
test('experimental errors are localized and unknown raw details are not echoed',()=>{
 const format=functionFrom('workspace/experiments.js','  const errorMessages=','  function notice(', 'readableError');
 assert.match(format('FF_CRITERIA_REQUIRED'),/判断依据/);
 assert.match(format('OPERATION_FAILED'),/实验操作未完成/);
 assert.doesNotMatch(format('PRIVATE_TOKEN=example'),/PRIVATE_TOKEN|example/);
});
test('required verdict input and manual upload check enforce a real control gate',()=>{
 const html=read('workspace/experiments.html'),app=read('workspace/app.js'),exp=read('workspace/experiments.js');
 assert.match(html,/id="ff-criteria"[^>]*required/);
 assert.match(exp,/if\(!criteria\.value\.trim\(\)\)/);
 assert.match(app,/confirm-upload'\)\.disabled=!mayConfirm\|\|!\$\('confirmed'\)\.checked/);
});
