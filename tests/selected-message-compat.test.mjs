import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('src/tl-page-scope.js','utf8');

function fixture() {
 class Node {}
 class Element extends Node {
  constructor(tag, attrs={}) {super();this.tag=tag;this.attrs=attrs;this.parentElement=null;this.children=[];this.visible=true;this.isConnected=true;}
  append(child){child.parentElement=this;this.children.push(child);return child;}
  getClientRects(){return this.visible?[{}]:[];}
  getAttribute(key){return this.attrs[key]??null;}
  hasAttribute(key){return Object.hasOwn(this.attrs,key);}
  matches(selector){return selector.split(',').some(part=>{
   part=part.trim();
   if(part===this.tag)return true;
   const attr=/^\[([^\]\^=]+)(\^?=)?(?:\"([^\"]+)\")?\]$/.exec(part);
   if(!attr)return false;
   const value=this.attrs[attr[1]];
   return value!==undefined&&(attr[2]===undefined||
     (attr[2]==='^='?String(value).startsWith(attr[3]):value===attr[3]));
  });}
  closest(selector){for(let el=this;el;el=el.parentElement){if(el.matches(selector))return el;}return null;}
  contains(node){for(let el=node;el;el=el.parentElement)if(el===this)return true;return false;}
  querySelectorAll(selector){const all=[];function walk(root){for(const c of root.children){if(c instanceof Element){if(c.matches(selector))all.push(c);walk(c);}}}walk(this);return all;}
 }
 class TextNode extends Node {constructor(parent){super();this.parentElement=parent;}}
 const main = new Element('main'), turn1=main.append(new Element('article',{'data-testid':'conversation-turn-1'}));
 const turn2=main.append(new Element('article',{'data-testid':'conversation-turn-2'}));
 const body1=turn1.append(new Element('div')), body2=turn2.append(new Element('div'));
 const text1=new TextNode(body1),text2=new TextNode(body2);
 let selectedText='任务文本',anchor=text1,focus=text1,legacy=[];
 const state={main,turn1,turn2,body1,body2,text1,text2,legacy,
  setSelection(a,b,t='任务文本'){anchor=a;focus=b;selectedText=t;},
  setLegacy(value){legacy=value;},
  selection(){return {anchorNode:anchor,focusNode:focus,isCollapsed:false,toString:()=>selectedText};}};
 const ctx=vm.createContext({Node,Element,document:{querySelectorAll:selector=>selector==='.thread-scroll-container'?legacy:selector==='main'?[main]:[],documentElement:null},
  location:{href:'https://chatgpt.com/c/test-0123456789',origin:'https://chatgpt.com',pathname:'/c/test-0123456789'},
  getComputedStyle:()=>({display:'block',visibility:'visible'}),
  getSelection:()=>state.selection(),
  TLCore:{chatUrl:url=>({conversationId:url.split('/c/')[1]})}});
 vm.runInContext(source,ctx);
 return {state,scope:ctx.TLPageScope,Element};
}

test('modern ChatGPT conversation-turn selection becomes an unverified, user-controlled draft',()=>{
 const {scope}=fixture();const selection=scope.selectedMessage();
 assert.equal(selection.status,'selected');assert.equal(selection.text,'任务文本');
 assert.equal(selection.evidence,'unverified');assert.equal(selection.messageId,null);
 assert.equal(selection.url,'https://chatgpt.com/c/test-0123456789');
});
test('fallback works despite an unrelated legacy thread being visible',()=>{
 const {scope,state,Element}=fixture();
 const legacy=new Element('section');legacy.append(new Element('i'));
 state.setLegacy([legacy]);
 assert.equal(scope.selectedMessage().status,'selected');
 assert.equal(scope.selectedMessage().evidence,'unverified');
});
test('cross-message, composer, mismatch-marker and invisible selections are refused',()=>{
 const {scope,state,Element}=fixture();
 state.setSelection(state.text1,state.text2);
 assert.equal(scope.selectedMessage().reason,'single-message');
 state.setSelection(state.text1,state.text1);
 state.body1.attrs['contenteditable']='true';
 assert.equal(scope.selectedMessage().reason,'single-message');
 delete state.body1.attrs['contenteditable'];
 state.turn1.attrs['data-chatgpt-selection-conversation-id']='other-chat';
 assert.equal(scope.selectedMessage().reason,'scope-unavailable');
 delete state.turn1.attrs['data-chatgpt-selection-conversation-id'];
 state.turn1.visible=false;
 assert.equal(scope.selectedMessage().reason,'single-message');
});
test('long selections are not returned in event payload',()=>{
 const {scope,state}=fixture();state.setSelection(state.text1,state.text1,'x'.repeat(20001));
 const got=scope.selectedMessage();assert.equal(got.tooLong,true);assert.equal(got.text,'');
 assert.equal(got.length,20001);
});
