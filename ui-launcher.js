/* 声屿独立版：悬浮控件显隐与宿主自适应唤起入口。 */
import { viewport } from './viewport.js';

const STORAGE_KEY = 'soundisle_launcher_v1';
const POLICIES = new Set(['always', 'auto', 'edge', 'hidden']);
export function normalizeLauncherConfig(value = {}) {
  const read = value && typeof value === 'object' ? value : {};
  const config = {
    policy: POLICIES.has(read.policy) ? read.policy : 'always',
    shortcut: Boolean(read.shortcut),
    gesture: Boolean(read.gesture),
    delay: [3, 5, 10, 20].includes(Number(read.delay)) ? Number(read.delay) : 5,
  };
  return config;
}
export function readLauncherConfig(storage = window.localStorage) {
  try { return normalizeLauncherConfig(JSON.parse(storage?.getItem(STORAGE_KEY) || '{}')); }
  catch { return normalizeLauncherConfig(); }
}
export function mountLauncher({root, island, nav, onOpen, isPlayerOpen}) {
  const W=window, D=document;
  let storage; try {storage=W.localStorage;} catch {}
  let config=readLauncherConfig(storage);
  let dead=false, hideTimer=0, raf=0, lastTap=0, lastTapSide='', lastTop;
  const edgeButton=D.createElement('button');
  edgeButton.type='button';edgeButton.className='si-edge-handle';
  edgeButton.setAttribute('aria-label','展开声屿');edgeButton.title='展开声屿';
  edgeButton.onclick=()=>open(edgeButton);D.body.append(edgeButton);
  function open(trigger){
    wake();
    if (trigger) {
      const r=trigger.getBoundingClientRect();
      W.__soundIsleOpenOrigin={left:r.left,top:r.top,width:r.width,height:r.height,right:r.right,bottom:r.bottom};
    }
    onOpen();
  }
  function wake(){
    island.classList.remove('si-auto-asleep');
    scheduleHide();
  }
  function scheduleHide(){
    W.clearTimeout(hideTimer);hideTimer=0;
    if(config.policy!=='auto'||!nav.hidden||isPlayerOpen?.())return;
    hideTimer=W.setTimeout(()=>{
      if(!dead&&config.policy==='auto'&&nav.hidden&&!isPlayerOpen?.())island.classList.add('si-auto-asleep');
    },config.delay*1000);
  }
  function apply(){
    root.dataset.floatVisibility=config.policy;
    island.classList.remove('si-auto-asleep');
    // 完全隐藏且没有快捷键/边缘手势时，保留细把手避免失联。
    edgeButton.hidden=config.policy!=='edge' && !(config.policy==='hidden' && !config.shortcut && !config.gesture);
    scheduleHide();locate();
  }
  function update(changes){
    config=normalizeLauncherConfig({...config,...changes});
    try {storage?.setItem(STORAGE_KEY,JSON.stringify(config));}catch{}
    apply();return {...config};
  }
  function locate(){
    if(dead)return;
    const v=viewport(W);
    const top=Math.max(v.y+30,Math.min(v.y+v.h-70,v.y+v.h*.45));
    if(top!==lastTop){lastTop=top;edgeButton.style.top=`${top}px`;}
  }
  function scheduleLocate(){if(dead||raf)return;raf=W.requestAnimationFrame(()=>{raf=0;locate();});}
  function onInput(e){
    if(e.target?.closest?.('#capricorn-hub'))return;
    if(config.policy==='auto')wake();
  }
  function onKey(e){
    if(!config.shortcut||!e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||e.repeat||e.key?.toLowerCase()!=='m')return;
    if(e.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
    e.preventDefault();open();
  }
  function onTap(e){
    if(!config.gesture||e.pointerType==='mouse'||e.target?.closest?.('button,a,input,textarea,select,[contenteditable="true"],#capricorn-hub,.si-edge-handle'))return;
    const v=viewport(W);const x=e.clientX;
    const side=x<=v.x+18?'left':x>=v.x+v.w-18?'right':'';
    if(!side)return;
    const now=Date.now();
    if(side===lastTapSide&&now-lastTap<360){lastTap=0;lastTapSide='';open();return;}
    lastTap=now;lastTapSide=side;
  }
  function onVisibility(){if(!D.hidden){scheduleLocate();scheduleHide();}}
  D.addEventListener('pointerdown',onInput,{passive:true});
  D.addEventListener('pointerup',onTap,{passive:true});
  D.addEventListener('keydown',onKey);
  D.addEventListener('visibilitychange',onVisibility);
  W.addEventListener('resize',scheduleLocate);
  W.addEventListener('scroll',scheduleLocate,true);
  W.visualViewport?.addEventListener('resize',scheduleLocate);
  W.visualViewport?.addEventListener('scroll',scheduleLocate);
  // Edge handle depends only on viewport dimensions, not chat DOM mutations.
  island.addEventListener('pointerenter',wake);
  island.addEventListener('focus',wake);
  // 自动隐藏依赖全局触摸唤醒；完全隐藏无其他入口时保留贴边把手。
  apply();
  return {
    settings:()=>({...config}),update,
    onPlayback(){ /* 音乐播放不改变悬浮控件的隐藏策略。 */ },
    onPanelChange(){
      // 每次打开或收起播放器都撤销旧计时器，并按最新面板状态重启。
      island.classList.remove('si-auto-asleep');
      scheduleHide();
    },
    wake,
    destroy(){
      dead=true;W.clearTimeout(hideTimer);
      if(raf)W.cancelAnimationFrame(raf);
      D.removeEventListener('pointerdown',onInput);D.removeEventListener('pointerup',onTap);
      D.removeEventListener('keydown',onKey);D.removeEventListener('visibilitychange',onVisibility);
      W.removeEventListener('resize',scheduleLocate);W.removeEventListener('scroll',scheduleLocate,true);
      W.visualViewport?.removeEventListener('resize',scheduleLocate);
      W.visualViewport?.removeEventListener('scroll',scheduleLocate);
      island.removeEventListener('pointerenter',wake);island.removeEventListener('focus',wake);
      edgeButton.remove();
      delete root.dataset.floatVisibility;
    },
  };
}
