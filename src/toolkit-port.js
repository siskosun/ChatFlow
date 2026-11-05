/* Adapted portions of GPT-Conversation-Toolkit (MIT), copyright 2026 bujue3709.
 * Pinned 119d3728bc4cb583d75da72b067a74b1dce90d60. See THIRD_PARTY_NOTICES.md.
 * Ports: search.js/getSearchMatchRanges, export-normalizer.js/groupExportMessagesIntoTurns,
 * export-formatters.js and virtualized-jump.js/getDomMessageIdCandidates.
 * Safety changes: preserve stable source IDs; bounded matches; Unicode offsets;
 * no fuzzy jump, no host DOM replacement, no global source collection.
 */
(() => {
 'use strict';
 const exportText=message=>globalThis.TLCore?.exportMessageText?.(message)??message.text??'';
  const formatConversationExportJson=payload=>JSON.stringify(payload,null,2);
 const formatConversationExportMarkdown=payload=>{
  const lines=[];if(payload?.title)lines.push(`# ${payload.title}`,'');
  (payload?.messages||[]).forEach(message=>{
   const role=message.role?message.role[0].toUpperCase()+message.role.slice(1):'Message';
   const text=payload?.source==='api'&&typeof message.__markdown==='string'?message.__markdown:exportText(message);
   lines.push(`## ${role}`,'');if(text)lines.push(text,'');
  });return lines.join('\n').trimEnd()+'\n';
 };
 const formatConversationExportText=payload=>(payload?.messages||[]).map(message=>{const role=message.role||'message';return`[${role}]\n${exportText(message)}`.trim();}).filter(Boolean).join('\n\n');
 function getSearchMatchRanges(text,query){
  // Upstream lowercasing may change UTF-16 length (e.g. dotted I). Map offsets.
  text=String(text||'');query=String(query||'').toLowerCase();if(!query)return[];
  const starts=[],ends=[];let lowerText='',offset=0;
  for(const cp of text){const lower=cp.toLowerCase();for(let n=0;n<lower.length;n++){starts.push(offset);ends.push(offset+cp.length);}lowerText+=lower;offset+=cp.length;}
  const ranges=[];let index=lowerText.indexOf(query);
  while(index!==-1&&ranges.length<10000){ranges.push({start:starts[index],end:ends[index+query.length-1]});index=lowerText.indexOf(query,index+query.length);}
  return ranges;
 }
 function groupExportMessagesIntoTurns(messages){
  const turns=[];let currentTurn=null;
  (Array.isArray(messages)?messages:[]).forEach((message,messageOffset)=>{
   const role=message?.role||'unknown';
   if(role==='user'||!currentTurn){currentTurn={id:`turn-${turns.length+1}`,order:turns.length+1,messages:[],userMessages:[],assistantMessages:[]};turns.push(currentTurn);}
   const sourceIndex=Number.isFinite(message?.sourceIndex)?message.sourceIndex:Number.isFinite(message?.index)?message.index:messageOffset+1;
   const turnMessage={message,sourceIndex};currentTurn.messages.push(turnMessage);
   if(role==='user')currentTurn.userMessages.push(turnMessage);else if(role==='assistant')currentTurn.assistantMessages.push(turnMessage);
  });return turns;
 }
 function getDomMessageIdCandidates(node){
  if(!(node instanceof HTMLElement))return[];const candidates=[];
  const addCandidate=value=>{const text=typeof value==='string'?value.trim():'';if(text&&!candidates.includes(text))candidates.push(text);};
  for(const attr of ['data-message-id','data-turn-key','data-chatgpt-selection-message-id','data-turn-id','data-turn-id-container','data-node-id']){
   addCandidate(node.getAttribute(attr));addCandidate(node.querySelector('['+attr+']')?.getAttribute(attr));
  }
  for(const el of [node,node.querySelector('[data-chatgpt-search-message-ids]')].filter(Boolean)){
   const raw=el.getAttribute('data-chatgpt-search-message-ids')||'';
   if(raw.length<=8192){const tokens=raw.trim().split(/\s+/).filter(Boolean);if(tokens.length<=32)for(const id of tokens)addCandidate(id);}
  }return candidates;
 }
 function nextMatchIndex(cursor,step,count){if(!Number.isInteger(count)||count<1)return-1;if(!Number.isInteger(cursor)||cursor<0||cursor>=count)return step<0?count-1:0;return(cursor+(step<0?-1:1)+count)%count;}
 function exportSelected(messages,selectedIds,source,title,format){
  const wanted=new Set(selectedIds),turns=groupExportMessagesIntoTurns(messages);
  if(!wanted.size||[...wanted].some(id=>!turns.some(t=>t.id===id)))throw new Error('NO_EXPORT_TURNS');
  const selected=turns.filter(t=>wanted.has(t.id)).flatMap(t=>t.messages.map(({message})=>({id:message.id,nodeId:message.nodeId||null,role:message.role,text:message.text,...(message.sourceReferences?.length?{sourceReferences:message.sourceReferences}:{})})));
  const payload={schema:'chatflow.selected-turns/1',title,scope:'selected_turns_not_full_archive',source,sourceMessageCount:messages.length,messages:selected};
  if(format==='json')return formatConversationExportJson(payload);
  const header=['Source: '+source.url,'Scope: selected turns; not a restorable archive.','Message IDs: '+selected.map(m=>m.id).join(', '),''].join('\n');
  if(format==='txt')return header+'\n'+formatConversationExportText(payload);
  if(format==='md')return header+'\n'+formatConversationExportMarkdown(payload);
  throw new Error('UNSUPPORTED_EXPORT_FORMAT');
 }
 globalThis.CFToolkit=Object.freeze({nextMatchIndex,getSearchMatchRanges,groupExportMessagesIntoTurns,getDomMessageIdCandidates,exportSelected,formatConversationExportJson,formatConversationExportMarkdown,formatConversationExportText});
})();
