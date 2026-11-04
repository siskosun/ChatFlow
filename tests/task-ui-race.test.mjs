import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const source=fs.readFileSync(new URL('../workspace/flow.js',import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));

// This is a small DOM boundary, not a second task-flow implementation. The
// complete production flow.js, its real input listeners and matching logic run
// below. Only storage latency, clipboard/browser APIs and DOM painting are fake.
function harness({holdFirstChoices=false,resultTexts=['Same unmarked result','Same unmarked result']}={}){
 const ids=new Map(),listeners=new Map(),choiceReached=deferred(),choiceResume=deferred(),clipboardWrites=[],runtimeCalls=[];let choices=0;
 class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attributes=new Map();this.events=new Map();this._text='';this.value='';this.hidden=false;this.checked=false;this.disabled=false;this.parentElement=null;this.isConnected=true;this.className='';this.classList={toggle:()=>{},add:()=>{},remove:()=>{}};}
  set textContent(value){this._text=String(value??'');this.children=[];}
  get textContent(){return this._text+this.children.map(c=>c.textContent??String(c)).join('');}
  setAttribute(name,value){this.attributes.set(name,String(value));if(name==='id'){this.id=String(value);ids.set(this.id,this);}if(name==='hidden')this.hidden=true;if(name==='class')this.className=String(value);}
  getAttribute(name){return this.attributes.get(name)??null;}
  append(...children){for(const child of children){this.children.push(child);if(child&&typeof child==='object')child.parentElement=this;}}
  insertBefore(child){this.append(child);}
  replaceChildren(...children){this.children=[];this._text='';this.append(...children);if(this.tagName==='SELECT')this.value=children[0]?.value||'';}
  add(option){this.append(option);}
  addEventListener(name,fn){const rows=this.events.get(name)||[];rows.push(fn);this.events.set(name,rows);}
  dispatch(name){for(const fn of this.events.get(name)||[])fn({target:this,preventDefault(){}});}
  focus(){} select(){} remove(){this.isConnected=false;} querySelector(){return null;}
  get selectedOptions(){return this.children.filter(c=>c.value===this.value);}
 }
 const document={createElement:tag=>new Element(tag),getElementById:id=>ids.get(id),querySelector:q=>q==='main'?main:null,body:new Element('body'),addEventListener:(name,fn)=>{const rows=listeners.get(name)||[];rows.push(fn);listeners.set(name,rows);}};
 const main=new Element('main');for(const id of ['capture-view','source','live','open-tools','status']){const e=new Element(id==='source'?'select':'div');e.setAttribute('id',id);main.append(e);}
 class Option extends Element{constructor(text,value){super('option');this.textContent=text;this.value=String(value);this.dataset={};}}
 const context=vm.createContext({console,document,Option,window:{addEventListener(){}},location:{href:'chrome-extension://synthetic/workspace/index.html'},navigator:{clipboard:{writeText:async value=>{clipboardWrites.push(value);}}},chrome:{storage:{local:{get:async()=>({}),set:async()=>{}}},runtime:{sendMessage:async message=>{runtimeCalls.push(message);return{ok:true,data:[]};}}},URL,TextEncoder,TextDecoder,Uint8Array,Uint32Array,ArrayBuffer,DataView,Blob,crypto:webcrypto,atob,btoa,setTimeout,clearTimeout,confirm:()=>true});
 for(const name of ['tl-core.js','tl-tasks.js'])vm.runInContext(fs.readFileSync(new URL('../src/'+name,import.meta.url),'utf8'),context);
 const T=context.TLTasks,tasks=['A','B'].map((name,index)=>T.createTask({origin:'https://chatgpt.com',conversationId:'conversation_ui_race_'+name,url:'https://chatgpt.com/c/conversation_ui_race_'+name,title:'Same topic'},'Same task text',{now:1000,code:'CF-'+name.repeat(12),id:`00000000-0000-4000-8000-00000000000${index+1}`}));
 const results=tasks.map((task,index)=>T.createResult(task,resultTexts[index],{manual:true,now:2000,id:`00000000-0000-4000-8000-00000000001${index+1}`}));
 context.TLTaskStore={
  get:async id=>structuredClone(tasks.find(t=>t.id===id)),
  getResult:async id=>structuredClone(results.find(r=>r.id===id)),
  taskChoices:async()=>{if(++choices===1&&holdFirstChoices){choiceReached.resolve();await choiceResume.promise;}return tasks.map(t=>T.taskSummary(t,1));},
  match:async text=>T.match(text,tasks),
  listPage:async()=>({items:[],nextCursor:null,total:0})
 };
 const original='globalThis.ChatFlowTaskUI=Object.freeze({refreshTasks,refreshSources,updateMatch,mode});';
 assert.ok(source.includes(original),'Production task UI test hook must be updated after an API refactor');
 const injected=source.replace(original,'globalThis.ChatFlowTaskUI=Object.freeze({refreshTasks,refreshSources,updateMatch,mode,openSavedResult,state:()=>({prepared:prepared?{...prepared}:null,matchEpoch})});');
 vm.runInContext(injected,context,{filename:'workspace/flow.js'});
 return{ui:context.ChatFlowTaskUI,tasks,results,clipboardWrites,runtimeCalls,choiceReached:choiceReached.promise,resumeChoices:choiceResume.resolve,element:id=>ids.get(id),input(value){const el=ids.get('task-result-text');el.value=value;el.dispatch('input');}};
}

