import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('src/tl-selection-action.js', 'utf8');
const URL = 'https://chatgpt.com/c/selection_alpha_1234';
const box = (left, top, width, height) => ({left, top, width, height, right:left+width, bottom:top+height});
function deferred() {
 let resolve, reject;
 const promise = new Promise((yes, no) => {resolve = yes;reject = no;});
 return {promise, resolve, reject};
}
function fixture({foreignHost=false}={}) {
 let now = 0, sequence = 0;
 const timers = new Map(), observers = new Set(), natives = [], responses = [], sent = [];
 const state = {
  text: 'first synthetic task', generation: 1, url: URL, messageId:'message-1',
  startContainer: {}, startOffset: 0, endContainer: {}, endOffset: 20,
  rect: box(80, 180, 180, 20), empty: false, scale: 1
 };
 class Events {
  listeners = new Map();
  addEventListener(type, callback) {
   if (!this.listeners.has(type)) this.listeners.set(type, []);
   this.listeners.get(type).push(callback);
  }
  async emit(type, data = {}) {
   const event = {type, preventDefault() {}, ...data};
   return Promise.all((this.listeners.get(type) || []).map(callback => callback(event)));
  }
 }
 let ctx;
 class Element extends Events {
  constructor(tag) {super();this.tag=tag;this.children=[];this.attrs={};this.style={};this.hidden=false;this.textContent='';this.parent=null;}
  setAttribute(key, value) {this.attrs[key] = String(value);}
  getAttribute(key) {return this.attrs[key] ?? null;}
  closest() {return null;}
  append(...children) {for (const child of children) {child.parent=this;this.children.push(child);}}
  attachShadow() {this.shadowRoot = new Element('shadow');return this.shadowRoot;}
  contains(node) {for (let n=node;n;n=n.parent) if(n===this) return true;return false;}
  getBoundingClientRect() {
   if (this.rect) return this.rect;
   const child = this.shadowRoot?.children.find(el=>el.tag==='button');
   const label = child?.textContent ?? this.textContent;
   const natural = (label.length * 9 + 28) * state.scale, width = Math.min(natural, ctx.innerWidth - 20);
   const height = Math.max(36, Math.ceil(natural / Math.max(1, width)) * 18 + 16);
   return box(parseFloat(this.style.left)||0, parseFloat(this.style.top)||0, width, height);
  }
 }
 const doc = new Events(), win = new Events(), navigation = new Events();
 doc.documentElement = new Element('html');
 doc.createElement = tag => new Element(tag);
 doc.querySelectorAll = () => natives;
  doc.querySelector = selector => selector==='#chatflow-selected-action'
   ? doc.documentElement.children.find(el=>el.id==='chatflow-selected-action')||null : null;
  if(foreignHost){const owner=new Element('div');owner.id='chatflow-selected-action';doc.documentElement.append(owner);}
 const selection = () => ({
  rangeCount: state.empty ? 0 : 1,
  getRangeAt: () => ({
   startContainer:state.startContainer, startOffset:state.startOffset,
   endContainer:state.endContainer, endOffset:state.endOffset,
   getBoundingClientRect:()=>state.rect, getClientRects:()=>[state.rect]
  })
 });
 class Observer {
  constructor(callback) {this.callback=callback;}
  observe() {observers.add(this);}
  disconnect() {observers.delete(this);}
 }
 ctx = vm.createContext({
  document:doc, window:win, navigation, location:{href:URL}, innerWidth:800, innerHeight:600,
  getSelection:selection, MutationObserver:Observer,
  setTimeout(callback, delay=0) {const id=++sequence;timers.set(id,{at:now+delay,callback});return id;},
  clearTimeout(id) {timers.delete(id);},
  TLCore:{chatUrl(value){if(!String(value).startsWith('https://chatgpt.com/c/'))throw Error('NOT_CHAT');return{url:value};}},
  TLPageScope:{
   isVisible:()=>true,
   selectedMessage:()=>state.empty?{status:'empty'}:{
    status:'selected', text:state.text, tooLong:false, generation:state.generation,
    messageId:state.messageId, evidence:'confirmed', url:state.url
   }
  },
  chrome:{runtime:{sendMessage(message){sent.push(message);return responses.length?responses.shift():Promise.resolve({ok:true});}}}
 });
 vm.runInContext(source,ctx);
 async function advance(milliseconds) {
  const end = now + milliseconds;
  for (;;) {
   const next=[...timers].filter(([,item])=>item.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];
   if(!next)break;
   now=next[1].at;timers.delete(next[0]);next[1].callback();
   await Promise.resolve();await Promise.resolve();
  }
  now=end;await Promise.resolve();await Promise.resolve();
 }
 const host = () => doc.documentElement.children.find(el=>el.id==='chatflow-selected-action');
 const button = () => host()?.shadowRoot.children.find(el=>el.tag==='button');
 async function select(text, offset=0) {
  state.text=text;state.startOffset=offset;state.endOffset=offset+text.length;state.empty=false;
  await doc.emit('selectionchange');await advance(121);
 }
 function native(rect) {
  const el=new Element('button');el.textContent='Ask ChatGPT';el.rect=rect;natives.push(el);
  for(const observer of [...observers])observer.callback([{target:doc.documentElement,addedNodes:[el]}]);
  return el;
 }
 return {ctx,state,doc,win,navigation,advance,select,native,host,button,sent,responses,timers,observers};
}

