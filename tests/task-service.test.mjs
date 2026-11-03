import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const URL_A='https://chatgpt.com/c/conversation_task_source_A',URL_B='https://chatgpt.com/c/conversation_task_source_B';
const sender={id:'extension',url:'chrome-extension://extension/workspace/index.html',tab:{id:10,windowId:9}};
function setup({existing=true,changeOnSecondGet=false,scriptUrl=URL_A}={}){
 const events=[],tabs=new Map(existing?[[20,{id:20,windowId:9,url:URL_A}]]:[]);let gets=0;
 const api={runtime:{id:'extension',getURL:path=>'chrome-extension://extension/'+path},
  windows:{update:async(...args)=>events.push(['focus',...structuredClone(args)])},
  tabs:{query:async()=>[...tabs.values()],get:async id=>{gets++;const tab=tabs.get(id);return changeOnSecondGet&&gets===2?{...tab,url:URL_B}:tab;},update:async(id,options)=>{events.push(['update',id,{...options}]);return tabs.get(id);},create:async options=>{events.push(['create',{...options}]);return{id:30,...options};},sendMessage:async(id,msg)=>{events.push(['message',id,{...msg}]);return{ok:true};}},
  scripting:{executeScript:async options=>{events.push(['script',options.files?Array.from(options.files):'selection']);return[{frameId:0,documentId:'doc-A',result:{url:scriptUrl,title:'Same title',text:'selected synthetic text',messageId:'m1',nodeId:null}}];}}};
 const ctx=vm.createContext({console,URL,TextEncoder,TextDecoder,Uint8Array,Uint32Array,DataView,ArrayBuffer,Blob,crypto:webcrypto,atob,btoa});
 for(const path of ['tl-core.js','tl-tasks.js'])vm.runInContext(fs.readFileSync(new URL('../src/'+path,import.meta.url),'utf8'),ctx);
 const task=ctx.TLTasks.createTask({origin:'https://chatgpt.com',conversationId:'conversation_task_source_A',url:URL_A},'small task');
 ctx.TLTaskStore={get:async id=>id===task.id?task:null};
 vm.runInContext(fs.readFileSync(new URL('../src/tl-task-service.js',import.meta.url),'utf8'),ctx);
 return{api,events,tabs,task,handle:(msg,s=sender)=>ctx.TLTaskService.handle(msg,s,api)};
}
test('Task Loop service accepts only the owning extension workspace',async()=>{
 const h=setup();for(const s of [{...sender,id:'foreign'},{...sender,url:'https://chatgpt.com/'},{...sender,url:'chrome-extension://extension/workspace-evil/index.html'}])await assert.rejects(h.handle({type:'tl:taskSource',tabId:20,expectedUrl:URL_A},s),/WORKSPACE_ONLY/);
 assert.equal(h.events.length,0);
});
test('source creation reads only selected message and returns verified identity, not a full capture',async()=>{
 const h=setup(),r=await h.handle({type:'tl:taskSource',tabId:20,expectedUrl:URL_A});assert.equal(r.source.url,URL_A);assert.equal(r.source.messageId,'m1');assert.equal(r.source.nodeId,null);assert.equal(r.selection,'selected synthetic text');assert.deepEqual(h.events,[['script','selection']]);
});
test('source selector mismatch and script navigation race fail before associating a task',async()=>{
 const h=setup();await assert.rejects(h.handle({type:'tl:taskSource',tabId:20,expectedUrl:URL_B}),/TASK_SOURCE_CHANGED/);assert.equal(h.events.length,0);
 for(const options of [{changeOnSecondGet:true},{scriptUrl:URL_B}]){const h=setup(options);await assert.rejects(h.handle({type:'tl:taskSource',tabId:20,expectedUrl:URL_A}),/TASK_SOURCE_CHANGED/);}
});
test('existing-source return focuses the exact source without scripting, navigation or Send',async()=>{
 const h=setup(),r=await h.handle({type:'tl:taskReturn',taskId:h.task.id,url:'https://evil.example'});assert.equal(r.state,'source_opened_not_sent');assert.deepEqual(h.events,[['update',20,{active:true}],['focus',9,{focused:true}]]);
});
test('closed-source return opens the stored canonical source and ignores external result URLs',async()=>{
 const h=setup({existing:false}),r=await h.handle({type:'tl:taskReturn',taskId:h.task.id,url:URL_B});assert.equal(r.state,'source_opened_not_sent');assert.deepEqual(h.events,[['create',{windowId:9,url:URL_A,active:true}]]);
});
test('missing task and missing workspace window cannot open a destination',async()=>{
 const h=setup();await assert.rejects(h.handle({type:'tl:taskReturn',taskId:'unknown'}),/TASK_NOT_FOUND/);await assert.rejects(h.handle({type:'tl:taskReturn',taskId:h.task.id},{...sender,tab:{}}),/WORKSPACE_WINDOW_REQUIRED/);assert.equal(h.events.length,0);
});
test('optional page tools load only from an explicit source-bound command',async()=>{
 const h=setup();assert.equal(await h.handle({type:'unrelated'}),undefined);assert.equal(h.events.length,0);
 const r=await h.handle({type:'tl:openTools',tabId:20,expectedUrl:URL_A});assert.equal(r.opened,true);assert.deepEqual(h.events[0],['script',['src/tl-core.js','src/tl-provider.js','src/toolkit-port.js','src/tl-tools-page.js']]);assert.equal(h.events[1][2].url,URL_A);
});
test('tool injection does not show a panel if the tab changed during injection',async()=>{
 const h=setup({changeOnSecondGet:true});await assert.rejects(h.handle({type:'tl:openTools',tabId:20,expectedUrl:URL_A}),/TASK_SOURCE_CHANGED/);assert.equal(h.events.filter(x=>x[0]==='message').length,0);
});
