import { viewport, clampIsland } from './viewport.js';

// The original draggable coordinate key is intentionally retained for upgrades.
const POSITION_KEY = 'capricorn_island_position';
const SETTINGS_KEY = 'soundisle_float_settings_v1';
const MODES = new Set(['orb', 'island']);
const DOCKS = new Set(['free', 'fixed', 'top', 'composer']);
const TOP_SELECTORS = ['#top-bar', '#top-settings-holder', '#top-bar-container'];
const COMPOSER_SELECTORS = ['#send_form', '#form_sheld', '#send_textarea', '#send_form_sheld'];

export function readFloatSettings(storage = window.localStorage) {
  let parsed = {};
  try { parsed = JSON.parse(storage.getItem(SETTINGS_KEY) || '{}') || {}; } catch {}
  return {
    mode: MODES.has(parsed.mode) ? parsed.mode : 'island',
    dock: DOCKS.has(parsed.dock) ? parsed.dock : 'free',
  };
}

export function dockPoint(kind, target, bounds, width, height, gap = 10) {
  // All rectangles are measured from the live DOM; no hard-coded chat UI height.
  const centerX = target.left + target.width / 2 - width / 2;
  const top = kind === 'top' ? target.bottom + gap : target.top - height - gap;
  return clampIsland(bounds, centerX, top, width, height);
}

