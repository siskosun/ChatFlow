/* ChatFlow Saved Passages. Deterministic, local-only anchors. */
(() => {
 'use strict';
 const C=globalThis.TLCore;
 const check=C.check;
 const hash=value=>new C.SHA256().update(typeof value==='string'?value:JSON.stringify(value)).hex();
 const cleanSnapshot=snapshot=>C.persistedSnapshot(snapshot);
 function snapshotHash(snapshot){return hash(cleanSnapshot(snapshot));}
 function messageHash(message){
  check(message&&typeof message.id==='string'&&typeof message.nodeId==='string','INVALID_PASSAGE_MESSAGE');
  return hash({id:message.id,nodeId:message.nodeId,role:message.role,text:String(message.text||'')});
 }
 function create({passageId,captureId,snapshot,message,text,startOffset,endOffset,color='yellow',createdAt=Date.now()}){
  check(typeof captureId==='string'&&captureId.length>0,'INVALID_PASSAGE_CAPTURE');
  check(snapshot?.schema==='threadline.snapshot/1'&&snapshot.source?.conversationId,'INVALID_PASSAGE_SNAPSHOT');
  check(message&&snapshot.messages.some(m=>m.id===message.id&&m.nodeId===message.nodeId),'PASSAGE_MESSAGE_NOT_IN_SNAPSHOT');
  const body=String(message.text||''),selected=String(text||'');
  check(selected.length>0&&selected.length<=100000&&Number.isSafeInteger(startOffset)&&Number.isSafeInteger(endOffset)&&startOffset>=0&&endOffset>startOffset&&endOffset<=body.length,'INVALID_PASSAGE_RANGE');
  check(body.slice(startOffset,endOffset)===selected,'PASSAGE_TEXT_OFFSET_MISMATCH');
  const occurrence=occurrences(body,selected).findIndex(x=>x.start===startOffset);
  check(occurrence>=0,'PASSAGE_OCCURRENCE_NOT_FOUND');
  check(['yellow','green','blue','pink'].includes(color),'INVALID_PASSAGE_COLOR');
  return{
   schema:'chatflow.passage/1',passageId:passageId||C.id(),captureId,
   snapshotHash:snapshotHash(snapshot),conversationId:snapshot.source.conversationId,
   messageId:message.id,nodeId:message.nodeId,messageHash:messageHash(message),
   role:message.role,text:selected,prefix:body.slice(Math.max(0,startOffset-160),startOffset),
   suffix:body.slice(endOffset,endOffset+160),startOffset,endOffset,occurrence,
   color,status:'anchored',createdAt,updatedAt:createdAt
  };
 }
 function occurrences(body,text){
  const out=[];let from=0;
  while(from<=body.length-text.length){
   const start=body.indexOf(text,from);if(start<0)break;
   out.push({start,end:start+text.length});from=start+1;
  }
  return out;
 }
 function commonSuffix(a,b){let n=0,max=Math.min(a.length,b.length);while(n<max&&a[a.length-1-n]===b[b.length-1-n])n++;return n;}
 function commonPrefix(a,b){let n=0,max=Math.min(a.length,b.length);while(n<max&&a[n]===b[n])n++;return n;}
 function resolve(record,snapshot){
  check(record?.schema==='chatflow.passage/1'&&snapshot?.schema==='threadline.snapshot/1','INVALID_PASSAGE_RESOLUTION');
  if(snapshot.source?.conversationId!==record.conversationId)return{status:'stale',reason:'CONVERSATION_CHANGED',candidates:[]};
  const matches=snapshot.messages.filter(m=>m.id===record.messageId&&m.nodeId===record.nodeId);
  if(matches.length!==1)return{status:matches.length?'ambiguous':'stale',reason:matches.length?'DUPLICATE_MESSAGE_IDENTITY':'MESSAGE_NOT_FOUND',candidates:[]};
  const message=matches[0],body=String(message.text||'');
  if(messageHash(message)===record.messageHash&&body.slice(record.startOffset,record.endOffset)===record.text){
   return{status:'anchored',reason:'EXACT_MESSAGE_HASH_AND_OFFSET',message,startOffset:record.startOffset,endOffset:record.endOffset,candidates:[{start:record.startOffset,end:record.endOffset,score:Infinity}]};
  }
  const candidates=occurrences(body,record.text).map((range,index)=>({
   ...range,index,
   score:commonSuffix(record.prefix||'',body.slice(Math.max(0,range.start-160),range.start))+
    commonPrefix(record.suffix||'',body.slice(range.end,range.end+160))
  }));
  if(!candidates.length)return{status:'stale',reason:'PASSAGE_TEXT_NOT_FOUND_IN_SOURCE_MESSAGE',message,candidates:[]};
  if(candidates.length===1)return{status:'anchored',reason:'UNIQUE_EXACT_TEXT_IN_SOURCE_MESSAGE',message,...candidates[0],candidates};
  const ranked=[...candidates].sort((a,b)=>b.score-a.score);
  if(ranked[0].score>=8&&ranked[0].score>ranked[1].score){
   return{status:'anchored',reason:'UNIQUE_CONTEXT_MATCH',message,...ranked[0],candidates};
  }
  return{status:'ambiguous',reason:'MULTIPLE_UNRESOLVED_OCCURRENCES',message,candidates};
 }
 globalThis.TLPassages=Object.freeze({create,resolve,snapshotHash,messageHash,occurrences});
})();