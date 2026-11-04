/* User-triggered ChatGPT tools. Bounded navigation; exact identity, no fuzzy jumps. MIT. */
(() => {
 'use strict';
 if(globalThis.CFPageToolsInstalled)return;globalThis.CFPageToolsInstalled=true;
 const C=TLCore,K=CFToolkit,api=chrome;let live=null;
 const n=(tag,text,attrs={})=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;};
 const canonical=()=>C.chatUrl(location.href).url;
 const current=s=>{try{return live===s&&!s.closed&&canonical()===s.url;}catch{return false;}};
 const ensure=s=>C.check(current(s),'TOOLS_SOURCE_CHANGED');
 function close(){const s=live;if(!s)return;s.closed=true;s.jump++;s.controller?.abort();clearInterval(s.routeWatch);s.host.remove();s.restoreFocus?.focus?.();live=null;}
 function nodes(){return [...document.querySelectorAll('[data-message-author-role],article[data-turn-key],[data-message-id]')].filter(e=>!e.closest('#chatflow-page-tools'));}
 function resolve(s,m){
  if(m.domNode?.isConnected&&m.idKnown===false)return m.domNode;
  const ids=new Set([m.id,m.nodeId].filter(Boolean)),found=nodes().filter(e=>K.getDomMessageIdCandidates(e).some(id=>ids.has(id)));
  // Nested wrappers for one identical message collapse to the innermost message.
  const inner=found.filter(e=>!found.some(other=>other!==e&&e.contains(other)));
  return inner.length===1?inner[0]:null;
 }
 function scroller(el){for(let e=el?.parentElement;e&&e!==document.body;e=e.parentElement){const css=getComputedStyle(e);if(/auto|scroll/.test(css.overflowY)&&e.scrollHeight>e.clientHeight+10)return e;}return document.scrollingElement;}
 async function jump(s,m){
  const token=++s.jump;s.status.textContent='\u6b63\u5728\u5b9a\u4f4d\u539f\u6d88\u606f\u2026';
  const byId=new Map();s.messages.forEach((x,i)=>{byId.set(x.id,i);if(x.nodeId)byId.set(x.nodeId,i);});
  for(let attempt=0;attempt<24;attempt++){
   ensure(s);if(token!==s.jump)return false;
   const exact=resolve(s,m);if(exact){exact.scrollIntoView({block:'center',behavior:'instant'});s.status.textContent='\u5df2\u5b9a\u4f4d\u5230\u539f\u6d88\u606f\uff08\u6309\u6d88\u606f\u8eab\u4efd\u5339\u914d\uff09\u3002';return true;}
   const visible=nodes().map(el=>({el,index:K.getDomMessageIdCandidates(el).map(id=>byId.get(id)).find(i=>i!==undefined)})).filter(x=>x.index!==undefined),target=s.messages.indexOf(m);
   if(!visible.length)break;
   const nearest=visible.reduce((a,b)=>Math.abs(a.index-target)<=Math.abs(b.index-target)?a:b),box=scroller(nearest.el);
   if(!box||box.clientHeight<1)break;
   let orientation=1;const first=visible[0],other=visible.find(x=>x.index!==first.index&&Math.abs(x.el.getBoundingClientRect().top-first.el.getBoundingClientRect().top)>2);
   if(other)orientation=Math.sign((other.index-first.index)*(other.el.getBoundingClientRect().top-first.el.getBoundingClientRect().top));
   const direction=Math.sign(target-nearest.index)*orientation;
   box.scrollBy({top:direction*Math.max(120,box.clientHeight*.85),behavior:'instant'});
   await new Promise(r=>setTimeout(r,240));
  }
  if(current(s)&&token===s.jump)s.status.textContent='\u9875\u9762\u672a\u6302\u8f7d\u76ee\u6807\u6d88\u606f\uff0c\u672a\u8df3\u8f6c\u5230\u76f8\u4f3c\u6587\u5b57\u3002\u53ef\u624b\u52a8\u6eda\u52a8\u540e\u91cd\u8bd5\u3002';return false;
 }
 async function json(s,path,request){
  ensure(s);C.check(s.request===request,'TOOLS_REQUEST_SUPERSEDED');const url=ChatFlowProviders.get('chatgpt').readEndpoint(path,C.chatUrl(s.url));
  const response=await fetch(url,{method:'GET',credentials:'include',redirect:'error',headers:request.token?{Authorization:'Bearer '+request.token}:{},cache:'no-store',signal:request.controller.signal});
  C.check(response.ok,'TOOLS_HTTP_'+response.status);const reader=response.body.getReader(),parts=[];let size=0;
  try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;C.check(size<=8*1024*1024,'TOOLS_RESPONSE_LIMIT');parts.push(r.value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
  ensure(s);C.check(s.request===request,'TOOLS_REQUEST_SUPERSEDED');return JSON.parse(await new Blob(parts).text());
 }
 function loadedMessages(){const seen=new Set(),out=[];for(const el of nodes()){
  const ids=K.getDomMessageIdCandidates(el),role=el.getAttribute('data-message-author-role')||el.querySelector('[data-message-author-role]')?.getAttribute('data-message-author-role');
  if(!['user','assistant'].includes(role))continue;const id=ids[0]||'loaded-'+out.length;
  if(seen.has(id)||out.some(m=>m.domNode.contains(el)||el.contains(m.domNode)))continue;seen.add(id);
  out.push({id,nodeId:null,role,text:el.innerText||el.textContent||'',domNode:el,idKnown:!!ids.length});
 }return out;}
 async function load(s){
  s.jump++;s.controller?.abort();const request={controller:new AbortController(),token:null};s.request=request;s.controller=request.controller;s.selected.clear();
  const timer=setTimeout(()=>request.controller.abort(),10000);let messages,coverage,label;
  s.list.replaceChildren();s.prev.disabled=s.next.disabled=true;s.matches=[];s.count.textContent='';
  s.status.textContent='\u6b63\u5728\u8bfb\u53d6\u5f53\u524d\u5bf9\u8bdd\u2026';
  try{const session=await json(s,'/api/auth/session',request);request.token=session.accessToken||null;
   const raw=await json(s,'/backend-api/conversation/'+encodeURIComponent(C.chatUrl(s.url).conversationId),request),snapshot=C.normalizeConversation(raw,s.url),byNode=new Map(snapshot.messages.map(m=>[m.nodeId,m]));
   messages=snapshot.active.map(id=>byNode.get(id)).filter(Boolean);C.check(messages.length,'TOOLS_NO_API_MESSAGES');coverage='api_accessible_branch';label='\u5f53\u524d\u53ef\u8bbf\u95ee\u5206\u652f'+(snapshot.integrity.issues.length?'\uff08\u6709\u5b8c\u6574\u6027\u63d0\u793a\uff09':'');
  }catch(e){if(!current(s)||s.request!==request)return;messages=loadedMessages();coverage='loaded_dom_only';label='\u4ec5\u5df2\u52a0\u8f7d\u6d88\u606f\uff1b\u5386\u53f2\u8986\u76d6\u4e0d\u5b8c\u6574';}
  finally{clearTimeout(timer);request.token=null;}
  if(!current(s)||s.request!==request)return;s.messages=messages;s.coverage=coverage;s.coverageLabel=label;
  s.coverageNode.textContent=label+' \u00b7 '+messages.length+' \u6761';s.status.textContent='';s.turns=K.groupExportMessagesIntoTurns(messages);render(s);
 }
 function render(s){
  s.list.replaceChildren();s.cursor=-1;const query=s.query.value.trim();
  const tooLong=query.length>200;s.query.setCustomValidity(tooLong?'搜索词超过 200 个字符，全文已保留。':'');s.query.setAttribute('aria-invalid',String(tooLong));
  if(tooLong){s.matches=[];s.prev.disabled=s.next.disabled=true;s.count.textContent='搜索词过长';s.status.textContent='搜索词超过 200 个字符，全文已保留。请缩短后搜索。';return;}
  if(s.status.textContent.startsWith('搜索词超过'))s.status.textContent='';
  s.matches=s.messages.filter(m=>query?K.getSearchMatchRanges(m.text,query).length:m.role==='user');
  s.count.textContent=query?s.matches.length+' \u6761\u547d\u4e2d':s.matches.length+' \u4e2a\u63d0\u95ee';
  s.prev.disabled=s.next.disabled=!s.matches.length;
  for(const m of s.matches.slice(0,200)){
   const row=n('div',null,{class:'row'}),turn=s.turns.find(t=>t.messages.some(x=>x.message===m)),check=n('input',null,{type:'checkbox','aria-label':'\u9009\u62e9\u6b64\u95ee\u7b54\u56de\u5408'});check.checked=s.selected.has(turn?.id);check.dataset.turnId=turn?.id||'';check.onchange=()=>{if(!turn)return;if(check.checked)s.selected.add(turn.id);else s.selected.delete(turn.id);for(const el of s.list.querySelectorAll('input[type=checkbox]'))el.checked=s.selected.has(el.dataset.turnId);};
   const b=n('button',null,{type:'button',title:m.text.slice(0,800)}),ranges=query?K.getSearchMatchRanges(m.text,query):[];
   const first=ranges[0],start=first?Math.max(0,first.start-30):0,end=Math.min(m.text.length,start+150);
   if(first&&first.end<=end){b.append(document.createTextNode(m.text.slice(start,first.start)),n('mark',m.text.slice(first.start,first.end)),document.createTextNode(m.text.slice(first.end,end)));}else b.textContent=m.text.slice(start,end)||'\uff08\u65e0\u6587\u672c\uff09';
   b.onclick=()=>{s.cursor=s.matches.indexOf(m);return jump(s,m).catch(()=>{s.status.textContent='\u6765\u6e90\u5df2\u6539\u53d8\uff0c\u8bf7\u91cd\u65b0\u6253\u5f00\u5de5\u5177\u3002';});};row.append(check,b);s.list.append(row);
  }
  if(s.matches.length>200)s.list.append(n('p','\u663e\u793a\u524d 200 \u6761\uff1b\u8bf7\u7f29\u5c0f\u641c\u7d22\u8303\u56f4\u3002'));
 }
 function show(url){
  C.check(canonical()===url,'TOOLS_SOURCE_CHANGED');close();const host=n('div',null,{id:'chatflow-page-tools'}),shadow=host.attachShadow({mode:'open'}),s={url,host,shadow,closed:false,jump:0,messages:[],turns:[],selected:new Set(),matches:[],cursor:-1,restoreFocus:document.activeElement};live=s;
  const style=n('style',`:host{all:initial;position:fixed;right:18px;top:80px;z-index:2147483646;width:min(340px,calc(100vw - 32px));font:14px/1.5 system-ui;color:#233442;color-scheme:light}*{box-sizing:border-box}.panel{background:#fff;border:1px solid #d3dce4;border-radius:16px;box-shadow:0 12px 44px #182e4524;padding:16px;max-height:calc(100vh - 160px);overflow:auto}header,.controls,.row{display:flex;gap:8px;align-items:center}header{justify-content:space-between;margin-bottom:12px}h2{font-size:16px;margin:0}button,input,select{font:inherit;color:inherit}button{min-height:44px;padding:8px 10px;border:1px solid #d6dfe6;border-radius:9px;background:#fff;cursor:pointer}button:disabled{opacity:.5}input[type=search],select{width:100%;padding:10px;border:1px solid #ccd7e0;border-radius:9px;margin:7px 0}input[type=checkbox]{flex:none;width:18px;height:18px}.row{border-bottom:1px solid #edf0f3}.row button{flex:1;text-align:left;border:0;overflow-wrap:anywhere;min-width:0}.controls{justify-content:space-between}.hint,small{color:#5d6d7c;font-size:12px}#list{max-height:38vh;overflow:auto;margin:8px 0}p{overflow-wrap:anywhere}details{margin-top:12px}summary{cursor:pointer;min-height:44px;padding-top:10px}mark{background:#fff0a4}button:focus-visible,input:focus-visible,summary:focus-visible,select:focus-visible{outline:2px solid #327aba;outline-offset:2px}@media(prefers-color-scheme:dark){:host{color:#e4edf4;color-scheme:dark}.panel,button,input[type=search],select{background:#1c2832;border-color:#425666}.hint,small{color:#c1ced8}.row{border-color:#3b4a57}mark{background:#6d581d;color:#fff}}`);
  const panel=n('section',null,{class:'panel',role:'dialog','aria-label':'\u5bf9\u8bdd\u641c\u7d22\u4e0e\u65f6\u95f4\u8f74'}),head=n('header'),x=n('button','\u00d7',{type:'button','aria-label':'\u5173\u95ed\u5bf9\u8bdd\u5de5\u5177'});x.onclick=close;head.append(n('h2','\u5bf9\u8bdd\u5bfc\u822a'),x);
  s.query=n('input',null,{type:'search',placeholder:'\u641c\u7d22\u5f53\u524d\u5bf9\u8bdd','aria-label':'\u641c\u7d22\u5f53\u524d\u5bf9\u8bdd'});s.query.oninput=()=>{s.jump++;render(s);};
  s.coverageNode=n('p',null,{class:'hint'});s.count=n('span');s.prev=n('button','\u4e0a\u4e00\u6761',{type:'button'});s.next=n('button','\u4e0b\u4e00\u6761',{type:'button'});
  for(const[b,step]of [[s.prev,-1],[s.next,1]])b.onclick=()=>{if(!s.matches.length)return;s.cursor=K.nextMatchIndex(s.cursor,step,s.matches.length);jump(s,s.matches[s.cursor]).catch(()=>{});};
  const controls=n('div',null,{class:'controls'});controls.append(s.prev,s.count,s.next);s.list=n('div',null,{id:'list'});s.status=n('p',null,{role:'status','aria-live':'polite',class:'hint'});
  const extra=n('details'),summary=n('summary','\u5bfc\u51fa\u6240\u9009\u56de\u5408\u4e0e\u516c\u5f0f\u590d\u5236'),format=n('select',null,{'aria-label':'\u5bfc\u51fa\u683c\u5f0f'});for(const f of ['md','json','txt'])format.add(new Option(f.toUpperCase(),f));
  const exportButton=n('button','\u5bfc\u51fa\u52fe\u9009\u56de\u5408',{type:'button'});exportButton.onclick=()=>{try{ensure(s);const content=K.exportSelected(s.messages,[...s.selected],{...C.chatUrl(url),coverage:s.coverage},document.title,format.value),objectUrl=URL.createObjectURL(new Blob([content],{type:format.value==='json'?'application/json':'text/plain;charset=utf-8'})),a=n('a',null,{href:objectUrl,download:'chatflow-selected-turns.'+format.value});a.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);s.status.textContent='\u5df2\u53d1\u8d77\u6240\u9009\u56de\u5408\u4e0b\u8f7d\uff1b\u4e0d\u662f\u5168\u6587\u6863\u6848\u5907\u4efd\u3002';}catch(e){s.status.textContent=e.message==='NO_EXPORT_TURNS'?'\u8bf7\u5148\u52fe\u9009\u81f3\u5c11\u4e00\u4e2a\u56de\u5408\u3002':'\u65e0\u6cd5\u5bfc\u51fa\uff1a'+e.message;}};
  const formulas=n('select',null,{'aria-label':'\u9009\u62e9\u53ef\u590d\u5236\u7684 LaTeX \u516c\u5f0f'}),copyFormula=n('button','\u590d\u5236 LaTeX',{type:'button'});
  extra.addEventListener('toggle',()=>{if(!extra.open)return;formulas.replaceChildren(new Option('\u9009\u62e9\u9875\u9762\u4e2d\u7684\u516c\u5f0f',''));for(const a of [...document.querySelectorAll('annotation[encoding="application/x-tex"],annotation[encoding="application/x-latex"]')].slice(0,100)){const text=a.textContent;if(text&&text.length<=20000)formulas.add(new Option(text.slice(0,80),text));}});
  copyFormula.onclick=async()=>{try{ensure(s);C.check(formulas.value,'NO_FORMULA');await navigator.clipboard.writeText(formulas.value);s.status.textContent='LaTeX \u5df2\u590d\u5236\u3002';}catch(e){s.status.textContent=e.message==='NO_FORMULA'?'\u8bf7\u9009\u62e9\u6709\u6e90\u7801\u7684\u516c\u5f0f\u3002':'\u526a\u8d34\u677f\u4e0d\u53ef\u7528\uff0c\u8bf7\u624b\u52a8\u590d\u5236\u4e0b\u65b9\u6587\u672c\u3002';fallback.value=formulas.value;fallback.hidden=false;fallback.focus();fallback.select();}};const fallback=n('textarea',null,{readonly:'',hidden:'','aria-label':'\u624b\u52a8\u590d\u5236 LaTeX'});
  const refresh=n('button','\u5237\u65b0\u5f53\u524d\u5bf9\u8bdd',{type:'button'});refresh.onclick=()=>{s.jump++;load(s);};
  extra.append(summary,format,exportButton,n('p','\u53ea\u5bfc\u51fa\u52fe\u9009\u56de\u5408\u3002\u6587\u4ef6\u5305\u542b\u6765\u6e90\u8eab\u4efd\u4e0e\u8986\u76d6\u8303\u56f4\u3002',{class:'hint'}),formulas,copyFormula,fallback,refresh);panel.append(head,s.query,s.coverageNode,controls,s.list,s.status,extra);shadow.append(style,panel);document.documentElement.append(host);s.query.focus();panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}});s.routeWatch=setInterval(()=>{if(!current(s))close();},400);load(s);return s;
 }
 api.runtime.onMessage.addListener((msg,sender,reply)=>{if(msg?.type!=='tl:showTools'||sender.id!==api.runtime.id)return false;try{show(msg.url);reply({ok:true});}catch{reply({ok:false});}return false;});
})();
