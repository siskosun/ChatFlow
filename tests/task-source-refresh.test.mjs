import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync('workspace/flow.js','utf8');
const start=script.indexOf(' async function refreshSources()');
const end=script.indexOf('\n async function refreshChoices',start);
assert.ok(start>=0&&end>start);
const events=script.split('\n').find(line=>line.includes("text.addEventListener('input'")&&line.includes("source.addEventListener('change'"));
assert.ok(events,'production source and input edit handlers are required');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const url=id=>'https://chatgpt.com/c/source-'+id;
const row=id=>({id,url:url(id),title:'Source '+id});
function fixture({initialText='keep my draft',sourceParam=''}={}){
 let rows=[row(42),row(84)],query=async()=>[{id:84}],getRows=async()=>rows;
 const calls=[],sourceHandlers={},textHandlers={};
 class Option{constructor(label,value){this.label=label;this.value=value;this.dataset={};}}
 const source={options:rows.map(r=>Object.assign(new Option(r.title,String(r.id)),{dataset:{sourceUrl:r.url}})),_value:'42',
  add(option){this.options.push(option);},replaceChildren(...options){this.options=options;this._value=options[0]?.value||'';},
  addEventListener(type,fn){sourceHandlers[type]=fn;}};
 Object.defineProperties(source,{
  value:{get(){return this._value;},set(value){this._value=this.options.some(o=>o.value===String(value))?String(value):'';}},
  selectedOptions:{get(){return this.options.filter(o=>o.value===this._value);}}
 });
 const text={value:initialText,addEventListener(type,fn){textHandlers[type]=fn;}};
 const ctx=vm.createContext({source,text,Option,URL,location:{href:'chrome-extension://ext/workspace/index.html'+sourceParam},
  call:async()=>getRows(),displayLabels:xs=>xs.map(r=>r.title),
  chrome:{tabs:{query:()=>{calls.push(['query']);return query();}}},
  selectionStage:{hidden:false},stopSelectionWatch:()=>calls.push(['stop']),
  selectionFeedback:(...args)=>calls.push(['feedback',...args]),updateCreateState:()=>calls.push(['update']),
  invalidateCreation:()=>calls.push(['invalidate'])
 });
 const ops=vm.runInContext('let sourceRefreshEpoch=0,quickSelectionEpoch=0,selectedFromWatch={messageId:"original"};\n'+events+'\n'+script.slice(start,end)+
  '\n({refreshSources,state(){return {text:text.value,source:source.value,selectedFromWatch};}})',ctx);
 return {...ops,calls,setRows:next=>{rows=next;},setRowsLoader:fn=>{getRows=fn;},setQuery:fn=>{query=fn;},
  choose:id=>{source.value=String(id);sourceHandlers.change();},edit:value=>{text.value=value;textHandlers.input();}};
}
test('a nonempty draft is not rebound when its source tab navigates',async()=>{
 const f=fixture();f.setRows([{...row(42),url:url('changed')},row(84)]);
 await f.refreshSources();
 assert.equal(f.state().text,'keep my draft');assert.equal(f.state().source,'');
 assert.equal(f.state().selectedFromWatch,null);
 assert.equal(f.calls.find(x=>x[0]==='feedback')[3],url(42));
 assert.equal(f.calls.some(x=>x[0]==='query'),false);
});
test('closing the source preserves the draft and requires an explicit new choice',async()=>{
 const f=fixture();f.setRows([row(84)]);await f.refreshSources();
 assert.equal(f.state().source,'');assert.equal(f.state().text,'keep my draft');
 assert.equal(f.calls.filter(x=>x[0]==='invalidate').length,1);
 await f.refreshSources();assert.equal(f.state().source,'','a later refresh must still require an explicit source');
});
test('refreshing the same source retains its selection evidence',async()=>{
 const f=fixture();await f.refreshSources();
 assert.equal(f.state().source,'42');assert.equal(f.state().selectedFromWatch.messageId,'original');
 assert.equal(f.calls.some(x=>x[0]==='invalidate'),false);
});
test('an empty draft can select the current active conversation',async()=>{
 const f=fixture({initialText:''});f.setRows([row(84),row(126)]);await f.refreshSources();
 assert.equal(f.state().source,'84');
});
test('a slow source list cannot override the newer completed refresh',async()=>{
 const f=fixture({initialText:''}),gate=deferred();
 f.setRowsLoader(()=>gate.promise);const older=f.refreshSources();
 f.setRowsLoader(async()=>[row(84)]);await f.refreshSources();
 gate.resolve([row(126)]);await older;
 assert.equal(f.state().source,'84');
});
test('a manual source choice during the active-tab lookup is retained',async()=>{
 const f=fixture({initialText:''}),gate=deferred(),entered=deferred();
 f.setRows([row(84),row(126)]);f.setQuery(()=>{entered.resolve();return gate.promise;});
 const loading=f.refreshSources();await entered.promise;f.choose(126);gate.resolve([{id:84}]);await loading;
 assert.equal(f.state().source,'126');
});
test('typing while sources load prevents an automatic source replacement',async()=>{
 const f=fixture({initialText:''}),gate=deferred();
 f.setRowsLoader(()=>gate.promise);const loading=f.refreshSources();
 f.edit('new draft while loading');gate.resolve([row(84)]);await loading;
 assert.equal(f.state().text,'new draft while loading');assert.equal(f.state().source,'42');
});

test('an initial URL source hint cannot rebind a draft after that tab changes conversation',async()=>{
 const f=fixture({sourceParam:'?source=42'});f.setRows([{...row(42),url:url('changed')},row(84)]);
 await f.refreshSources();await f.refreshSources();
 assert.equal(f.state().source,'');assert.equal(f.state().text,'keep my draft');
});
