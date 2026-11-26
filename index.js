/* 声屿独立版：只初始化音乐系统，绝不初始化拾忆或注册生成拦截器。 */
import { getChatIdentity } from './host-context.js';
import { icon } from './icons.js';
import { startMusic } from './music.js';
import { mountCloud } from './cloud.js';
import { mountNetease } from './netease.js';
import { mountAppearance } from './appearance.js';
import { mountMobile, readFloatSettings } from './mobile.js';
import { mountLauncher } from './ui-launcher.js';
import { mountSelects, nativeSelectsEnabled, setNativeSelects, refreshSelect } from './ui-select.js';
import { mountSettings } from './ui-settings.js';
import { popover } from './ui-popover.js';
import { viewport } from './viewport.js';
import { createScheduler, maintenancePriority } from './scheduler.js';

const W = window, D = document;
try { W.__soundIsleStandalone?.destroy?.(); } catch (error) { console.warn('[声屿] 上次实例清理失败', error); }
if (W.__capricornExtension || D.getElementById('capricorn-hub')) throw new Error('声屿独立版与摩羯座完整版不能同时启用');
const root = D.createElement('div');
root.dataset.floatMode = readFloatSettings().mode;
root.id = 'capricorn-hub';
root.dataset.soundIsleStandalone = 'true';

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
delete D.body.dataset.capVisualLite;
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
const chatIdentity = () => getChatIdentity(context());
const scope = () => chatIdentity().scope;
const shared = { flags: {music:true,memory:false}, scope, chatIdentity, recallLocked: false };
let destroyed = false, music, cloud, cleanupNetease, appearance, cleanupMobile, launcher, settingsUi;
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
  const playbackChanged=island.dataset.playing!==String(playing);
  const bilingualChanged=island.dataset.bilingual!==String(Boolean(playing&&translation));
  island.dataset.playing=playing?'true':'false';
  island.title=playing?`${title||'正在播放'} · 声屿`:'声屿（点击打开播放器）';
  const translate=playing?(translation||''):'';
  if(islandTranslation.textContent!==translate)islandTranslation.textContent=translate;
  islandTranslation.hidden=!translate;
  island.dataset.bilingual=String(Boolean(translate));
  if (text && playing && islandLyric.textContent!==text) islandLyric.textContent=text;
  if (playbackChanged || bilingualChanged) cleanupMobile?.fit?.();
  if (playbackChanged) launcher?.onPlayback(playing);
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
  launcher?.onPanelChange();
}
function openHub(page='library'){
  nav.hidden=false;root.dataset.panelOpen='true';island.setAttribute('aria-expanded','true');
  fitHub();select(page);launcher?.wake();launcher?.onPanelChange();
}
shared.openPlayerAux=openHub;
shared.onPlayerClose=()=>{
  island.setAttribute('aria-expanded','false');
  launcher?.onPanelChange();
};
function openPlayer(){
  if (!music)return openHub('library');
  close();music.openPlayer();island.setAttribute('aria-expanded','true');launcher?.onPanelChange();
}
let lastIslandClick=-Infinity;
island.onclick=(event)=>{
  event.stopPropagation();
  const now=performance.now();
  if(now-lastIslandClick<450)return;
  lastIslandClick=now;
  if(cleanupMobile?.consumeDrag())return;
  if(music?.isPlayerOpen()){music.closePlayer();return;}
  openPlayer();
};
nav.querySelector('[data-open-player]').onclick=openPlayer;
nav.querySelector('[data-close]').onclick=close;
nav.querySelectorAll('.cap-hub-primary [data-tab]').forEach(b=>b.onclick=()=>select(b.dataset.tab));
nav.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented)close();});
shared.onAccountChange=()=>{
  cloud?.invalidate();
  if(selectedTab==='cloud'&&!shared.accountReady?.())select('library');
  else libraryNav.hidden=!['library','cloud'].includes(selectedTab)||!shared.accountReady?.();
};
function tick(){
  if(destroyed||!music)return;
  try{
    repairUI();
    scheduler.setContext(scope());
    scheduler.enqueue('声屿',task=>music.tick(task),maintenancePriority.audio,
      {lane:'audio',scoped:true,duringForeground:true});
  }catch(error){console.warn('[声屿] 后台任务',error);}
}
function repairUI(){
  if(destroyed || W.__soundIsleStandalone?.destroy!==destroy || !D.body)return;
  if(!root.isConnected)D.body.append(root);
  if(!music?.isPlayerOpen())D.body.removeAttribute('data-cap-player-open');
}
function resume(){if(!D.hidden){repairUI();scheduler.resume();tick();}}
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
  launcher?.destroy();
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
  launcher=mountLauncher({root,island,nav,onOpen:openPlayer,isPlayerOpen:()=>Boolean(music?.isPlayerOpen())});
  const floating=D.createElement('section');
  floating.dataset.capSettingsSection='appearance';
  floating.className='cap-float-settings';
  floating.innerHTML=`<h4>悬浮控件</h4>
    <label>显示样式<select data-float-mode data-cap-select="segment">
      <option value="orb">悬浮球 · 始终只显示小球</option>
      <option value="island">灵动岛 · 播放时展开歌词</option>
    </select></label>
    <label>停靠位置<select data-float-dock>
      <option value="free">自由拖动</option>
      <option value="fixed">锁定当前位置</option>
      <option value="top">酒馆顶栏正中下方 · 自适应</option>
      <option value="composer">输入栏正中上方 · 自适应</option>
    </select></label>
    <p class="cap-float-hint">自由拖动可保存位置；锁定会保持当前位置；自动停靠将随顶栏、输入框和视口变化更新。</p>`;
  settings.append(floating);
  const floatMode=floating.querySelector('[data-float-mode]');
  const floatDock=floating.querySelector('[data-float-dock]');
  const initial=cleanupMobile.settings();
  floatMode.value=initial.mode;
  floatDock.value=initial.dock;
  floatMode.addEventListener('change',()=>cleanupMobile.update({mode:floatMode.value}));
  floatDock.addEventListener('change',()=>cleanupMobile.update({dock:floatDock.value}));
  const wakeSettings=D.createElement('section');
  wakeSettings.className='si-launch-settings';
  wakeSettings.innerHTML=`<h4>隐藏与唤起</h4>
    <label>悬浮控件显示策略<select data-launch-policy>
      <option value="always">始终显示</option>
      <option value="auto">自动隐藏 · 触碰时唤醒</option>
      <option value="edge">贴边隐藏 · 保留把手</option>
      <option value="hidden">完全隐藏 · 无其他入口时保留贴边把手</option>
    </select></label>
    <label>自动隐藏等待<select data-launch-delay><option value="3">3 秒</option><option value="5">5 秒</option><option value="10">10 秒</option><option value="20">20 秒</option></select></label>
    <label class="si-launch-toggle"><input type="checkbox" data-launch-shortcut>键盘 Alt + M 唤起</label>
    <label class="si-launch-toggle"><input type="checkbox" data-launch-gesture>屏幕边缘双击唤起（实验功能）</label>
    <p class="cap-float-hint">隐藏只影响界面，不停止播放。完全隐藏且未开启快捷键或边缘双击时，会保留贴边小把手，避免播放器失联。</p>`;
  floating.append(wakeSettings);
  const launchControls={policy:wakeSettings.querySelector('[data-launch-policy]'),delay:wakeSettings.querySelector('[data-launch-delay]'),shortcut:wakeSettings.querySelector('[data-launch-shortcut]'),gesture:wakeSettings.querySelector('[data-launch-gesture]')};
  const currentLaunch=launcher.settings();
  for(const [key,element] of Object.entries(launchControls)){
    if(element.type==='checkbox')element.checked=currentLaunch[key];
    else element.value=String(currentLaunch[key]);
    element.addEventListener('change',()=>{
      const value=element.type==='checkbox'?element.checked:(key==='delay'?Number(element.value):element.value);
      const applied=launcher.update({[key]:value});
      for(const [name,el] of Object.entries(launchControls))
        if(el.type==='checkbox')el.checked=applied[name];
    });
  }
  const services=D.createElement('section');
  services.dataset.capSettingsSection='services';
  services.className='cap-backup';
  services.innerHTML='<h4>服务与兼容性</h4><label><input type="checkbox" data-native-selects> 使用系统下拉菜单</label>';
  services.querySelector('[data-native-selects]').checked=nativeSelectsEnabled(D);
  services.querySelector('[data-native-selects]').onchange=event=>setNativeSelects(D,event.target.checked);
  const bg = D.createElement('label');
  bg.innerHTML='<input type="checkbox"> iOS 后台播放优先';
  bg.firstElementChild.checked=music.backgroundPriority();
  bg.firstElementChild.onchange=()=>music.setBackgroundPriority(bg.firstElementChild.checked);
  services.append(bg);
  const follow = D.createElement('label');
  follow.innerHTML='<input type="checkbox"> 切换角色卡时自动切歌';
  follow.firstElementChild.checked=W.localStorage.getItem('capricorn_follow_character')!=='off';
  follow.firstElementChild.onchange=()=>W.localStorage.setItem('capricorn_follow_character',follow.firstElementChild.checked?'on':'off');
  services.append(follow);
  const story=D.createElement('label');
  story.innerHTML='<input type="checkbox"> 跟随剧情 BGM';
  story.firstElementChild.checked=W.localStorage.getItem('capricorn_follow_story')!=='off';
  story.firstElementChild.onchange=()=>W.localStorage.setItem('capricorn_follow_story',story.firstElementChild.checked?'on':'off');
  services.append(story);
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
