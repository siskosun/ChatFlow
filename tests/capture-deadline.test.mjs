import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
async function captureCase({external=false}={}){
 let now=1000000,listener,finished;
 const completion=new Promise(resolve=>{finished=resolve;});
 const events=[],timers=[],assetCalls=[],sourceUrl='https://chatgpt.com/c/capture_deadline_1234';
 class Clock extends Date{static now(){return now;}}
 const conv={conversation_id:'capture_deadline_1234',title:'Synthetic deadline',current_node:'n1',mapping:{
  n1:{parent:null,children:[],message:{id:'msg1',author:{role:'user'},content:{parts:['one message']},metadata:{attachments:[{id:'file_deadline_1',name:'report.txt'}]}}}
 }};
 const fetch=async url=>{
  const u=String(url);
  if(u.endsWith('/api/auth/session'))return{ok:true,json:async()=>({accessToken:'synthetic-only'})};
  if(u.endsWith('/backend-api/conversation/capture_deadline_1234'))return{ok:true,json:async()=>conv};
  if(u.includes('/backend-api/files/download/')){
   assetCalls.push(u);now+=external?35000:assetCalls.length===1?50000:20000;
   return external?{ok:true,json:async()=>({download_url:'https://files.oaiusercontent.com/fake'})}:{ok:false,status:404};
  }
  throw Error('UNEXPECTED_FETCH_'+u);
 };
 const chrome={runtime:{id:'synthetic-extension',onMessage:{addListener(f){listener=f;}},async sendMessage(msg){
  events.push(msg);if(msg.type==='tl:finish'||msg.type==='tl:captureFailed')finished(msg.type);
  if(msg.type==='tl:snapshot')return{ok:true,data:{savedKeys:[]}};
  return{ok:true,data:{}};
 }}};
 const env=vm.createContext({URL,URLSearchParams,AbortController,Response,TextDecoder,TextEncoder,crypto:webcrypto,Date:Clock,fetch,chrome,
  location:{href:sourceUrl},document:{getElementById:()=>null,querySelectorAll:()=>[]},
  setTimeout:(fn,ms)=>{timers.push(ms);return timers.length;},clearTimeout:()=>{},setInterval:()=>{throw Error('NO_LIVE_CACHE');},clearInterval:()=>{}});
 for(const name of ['tl-core','tl-provider','tl-capture'])vm.runInContext(read('src/'+name+'.js'),env,{filename:name});
 let ack;listener({type:'tl:capture',nonce:'synthetic-nonce-abcdefghijklmnop',scope:'all',live:false,expectedSource:{origin:'https://chatgpt.com',conversationId:'capture_deadline_1234'}},{id:chrome.runtime.id},r=>{ack=r;});
 assert.equal(ack.ok,true);
 const outcome=await Promise.race([completion,new Promise((_,reject)=>setTimeout(()=>reject(Error('CAPTURE_STALLED')),2000))]);
 assert.equal(outcome,'tl:finish');
 return{events,timers,assetCalls,now};
}
test('one asset has one deadline across sequential same-origin URL attempts',async()=>{
 const x=await captureCase();
 assert.equal(x.assetCalls.length,2,'no third URL after cumulative 60-second timeout');
 assert.deepEqual(x.timers.slice(-2),[60000,10000],'second attempt inherits remaining budget');
 assert.ok(x.events.some(e=>e.type==='tl:assetFail'&&e.code==='ASSET_DOWNLOAD_TIMEOUT'));
 assert.equal(x.events.some(e=>e.type==='tl:assetEnd'),false);
});
test('external download inherits the original deadline',async()=>{
 const x=await captureCase({external:true}),handoff=x.events.find(e=>e.type==='tl:external');
 assert.ok(handoff);
 assert.equal(handoff.deadlineAt-x.now,25000,'metadata lookup used 35s of 60s');
 assert.equal(x.assetCalls.length,1);
});
