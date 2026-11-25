/* 声屿独立版：只初始化音乐系统，绝不初始化拾忆或注册生成拦截器。 */
import { icon } from './icons.js';
import { startMusic } from './music.js';
import { mountCloud } from './cloud.js';
import { mountNetease } from './netease.js';
import { mountAppearance } from './appearance.js';
import { mountMobile } from './mobile.js';
import { mountSelects, nativeSelectsEnabled, setNativeSelects, refreshSelect } from './ui-select.js';
import { mountSettings } from './ui-settings.js';
import { popover } from './ui-popover.js';
import { viewport } from './viewport.js';
import { createScheduler, maintenancePriority } from './scheduler.js';

const W = window, D = document;
try { W.__soundIsleStandalone?.destroy?.(); } catch (error) { console.warn('[声屿] 上次实例清理失败', error); }
const root = D.createElement('div');
root.id = 'capricorn-hub';
root.dataset.soundIsleStandalone = 'true';
if (W.navigator.deviceMemory > 0 && W.navigator.deviceMemory <= 4) D.body.dataset.capVisualLite = '';
root.innerHTML = `
  <button type="button" class="cap-island" aria-label="声屿音乐播放器" aria-expanded="false" data-playing="false" title="声屿">
    <span class="cap-island-colors" aria-hidden="true"></span>
    <span class="cap-island-orb" aria-hidden="true">
      <span class="cap-island-note-svg">${icon('music',21)}</span>
      <span class="cap-island-bars"><i></i><i></i><i></i></span>
    </span>
    <span class="cap-island-lyric-wrap">
      <span class="cap-island-lyric">声屿</span>
      <span class="cap-island-translation" hidden></span>
    </span>
  </button>
  <nav aria-label="声屿" hidden>
    <header class="cap-hub-header">
      <div class="cap-hub-primary" role="tablist" aria-label="声屿页面">
        <button type="button" role="tab" data-tab="library" aria-controls="cap-hub-content">${icon('library',15)}<span>曲库</span></button>
        <button type="button" role="tab" data-tab="settings" aria-controls="cap-hub-settings">${icon('settings',15)}<span>设置</span></button>
      </div>
      <div class="cap-hub-actions">
        <button type="button" data-open-player aria-label="打开播放器" title="打开播放器">${icon('play',17)}</button>
        <button type="button" data-close aria-label="关闭声屿" title="关闭声屿">${icon('close',17)}</button>
      </div>
    </header>
    <small role="status"></small>
    <section class="cap-settings" id="cap-hub-settings" role="tabpanel" hidden>
      <label data-cap-settings-section="appearance">外观模式
        <select data-cap-select="segment"><option value="auto">跟随系统</option><option value="light">日间浅色</option><option value="dark">夜间深色</option></select>
      </label>
    </section>
    <div id="cap-hub-content" class="cap-content" role="tabpanel" aria-label="声屿曲库"></div>
  </nav>
`;
D.body.append(root);
const nav = root.querySelector('nav');
const island = root.querySelector('.cap-island');
const islandLyric = island.querySelector('.cap-island-lyric');
const islandTranslation = island.querySelector('.cap-island-translation');
const content = nav.querySelector('.cap-content');
const settings = nav.querySelector('.cap-settings');
const themeSelect = settings.querySelector('select');
let theme = 'auto';
try { theme = W.localStorage.getItem('capricorn_theme') || 'auto'; } catch {}
themeSelect.value = ['auto','light','dark'].includes(theme) ? theme : 'auto';
root.dataset.theme = themeSelect.value;
themeSelect.onchange = () => {
  root.dataset.theme = themeSelect.value;
  try { W.localStorage.setItem('capricorn_theme',themeSelect.value); } catch {}
};
const context = () => W.SillyTavern?.getContext?.() || {};
const chatIdentity = () => {
  const c = context();
  return { scope: [c.groupId ?? c.group_id ?? c.characterId ?? c.character_id ?? 'none',
    c.getCurrentChatId?.() ?? c.chatId ?? c.chatMetadata?.chat_id ?? 'none'].join(':') };
};
const scope = () => chatIdentity().scope;
const shared = { flags: {music:true,memory:false}, scope, chatIdentity, recallLocked: false };
let destroyed = false, music, cloud, cleanupNetease, appearance, cleanupMobile, settingsUi;
let selectAdapter, timer, selectedTab = 'library', artworkImage, artworkFrame = 0, artworkEpoch = 0;
const scheduler = createScheduler(W, () => D.hidden);
shared.maintenance = scheduler;
function fitHub() {
  if (nav.hidden) return;
  const bounds = viewport(W);
  for (const [key, value] of Object.entries({vx:bounds.x,vy:bounds.y,vw:bounds.w,vh:bounds.h}))
    nav.style.setProperty('--cap-hub-' + key,value + 'px');
}
W.addEventListener('resize',fitHub);
W.visualViewport?.addEventListener('resize',fitHub);
W.visualViewport?.addEventListener('scroll',fitHub);

