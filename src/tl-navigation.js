/* Bounded message navigation. Position estimates never certify message identity. MIT. */
(() => {
  'use strict';
  const BUDGET = Object.freeze({elapsedMs:12000, writes:60, scans:128, stableFrames:4, epsilon:2});
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function logicalPosition(box, reverse) {
    const max = Math.max(0, box.scrollHeight - box.clientHeight);
    return clamp(box.scrollTop + (reverse ? max : 0), 0, max);
  }
  function physicalPosition(box, logical, reverse) {
    const max = Math.max(0, box.scrollHeight - box.clientHeight);
    return clamp(logical, 0, max) - (reverse ? max : 0);
  }
  // Adapted from ChatTrail evaluateInitialJumpReadiness / evaluateScrollCorrection,
  // f894aa82440281dc2f99e2427dd5f67d6a0c6efc. See THIRD_PARTY_NOTICES.md.
  function stable(previous, next, epsilon = BUDGET.epsilon) {
    return !!previous && [previous.top,previous.height,previous.anchor,next.top,next.height,next.anchor].every(Number.isFinite) &&
      Math.abs(next.top - previous.top) <= epsilon && Math.abs(next.height - previous.height) <= epsilon &&
      Math.abs(next.anchor - previous.anchor) <= epsilon;
  }
  /** Waits for a render opportunity; abort always wins over a late timer/frame. */
  function pause(signal) {
    return new Promise(resolve => {
      if (signal?.aborted) {resolve(); return;}
      let done = false, timer = null, frame = null;
      const finish = () => {
        if (done) return; done = true;
        if (timer !== null) clearTimeout(timer);
        if (frame !== null) globalThis.cancelAnimationFrame?.(frame);
        signal?.removeEventListener('abort', finish); resolve();
      };
      signal?.addEventListener('abort', finish, {once:true});
      timer = setTimeout(finish, 100);
      if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(finish);
    });
  }
  /**
   * @param {object} options Functions resolve/mounted return current scoped DOM only.
   * @returns {Promise<object>} Explicit matched/observed/cancelled/not_found/timeout evidence.
   */
  async function navigate({resolve,mounted,scrollContainer,assertCurrent,targetIndex,total,signal,now=()=>performance.now(),wait=pause}) {
    const started = now(), stats = {writes:0,scans:0,elapsedMs:0};
    const touched = new Map();
    let previous = null, stableFrames = 0, stalled = 0, lastSignature = null;
    function guard() {if (signal?.aborted) return false; assertCurrent(); return true;}
    const result = (state, extra={}) => ({state,...extra,stats:{...stats,elapsedMs:Math.max(0,now()-started)}});
    function measure(el, box) {return {top:box.scrollTop,height:box.scrollHeight,anchor:el.getBoundingClientRect().top};}
    function own(box) {
      if (!touched.has(box) && box.style) {
        touched.set(box, [box.style.getPropertyValue('overflow-anchor'),box.style.getPropertyPriority('overflow-anchor')]);
        box.style.setProperty('overflow-anchor','none');
      }
    }
    function write(box, top) {
      if (!guard() || stats.writes >= BUDGET.writes) return false;
      own(box); stats.writes += 1;
      box.scrollTo({top,behavior:'instant'}); return true;
    }
    try {
      while (now()-started < BUDGET.elapsedMs && stats.scans < BUDGET.scans) {
        if (!guard()) return result('cancelled');
        stats.scans += 1;
        const found = resolve();
        if (found) {
          const box = scrollContainer(found.el);
          if (!box || box.clientHeight <= 0) return result('not_found');
          const targetRect = found.el.getBoundingClientRect(), boxRect = box===globalThis.document?.scrollingElement?{top:0,height:box.clientHeight}:box.getBoundingClientRect();
          // Tall answers align their start; centering a huge answer can hide its beginning.
          const delta = targetRect.height > box.clientHeight ? targetRect.top-boxRect.top-16 :
            targetRect.top+targetRect.height/2-boxRect.top-boxRect.height/2;
          const reverse = getComputedStyle(box).flexDirection === 'column-reverse';
          const max = Math.max(0,box.scrollHeight-box.clientHeight);
          const top = clamp(box.scrollTop+delta,reverse?-max:0,reverse?0:max);
          if (Math.abs(top-box.scrollTop)>BUDGET.epsilon) {
            if (!write(box,top)) return result(signal?.aborted?'cancelled':'not_found');
            stableFrames = 0; previous = null;
          } else {
            const next = measure(found.el,box);
            stableFrames = stable(previous,next) ? stableFrames+1 : 0; previous = next;
            if (stableFrames >= BUDGET.stableFrames) {
              if (!guard()) return result('cancelled');
              const final = resolve();
              if (final?.el === found.el && targetRect.bottom>boxRect.top && targetRect.top<boxRect.top+box.clientHeight) return result(found.confidence==='verified_message_id'?'matched':'observed', {confidence:found.confidence,el:found.el});
              stableFrames=0; previous=null;
            }
          }
        } else {
          previous=null; stableFrames=0;
          const rows = mounted();
          if (!rows.length || !Number.isInteger(targetIndex) || targetIndex<0) return result('not_found');
          const nearest = rows.reduce((a,b)=>Math.abs(a.index-targetIndex)<=Math.abs(b.index-targetIndex)?a:b);
          const box = scrollContainer(nearest.el);
          if (!box || box.clientHeight<=0 || stats.writes>=BUDGET.writes) return result('not_found');
          const reverse = getComputedStyle(box).flexDirection==='column-reverse';
          const max = Math.max(0,box.scrollHeight-box.clientHeight), current = logicalPosition(box,reverse);
          const signature = rows.map(row=>row.index).join(',')+':'+Math.round(current)+':'+Math.round(max);
          stalled = signature===lastSignature?stalled+1:0; lastSignature=signature;
          if (stalled>=4) return result('not_found');
          const distance=targetIndex-nearest.index;
          let step=Math.sign(distance)*Math.max(120,box.clientHeight*.85);
          // Coarse estimates only accelerate acquisition. resolve() still owns success.
          const far = Math.abs(distance)>rows.length*2;
          let wanted = far && total>1 ? max*targetIndex/(total-1) : current+step;
          if (Math.abs(wanted-current)<2) wanted=current+step;
          if (!write(box,physicalPosition(box,wanted,reverse))) return result('cancelled');
        }
        await wait(signal);
      }
      return result(signal?.aborted?'cancelled':now()-started>=BUDGET.elapsedMs?'timeout':'not_found');
    } finally {
      for (const [box,[value,priority]] of touched) {
        // Do not undo a third-party change made after our own write.
        if (box.style.getPropertyValue('overflow-anchor')==='none') {
          if (value) box.style.setProperty('overflow-anchor',value,priority); else box.style.removeProperty('overflow-anchor');
        }
      }
    }
  }
  globalThis.TLNavigation=Object.freeze({BUDGET,logicalPosition,physicalPosition,stable,navigate});
})();