test('last opened result wins when two manual receipts have identical text and the first finishes late',async()=>{
 const h=harness({holdFirstChoices:true}),[a,b]=h.results;
 const first=h.ui.openSavedResult(a.id,a.taskId);await h.choiceReached;
 await h.ui.openSavedResult(b.id,b.taskId);assert.equal(h.ui.state().prepared?.taskId,b.taskId);
 h.resumeChoices();await first;
 assert.equal(h.ui.state().prepared?.id,b.id,'A late result replaced the last requested receipt');
 assert.equal(h.element('task-manual-source').value,b.taskId,'A late result replaced the selected source');
 assert.equal(h.element('task-return-origin').hidden,false);
});

test('typing while a saved result loads invalidates it even if the user ends with the same text',async()=>{
 const h=harness({holdFirstChoices:true}),[a]=h.results;
 const opening=h.ui.openSavedResult(a.id,a.taskId);await h.choiceReached;
 h.input('A new user edit');await flush();h.input(a.text);await flush();
 h.resumeChoices();await opening;
 assert.equal(h.element('task-result-text').value,a.text,'Loading a receipt overwrote the user draft');
 assert.equal(h.ui.state().prepared,null,'An old load restored return eligibility after user input');
 assert.equal(h.element('task-return-origin').hidden,true);
});

test('manual source changes while a receipt loads cannot be overwritten by its delayed completion',async()=>{
 const h=harness({holdFirstChoices:true}),[a,b]=h.results;
 const opening=h.ui.openSavedResult(a.id,a.taskId);await h.choiceReached;
 const select=h.element('task-manual-source');select.value=b.taskId;select.dispatch('change');await flush();
 h.resumeChoices();await opening;
 assert.equal(h.ui.state().prepared,null,'Delayed load revived a receipt after manual reassignment');
 assert.equal(select.value,b.taskId,'Delayed load overwrote the manual task choice');
});

test('corrupt stored receipts or their owning tasks cannot replace the draft or remain eligible to copy',async t=>{
 const cases=[
  ['body hash mismatch',h=>{h.results[0].text='Corrupted stored body';},/TASK_RESULT_INTEGRITY_INVALID/],
  ['wrong task code',h=>{h.results[0].taskCode=h.tasks[1].code;},/TASK_RESULT_INVALID/],
  ['invalid owning source',h=>{h.tasks[0].source.conversationId='different_source_id';},/TASK_SOURCE_ID_MISMATCH/]
 ];
 for(const [name,corrupt,error]of cases)await t.test(name,async()=>{
  const h=harness({resultTexts:['Stored result A','Stored result B']}),[a,b]=h.results;
  await h.ui.openSavedResult(b.id,b.taskId);
  assert.equal(h.ui.state().prepared?.id,b.id,'Fixture did not begin with a valid saved receipt');
  const previousText=h.element('task-result-text').value;
  corrupt(h);
  await assert.rejects(h.ui.openSavedResult(a.id,a.taskId),error);
  assert.equal(h.element('task-result-text').value,previousText,'Invalid stored data replaced the existing draft');
  assert.equal(h.ui.state().prepared,null,'Invalid stored data retained a copy/return receipt');
  assert.equal(h.element('task-return-origin').hidden,true);
  assert.equal(h.element('task-open-only').hidden,true);
  h.element('task-return-origin').dispatch('click');await flush();
  assert.deepEqual(h.clipboardWrites,[],'Invalid stored data reached the clipboard');
  assert.equal(h.runtimeCalls.some(call=>call.type==='tl:taskReturn'),false,'Invalid stored data returned to a conversation');
 });
});
