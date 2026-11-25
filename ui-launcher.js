/* 声屿独立版：悬浮控件显隐与宿主自适应唤起入口。 */
import { viewport } from './viewport.js';
import { icon } from './icons.js';

const STORAGE_KEY = 'soundisle_launcher_v1';
const POLICIES = new Set(['always', 'auto', 'edge', 'hidden']);
const TOP = ['#top-bar', '#top-settings-holder', '#top-bar-container', '#top-bar'];
const COMPOSER = ['#send_form', '#form_sheld', '#send_form_sheld', '#send_textarea'];
export function normalizeLauncherConfig(value = {}) {
  const read = value && typeof value === 'object' ? value : {};
  const config = {
    policy: POLICIES.has(read.policy) ? read.policy : 'always',
    top: read.top !== false,
    composer: Boolean(read.composer),
    shortcut: Boolean(read.shortcut),
    gesture: Boolean(read.gesture),
    delay: [3, 5, 10, 20].includes(Number(read.delay)) ? Number(read.delay) : 5,
  };
  // 完全隐藏时必须存在无需手势/键盘即可找到的入口。
  if (config.policy === 'hidden' && !config.top && !config.composer) config.top = true;
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
  let dead=false, hideTimer=0, raf=0, polling=0, lastTap=0, lastTapSide='', lastRect=null;
  let playing=false;
  const buttons={top:D.createElement('button'),composer:D.createElement('button')};
  const edgeButton=D.createElement('button');
  edgeButton.type='button';edgeButton.className='si-edge-handle';
  edgeButton.setAttribute('aria-label','展开声屿');edgeButton.title='展开声屿';
  edgeButton.onclick=()=>open(edgeButton);D.body.append(edgeButton);
  const targets={top:TOP,composer:COMPOSER};
  for (const [kind,button] of Object.entries(buttons)) {
    button.type='button';button.className='si-launch-button si-launch-'+kind;
    button.setAttribute('aria-label',kind==='top'?'打开声屿（顶栏入口）':'打开声屿（输入栏入口）');
    button.title='声屿 · 打开播放器';button.innerHTML=icon('music',18);
    button.hidden=true;button.onclick=()=>open(button);
    D.body.append(button);
  }
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
    for(const [kind,button] of Object.entries(buttons))button.hidden=!config[kind];
    edgeButton.hidden=config.policy!=='edge';
    scheduleHide();locate();
  }
  function update(changes){
    config=normalizeLauncherConfig({...config,...changes});
    try {storage?.setItem(STORAGE_KEY,JSON.stringify(config));}catch{}
    apply();return {...config};
  }
  function find(kind){
    const v=viewport(W);
    for(const selector of targets[kind]){
      const el=D.querySelector(selector);
      if(!el||root.contains(el)||!el.isConnected||Object.values(buttons).includes(el))continue;
      const r=el.getBoundingClientRect();
      if(r.width>5&&r.height>5&&r.bottom>v.y&&r.top<v.y+v.h)return r;
    }
    return null;
  }
  function locate(){
    if(dead)return;
    const v=viewport(W);
    edgeButton.style.top=`${Math.max(v.y+30,Math.min(v.y+v.h-70,v.y+v.h*.45))}px`;
    for(const [kind,button] of Object.entries(buttons)){
      if(button.hidden)continue;
      const r=find(kind);const w=36,h=36;
      let x=r?r.left+r.width-w-8:v.x+v.w-w-12;
      let y=r?(kind==='top'?r.top+(r.height-h)/2:r.top+(r.height-h)/2):(kind==='top'?v.y+8:v.y+v.h-h-80);
      // 不将按钮放到用户输入的文本正中央。
      if(kind==='composer'&&r)x=r.left+Math.min(r.width-w-6,Math.max(6,r.width-45));
      x=Math.max(v.x+4,Math.min(x,v.x+v.w-w-4));
      y=Math.max(v.y+4,Math.min(y,v.y+v.h-h-4));
      button.style.transform=`translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
    }
  }
  function scheduleLocate(){if(dead||raf)return;raf=W.requestAnimationFrame(()=>{raf=0;locate();});}
  function onInput(e){
    if(e.target?.closest?.('#capricorn-hub')||e.target?.closest?.('.si-launch-button'))return;
    if(config.policy==='auto')wake();
  }
  function onKey(e){
    if(!config.shortcut||!e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||e.repeat||e.key?.toLowerCase()!=='m')return;
    if(e.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
    e.preventDefault();open();
  }
  function onTap(e){
    if(!config.gesture||e.pointerType==='mouse'||e.target?.closest?.('button,a,input,textarea,select,[contenteditable="true"],#capricorn-hub,.si-launch-button'))return;
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
  let observer;
  if(typeof W.MutationObserver==='function'){
    observer=new W.MutationObserver(scheduleLocate);
    observer.observe(D.body,{childList:true,subtree:true});
  }
  polling=W.setInterval(()=>{if(!D.hidden)locate();},1500);
  island.addEventListener('pointerenter',wake);
  island.addEventListener('focus',wake);
  // 当悬浮控件被完全隐藏，保留工具栏可见入口（配置防失联）。
  apply();
  return {
    settings:()=>({...config}),update,
    onPlayback(value){playing=Boolean(value);for(const button of Object.values(buttons))button.dataset.playing=String(playing);},
    onPanelChange(){scheduleHide();},
    wake,
    destroy(){
      dead=true;W.clearTimeout(hideTimer);W.clearInterval(polling);
      if(raf)W.cancelAnimationFrame(raf);observer?.disconnect();
      D.removeEventListener('pointerdown',onInput);D.removeEventListener('pointerup',onTap);
      D.removeEventListener('keydown',onKey);D.removeEventListener('visibilitychange',onVisibility);
      W.removeEventListener('resize',scheduleLocate);W.removeEventListener('scroll',scheduleLocate,true);
      W.visualViewport?.removeEventListener('resize',scheduleLocate);
      W.visualViewport?.removeEventListener('scroll',scheduleLocate);
      island.removeEventListener('pointerenter',wake);island.removeEventListener('focus',wake);
      for(const button of Object.values(buttons))button.remove();
      edgeButton.remove();
      delete root.dataset.floatVisibility;
    },
  };
}
