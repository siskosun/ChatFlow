/* Source-bound rendered headings. No Markdown rendering or host DOM mutation. MIT. */
(() => {
  'use strict';
  const C = globalThis.TLCore;
  const LIMITS = Object.freeze({headings:256, text:1000, message:1024 * 1024});
  const SELECTOR = 'h1,h2,h3,h4,h5,h6';
  const EXCLUDED = 'pre,code,[hidden],[inert],[aria-hidden="true"],.sr-only,[data-chatflow-ui]';
  const normalize = text => String(text || '').replace(/\s+/g, ' ').trim();
  const hash = value => new C.SHA256().update(value).hex();
  const cache = new WeakMap();
  // MutationObserver.takeRecords() also detects edits made earlier in the same task,
  // before its asynchronous callback fires. Cache only identity-verified roots.
  function entryCache(root,isVisible){
    const record=cache.get(root);
    if(!record||record.visible!==isVisible||!record.observer)return null;
    if(record.observer.takeRecords().length)record.dirty=true;
    if(record.dirty||record.entries.some(entry=>!isVisible(entry.element)))return null;
    return record.entries;
  }
  function remember(root,isVisible,entries){
    if(typeof MutationObserver!=='function')return entries;
    let record=cache.get(root);
    if(!record){record={observer:null,entries:[],dirty:false,visible:isVisible};cache.set(root,record);}
    if(!record.observer){
      record.observer=new MutationObserver(()=>{record.dirty=true;});
      record.observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','inert','aria-hidden','class','style']});
    }else record.observer.takeRecords();
    record.entries=entries;record.visible=isVisible;record.dirty=false;
    return entries;
  }
  /** Call only with an identity-verified assistant message, never document/body. */
  function read(root, isVisible) {
    C.check(root?.isConnected && typeof isVisible === 'function', 'HEADING_SOURCE_UNAVAILABLE');
    const previous=entryCache(root,isVisible);if(previous)return previous;
    const text = root.textContent || '';
    C.check(text.length <= LIMITS.message, 'HEADING_MESSAGE_LIMIT');
    const nodes = root.querySelectorAll(SELECTOR);
    C.check(nodes.length <= LIMITS.headings, 'HEADING_COUNT_LIMIT');
    const entries = [], occurrences = new Map();
    for (const element of nodes) {
      if (!root.contains(element) || element.closest(EXCLUDED) || !isVisible(element)) continue;
      const title = normalize(element.textContent);
      if (!title) continue;
      C.check(title.length <= LIMITS.text, 'HEADING_TEXT_LIMIT');
      const level = Number(element.tagName.slice(1));
      if (!Number.isInteger(level) || level < 1 || level > 6) continue;
      const key = JSON.stringify([level, title]), occurrence = occurrences.get(key) || 0;
      occurrences.set(key, occurrence + 1);
      entries.push({level, text:title, occurrence, element});
    }
    const messageHash = hash(text);
    const outlineHash = hash(JSON.stringify(entries.map(({level,text,occurrence}) => [level,text,occurrence])));
    return remember(root,isVisible,entries.map((entry,index) => ({...entry,index,messageHash,outlineHash})));
  }
  /** A descriptor contains no DOM handle. Re-rendering is allowed; changed content is not guessed. */
  function descriptor(entry) {
    const {index,level,text,occurrence,messageHash,outlineHash} = entry;
    return {index,level,text,occurrence,messageHash,outlineHash};
  }
  function resolve(root, saved, isVisible) {
    if (!saved || !Number.isInteger(saved.index) || saved.index < 0) return null;
    try{
      const entry = read(root,isVisible)[saved.index];
      return entry && ['level','text','occurrence','messageHash','outlineHash'].every(key => entry[key] === saved[key]) ? entry.element : null;
    }catch{return null;}
  }
  globalThis.TLHeadings = Object.freeze({LIMITS,read,descriptor,resolve});
})();