function colorIsland(url) {
  const epoch = ++artworkEpoch;
  if (artworkImage) { artworkImage.onload = artworkImage.onerror = null; artworkImage = null; }
  if (artworkFrame) { cancelAnimationFrame(artworkFrame); artworkFrame = 0; }
  const host = island.querySelector('.cap-island-colors');
  host.replaceChildren();
  if (!url) return;
  try { if (!['https:','http:'].includes(new URL(url).protocol)) return; } catch { return; }
  const img = new Image(); artworkImage = img; img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (epoch !== artworkEpoch || destroyed) return;
    try {
      const canvas = D.createElement('canvas');canvas.width = canvas.height = 16;
      const ctx = canvas.getContext('2d');ctx.drawImage(img,0,0,16,16);
      const pixels = ctx.getImageData(0,0,16,16).data;
      let r=0,g=0,b=0,count=0;
      for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>127){r+=pixels[i];g+=pixels[i+1];b+=pixels[i+2];count++;}
      if (!count) return;
      const layer=D.createElement('span');
      layer.style.background=`rgb(${Math.round(r/count)},${Math.round(g/count)},${Math.round(b/count)})`;
      host.replaceChildren(layer);
      artworkFrame=requestAnimationFrame(()=>{ if(epoch===artworkEpoch)layer.style.opacity='1'; artworkFrame=0; });
    } catch { host.replaceChildren(); }
  };
  img.onerror=()=>{if(epoch===artworkEpoch)host.replaceChildren();};
  img.src=url;
}
let coverUrl = '';
function artwork() { colorIsland(root.dataset.islandArtwork === 'true' ? coverUrl : ''); }
root.addEventListener('capricorn-island-artwork',artwork);
shared.onIslandUpdate = ({playing,text,title,coverUrl:cover,translation}) => {
  if (destroyed) return;
  if (coverUrl !== (cover || '')) { coverUrl = cover || ''; artwork(); }
  island.dataset.playing=playing?'true':'false';
  island.title=playing?`${title||'正在播放'} · 声屿`:'声屿（点击打开播放器）';
  const translate=playing?(translation||''):'';
  islandTranslation.textContent=translate;
  islandTranslation.hidden=!translate;
  island.dataset.bilingual=String(Boolean(translate));
  if (text && playing && islandLyric.textContent!==text) islandLyric.textContent=text;
  cleanupMobile?.fit?.();
};

const libraryNav=D.createElement('div');
libraryNav.className='cap-library-switch';
libraryNav.setAttribute('role','tablist');
libraryNav.setAttribute('aria-label','曲库来源');
for(const [key,label] of [['library','本地 / 角色'],['cloud','网易云']]){
  const button=D.createElement('button');button.type='button';button.dataset.tab=key;
  button.setAttribute('role','tab');button.textContent=label;
  button.onclick=()=>select(key);libraryNav.append(button);
}
content.before(libraryNav);
function select(page) {
  if (page==='cloud' && !shared.accountReady?.())page='library';
  selectedTab=page;
  root.dataset.tab=page;
  D.body.dataset.capricornTab=page;
  settings.hidden=page!=='settings';
  content.hidden=!['library','cloud'].includes(page);
  libraryNav.hidden=!['library','cloud'].includes(page) || !shared.accountReady?.();
  for(const button of nav.querySelectorAll('.cap-hub-primary [data-tab]')){
    const active=button.dataset.tab===(page==='cloud'?'library':page);
    button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  }
  for(const button of libraryNav.querySelectorAll('button')){
    const active=button.dataset.tab===page;
    button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  }
  if(page==='cloud')cloud?.show();else cloud?.hide();
  if(page==='library')music?.show();else music?.hide();
}
function close() {
  popover.closeWithin(nav);
  nav.hidden=true;
  root.dataset.panelOpen='false';
  island.setAttribute('aria-expanded','false');
}
function openHub(page='library'){
  nav.hidden=false;root.dataset.panelOpen='true';island.setAttribute('aria-expanded','true');
  fitHub();select(page);
}
shared.openPlayerAux=openHub;
shared.onPlayerClose=()=>island.setAttribute('aria-expanded','false');
function openPlayer(){
  if (!music)return openHub('library');
  close();music.openPlayer();island.setAttribute('aria-expanded','true');
}
island.onclick=()=>{
  if(cleanupMobile?.consumeDrag())return;
  if(music?.isPlayerOpen()){music.closePlayer();return;}
  openPlayer();
};
nav.querySelector('[data-open-player]').onclick=openPlayer;
nav.querySelector('[data-close]').onclick=close;
nav.querySelectorAll('.cap-hub-primary [data-tab]').forEach(b=>b.onclick=()=>select(b.dataset.tab));
nav.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented)close();});
shared.onAccountChange=()=>{
  if(selectedTab==='cloud'&&!shared.accountReady?.())select('library');
  else libraryNav.hidden=!['library','cloud'].includes(selectedTab)||!shared.accountReady?.();
};
function tick(){
  if(destroyed||!music)return;
  try{
    scheduler.setContext(scope());
    scheduler.enqueue('声屿',task=>music.tick(task),maintenancePriority.audio,
      {lane:'audio',scoped:true,duringForeground:true});
  }catch(error){console.warn('[声屿] 后台任务',error);}
}
function resume(){if(!D.hidden){scheduler.resume();tick();}}
D.addEventListener('visibilitychange',resume);
function destroy(){
  if(destroyed)return;
  destroyed=true;
  clearInterval(timer);
  ++artworkEpoch;
  if(artworkImage){artworkImage.onload=artworkImage.onerror=null;artworkImage=null;}
  if(artworkFrame)cancelAnimationFrame(artworkFrame);
  D.removeEventListener('visibilitychange',resume);
  W.removeEventListener('resize',fitHub);
  W.visualViewport?.removeEventListener('resize',fitHub);
  W.visualViewport?.removeEventListener('scroll',fitHub);
  scheduler.close();
  cleanupMobile?.destroy();
  cleanupNetease?.();
  cloud?.destroy();
  appearance?.destroy();
  settingsUi?.destroy();
  selectAdapter?.destroy();
  popover.destroy();
  music?.destroy();
  root.remove();
  delete D.body.dataset.capricornTab;
  delete D.body.dataset.capVisualLite;
  if(W.__soundIsleStandalone?.destroy===destroy)delete W.__soundIsleStandalone;
}
W.__soundIsleStandalone={destroy,open:openHub,openPlayer};