test('a late native quote toolbar is followed, then the temporary observer disconnects',async()=>{
 const f=fixture();await f.select('first synthetic task');
 const before=f.host().getBoundingClientRect();
 assert.equal(f.observers.size,1);
 await f.advance(800);
 const native=f.native(box(300,155,110,32));
 await f.advance(81);
 const after=f.host().getBoundingClientRect();
 assert.equal(after.left,native.rect.right+6);
 assert.ok(Math.abs(after.top-(native.rect.top+(native.rect.height-after.height)/2))<=1);
 assert.notEqual(after.left,before.left);
 await f.advance(3000);
 assert.equal(f.observers.size,0);
});

test('Escape cancels queued selection work and does not revive the same range on resize',async()=>{
 const f=fixture();
 await f.doc.emit('selectionchange');await f.advance(50);
 await f.doc.emit('keydown',{key:'Escape'});await f.advance(5000);
 assert.equal(f.host(),undefined);
 await f.win.emit('resize');await f.doc.emit('keyup',{key:'Escape'});await f.advance(200);
 assert.equal(f.host(),undefined);
 await f.select('a new selected range',4);
 assert.equal(f.host().hidden,false);
 await f.doc.emit('keydown',{key:'Escape'});await f.advance(5000);
 assert.equal(f.host().hidden,true);
 assert.equal(f.observers.size,0);
 assert.equal(f.timers.size,0);
});

test('failed opening stays actionable until retry or a new selection',async()=>{
 const f=fixture();await f.select('first synthetic task');
 f.responses.push(Promise.resolve({ok:false,code:'SIDEPANEL_OPEN_FAILED'}));
 await f.button().emit('click');
 assert.equal(f.button().textContent,'打开失败，点击重试');
 assert.equal(f.button().disabled,false);
 await f.advance(5000);await f.win.emit('scroll');await f.advance(121);
 assert.equal(f.button().textContent,'打开失败，点击重试');
 assert.equal(f.host().hidden,false);
 await f.button().emit('click');
 assert.equal(f.sent.length,2);
 assert.equal(f.host().hidden,true);
 await f.win.emit('resize');await f.advance(121);
 assert.equal(f.host().hidden,true);
 await f.select('another selected task',3);
 assert.equal(f.button().textContent,'ChatFlow选文');
});

test('placement uses actual error dimensions and flips within a resized viewport',async()=>{
 const f=fixture();await f.select('first synthetic task');
 f.native(box(240,170,70,32));await f.advance(81);
 f.responses.push(Promise.resolve({ok:false}));
 await f.button().emit('click');
 f.ctx.innerWidth=320;f.ctx.innerHeight=420;f.state.scale=2.6;
 await f.win.emit('resize');await f.advance(121);
 const rect=f.host().getBoundingClientRect();
 assert.ok(rect.left>=10);
 assert.ok(rect.right<=310);
 assert.ok(rect.top>=10&&rect.bottom<=410);
 assert.equal(f.button().textContent,'打开失败，点击重试');
});

test('click rechecks text, range, source and generation before dispatch',async()=>{
 for(const mutate of [
  f=>{f.state.text='replaced text';},
  f=>{f.state.startOffset+=1;},
  f=>{f.state.startContainer={};},
  f=>{f.state.generation+=1;},
  f=>{f.state.url='https://chatgpt.com/c/selection_beta_1234';f.ctx.location.href=f.state.url;}
 ]) {
  const f=fixture();await f.select('first synthetic task');mutate(f);
  await f.button().emit('click');
  assert.equal(f.sent.length,0,'a stale click must not dispatch its old selection');
 }
 const f=fixture();await f.select('current selected task',7);await f.button().emit('click');
 assert.equal(f.sent[0].text,'current selected task');
 assert.equal(f.sent[0].generation,1);
 assert.equal(f.sent[0].url,URL);
});

test('an old async success or failure cannot hide or relabel a newer selection',async()=>{
 for(const response of [{ok:true},{ok:false,code:'OLD_FAILURE'}]) {
  const f=fixture();await f.select('older task');
  const pending=deferred();f.responses.push(pending.promise);
  const old=f.button().emit('click');
  assert.equal(f.button().disabled,true);
  await f.select('newer task',5);
  assert.equal(f.button().disabled,false);
  pending.resolve(response);await old;
  assert.equal(f.host().hidden,false);
  assert.equal(f.button().textContent,'ChatFlow选文');
  await f.button().emit('click');
  assert.equal(f.sent.at(-1).text,'newer task');
 }
});

test('Escape while opening detaches late results without restoring the action',async()=>{
 const f=fixture();await f.select('pending task');
 const pending=deferred();f.responses.push(pending.promise);
 const opening=f.button().emit('click');
 await f.doc.emit('keydown',{key:'Escape'});
 pending.reject(Error('late failure'));await opening;
 await f.advance(5000);await f.win.emit('resize');await f.advance(121);
 assert.equal(f.host().hidden,true);
 assert.equal(f.observers.size,0);
});

test('a second isolated injection never mounts another same-document selection action',async()=>{
 const f=fixture({foreignHost:true});
 await f.select('selection from another injected build');
 assert.equal(f.doc.documentElement.children.filter(el=>el.id==='chatflow-selected-action').length,1);
 assert.equal(f.sent.length,0);
 assert.equal(f.host().shadowRoot,undefined,'the new injection must leave the existing owner untouched');
});