export function mountMobile({ root, island, nav, onResume, onLongPress }) {
  const W = window, D = document;
  const storage = (() => { try { return W.localStorage; } catch { return null; } })();
  let settings = readFloatSettings(storage);
  let start = null, moved = false, suppress = false, raf = 0;
  let last = null, lastAnchor = null, anchorObserver = null, observer = null;
  let poll = null, disposed = false;
  const readSaved = () => {
    try {
      const p = JSON.parse(storage?.getItem(POSITION_KEY) || 'null');
      return Number.isFinite(p?.x) && Number.isFinite(p?.y) ? p : null;
    } catch { return null; }
  };
  let saved = readSaved();

  function bounds() { return viewport(W); }
  function size() { const r = island.getBoundingClientRect(); return {w:r.width || 44, h:r.height || 44}; }
  function put(x, y) {
    const {w,h} = size();
    const p = clampIsland(bounds(), x, y, w, h);
    root.style.left = `${p.x}px`;
    root.style.top = `${p.y}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
    last = p;
    return p;
  }
  function findAnchor(which) {
    const selectors = which === 'top' ? TOP_SELECTORS : COMPOSER_SELECTORS;
    const v = bounds();
    for (const selector of selectors) {
      const el = D.querySelector(selector);
      if (!el || !el.isConnected || root.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < v.y || r.top > v.y + v.h) continue;
      return {el, rect:r};
    }
    return null;
  }
  function watchAnchor(el) {
    if (lastAnchor === el) return;
    anchorObserver?.disconnect();
    lastAnchor = el;
    if (el && typeof W.ResizeObserver === 'function') {
      anchorObserver = new W.ResizeObserver(scheduleFit);
      anchorObserver.observe(el);
    }
  }
  function fit() {
    if (disposed || start || !nav.hidden) return;
    const {w,h} = size();
    if (settings.dock === 'top' || settings.dock === 'composer') {
      const found = findAnchor(settings.dock);
      watchAnchor(found?.el || null);
      if (found) {
        const p = dockPoint(settings.dock, found.rect, bounds(), w, h);
        put(p.x, p.y);
        return;
      }
      // If ST has hidden its bar, keep the last safe position. For new installs,
      // choose a visible center position until an anchor becomes available.
      if (last) { put(last.x, last.y); return; }
      const v = bounds();
      put(v.x + (v.w - w) / 2, settings.dock === 'top' ? v.y + 12 : v.y + v.h - h - 20);
      return;
    }
    watchAnchor(null);
    if (saved) put(saved.x,saved.y);
    else if (last) put(last.x,last.y);
    else {
      const r = island.getBoundingClientRect();
      put(r.left,r.top);
    }
  }
  function scheduleFit() {
    if (disposed || raf) return;
    raf = W.requestAnimationFrame(() => { raf = 0; fit(); });
  }
  function save(x,y) {
    saved = {x,y};
    try { storage?.setItem(POSITION_KEY, JSON.stringify(saved)); } catch {}
  }
  let pressTimer = 0;
  function clearPress() {
    if (pressTimer) { W.clearTimeout(pressTimer); pressTimer = 0; }
  }
  function down(e) {
    if (!nav.hidden || (e.button != null && e.button !== 0)) return;
    const r = island.getBoundingClientRect();
    start = { id: e.pointerId, x: e.clientX, y: e.clientY, left: r.left, top: r.top, canDrag: settings.dock === 'free' };
    moved = false;
    clearPress();
    if (typeof onLongPress === 'function') {
      pressTimer = W.setTimeout(() => {
        pressTimer = 0;
        if (!start || moved || disposed) return;
        suppress = true;
        start = null;
        delete island.dataset.dragging;
        onLongPress();
      }, 520);
    }
    if (start.canDrag) {
      try { island.setPointerCapture(e.pointerId); } catch {}
    }
  }
  function move(e) {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) < 8) return;
    clearPress();
    if (!start.canDrag) {
      start = null;
      return;
    }
    if (!moved) { moved = true; island.dataset.dragging = 'true'; }
    put(start.left + dx, start.top + dy);
    e.preventDefault();
  }
  function end(e) {
    clearPress();
    if (!start || e.pointerId !== start.id) return;
    delete island.dataset.dragging;
    if (moved) {
      suppress = true;
      const r = island.getBoundingClientRect();
      save(r.left, r.top);
    }
    start = null;
  }
  function setSettings(next) {
    const incoming = {...settings, ...next};
    const normalized = {
      mode: MODES.has(incoming.mode) ? incoming.mode : settings.mode,
      dock: DOCKS.has(incoming.dock) ? incoming.dock : settings.dock,
    };
    if (normalized.dock === 'fixed' && settings.dock !== 'fixed') {
      const r = island.getBoundingClientRect();
      save(r.left,r.top);
    }
    settings=normalized;
    root.dataset.floatMode=settings.mode;
    root.dataset.floatDock=settings.dock;
    try { storage?.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
    // Docking back to free restores the user's last freely selected coordinate.
    if (settings.dock === 'free') saved=readSaved();
    scheduleFit();
    return {...settings};
  }
  function handleVisible(){if(!D.hidden){scheduleFit();onResume?.();}}
  function scroll(){if(settings.dock==='top'||settings.dock==='composer')scheduleFit();}
  let ro=null;
  if(typeof W.ResizeObserver==='function'){
    ro=new W.ResizeObserver(()=>{if(!start&&nav.hidden)scheduleFit();});
    ro.observe(island);
  }
  if(typeof W.MutationObserver==='function'){
    // Watch replacement of the host bars, not every text or attribute change.
    observer=new W.MutationObserver(()=>{
      if(settings.dock!=='top'&&settings.dock!=='composer')return;
      if(!lastAnchor?.isConnected || !lastAnchor) scheduleFit();
    });
    observer.observe(D.body,{childList:true,subtree:true});
  }
  island.addEventListener('pointerdown',down);
  island.addEventListener('pointermove',move);
  island.addEventListener('pointerup',end);
  island.addEventListener('pointercancel',end);
  W.addEventListener('resize',scheduleFit);
  W.addEventListener('scroll',scroll,true);
  W.visualViewport?.addEventListener('resize',scheduleFit);
  W.visualViewport?.addEventListener('scroll',scheduleFit);
  D.addEventListener('visibilitychange',handleVisible);
  // Host layouts can move without emitting a resize event (drawer transitions).
  poll=W.setInterval(()=>{if(!D.hidden&&(settings.dock==='top'||settings.dock==='composer'))scheduleFit();},1200);
  root.dataset.floatMode=settings.mode;
  root.dataset.floatDock=settings.dock;
  scheduleFit();
  return {
    fit:scheduleFit,
    settings:()=>({...settings}),
    update:setSettings,
    consumeDrag(){const value=suppress;suppress=false;return value;},
    destroy(){
      disposed=true;
      clearPress();
      delete island.dataset.dragging;
      if(raf)W.cancelAnimationFrame(raf);
      W.clearInterval(poll);
      ro?.disconnect();anchorObserver?.disconnect();observer?.disconnect();
      island.removeEventListener('pointerdown',down);
      island.removeEventListener('pointermove',move);
      island.removeEventListener('pointerup',end);
      island.removeEventListener('pointercancel',end);
      W.removeEventListener('resize',scheduleFit);
      W.removeEventListener('scroll',scroll,true);
      W.visualViewport?.removeEventListener('resize',scheduleFit);
      W.visualViewport?.removeEventListener('scroll',scheduleFit);
      D.removeEventListener('visibilitychange',handleVisible);
    },
  };
}