async function boot(){
  cleanupNetease=mountNetease(settings,shared);
  music=await startMusic(shared);
  if(destroyed){music.destroy();return;}
  content.append(music.root);
  cloud=mountCloud(content,shared,music);
  cleanupMobile=mountMobile({root,island,nav,onResume:tick});
  const services=D.createElement('section');
  services.dataset.capSettingsSection='services';
  services.className='cap-backup';
  services.innerHTML='<h4>服务与兼容性</h4><label><input type="checkbox" data-native-selects> 使用系统下拉菜单</label>';
  services.querySelector('[data-native-selects]').checked=nativeSelectsEnabled(D);
  services.querySelector('[data-native-selects]').onchange=event=>setNativeSelects(D,event.target.checked);
  settings.append(services);
  const controls=D.createElement('section');
  controls.dataset.capSettingsSection='backup';
  controls.className='cap-backup';
  controls.innerHTML='<h4>音乐库备份</h4><button type="button" data-export>导出音乐库</button><button type="button" data-import>导入并合并音乐库</button><input type="file" accept=".json,application/json" hidden><p role="status"></p>';
  settings.append(controls);
  const result=controls.querySelector('p');
  controls.querySelector('[data-export]').onclick=()=>{
    try{
      const data={format:'sound-isle-music',version:1,created:new Date().toISOString(),music:music.backup()};
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
      const link=D.createElement('a');link.href=url;link.download='sound-isle-music.json';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),3000);result.textContent='音乐库已导出';
    }catch(error){result.textContent='导出失败：'+error.message;}
  };
  const file=controls.querySelector('input[type=file]');
  controls.querySelector('[data-import]').onclick=()=>file.click();
  file.onchange=async()=>{
    const uploaded=file.files?.[0];file.value='';if(!uploaded)return;
    try{
      const payload=JSON.parse(await uploaded.text());
      const incoming=payload.music||payload;
      if(!W.confirm('导入音乐库并合并缺失歌曲？现有歌单优先。'))return;
      await music.restoreBackup(incoming);
      result.textContent='音乐库已合并';
    }catch(error){result.textContent='导入失败：'+error.message;}
  };
  appearance=mountAppearance(settings,root,themeSelect,null);
  settingsUi=mountSettings(settings);
  selectAdapter=mountSelects(root);
  island.hidden=false;
  select('library');
  timer=setInterval(()=>{if(!D.hidden)tick();},4000);
  tick();
  console.info('[声屿独立版] 已启动');
}
void boot().catch(error=>{
  console.error('[声屿独立版] 启动失败',error);
  const status=nav.querySelector('small');
  if(status)status.textContent='声屿启动失败：'+error.message;
  openHub('settings');
});
