import { createPlaybackCheckpoint } from './music-checkpoint.js';
import { createBgmIndex } from './bgm-index.js';
import { commitMusicBackup } from './backup.js';
import { createLatestTask, withMusicTimeout } from './music-tasks.js';
import { icon } from './icons.js';
import { closeLibraryMenus, libraryButton, libraryMenu } from './ui-library.js';
import { lastItem } from './compat.js';
/* 声屿 v0.8 | TavernHelper 全局脚本。仅本地歌单；不提供未授权网易云登录/音源。 */
import { mountNowPlaying } from './now-playing.js';
import { uiAlert, uiConfirm, uiPrompt, uiToast } from './ui-dialog.js';
export async function startMusic(shared){
'use strict';
let W=window,D=document;try{if(window.parent!==window&&window.parent.document?.body){W=window.parent;D=W.document;}}catch{}
const INSTANCE='__sound_isle_v08__';try{W.__sound_isle_v07__?.destroy?.()}catch{};try{W.__sound_isle_v06__?.destroy?.()}catch{};try{W.__sound_isle_v05__?.destroy?.()}catch{};try{W[INSTANCE]?.destroy?.()}catch{};try{W.__sound_isle_v04__?.destroy?.()}catch{};try{W.__sound_isle_v03__?.destroy?.()}catch{};try{W.__sound_isle_v02__?.destroy?.()}catch{};try{W.__sound_isle_v01__?.destroy?.()}catch{}
const KEY='sound_isle_v01_library';
const api=(n,...a)=>{let f=window[n]||window.TavernHelper?.[n]||W[n]||W.TavernHelper?.[n];return typeof f==='function'?f(...a):null};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function hash(value) {
  const text = String(value);
  let digest = 2166136261;
  for (let i = 0; i < text.length; i++) {
    digest ^= text.charCodeAt(i);
    digest = Math.imul(digest, 16777619);
  }
  return (digest >>> 0).toString(16);
}
const checkpoint=createPlaybackCheckpoint(W.localStorage,KEY);
let db;try{db=JSON.parse(W.localStorage.getItem(KEY)||'null')}catch{};if(!db||typeof db!=='object')db={version:1,playlists:{},favorites:[],recent:[],processed:{},settings:{}};
for(let k of ['playlists','processed','settings'])if(!db[k]||typeof db[k]!=='object')db[k]={};for(let k of ['favorites','recent'])if(!Array.isArray(db[k]))db[k]=[];
const save=()=>{try{W.localStorage.setItem(KEY,JSON.stringify(db))}catch(e){status('本地保存失败：'+e.message)}};
const context=()=>W.SillyTavern?.getContext?.()||window.SillyTavern?.getContext?.()||{};
function character(){
  const c=context(),groupId=c.groupId??c.group_id;
  if(groupId!=null&&groupId!==''){
    const group=c.groups?.find?.(row=>String(row.id)===String(groupId));
    return {id:'group:'+String(groupId),name:String(group?.name||c.group?.name||'群聊')};
  }
  const id=c.characterId??c.character_id,name=c.name2||c.characters?.[id]?.name;
  if(id==null||id===''||!name)return null;
  return {id:'char:'+String(id),name:String(name)};
}
function playlist(id,name,kind='character'){if(!db.playlists[id]){db.playlists[id]={id,name,kind,songs:[],created:Date.now()};save()}return db.playlists[id]}
let trackPage=0,trackPageScope='',filterText='',current='',selected='',opened=false,playing=null,drag=false,disposed=false,scanBusy=false;
let playlistNameDraft = '', songTitleDraft = '', songArtistDraft = '';
let previousTrackScrollReset = false;
const playbackTasks = createLatestTask();
const storyTasks = createLatestTask();
let storyTask = storyTasks.start();
function makeAudio(){const a=D.createElement('audio');a.preload='metadata';a.playsInline=true;a.setAttribute('playsinline','');a.setAttribute('aria-hidden','true');a.style.cssText='position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10000px;top:0';D.body.append(a);return a}
const mobileMedia=/Android|iPhone|iPad|iPod/i.test(W.navigator.userAgent)||(W.navigator.platform==='MacIntel'&&W.navigator.maxTouchPoints>1);
const mediaSession=W.navigator?.mediaSession||window.navigator?.mediaSession||null;
const mediaMetadataCtor=W.MediaMetadata||window.MediaMetadata;
const systemAudioSession=W.navigator?.audioSession||window.navigator?.audioSession;
let previousSessionType=null;
function requestPlaybackSession(){try{if(systemAudioSession){if(previousSessionType===null)previousSessionType=systemAudioSession.type;systemAudioSession.type='playback'}}catch{}}
function releasePlaybackSession(){try{if(systemAudioSession&&previousSessionType!==null&&systemAudioSession.type==='playback')systemAudioSession.type=previousSessionType}catch{}previousSessionType=null}
const fallbackArtwork=new URL('./sound-isle-cover.png',import.meta.url).href;
const isAppleMobile=/iPhone|iPad|iPod/.test(W.navigator.userAgent)||(W.navigator.platform==='MacIntel'&&W.navigator.maxTouchPoints>1);
// A native HTMLAudioElement is much more likely to keep iOS background media alive
// than a Web Audio graph, which the operating system may suspend when backgrounded.
// Users can opt out when they prefer in-page Web Audio volume adjustment.
// New preference key: old default-on setting must not silently disable volume.
const backgroundPriority=()=>db.settings.audioBackgroundPreference===true;
const nativeAudio=makeAudio(), graphAudio=makeAudio();graphAudio.crossOrigin='anonymous';let activeAudio=nativeAudio, audioContext=null, gainNode=null;
let nativeVolume=true;try{nativeAudio.volume=.37;nativeVolume=Math.abs(nativeAudio.volume-.37)<.01;nativeAudio.volume=1}catch{nativeVolume=false}
const mediaListeners = new Map();
const audio = new Proxy(nativeAudio, {
  get(_target, key) {
    if (key === 'addEventListener') return (name, listener) => {
      const listeners = mediaListeners.get(name) ?? new Map();
      if (listeners.has(listener)) return;
      const handler = event => {
        if (!disposed && event.currentTarget === activeAudio) listener(event);
      };
      listeners.set(listener, handler);
      mediaListeners.set(name, listeners);
      for (const element of [nativeAudio, graphAudio]) element.addEventListener(name, handler);
    };
    if (key === 'removeEventListener') return (name, listener) => {
      const listeners = mediaListeners.get(name);
      const handler = listeners?.get(listener);
      if (!handler) return;
      for (const element of [nativeAudio, graphAudio]) element.removeEventListener(name, handler);
      listeners.delete(listener);
    };
    const value = activeAudio[key];
    return typeof value === 'function' ? value.bind(activeAudio) : value;
  },
  set(_target, key, value) {
    activeAudio[key] = value;
    return true;
  },
});

function disposeAudio() {
  for (const element of [nativeAudio, graphAudio]) {
    for (const [name, listeners] of mediaListeners) {
      for (const listener of listeners.values()) element.removeEventListener(name, listener);
    }
    element.pause();
    element.removeAttribute('src');
    element.load();
    element.remove();
  }
  mediaListeners.clear();
  audioContext?.close().catch(()=>{});
  D.removeEventListener('pointerdown',unlockAudio,true);
  D.removeEventListener('touchend',unlockAudio,true);
  D.removeEventListener('click',unlockAudio,true);
}
if(isAppleMobile)nativeVolume=false;
// iOS often accepts mute but ignores intermediate HTMLMediaElement.volume values.
// A running Web Audio graph must be selected before loading the song; an asynchronous
// AudioContext.resume() must be given a bounded chance to complete first.
let resumePending=null;
function unlockAudio(){
 if(nativeVolume||disposed||(isAppleMobile&&backgroundPriority()))return Promise.resolve(false);
 try{
  if(!audioContext){
   const C=W.AudioContext||W.webkitAudioContext;
   if(!C)return Promise.resolve(false);
   audioContext=new C();gainNode=audioContext.createGain();
   audioContext.createMediaElementSource(graphAudio).connect(gainNode);
   gainNode.connect(audioContext.destination);
  }
  if(audioContext.state==='running')return Promise.resolve(true);
  if(!['suspended','interrupted'].includes(audioContext.state))return Promise.resolve(false);
  if(!resumePending){
   resumePending=Promise.resolve(audioContext.resume()).then(()=>audioContext?.state==='running',()=>false)
     .finally(()=>{resumePending=null});
  }
  return resumePending;
 }catch(error){
  gainNode=null;trace('Web Audio 初始化失败：'+(error?.message||'未知错误'));
  return Promise.resolve(false);
 }
}
D.addEventListener('click',unlockAudio,true);
async function chooseAudio(alive,forceNative=false){
 if(!alive())return false;
 if(!forceNative&&!nativeVolume&&!(isAppleMobile&&(backgroundPriority()||D.hidden))){
  // Never let a suspended/resuming audio graph stall normal playback indefinitely.
  await Promise.race([unlockAudio(),new Promise(resolve=>setTimeout(()=>resolve(false),500))]);
 }
 if(!alive())return false;
 activeAudio=!forceNative&&!nativeVolume&&!(isAppleMobile&&(backgroundPriority()||D.hidden))&&gainNode&&audioContext?.state==='running'?graphAudio:nativeAudio;
 return true;
}
function volumeCapability(){return nativeVolume||activeAudio===graphAudio&&!!gainNode&&audioContext?.state==='running'}
function volumeBackend(){return volumeCapability()?(activeAudio===graphAudio?'Web Audio 增益':'原生音量'):'仅支持静音 / 系统音量'}
let queue=[],queueIndex=-1,queueRevision=0,queuePlaylistName="",playMode=db.settings.playMode||'order',audioError='';
function validUrl(u){try{let x=new URL(String(u||''));return ['https:','http:'].includes(x.protocol)?x.href:''}catch{return ''}}
function durationText(v){if(!Number.isFinite(v))return '00:00';return String(Math.floor(v/60)).padStart(2,'0')+':'+String(Math.floor(v%60)).padStart(2,'0')}
function audioTracks(){return db.playlists[selected]?.songs||[]}
let mediaKey='', mediaDiagnostic='尚未注册';
function updatePosition(){try{const duration=audio.duration;if(!mediaSession)return;if(Number.isFinite(duration)&&duration>0)mediaSession.setPositionState({duration,position:Math.max(0,Math.min(duration,audio.currentTime||0)),playbackRate:audio.playbackRate||1});else mediaSession.setPositionState()}catch{}}
let artworkJobKey='', artworkJob=null, artworkReady=null;
function prepareSystemArtwork(url,key,track){
 if(artworkJobKey===key)return;
 artworkJob?.abort(); artworkJobKey=key; artworkReady=null;
 const controller=new AbortController(); artworkJob=controller;
 const timer=setTimeout(()=>controller.abort(),8000);
 (async()=>{
   try{
     const response=await W.fetch(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
     if(!response.ok)throw Error('HTTP '+response.status);
     const blob=await response.blob(); if(!blob.type.startsWith('image/')||blob.size>8*1024*1024)throw Error('图片格式或大小');
     const bitmap=await W.createImageBitmap(blob);
     let data;
     try{const canvas=D.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d');const side=Math.min(bitmap.width,bitmap.height);ctx.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,512,512);data=canvas.toDataURL('image/png');}finally{bitmap.close();}
     if(disposed||controller.signal.aborted||playing!==track||mediaKey!==key)return;
     artworkReady={key,src:data};
     mediaSession.metadata=new mediaMetadataCtor({title:String(track.title||'声屿'),artist:String(track.artist||''),album:'声屿 · Sound Isle',artwork:[{src:data,sizes:'512x512',type:'image/png'},{src:url}]});
     mediaDiagnostic='真实封面已转换并提交';
   }catch(e){if(!disposed&&playing===track&&mediaKey===key)mediaDiagnostic='远程封面已提交；转换失败：'+e.name;}
   finally{clearTimeout(timer);}
 })();
}
function updateMedia(){
 if(!mediaSession)return;
 if(!playing){
   mediaKey='';
   try{mediaSession.metadata=null}catch{}
   try{mediaSession.playbackState='none'}catch{}
   try{mediaSession.setPositionState?.()}catch{}
   return;
 }
 const cover=validUrl(playing.coverUrl).replace(/^http:/,'https:');
 const key=JSON.stringify([playing.title,playing.artist,cover]);
 if(key!==mediaKey&&mediaMetadataCtor){
   try{
     // A built-in image is available even for songs without online cover art.
     const artwork=cover?(artworkReady?.key===key?[{src:artworkReady.src,sizes:'512x512',type:'image/png'},{src:cover}]:[{src:cover}])
       :[{src:fallbackArtwork,sizes:'512x512',type:'image/png'}];
     mediaSession.metadata=new mediaMetadataCtor({
       title:String(playing.title||'声屿'),artist:String(playing.artist||'未知歌手'),
       album:'声屿 · Sound Isle',artwork
     });
     mediaKey=key;mediaDiagnostic=cover?'真实封面已提交':'默认封面已提交';
     if(cover) prepareSystemArtwork(cover,key,playing);
   }catch(error){
     // Bad remote artwork and older WebViews must not abort media updates.
     try{
       mediaSession.metadata=new mediaMetadataCtor({title:String(playing.title||'声屿'),artist:String(playing.artist||''),album:'声屿'});
       mediaKey=key;
     }catch(e){mediaKey='';mediaDiagnostic='元数据失败：'+e.name;}
   }
 }
 try{mediaSession.playbackState=audio.paused?'paused':'playing'}catch{}
 updatePosition();
}
function onMediaVisibility(){if(disposed)return;if(!audio.paused&&!resolving){requestPlaybackSession();if(D.hidden)applyGain(1);else if(activeAudio===graphAudio)void unlockAudio();}updateMedia();storePlayback();if(!D.hidden)updateMini()}
D.addEventListener('visibilitychange',onMediaVisibility);
// pageshow/resume can run when the WebView is restored; no forced autoplay
// because app termination and OS media interruptions are controlled by the host.
const onMediaRestore=()=>{if(!disposed){mediaKey='';onMediaVisibility();}};
const onMediaPageHide=()=>{if(!disposed)storePlayback()};
W.addEventListener('pagehide',onMediaPageHide);
W.addEventListener('pageshow',onMediaRestore);
D.addEventListener('resume',onMediaRestore);

function rememberPlay(t){db.recent=db.recent.filter(x=>x.id!==t.id);db.recent.unshift({id:t.id,title:t.title,artist:t.artist,at:Date.now()});db.recent=db.recent.slice(0,100);save()}
let fullPlayer;
let resolving=false;let playEpoch=0, matching=false, matchAttempts=new WeakMap(), actualQuality='';
const manualChanges=new WeakMap();
const autoMatchTasks=createLatestTask();
function noteManualMatch(track) {
  manualChanges.set(track, (manualChanges.get(track) ?? 0) + 1);
}
function chooseMatch(t,songs){
 const norm=x=>String(x||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
 const artists=String(t.artist).split(/[/／、&＆]/).map(norm).filter(Boolean).sort().join('|');
 const wanted=artists.split('|').filter(Boolean);
 const candidates=songs.filter(x=>/^\d+$/.test(String(x.id))&&Array.isArray(x.artists));
 const title=norm(t.title);
 const score=x=>{const a=x.artists.map(norm).filter(Boolean), n=norm(x.title);const exact=n===title;const related=norm(String(x.title).replace(/\s*[（(][^）)]*[）)]\s*$/,''))===title;const overlap=wanted.filter(w=>a.includes(w)).length;return (exact?100:related?70:0)+(overlap===wanted.length&&overlap?40:overlap?20:0);};
 return candidates.map(x=>({x,s:score(x)})).filter(x=>x.s>=90).sort((a,b)=>b.s-a.s)[0]?.x||null;
}
let closeSongPicker=null;
function songPicker(query, label='确认添加', allowLocal=false){
 closeSongPicker?.();
 return new Promise(resolve=>{
 const overlay=D.createElement('div');overlay.className='cap-song-picker-overlay';
 overlay.innerHTML=`<section class="cap-song-picker" role="dialog" aria-modal="true" aria-label="网易云歌曲搜索"><header>网易云歌曲搜索</header><form><input type="search" placeholder="歌名、歌手或关键词" aria-label="搜索关键词"><button type="submit">搜索</button></form><div class="cap-song-picker-status" role="status"></div><div class="cap-song-picker-results"></div><footer><button data-cancel>取消</button>${allowLocal?'<button data-local>仅添加本地记录</button>':''}<button data-confirm disabled>${esc(label)}</button></footer></section>`;
 const input=overlay.querySelector('input'),list=overlay.querySelector('.cap-song-picker-results'),note=overlay.querySelector('[role=status]'),confirm=overlay.querySelector('[data-confirm]');
 let epoch=0,done=false,pick=null;
 const searchTasks=createLatestTask();
 function finish(value){if(done)return;done=true;epoch++;searchTasks.cancel();overlay.remove();D.removeEventListener('keydown',key,true);if(closeSongPicker===cancel)closeSongPicker=null;resolve(value)}
 function cancel(){finish(null)}function key(e){if(e.key==='Escape'){e.preventDefault();cancel()}}
 closeSongPicker=cancel;D.addEventListener('keydown',key,true);D.body.append(overlay);input.value=query.trim();
 overlay.querySelector('[data-cancel]').onclick=cancel;overlay.onclick=e=>{if(e.target===overlay)cancel()};confirm.onclick=()=>{if(pick)finish(pick)};
 const local=overlay.querySelector('[data-local]');if(local)local.onclick=()=>finish({local:true});
 function coverPlaceholder(){
   const placeholder=D.createElement('span');
   placeholder.className='cap-song-picker-placeholder';
   placeholder.innerHTML=icon('music',18);
   return placeholder;
 }
 async function search(){
   const q=input.value.trim(),token=++epoch,task=searchTasks.start();
   pick=null;confirm.disabled=true;list.replaceChildren();
   if(!q){note.textContent='请输入搜索关键词';return}
   if(!shared.online?.ready()){note.textContent='请先配置并启用网易云服务';return}
   note.textContent='正在搜索…';
   try{
     const data=await shared.online.get('/music/search?q='+encodeURIComponent(q),12000,task.signal);
     if(done||token!==epoch)return;
     const rows=(Array.isArray(data.songs)?data.songs:[]).filter(song=>song&&/^\d+$/.test(String(song.id))&&song.title);
     note.textContent=rows.length?'找到 '+rows.length+' 首，请选择歌曲版本':'没有结果，试试更短的关键词';
     for(const song of rows){
       const button=D.createElement('button');
       button.type='button';button.className='cap-song-picker-row';button.setAttribute('aria-pressed','false');
       const cover=validUrl(song.cover);
       if(cover){
         const image=D.createElement('img');
         image.loading='lazy';image.alt='';image.src=cover.replace(/^http:/,'https:');
         image.addEventListener('error',()=>image.replaceWith(coverPlaceholder()));
         button.append(image);
       }else button.append(coverPlaceholder());
       const text=D.createElement('span'), title=D.createElement('strong'), artist=D.createElement('small');
       title.textContent=song.title;
       artist.textContent=(Array.isArray(song.artists)?song.artists:[]).join(' / ')+(song.album?' · '+song.album:'');
       text.append(title,artist);
       button.append(text);
       button.onclick=()=>{
         pick=song;
         for(const row of list.children)row.setAttribute('aria-pressed',String(row===button));
         confirm.disabled=false;
       };
       list.append(button);
     }
   }catch(error){if(!done&&token===epoch)note.textContent='搜索失败：'+error.message}
 }
 overlay.querySelector('form').onsubmit=e=>{e.preventDefault();void search()};input.oninput=()=>{epoch++;searchTasks.cancel();pick=null;confirm.disabled=true;list.replaceChildren();note.textContent='点击搜索获取结果'};void search();
 });
}
async function matchOnline(track, manual = false, signal = storyTask.signal) {
  if (!track || !shared.online?.ready() || signal.aborted) return false;
  if (!manual && track.neteaseId) return true;
  if (!manual && (track.autoMatchDisabled || validUrl(track.audioUrl))) return false;
  if (manual) noteManualMatch(track);
  const revision = manualChanges.get(track);
  const intact = () => !disposed && !signal.aborted && revision === manualChanges.get(track);
  let picked;
  if (manual) {
    picked = await songPicker([track.title, track.artist].filter(Boolean).join(' '), '确认匹配');
  } else {
    const songs = new Map();
    for (const query of new Set([[track.title, track.artist].filter(Boolean).join(' '), track.title])) {
      if (!intact() || !shared.online?.ready()) return false;
      const result = await shared.online.get('/music/search?q='+encodeURIComponent(query), 12000, signal);
      for (const song of Array.isArray(result.songs) ? result.songs : []) songs.set(String(song.id), song);
      picked = chooseMatch(track, [...songs.values()]);
      if (picked) break;
    }
  }
  if (!intact() || !/^\d+$/.test(String(picked?.id))) return false;
  if (!Object.values(db.playlists).some(list => list.songs.includes(track)) && !queue.includes(track)) return false;
  if (!manual && (track.neteaseId || track.audioUrl)) return !!track.neteaseId;
  if (manual) cancelTrackLoad(track);
  track.neteaseId = String(picked.id);
  if (manual) track.autoMatchDisabled = false;
  const cover = validUrl(picked.cover);
  if (cover && !validUrl(track.coverUrl)) track.coverUrl = cover.replace(/^http:/, 'https:');
  save();
  render();
  return true;
}

async function autoMatch() {
  if (matching || resolving || disposed || !shared.online?.ready() || shared.flags.music === false) return;
  const songs = db.playlists[character()?.id]?.songs || [];
  const eligible = track => !track.neteaseId && !track.audioUrl && !track.autoMatchDisabled
    && Date.now() - (matchAttempts.get(track) || 0) > 30000;
  const track = songs.findLast ? songs.findLast(eligible) : songs.slice().reverse().find(eligible);
  if (!track) return;
  const task = autoMatchTasks.start();
  matching = true;
  matchAttempts.set(track, Date.now());
  try {
    const found = await matchOnline(track, false, task.signal);
    if (!task.active()) return;
    if (!found) {
      status('未找到准确版本：'+track.title+'，可手动在线匹配',false);
      return;
    }
    status('已匹配网易云：'+track.title,false);
    if (playing === track && !resolving && !audio.getAttribute('src') && shouldFollowStory()) {
      void storyPlay(queueIndex);
    }
  } catch (error) {
    if (task.active()) status('在线匹配暂不可用：'+error.message,false);
  } finally {
    matching = false;
  }
}
async function playIndex(index){const tracks=audioTracks();if(!tracks[index])return;queue=tracks.slice();queueRevision++;queuePlaylistName=db.playlists[selected]?.name||'声屿';return playQueued(index)}
let lastMemory=0;
function storePlayback(){
  if(disposed||!playing||resolving)return;
  const start=Math.max(0,queueIndex-499);
  db.settings.playback={
    queue:queue.slice(start,start+500).map(t=>({id:t.id,title:t.title,artist:t.artist,neteaseId:t.neteaseId,coverUrl:t.coverUrl,audioUrl:t.audioUrl})),
    index:queueIndex-start,name:queuePlaylistName,position:audio.currentTime||resumePosition||0,
  };
  save();
}
let resumePosition=0;
let manualPause=false;
const autoPref=k=>W.localStorage.getItem("capricorn_auto_"+k)==="on";
function storyPlay(index){
 if(!manualPause && ((!audio.paused && started)||autoPref("story"))) return playQueued(index);
 if(!audio.paused||resolving)return;
 stopPlaybackWork();clearAudio();queueIndex=index;playing=queue[index];resumePosition=0;storePlayback();updateMedia();render();
}
let playbackLog=[], coverState='未检查', started=false;
function trace(msg){playbackLog.push(String(msg));if(playbackLog.length>40)playbackLog.shift();status(msg,false);fullPlayer?.refresh()}
let fadeGain=1;
function targetVolume(){return Number.isFinite(+db.settings.volume)?Math.max(0,Math.min(1,+db.settings.volume)):0.8}
function applyGain(g){fadeGain=g;const v=targetVolume()*g;if(activeAudio===graphAudio&&gainNode){gainNode.gain.value=v;graphAudio.volume=1;graphAudio.muted=false}else{try{nativeAudio.volume=v}catch{}nativeAudio.muted=targetVolume()===0}}
function fadeTo(to,ms,epoch){if(D.hidden){applyGain(to);return Promise.resolve(true)}const from=fadeGain,start=Date.now();return new Promise(resolve=>{function step(){if(disposed||epoch!==playEpoch)return resolve(false);const x=Math.min(1,(Date.now()-start)/ms);applyGain(from+(to-from)*x);if(x<1&&!D.hidden)setTimeout(step,20);else if(x<1){applyGain(to);resolve(true)}else resolve(true)}step()})}
function syncNativeLoop(){audio.loop=playMode==='one';}
function clearAudio(){audio.pause();audio.removeAttribute('src');audio.load();started=false}
function stopPlaybackWork(){
  playbackTasks.cancel();
  playEpoch++;
  resolving=false;
}
function cancelTrackLoad(track){
  if(resolving&&playing===track){
    stopPlaybackWork();
    clearAudio();
  }
}
async function attemptPlay(timeout=12000,signal){
  try {
    requestPlaybackSession();
    await withMusicTimeout(() => audio.play(), timeout, signal);
  } catch (error) {
    if (error.name === 'AbortError' && error.message === '请求超时' && !signal?.aborted) {
      throw Error('音频加载超时');
    }
    throw error;
  }
}
const qualityOrder=['jymaster','sky','jyeffect','hires','lossless','exhigh','higher','standard'];
async function playQueued(index,resumeAt=0,preferOnline=false){
 manualPause=false;
 if(!queue.length||disposed)return;
 autoMatchTasks.cancel();
 const task=playbackTasks.start(),epoch=++playEpoch;
 const {signal}=task;
 const alive=()=>task.active()&&epoch===playEpoch&&!disposed;
 queueIndex=(index+queue.length)%queue.length;
 const t=queue[queueIndex];
 resolving=true;
 if(!audio.paused&&!audio.ended){await fadeTo(0,320,epoch);if(!alive())return;}
 resumePosition=resumeAt;playing=t;audioError='';actualQuality='';playbackLog=[];coverState='未检查';clearAudio();render();
 const deadline=Date.now()+95000;
 async function candidate(url,quality,forceNative=false){if(!alive())return false;clearAudio();if(!await chooseAudio(alive,forceNative))return false;syncNativeLoop();applyGain(D.hidden?1:0);audio.src=url;actualQuality=quality;trace('正在加载：'+quality);try{await attemptPlay(Math.max(1,Math.min(12000,deadline-Date.now())),signal);if(!alive())return false;if(resumeAt>0&&Number.isFinite(audio.duration))audio.currentTime=Math.min(resumeAt,audio.duration);resumePosition=0;started=true;void fadeTo(1,650,epoch);return true}catch(e){if(!alive())return false;if(e.name==='NotAllowedError'){trace('音源已准备，请再次点击播放');throw e}trace(quality+'：'+(audio.error?'媒体错误 '+audio.error.code:e.name==='AbortError'?'加载中断':e.message==='音频加载超时'?e.message:'播放失败 '+e.name));const retry=activeAudio===graphAudio;clearAudio();if(retry&&alive())return candidate(url,quality,true);return false}}
 async function loadCover(id){
   if(validUrl(t.coverUrl)){coverState='已有地址';return;}
   try {
     const metadata=await shared.online.get('/music/detail?id='+encodeURIComponent(id)+'&q='+encodeURIComponent([t.title,t.artist].filter(Boolean).join(' ')),10000,signal);
     if(!alive()||t.neteaseId!==id||validUrl(t.coverUrl))return;
     const cover=validUrl(metadata.cover);
     if(!cover){coverState='详情未返回封面';return;}
     t.coverUrl=cover.replace(/^http:/,'https:');
     save();
     coverState='已取得地址';
     fullPlayer?.refresh();updateMedia();
   } catch(error) {
     if(alive())coverState='详情请求失败：'+error.name;
   }
 }
 try{let ok=false;const manual=preferOnline?'':validUrl(t.audioUrl);if(manual)ok=await candidate(manual,'手动音源');if(!alive())return;
 if(!ok&&shared.online?.ready()){
 if(!t.neteaseId&&!manual)await matchOnline(t,false,signal);if(!alive())return;if(!t.neteaseId)throw Error('尚未匹配网易云歌曲');
 const id=t.neteaseId;
 void loadCover(id);
 for(const level of qualityOrder.slice(Math.max(0,qualityOrder.indexOf(db.settings.preferredQuality)))){if(!alive())return;if(t.neteaseId!==id)throw Error('歌曲关联已更新，请重试');if(Date.now()>=deadline)break;trace('正在请求：'+level);let d;try{d=await shared.online.get('/music/url?id='+encodeURIComponent(id)+'&level='+level,Math.max(1,Math.min(16000,deadline-Date.now())),signal)}catch(e){if(!alive())return;trace(level+'：'+(e.name==='AbortError'?'请求超时':e.message));continue}if(!alive())return;if(t.neteaseId!==id)throw Error('歌曲关联已更新，请重试');if(!d.available){trace(level+'：'+(d.reason||'无完整音源')+(d.upstreamCode?' ('+d.upstreamCode+')':''));continue}const url=validUrl(d.url);if(!url||new URL(url).protocol!=='https:'){trace(level+'：无有效 HTTPS 音源');continue}const mime={mp3:'audio/mpeg',flac:'audio/flac',aac:'audio/aac',m4a:'audio/mp4',wav:'audio/wav',ogg:'audio/ogg'}[String(d.type||'').toLowerCase()];if(mime&&!audio.canPlayType(mime)){trace(level+'：设备不支持 '+d.type);continue}if(await candidate(url,d.level||level)){ok=true;break}}
 }else if(!ok&&!manual)throw Error('请启用网易云并填写访问密钥');if(!alive())return;if(!ok)throw Error('未能加载完整音源，请查看播放诊断');resolving=false;rememberPlay(t);storePlayback();updateMedia();render();trace('播放成功：'+actualQuality+(volumeCapability()?'':' · 当前音源请使用系统音量键'));
 }catch(e){if(!alive())return;resolving=false;audioError=e.name==='NotAllowedError'?'系统要求再次点击播放':e.message;render();trace(audioError)}
}
function diagnostic(){return ['声屿 2.7.5','系统媒体会话：'+(mediaSession?'支持':'不支持'),'系统音频会话：'+(systemAudioSession?.type||'不支持'),'系统音频状态：'+(systemAudioSession?.state||'未知'),'页面状态：'+D.visibilityState,'聊天：'+chatId(),'跟随状态：'+String(observedStory)+' / '+String(pendingScope),'后台播放优先：'+String(isAppleMobile&&backgroundPriority()),'音频通道：'+(activeAudio===nativeAudio?'HTMLAudioElement':'Web Audio'),'媒体元数据：'+mediaDiagnostic,'系统媒体构造器：'+(mediaMetadataCtor?'支持':'不支持'),'音量引擎：'+volumeBackend(),'音频上下文：'+(audioContext?.state||'未创建'),'歌曲：'+(playing?.title||'无'),'网易云ID：'+(playing?.neteaseId||'无'),'封面：'+coverState,'音质：'+actualQuality,'readyState：'+audio.readyState,'networkState：'+audio.networkState,'媒体错误：'+(audio.error?.code||0),'状态：'+audioError,...playbackLog].join('\n')}
function nextTrack(direction=1){if(!queue.length){let tracks=audioTracks();if(!tracks.length)return;queue=tracks.slice();queueRevision++;queueIndex=0;queuePlaylistName=db.playlists[selected]?.name||'声屿';return playQueued(0)}let i=queueIndex;if(playMode==='shuffle'&&queue.length>1){let n=Math.floor(Math.random()*(queue.length-1));i=n>=i?n+1:n}else i=(i+direction+queue.length)%queue.length;playQueued(i)}
async function toggleAudio(){
  manualPause=resolving||!audio.paused;
  if(resolving){stopPlaybackWork();clearAudio();trace('已取消加载，再点播放重试');render();return;}
  if(!playing)return playIndex(0);
  if(!audio.paused){
    stopPlaybackWork();
    const epoch=playEpoch;
    await fadeTo(0,250,epoch);
    if(epoch===playEpoch&&!disposed){audio.pause();render();}
    return;
  }
  if(!audio.getAttribute('src')||audio.error)return playQueued(queueIndex,audio.currentTime||resumePosition||0);
  const task=playbackTasks.start(),epoch=++playEpoch;
  resolving=true;
  try{
    applyGain(0);
    await attemptPlay(12000,task.signal);
    if(!task.active()||disposed)return;
    void fadeTo(1,450,epoch);
    started=true;audioError='';trace('播放成功：'+actualQuality);
  }catch(error){
    if(!task.active()||disposed)return;
    audioError=error.name==='NotAllowedError'?'系统阻止播放，请再次点击':error.message;
    trace(audioError);
    if(error.name!=='NotAllowedError')clearAudio();
  }finally{
    if(task.active()&&!disposed){resolving=false;render();}
  }
}
audio.addEventListener('error',()=>{
  if (resolving || !audio.error || !audio.getAttribute('src')) return;
  const reasons={1:'播放已中止',2:'网络或音源请求失败',3:'音频格式无法解码',4:'音源不可用或格式不受支持'};
  audioError=reasons[audio.error.code]||'音频播放失败';
  status(audioError+'；请检查音源授权、链接有效期及格式');
  updateMini();
});
audio.addEventListener('ended',()=>{
  if (resolving || !audio.ended || !audio.getAttribute('src')) return;
  if (playMode==='one') {
    audio.currentTime=0;
    audio.play().catch(()=>{});
  } else nextTrack(1);
});
audio.addEventListener('play',()=>{requestPlaybackSession();updateMedia();updateMini()});audio.addEventListener('playing',()=>{mediaKey='';updateMedia();});audio.addEventListener('pause',()=>{updateMedia();updateMini();storePlayback()});
audio.addEventListener('timeupdate',()=>{if(Date.now()-lastMemory>(D.hidden?30000:5000)){lastMemory=Date.now();storePlayback();updatePosition()}if(D.hidden)return;let seek=root.querySelector('#si-seek'),clock=root.querySelector('.si-clock');if(seek&&!seek.matches(':active')){seek.max=String(Number.isFinite(audio.duration)?audio.duration:0);seek.value=String(audio.currentTime||0)}if(clock){const text=durationText(audio.currentTime)+' / '+durationText(audio.duration);if(clock.textContent!==text)clock.textContent=text}});
function updateMini(){
  root.dataset.audioPaused=String(audio.paused);
  fullPlayer?.refresh();
  updateLegacyPlayer();
}
function updateLegacyPlayer(){
  const title=root.querySelector('.si-island-title'),button=root.querySelector('[data-action="playpause"]');
  if(title&&title.textContent!==(playing?.title||'声屿'))title.textContent=playing?.title||'声屿';
  if(button){
    const action=audio.paused?'播放':'暂停';
    if(button.dataset.mediaAction!==action){button.innerHTML=icon(audio.paused?'play':'pause',26);button.dataset.mediaAction=action;}
    button.setAttribute('aria-label',action);
    button.title=action;
  }
}
const mediaActions=['play','pause','previoustrack','nexttrack','seekto','seekbackward','seekforward','stop'];
function mediaSeek(value){if(Number.isFinite(value)&&Number.isFinite(audio.duration)){audio.currentTime=Math.max(0,Math.min(audio.duration,value));updatePosition()}}
if(mediaSession){
  const pause=()=>{
    manualPause=true;
    const loading=resolving;
    stopPlaybackWork();
    if(loading)clearAudio();
    else audio.pause();
    render();
    updateMedia();
  };
  const handlers={play:()=>{if(audio.paused&&!resolving)void toggleAudio()},pause,previoustrack:()=>nextTrack(-1),nexttrack:()=>nextTrack(1),seekto:x=>mediaSeek(x.seekTime),seekbackward:x=>mediaSeek(audio.currentTime-(x.seekOffset||10)),seekforward:x=>mediaSeek(audio.currentTime+(x.seekOffset||10)),stop:()=>{pause();mediaSeek(0);storePlayback()}};
  for(const action of mediaActions)try{mediaSession.setActionHandler(action,handlers[action])}catch{}
}
for(const event of ['loadedmetadata','durationchange','seeked','ratechange'])audio.addEventListener(event,updatePosition);


const root=D.createElement('div');root.id='sound-isle-root';
const style=D.createElement('style');style.id='sound-isle-style';style.textContent=`
#sound-isle-root{position:fixed;z-index:2147483000;top:calc(env(safe-area-inset-top, 0px) + 12px);right:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f7f7fa;font-size:13px;pointer-events:none}
#sound-isle-root *{box-sizing:border-box}#sound-isle-root .si-island{pointer-events:auto;display:flex;align-items:center;gap:9px;border:0;border-radius:999px;background:rgba(18,18,22,.92);color:white;padding:9px 14px;min-width:154px;max-width:250px;box-shadow:0 10px 30px #0005;cursor:pointer;user-select:none;touch-action:none}
#sound-isle-root .si-dot{width:9px;height:9px;background:#f48eab;border-radius:50%;flex-shrink:0}#sound-isle-root .si-island-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;text-align:left}
#sound-isle-root .si-panel{pointer-events:auto;display:none;position:absolute;top:47px;right:0;width:min(360px,calc(100vw - 20px));max-height:min(74vh,650px);overflow:auto;border-radius:23px;padding:16px;background:rgba(28,28,35,.95);backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);box-shadow:0 15px 55px #0007;color:#f7f7fa}#sound-isle-root .si-panel.open{display:block}
#sound-isle-root button,#sound-isle-root input,#sound-isle-root select{font:inherit}#sound-isle-root button{cursor:pointer}#sound-isle-root .si-btn{background:#ffffff1b;color:#fff;border:1px solid #ffffff24;border-radius:11px;padding:7px 10px}#sound-isle-root .si-btn:hover{background:#ffffff30}
#sound-isle-root .si-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px}#sound-isle-root .si-h1{font-weight:750;font-size:19px}#sound-isle-root .si-muted{color:#b7b6bf;font-size:11px}#sound-isle-root .si-input{background:#ffffff15;border:1px solid #ffffff35;color:#fff;border-radius:9px;padding:9px;width:100%;min-width:0}#sound-isle-root .si-row{display:flex;gap:7px;align-items:center;margin:8px 0}#sound-isle-root .si-row .si-input{flex:1}#sound-isle-root .si-section{margin:16px 0 8px;font-size:11px;color:#bbb;text-transform:uppercase;letter-spacing:1px}#sound-isle-root .si-list{display:flex;flex-direction:column;gap:5px}#sound-isle-root .si-item{border:0;background:#ffffff0d;border-radius:10px;color:#fff;padding:10px;text-align:left;display:flex;align-items:center;gap:7px;width:100%}#sound-isle-root .si-item.active{background:#f48eab33}#sound-isle-root .si-item .si-grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#sound-isle-root .si-track{display:flex;gap:6px;align-items:center;padding:8px 0;border-bottom:1px solid #ffffff18}#sound-isle-root .si-track .si-grow{flex:1;min-width:0}#sound-isle-root .si-song{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#sound-isle-root .si-footer{margin-top:16px;padding-top:10px;border-top:1px solid #ffffff24}#sound-isle-root .si-pill{display:inline-block;background:#ffffff15;border-radius:20px;padding:4px 8px;margin:3px 0}#sound-isle-root .si-danger{color:#ffb1bd}
#sound-isle-root .si-cover{width:100px;height:100px;object-fit:cover;border-radius:16px;box-shadow:0 8px 30px #0006;background:linear-gradient(135deg,#ce769b,#6558a2)}
#sound-isle-root .si-now{display:flex;align-items:center;gap:13px;margin:12px 0;padding:12px;border-radius:18px;background:linear-gradient(120deg,#d36a8a30,#9876ba22)}
#sound-isle-root .si-controls{display:flex;justify-content:center;align-items:center;gap:12px;margin:10px 0}
#sound-isle-root .si-mainplay{font-size:22px;border-radius:50%;height:46px;width:46px;border:0;background:#fff;color:#17151c}
#sound-isle-root input[type=range]{accent-color:#f6a1bd;width:100%;min-width:0}
#sound-isle-root .si-panel{max-height:min(78dvh,720px);overscroll-behavior:contain}
#sound-isle-root .si-island{touch-action:none}
@media(max-width:420px){#sound-isle-root .si-panel{width:min(350px,calc(100vw - 18px));padding:13px}}

`;
D.head.append(style);D.body.append(root);
let statusText='本地曲库已就绪';function status(t, toastKind='auto'){statusText=t;fullPlayer?.refresh();const e=root.querySelector('.si-status');if(e)e.textContent=t;if(toastKind===false||D.hidden||!t)return;const text=String(t);const kind=toastKind!=='auto'?toastKind:/失败|无法|错误|不可用/.test(text)?'error':/请先|请输入|没有找到|未识别|无效|暂无|禁止|已存在|正在运行|停止/.test(text)?'warn':/成功|已保存|已添加|已复制|已导出|已关联|已合并|已自动收录|已解除|匹配完成/.test(text)?'success':'info';uiToast(text,{doc:D,kind});}
// 网易云仅关联歌曲公开页面；不处理账户密码、Cookie、私有播放地址。
function neteaseId(raw){let value=String(raw||'').trim();if(/^\d{1,20}$/.test(value))return value;try{let u=new URL(value);if(!['music.163.com','y.music.163.com','163cn.tv'].includes(u.hostname))return '';if(u.hostname==='163cn.tv')return '';let id=u.searchParams.get('id')||new URLSearchParams((u.hash.split('?')[1]||'')).get('id');if(!id){let m=u.pathname.match(/\/song\/(\d+)/);id=m?.[1]}return /^\d{1,20}$/.test(id||'')?id:''}catch{return ''}}
function neteaseUrl(t){return t?.neteaseId?'https://music.163.com/#/song?id='+encodeURIComponent(t.neteaseId):'https://music.163.com/#/search/m/?s='+encodeURIComponent(t.title+' '+t.artist)}
function openExternal(url){try{W.open(url,'_blank','noopener,noreferrer')}catch(e){status('打开网易云失败：'+e.message)}}
// 可选的公开元数据候选：Apple iTunes Search API，不是网易云数据或网易云音源。
// 必须用户手动点击才发起请求；结果需用户确认，永不覆盖已关联的网易云ID。
const normalize=s=>String(s||'').toLocaleLowerCase().normalize('NFKC').replace(/[\\s\\p{P}\\p{S}]+/gu,'');
async function metadataCandidates(t,task){
  if(W.localStorage.getItem('capricorn_privacy_mode')==='local'||!W.localStorage.getItem('capricorn_privacy_mode'))throw Error('本地模式禁止在线元数据查询');
  if(!await uiConfirm('向 Apple 公开曲库发送歌名和歌手以查询专辑封面候选？',{doc:D,title:'查询公开封面',confirmText:'查询'}))return [];
  return withMusicTimeout(async signal=>{
    const url='https://itunes.apple.com/search?'+new URLSearchParams({term:t.title+' '+t.artist,entity:'song',limit:'12'});
    const r=await fetch(url,{signal,credentials:'omit',referrerPolicy:'no-referrer'});
    if(!r.ok)throw Error('查询返回 HTTP '+r.status);
    const x=await r.json();
    return (Array.isArray(x.results)?x.results:[]).filter(v=>v.kind==='song'&&v.trackName&&v.artistName).map(v=>({
      title:String(v.trackName),artist:String(v.artistName),album:String(v.collectionName||''),
      cover:validUrl(String(v.artworkUrl100||'').replace(/100x100bb/g,'600x600bb')),
      preview:validUrl(v.previewUrl),url:validUrl(v.trackViewUrl),
      score:(normalize(v.trackName)===normalize(t.title)?3:normalize(v.trackName).includes(normalize(t.title))?1:0)
       +(normalize(v.artistName)===normalize(t.artist)?3:normalize(v.artistName).includes(normalize(t.artist))?1:0)
    })).sort((a,b)=>b.score-a.score).slice(0,8);
  },8500,task.signal);
}
async function chooseMetadata(t){
  const task=storyTask,revision=manualChanges.get(t);
  status('正在查询公开元数据候选（非网易云）…');
  let results;try{results=await metadataCandidates(t,task)}catch(e){if(task.active())status('元数据查询不可用：'+(e?.message||'网络限制')+'；仍可手动设置封面');return}
  if(!task.active()||revision!==manualChanges.get(t)||!Object.values(db.playlists).some(list=>list.songs.includes(t)))return;
  if(!results.length){status('没有找到候选，请使用「音源」手动设置封面');return}
  const lines=results.map((r,i)=>`${i+1}. ${r.title} — ${r.artist}${r.album?' / '+r.album:''}${r.score<5?' [需仔细核对]':''}`);
  let answer=await uiPrompt('以下来自 Apple 公开曲库，并非网易云搜索结果。\n请核对歌手和版本，输入序号确认专辑封面：\n\n'+lines.join('\n'),'1',{doc:D,title:'选择专辑封面候选',placeholder:'输入序号'});
  if(answer===null)return;
  const idx=Number(answer)-1,c=results[idx];
  if(!Number.isInteger(idx)||!c){status('未选择有效候选');return}
  if(!await uiConfirm('将「'+c.title+' — '+c.artist+'」的封面关联到「'+t.title+' — '+t.artist+'」？\n不会修改网易云 ID，也不会自动绑定试听音源。',{doc:D,title:'确认关联封面',confirmText:'应用封面'}))return;
  noteManualMatch(t);
  if(c.cover)t.coverUrl=c.cover;
  t.metadataSource='itunes';t.metadataTitle=c.title;t.metadataArtist=c.artist;t.metadataUrl=c.url;
  t.previewUrl=c.preview;save();status('已关联候选封面；网易云歌曲ID保持不变');render();
}
// 手动批量补封面：逐首显示候选，确认后保存；网络失败不中断本地歌单。
let metadataBatchRunning=false;
async function batchMetadata(){
 if(metadataBatchRunning)return status('已有批量匹配任务在运行');
 const pl=db.playlists[selected]||db.playlists[current];if(!pl)return status('请先选择歌单');
 const missing=pl.songs.filter(t=>!validUrl(t.coverUrl));
 if(!missing.length)return status('此歌单所有歌曲已有封面');
 if(!await uiConfirm('为「'+pl.name+'」中 '+missing.length+' 首缺少封面的歌曲逐首查询公开曲库？\n每首都需手动确认，不会查询网易云或读取账号数据。',{doc:D,title:'批量补齐封面',confirmText:'开始查询'}))return;
 const task=storyTask;
 metadataBatchRunning=true;let ok=0,skip=0;
 try{
  for(let i=0;i<missing.length;i++){
   if(!task.active())break;
   let t=missing[i];if(!pl.songs.includes(t)||validUrl(t.coverUrl))continue;
   status('封面候选 '+(i+1)+'/'+missing.length+'：'+t.title,false);
   let found;try{found=await metadataCandidates(t,task)}catch(e){if(task.active())status('网络查询失败，批量操作已停止：'+(e?.message||e));break}
   if(!task.active()||db.playlists[pl.id]!==pl||!pl.songs.includes(t)||validUrl(t.coverUrl))break;
   if(!found.length){skip++;continue}
   const lines=found.map((c,j)=>(j+1)+'. '+c.title+' — '+c.artist+(c.album?' / '+c.album:'')+(c.score<5?' [匹配度低]':''));
   let answer=await uiPrompt('第 '+(i+1)+'/'+missing.length+' 首：'+t.title+' — '+t.artist+'\n输入序号确认，留空跳过，输入 q 结束：\n\n'+lines.join('\n'),'',{doc:D,title:'批量封面匹配',placeholder:'序号 / 留空跳过 / q 结束'});
   if(answer===null||String(answer).toLowerCase()==='q')break;
   if(!String(answer).trim()){skip++;continue}
   const n=Number(answer)-1,c=found[n];
   if(!Number.isInteger(n)||!c||!c.cover){skip++;continue}
   if(!await uiConfirm('确认使用「'+c.title+' — '+c.artist+'」的封面？\n不会修改音源或网易云 ID。',{doc:D,title:'确认封面',confirmText:'使用'})){skip++;continue}
   noteManualMatch(t);
   t.coverUrl=c.cover;t.metadataSource='itunes';t.metadataTitle=c.title;t.metadataArtist=c.artist;t.metadataUrl=c.url;t.previewUrl=c.preview;
   ok++;save();render();
  }
 }finally{metadataBatchRunning=false;if(task.active()){status('封面批量匹配完成：成功 '+ok+' 首，跳过 '+skip+' 首');render()}}
}
function trackId(title,artist){return (title+'|'+artist).trim().toLocaleLowerCase().replace(/\s+/g,' ')}
function parseBgm(body){const re=/<bgm(?:\s[^>]*)?>([\s\S]*?)<\/bgm>/gi,out=[];for(const m of String(body||'').matchAll(re)){let line=m[1].replace(/<[^>]*>/g,'').trim().split('\n')[0].trim();let parts=line.split(/\s+[-—–－]\s+/);if(parts.length<2)continue;let artist=parts.pop().trim(),title=parts.join(' - ').trim();if(title&&artist&&title.length<150&&artist.length<150)out.push({id:trackId(title,artist),title,artist})}return out}
function addSong(pl,track,source,knownIds){
  if(!pl||!track||(knownIds?knownIds.has(track.id):pl.songs.some(song=>song.id===track.id)))return false;
  pl.songs.push({...track,source:source||null,added:Date.now()});
  if(knownIds)knownIds.add(track.id);
  else save();
  return true;
}
function chatId(){const c=context();return String(shared.chatIdentity?.()?.chatId||c.getCurrentChatId?.()||c.chatId||c.characters?.[c.characterId??c.character_id]?.chat||c.chatMetadata?.chat_id||'unknown')}
function storyKey(){
  const ch=character();
  return ch ? shared.scope?.()||JSON.stringify([ch.id,chatId()]) : null;
}
function shouldFollowStory(){
  return !shared.recallLocked&&shared.flags.music!==false&&W.localStorage.getItem('capricorn_follow_story')!=='off';
}
function readStoryMessages(){
  const native=context().chat;
  if(Array.isArray(native))return {messages:native,incremental:true};
  const last=api('getLastMessageId');
  if(last===-1)return {messages:[],incremental:false};
  const rows=Number.isInteger(last)&&last>=0?api('getChatMessages',`0-${last}`,{role:'assistant',hide_state:'all'}):null;
  return Array.isArray(rows)?{messages:rows,incremental:false}:null;
}

const bgmIndex=createBgmIndex(parseBgm,hash);
const pendingTags=new Map(),dirtyFloors=new Set();
let indexScope=null,fullScan=true,lastFullAt=0,lastVisitCount=0;
let indexRevision=0,indexWork,lastSliceCount=0,cancelledBgmScans=0;
let scanFollowSignature=null,pendingScope=null,pendingAt=0,pendingSwitch=false,followTimer=null,observedStory=null,observedCharacter=null,skipSwitchMusic=false;
let indexedStory=null,confirmedStory=null;

function storySnapshot(scope, { messages, incremental }) {
  const sample = message => incremental ? message : message?.message ?? message?.mes;
  return { scope, length: messages.length, first: sample(messages[0]), last: sample(lastItem(messages)) };
}

async function updateBgmIndex(scope,task){
  if(indexWork?.scope===scope&&indexWork.revision===indexRevision)return indexWork.promise;
  const needsFull=fullScan||indexScope!==scope||Date.now()-lastFullAt>=60000;
  if(!needsFull&&!dirtyFloors.size)return true;
  const source=readStoryMessages();
  if(!source)return false;
  const snapshot=storySnapshot(scope,source);
  if(indexedStory && indexedStory.scope!==scope && confirmedStory!==scope &&
    indexedStory.length===snapshot.length && indexedStory.first===snapshot.first && indexedStory.last===snapshot.last) {
    // A new chat ID can be visible while the native message array still belongs to the previous chat.
    return false;
  }
  const shiftedPrefix=source.incremental&&indexedStory?.scope===scope&&indexedStory.length>0&&
    indexedStory.length!==snapshot.length&&(indexedStory.first!==snapshot.first||source.messages[indexedStory.length-1]!==indexedStory.last);
  const job={scope,revision:indexRevision};
  const check=()=>{
    task?.check();
    if(disposed||D.hidden||storyKey()!==scope||indexRevision!==job.revision)throw new DOMException('剧情音乐已更新','AbortError');
  };
  const yieldControl=task?.yield||(()=>new Promise(resolve=>W.setTimeout(resolve,0)));
  job.promise=(async()=>{
    const release=task?.reserve(1024*1024);
    if(task&&!release)return false;
    try {
      const commit=await bgmIndex.prepareChunked(scope,source.messages,needsFull||shiftedPrefix||!source.incremental?null:dirtyFloors,{check,yieldControl});
      publishBgmIndex(scope,snapshot,commit());
      return true;
    } finally { release?.(); }
  })().catch(error=>{
    if(error?.name!=='AbortError')throw error;
    cancelledBgmScans++;
    return false;
  }).finally(()=>{if(indexWork===job)indexWork=undefined;});
  indexWork=job;
  return job.promise;
}

function publishBgmIndex(scope,snapshot,result){
  indexedStory=snapshot;
  lastVisitCount=result.visited;
  lastSliceCount=result.slices;
  if(result.full){
    lastFullAt=Date.now();
    for(const position of pendingTags.keys()){
      if(!result.changed.has(position))pendingTags.delete(position);
    }
  }
  const ch=character(),chat=chatId();
  const now=Date.now();
  for(const [position,row] of result.changed){
    if(!row){pendingTags.delete(position);continue;}
    const key=JSON.stringify([scope,row.id]);
    const legacyKey=ch.id+'|'+chat+'|'+row.id;
    if(db.processed[key]===row.signature||db.processed[legacyKey]===row.signature){pendingTags.delete(position);continue;}
    const previous=pendingTags.get(position);
    if(previous?.key===key&&previous.row.signature===row.signature)continue;
    pendingTags.set(position,{key,row,due:now+9000});
  }
  indexScope=scope;
  fullScan=false;
  dirtyFloors.clear();
}

async function scan(force=false,task){
  if(scanBusy||disposed||shared.flags.music===false)return;
  const ch=character(),scope=storyKey(),chat=chatId();
  if(!ch||!scope||chat==='unknown'||(pendingScope&&!force))return;
  scanBusy=true;
  if(force)markFull();
  const revision=indexRevision;
  try{
    if(!await updateBgmIndex(scope,task))return;
    task?.check();
    if(disposed||scope!==storyKey()||revision!==indexRevision)return;
    const pl=playlist(ch.id,ch.name+' · 故事原声');
    let added=0,changed=false,knownIds;
    const now=Date.now();
    for(const [position,{key,row,due}] of pendingTags){
      if(now<due)continue;
      if (!knownIds) knownIds = new Set(pl.songs.map(song=>song.id));
      for(const song of row.found)if(addSong(pl,song,{chat,floor:row.id,character:ch.name},knownIds))added++;
      db.processed[key]=row.signature;
      pendingTags.delete(position);
      changed=true;
    }
    if(changed)save();
    if(added){status('已自动收录 '+added+' 首歌曲');render();}
    const row=bgmIndex.latest();
    if(!row||!shouldFollowStory())return;
    const key=JSON.stringify([scope,row.id]),legacyKey=ch.id+'|'+chat+'|'+row.id;
    if(db.processed[key]!==row.signature&&db.processed[legacyKey]!==row.signature)return;
    const signature=JSON.stringify([key,row.signature]);
    if(signature===scanFollowSignature)return;
    const track=pl.songs.find(song=>song.id===lastItem(row.found).id);
    if(!track||(!validUrl(track.audioUrl)&&!shared.online?.ready()))return;
    scanFollowSignature=signature;
    if(playing?.id===track.id&&(resolving||audio.getAttribute('src')))return;
    queue=pl.songs.slice();
    queueRevision++;
    queuePlaylistName=pl.name;
    void storyPlay(queue.indexOf(track));
  }catch(error){
    if(error?.name!=='AbortError'){
      markFull();
      console.warn('[声屿] 扫描失败',error);
    }
  }finally{scanBusy=false;}
}
function sync(){const ch=character();if(!ch)return;if(current!==ch.id){current=ch.id;playlist(ch.id,ch.name+' · 故事原声');if(!selected||db.playlists[selected]?.kind==='character')selected=ch.id;render()}}
let storyEventSource=null,storyEventName=null,scanEvents=[];
function markScan(id){
  indexRevision++;
  const position=typeof id==='number'?id:typeof id==='string'&&/^\d+$/.test(id)?Number(id):NaN;
  if(Number.isSafeInteger(position)&&position>=0)dirtyFloors.add(position);
  else fullScan=true;
}
function markTail(){
  const chat=context().chat;
  if(Array.isArray(chat)&&chat.length)markScan(chat.length-1);
  else markFull();
}
function markFull(){indexRevision++;fullScan=true;}
function unbind(event,listener){
  if(storyEventSource?.removeListener)storyEventSource.removeListener(event,listener);
  else storyEventSource?.off?.(event,listener);
}
function unbindScan(){
  for(const [name,fn] of scanEvents)unbind(name,fn);
  if(storyEventName)unbind(storyEventName,onChatChanged);
  scanEvents=[];
  storyEventName=null;
}
function onChatChanged(){
  confirmedStory=storyKey();
  markFull();
  checkStory();
}
function bindStoryEvent(){
  const c=context(),source=c.eventSource,types=c.eventTypes||c.event_types||{};
  if(!source?.on||source===storyEventSource)return;
  unbindScan();
  storyEventSource=source;
  storyEventName=types.CHAT_CHANGED||'chat_changed';
  source.on(storyEventName,onChatChanged);
  const handlers={
    MESSAGE_RECEIVED:markScan, MESSAGE_EDITED:markScan, MESSAGE_UPDATED:markScan,
    MESSAGE_SWIPED:markScan, MESSAGE_DELETED:markFull, MESSAGE_SWIPE_DELETED:markFull,
    GENERATION_ENDED:markTail,
  };
  scanEvents=[...new Map(Object.entries(handlers).filter(([name])=>types[name]).map(([name,handler])=>[types[name],handler])).entries()];
  for(const [name,handler] of scanEvents)source.on(name,handler);
}
function resetStoryJobs(){
  storyTask=storyTasks.start();
  autoMatchTasks.cancel();
  closeSongPicker?.();
}
function scheduleFollow(delay){
  clearTimeout(followTimer);
  followTimer=setTimeout(checkStory,delay);
}
async function followStory(){
  const ch=character(),chat=chatId(),scope=storyKey();
  if(disposed||!ch||!scope||chat==='unknown')return;
  if(scope!==observedStory){
    const switching=observedStory!==null;
    skipSwitchMusic=switching&&observedCharacter!==ch.id&&W.localStorage.getItem("capricorn_follow_character")==="off";
    observedCharacter=ch.id;
    observedStory=scope;
    pendingTags.clear();
    bgmIndex.clear();
    dirtyFloors.clear();
    indexScope=null;
    markFull();
    scanFollowSignature=null;
    if(switching){
      resetStoryJobs();
      if(resolving&&!skipSwitchMusic){stopPlaybackWork();clearAudio();}
    }
    pendingScope=scope;
    pendingSwitch=switching;
    pendingAt=Date.now()+1000;
    scheduleFollow(1000);
    return;
  }
  if(pendingScope!==scope)return;
  if(Date.now()<pendingAt){scheduleFollow(pendingAt-Date.now());return;}
  const revision=indexRevision;
  if(D.hidden||!await updateBgmIndex(scope)||disposed||storyKey()!==scope||pendingScope!==scope||revision!==indexRevision)return;
  pendingScope=null;
  if(!pendingSwitch&&!autoPref("startup")){const row=bgmIndex.latest();if(row)scanFollowSignature=JSON.stringify([JSON.stringify([scope,row.id]),row.signature]);return;}
  if(skipSwitchMusic){const row=bgmIndex.latest();if(row)scanFollowSignature=JSON.stringify([JSON.stringify([scope,row.id]),row.signature]);return;}
  if(!shouldFollowStory())return;
  const pl=playlist(ch.id,ch.name+' · 故事原声');
  const row=bgmIndex.latest(),song=lastItem(row?.found);
  selected=ch.id;
  if(song){
    addSong(pl,song,{chat,floor:row.id,character:ch.name});
    const track=pl.songs.find(candidate=>candidate.id===song.id);
    if(!track)return;
    queue=pl.songs.slice();
    queueRevision++;
    queuePlaylistName=pl.name;
    if(playing?.id===track.id&&!audio.paused&&started){queueIndex=queue.indexOf(track);playing=track;applyGain(1);storePlayback();render();return;}
    if(validUrl(track.audioUrl)||shared.online?.ready())return storyPlay(queue.indexOf(track));
    render();
    return;
  }
  if(!playing||!pendingSwitch)return;
  stopPlaybackWork();
  const epoch=playEpoch;
  if(!audio.paused)await fadeTo(0,320,epoch);
  if(epoch!==playEpoch||disposed||storyKey()!==scope)return;
  clearAudio();playing=null;queue=pl.songs.slice();queueRevision++;queueIndex=-1;queuePlaylistName=pl.name;resumePosition=0;
  delete db.settings.playback;
  save();status('当前聊天暂无剧情音乐',false);updateMedia();render();
}
function checkStory(){
  if(disposed)return;
  try{bindStoryEvent();sync();void followStory().catch(error=>console.warn('[声屿] 剧情切换失败',error));}
  catch(error){console.warn('[声屿] 角色检测失败',error);}
}
function listPlaylists(){return Object.values(db.playlists).sort((a,b)=>(a.kind==='character'?0:1)-(b.kind==='character'?0:1)||a.created-b.created)}
function render(){
  if(disposed)return;
  fullPlayer?.refresh();
  closeLibraryMenus(root);
  if(!opened&&root.childElementCount){
    root.querySelector('.si-panel')?.classList.remove('open');
    return;
  }
  const pl=db.playlists[selected]||db.playlists[current]||null;
  if(pl&&!db.playlists[selected])selected=pl.id;
  const tracks=pl?.songs||[];
  const previousRail=root.querySelector('.cap-playlist-rail');
  const previousScroll=root.querySelector('.cap-library-scroll');
  const previousFilter=root.querySelector('#si-filter');
  const railLeft=previousRail?.scrollLeft||0;
  const trackTop=previousScroll?.scrollTop||0;
  const restoreFilter=previousFilter&&D.activeElement===previousFilter;
  const filterCursor=restoreFilter?previousFilter.selectionStart:null;
  const scopeChanged=trackPageScope!==pl?.id;
  if(scopeChanged){trackPageScope=pl?.id;trackPage=0;}
  const query=normalize(filterText),pageSize=40;
  const matched=query?tracks.flatMap((t,i)=>normalize(t.title+' '+t.artist).includes(query)?[{t,i}]:[]):null;
  const pageCount=Math.max(1,Math.ceil((matched?.length??tracks.length)/pageSize));
  trackPage=Math.min(trackPage,pageCount-1);
  const first=trackPage*pageSize,last=first+pageSize;
  const visibleTracks=matched?.slice(first,last)??tracks.slice(first,last).map((t,i)=>({t,i:first+i}));

  const element=(tag,className,text)=>{
    const el=D.createElement(tag);
    if(className)el.className=className;
    if(text!==undefined)el.textContent=text;
    return el;
  };
  // Retain the original standalone controls for environments mounting the music module by itself.
  if(!root.childElementCount){
    root.innerHTML=`
      <button type="button" class="si-island" aria-label="打开声屿播放器" title="打开声屿播放器">
        <span class="si-dot"></span><span class="si-island-title"></span>${icon('down',16)}
      </button>
      <div class="si-panel">
        <div class="si-head"><div class="si-h1">声屿</div><button type="button" class="si-btn" data-action="close">收起</button></div>
        <div class="si-now">
          <img class="si-cover" alt="专辑封面" hidden>
          <div class="si-current"><strong></strong><div class="si-muted"></div></div>
        </div>
        <input id="si-seek" type="range" min="0" step="1" aria-label="播放进度"><div class="si-muted si-clock"></div>
        <div class="si-controls">
          <button type="button" class="si-btn" data-action="mode" title="播放模式"></button>
          <button type="button" class="si-btn" data-action="prev" aria-label="上一首" title="上一首">${icon('prev')}</button>
          <button type="button" class="si-mainplay" data-action="playpause" aria-label="播放" title="播放"></button>
          <button type="button" class="si-btn" data-action="next" aria-label="下一首" title="下一首">${icon('next')}</button>
        </div>
        <div class="si-row"><span class="si-muted">音量</span><input id="si-volume" type="range" min="0" max="1" step="0.01" aria-label="音量"></div>
      </div>`;
    root.querySelector('.si-island').onclick=()=>{if(drag){drag=false;return}opened=!opened;render()};
    root.querySelector('[data-action="close"]').onclick=()=>{opened=false;render();D.querySelector('#capricorn-hub [data-close]')?.click()};
    root.querySelector('[data-action="playpause"]').onclick=toggleAudio;
    root.querySelector('[data-action="prev"]').onclick=()=>nextTrack(-1);
    root.querySelector('[data-action="next"]').onclick=()=>nextTrack(1);
    root.querySelector('[data-action="mode"]').onclick=()=>{playMode=playMode==='order'?'shuffle':playMode==='shuffle'?'one':'order';db.settings.playMode=playMode;syncNativeLoop();save();render()};
    root.querySelector('#si-seek').oninput=e=>{if(Number.isFinite(audio.duration))audio.currentTime=+e.target.value};
    root.querySelector('#si-volume').oninput=e=>{db.settings.volume=Math.max(0,Math.min(1,Number(e.target.value)||0));applyGain(fadeGain);save()};
    const cover=root.querySelector('.si-cover');cover.onerror=()=>{cover.hidden=true};
    const fullButton=libraryButton(root.querySelector('.si-now'),'全屏播放',()=>fullPlayer.open());
    fullButton.className='si-btn';
  }
  const panel=root.querySelector('.si-panel');
  panel.classList.toggle('open',opened);
  updateLegacyPlayer();
  const cover=panel.querySelector('.si-cover'),coverUrl=validUrl(playing?.coverUrl);
  if(coverUrl&&cover.getAttribute('src')!==coverUrl){cover.hidden=false;cover.src=coverUrl}
  if(!coverUrl){cover.hidden=true;cover.removeAttribute('src')}
  panel.querySelector('.si-current strong').textContent=playing?.title||'尚未播放';
  panel.querySelector('.si-current .si-muted').textContent=playing?.artist||'选择一首歌曲';
  panel.querySelector('[data-action="mode"]').textContent=playMode==='shuffle'?'随机':playMode==='one'?'单曲':'顺序';
  const seek=panel.querySelector('#si-seek');
  seek.max=String(Number.isFinite(audio.duration)?audio.duration:0);
  seek.value=String(audio.currentTime||0);
  panel.querySelector('.si-clock').textContent=durationText(audio.currentTime)+' / '+durationText(audio.duration);
  panel.querySelector('#si-volume').value=String(targetVolume());

  const library=element('div','cap-local-library cap-library-panel');
  const playlistBar=element('div','cap-playlist-bar');
  const rail=element('div','cap-playlist-rail');
  rail.setAttribute('role','group');
  rail.setAttribute('aria-label','本地歌单');
  const choices=listPlaylists();
  let picked;
  for(const list of choices){
    const active=list.id===selected;
    const button=libraryButton(rail,list.name,()=>{
      selected=list.id;
      filterText='';
      trackPage=0;
      render();
    });
    button.className='cap-playlist-pill';
    button.dataset.pick=list.id;
    button.title=list.name;
    button.setAttribute('aria-pressed',String(active));
    const name=element('span','cap-playlist-name',list.name);
    button.textContent='';
    button.append(name,element('small','',list.songs.length));
    if(active)picked=button;
  }
  playlistBar.append(rail);
  const newForm=element('form','cap-library-form');
  const playlistName=element('input');
  playlistName.id='si-playlist-name';
  playlistName.setAttribute('aria-label','新建自定义歌单名称');
  playlistName.placeholder='歌单名称';
  playlistName.required=true;
  playlistName.value=playlistNameDraft;
  playlistName.oninput=()=>{playlistNameDraft=playlistName.value};
  newForm.append(playlistName);
  const create=element('button','', '创建歌单');
  create.type='submit';
  newForm.append(create);
  const newButton=libraryMenu(playlistBar,'新建歌单','plus',{content:newForm,role:'dialog',initialFocus:playlistName});
  newButton.dataset.action='new';
  newForm.onsubmit=event=>{
    event.preventDefault();
    const name=playlistName.value.trim();
    if(!name)return status('请输入歌单名称');
    const id='custom:'+Date.now()+':'+hash(name);
    playlist(id,name,'custom');
    selected=id;
    playlistNameDraft='';
    filterText='';
    render();
    root.querySelector('[data-action="new"]')?.focus();
  };
  library.append(playlistBar);

  const tools=element('div','cap-library-tools');
  const filter=element('input');
  filter.type='search';
  filter.id='si-filter';
  filter.placeholder='搜索歌曲或歌手';
  filter.setAttribute('aria-label','搜索当前歌单的歌曲或歌手');
  filter.value=filterText;
  filter.oninput=()=>{
    filterText=filter.value;
    trackPage=0;
    previousTrackScrollReset=true;
    render();
  };
  const searchWrap=element('div','cap-lib-search-wrap');
  const searchIcon=element('span','cap-lib-search-icon');
  searchIcon.innerHTML=icon('search',15);
  searchWrap.append(searchIcon,filter);
  tools.append(searchWrap);
  const addForm=element('form','cap-library-form');
  const titleInput=element('input'),artistInput=element('input');
  titleInput.id='si-song-title';
  titleInput.placeholder='歌名或关键词';
  titleInput.setAttribute('aria-label','歌名或关键词');
  titleInput.value=songTitleDraft;
  titleInput.oninput=()=>{songTitleDraft=titleInput.value};
  artistInput.id='si-song-artist';
  artistInput.placeholder='歌手名称（选填）';
  artistInput.setAttribute('aria-label','歌手名称（选填）');
  artistInput.value=songArtistDraft;
  artistInput.oninput=()=>{songArtistDraft=artistInput.value};
  const add=element('button','','搜索添加');
  add.type='submit';
  addForm.append(titleInput,artistInput,add);
  const addButton=libraryMenu(tools,'添加歌曲','music',{content:addForm,role:'dialog',initialFocus:titleInput});
  addButton.disabled=!pl;
  addForm.onsubmit=async event=>{
    event.preventDefault();
    if(!pl)return status('请先选择歌单');
    let title=titleInput.value.trim(),artist=artistInput.value.trim();
    if(!title&&!artist)return status('请输入歌名或歌手关键词');
    closeLibraryMenus(root);
    const pick=await songPicker([title,artist].filter(Boolean).join(' '),'确认添加',!!title&&!!artist);
    if(!pick||disposed||db.playlists[pl.id]!==pl)return;
    if(pick.local){
      status(addSong(pl,{id:trackId(title,artist),title,artist},null)?'已添加本地歌曲':'歌曲已存在');
    }else{
      title=String(pick.title);
      artist=(Array.isArray(pick.artists)?pick.artists:[]).join('/')||'未知歌手';
      const id=String(pick.id);
      if(pl.songs.some(t=>String(t.neteaseId)===id)){status('歌曲已存在');return}
      const existing=pl.songs.find(t=>t.id===trackId(title,artist)&&!t.neteaseId);
      const coverUrl=validUrl(pick.cover).replace(/^http:/,'https:');
      if(existing){
        noteManualMatch(existing);cancelTrackLoad(existing);existing.neteaseId=id;existing.autoMatchDisabled=false;
        if(coverUrl&&!validUrl(existing.coverUrl))existing.coverUrl=coverUrl;
        save();status('已关联现有歌曲');
      }else{
        const base=trackId(title,artist);
        status(addSong(pl,{id:pl.songs.some(t=>t.id===base)?base+'|netease:'+id:base,title,artist,neteaseId:id,coverUrl},null)?'已添加歌曲':'歌曲已存在');
      }
    }
    songTitleDraft='';songArtistDraft='';
    render();
  };
  const importFile=element('input');
  importFile.id='si-import-file';
  importFile.type='file';
  importFile.accept='application/json,.json';
  importFile.hidden=true;
  importFile.onchange=async event=>{
    const file=event.target.files?.[0], task=storyTask;
    event.target.value='';
    if(!file)return;
    try{
      const data=JSON.parse(await file.text());
      if(!task.active()||disposed||!await uiConfirm('合并声屿备份并保留当前歌单、音源和设置？',{doc:D,title:'导入音乐库备份',confirmText:'合并导入'}))return;
      restoreBackup(data);
      status('备份已合并','success');
    }catch(error){
      if(task.active())status('导入失败：'+error.message);
    }
  };
  libraryMenu(tools,'歌单管理','more',{items:()=>{
    const items=[
      {label:'批量补封面',icon:'image',action:()=>batchMetadata()},
      {label:'扫描当前聊天',icon:'refresh',action:()=>{void scan(true);status('正在检查当前聊天，内容稳定9秒后收录')}},
      {label:'导出当前歌单 CSV',icon:'download',disabled:!pl,action:()=>exportPlaylist(pl)},
      {label:'导出音乐库备份',icon:'download',action:()=>downloadLibrary(JSON.stringify(db,null,2),'application/json','声屿_音乐库备份.json')},
      {label:'播放诊断',icon:'note',action:()=>uiPrompt('以下诊断信息不含密钥与音源直链，可一键复制：',diagnostic(),{doc:D,title:'声屿播放诊断',multiline:true,readOnly:true,confirmText:'复制诊断',cancelText:'关闭',copyOnConfirm:true})},
      {label:'导入音乐库备份',icon:'upload',action:()=>importFile.click()},
    ];
    if(pl?.kind==='custom')items.push({
      label:'删除当前自建歌单',icon:'trash',danger:true,action:async()=>{
        if(!await uiConfirm('确定删除自建歌单「'+pl.name+'」？歌单内曲目记录将被移除。',{doc:D,title:'删除自建歌单',danger:true,confirmText:'删除歌单'}))return;
        delete db.playlists[pl.id];selected=current;save();render();uiToast('已删除歌单「'+pl.name+'」',{doc:D});
      },
    });
    return items;
  }});
  library.append(tools,importFile);

  const scroller=element('div','cap-library-scroll');
  if(!visibleTracks.length){
    scroller.append(element('p','cap-library-empty',query?'没有匹配的歌曲':'暂无歌曲。可手动添加，或从聊天的 <bgm> 标签收录。'));
  }
  for(const {t,i} of visibleTracks){
    const active=playing?.id===t.id;
    const row=element('div','si-track');
    row.classList.toggle('is-current',active);
    const play=libraryButton(row,t.title,()=>playIndex(i));
    play.className='cap-track-title';
    play.dataset.play=String(i);
    if(active)play.setAttribute('aria-current','true');
    play.textContent='';
    const art=element('span','cap-track-art');
    art.setAttribute('aria-hidden','true');
    const cover=validUrl(t.coverUrl);
    if(cover){
      const img=element('img');
      img.loading='lazy';
      img.decoding='async';
      img.alt='';
      img.src=cover.replace(/^http:/,'https:');
      img.onerror=()=>{art.innerHTML=icon('music-note',16);};
      art.append(img);
    }else{
      art.innerHTML=icon('music-note',16);
    }
    if(active){
      const eq=element('span','cap-track-active-badge');
      eq.innerHTML='<span class="cap-eq-bars" aria-hidden="true"><i></i><i></i><i></i></span>';
      art.append(eq);
    }
    const textWrap=element('span','cap-track-meta');
    textWrap.append(element('span','si-song',t.title),element('small','si-muted si-song',t.artist+(t.source?' · 第'+t.source.floor+'楼':'')));
    play.append(art,textWrap);
    const menu=libraryMenu(row,'歌曲操作','more',{items:()=>localTrackActions(pl,t,i)});
    menu.classList.add('cap-action-menu');
    scroller.append(row);
  }
  library.append(scroller);

  if(pageCount>1){
    const pager=element('div','cap-library-pager');
    const page=offset=>{
      trackPage+=offset;
      previousTrackScrollReset=true;
      render();
    };
    const prev=libraryButton(pager,'上一页',()=>page(-1),'left');
    prev.disabled=trackPage===0;
    prev.dataset.page='prev';
    pager.append(element('span','',String(trackPage+1)+' / '+pageCount));
    const next=libraryButton(pager,'下一页',()=>page(1),'right');
    next.disabled=trackPage+1>=pageCount;
    next.dataset.page='next';
    library.append(pager);
  }
  const message=element('p','si-status cap-library-status',statusText);
  message.setAttribute('role','status');
  library.append(message);
  root.dataset.audioPaused=String(audio.paused);
  panel.querySelector('.cap-local-library')?.remove();
  panel.append(library);
  rail.scrollLeft=railLeft;
  if(scopeChanged&&picked){
    const bar=rail.getBoundingClientRect(),pill=picked.getBoundingClientRect();
    if(pill.right>bar.right)rail.scrollLeft+=pill.right-bar.right;
    else if(pill.left<bar.left)rail.scrollLeft-=bar.left-pill.left;
  }
  scroller.scrollTop=scopeChanged||previousTrackScrollReset?0:trackTop;
  previousTrackScrollReset=false;
  if(restoreFilter){filter.focus();filter.setSelectionRange(filterCursor,filterCursor)}
}

function downloadLibrary(value,type,filename){
  const url=URL.createObjectURL(new Blob([value],{type}));
  const link=D.createElement('a');link.href=url;link.download=filename;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function exportPlaylist(pl){
  const quote=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
  const rows=[['歌曲名称','歌手','网易云歌曲ID','来源角色','来源聊天ID','来源楼层','音源URL','封面URL']];
  for(const t of pl.songs)rows.push([t.title,t.artist,t.neteaseId||'',t.source?.character||'',t.source?.chat||'',t.source?.floor??'',t.audioUrl||'',t.coverUrl||'']);
  downloadLibrary('\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n'),'text/csv;charset=utf-8','声屿_'+pl.name.replace(/[\\/:*?"<>|]/g,'_')+'_歌单.csv');
  status('已导出当前歌单 CSV（含来源记录）');
}
function localTrackActions(pl,t,i){
  const move=offset=>{
    const j=i+offset;
    if(j<0||j>=pl.songs.length)return;
    [pl.songs[i],pl.songs[j]]=[pl.songs[j],pl.songs[i]];
    save();render();
  };
  return [
    {label:'播放',icon:'play',action:()=>playIndex(i)},
    {label:'查看歌曲来源',icon:'note',action:()=>{
      const x=t.source;
      void uiAlert('歌曲：'+t.title+' — '+t.artist+'\n'+(x?'角色：'+(x.character||'未知')+'\n聊天 ID：'+(x.chat||'未知')+'\n楼层：'+(x.floor??'未知'):'手动添加或旧版歌曲：无楼层来源记录')+'\n网易云歌曲 ID：'+(t.neteaseId||'未关联'),{doc:D,title:'歌曲来源信息',confirmText:'知道了'});
    }},
    {label:'复制到其他歌单',icon:'copy',action:async()=>{
      const destinations=listPlaylists().filter(p=>p.id!==pl.id);
      if(!destinations.length)return status('请先创建另一份歌单','warn');
      const raw=await uiPrompt('复制「'+t.title+'」到哪份歌单？请输入序号：\n'+destinations.map((p,n)=>(n+1)+'. '+p.name).join('\n'),'1',{doc:D,title:'复制到其他歌单',placeholder:'输入序号'});
      if(raw===null)return;
      const index=Number(raw)-1,target=destinations[index];
      if(!Number.isInteger(index)||!target)return status('无效歌单序号','warn');
      if(target.songs.some(x=>x.id===t.id))return status('目标歌单已包含这首歌','info');
      target.songs.push(JSON.parse(JSON.stringify(t)));save();status('已复制到「'+target.name+'」','success');render();
    }},
    {label:'设置音源',icon:'link',action:async()=>{
      let url=await uiPrompt('输入你有权播放的 HTTPS/HTTP 音频直链（留空清除）：',t.audioUrl||'',{doc:D,title:'设置手动音源',placeholder:'https://...'});
      if(url===null)return;
      url=url.trim();
      if(url&&!validUrl(url))return status('音源地址必须是 http(s) URL','warn');
      noteManualMatch(t);cancelTrackLoad(t);t.audioUrl=url;
      const cover=await uiPrompt('可选：专辑封面 HTTPS/HTTP 图片地址（留空清除，点取消保持不变）：',t.coverUrl||'',{doc:D,title:'设置专辑封面',placeholder:'https://...'});
      if(cover!==null&&(!cover.trim()||validUrl(cover.trim())))t.coverUrl=cover.trim();
      save();status('音源设置已保存','success');render();
    }},
    {label:'查找公开专辑封面候选',icon:'image',action:()=>chooseMetadata(t)},
    {heading:'歌曲匹配'},
    {label:'在线搜索匹配',icon:'search',action:async()=>{
      try{
        if(!shared.online?.ready())throw Error('请先配置并启用网易云');
        status(await matchOnline(t,true)?'匹配成功':'未修改匹配');render();
      }catch(error){status(error.message)}
    }},
    {label:t.neteaseId?'修改或解除网易云 ID':'手动输入网易云 ID',icon:'link',action:async()=>{
      const raw=await uiPrompt('粘贴网易云歌曲分享链接或歌曲数字 ID（留空解除关联）：',t.neteaseId||'',{doc:D,title:'关联网易云歌曲 ID',placeholder:'歌曲链接或数字 ID'});
      if(raw===null)return;
      const id=neteaseId(raw);
      if(raw.trim()&&!id)return status('未识别歌曲 ID：请使用网易云链接或数字 ID','warn');
      noteManualMatch(t);cancelTrackLoad(t);t.neteaseId=id||'';t.autoMatchDisabled=!id;
      save();status(id?'已关联网易云歌曲 '+id:'已解除网易云关联','success');render();
    }},
    {label:'在网易云打开或搜索',icon:'external',action:()=>openExternal(neteaseUrl(t))},
    {heading:'排序'},
    {label:'上移歌曲',icon:'up',disabled:i===0,action:()=>move(-1)},
    {label:'下移歌曲',icon:'arrowdown',disabled:i+1===pl.songs.length,action:()=>move(1)},
    {label:'删除歌曲',icon:'trash',danger:true,action:async()=>{
      if(!await uiConfirm('从「'+pl.name+'」移除歌曲「'+t.title+'」？',{doc:D,title:'删除歌曲',danger:true,confirmText:'删除'}))return;
      if(t===playing){stopPlaybackWork();playing=null;clearAudio();updateMedia()}
      pl.songs.splice(i,1);save();render();uiToast('已删除「'+t.title+'」',{doc:D});
    }},
  ];
}

// The standalone island only moves once the pointer crosses the drag threshold.
let dragStart=null;
root.addEventListener('pointerdown',event=>{
  if(!event.target.closest('.si-island'))return;
  const rect=root.getBoundingClientRect();
  dragStart={x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
  drag=false;
});
function move(event){
  if(!dragStart)return;
  const dx=event.clientX-dragStart.x,dy=event.clientY-dragStart.y;
  if(!drag&&Math.abs(dx)+Math.abs(dy)<8)return;
  drag=true;
  root.style.left=Math.max(5,Math.min(W.innerWidth-155,dragStart.left+dx))+'px';
  root.style.top=Math.max(5,Math.min(W.innerHeight-60,dragStart.top+dy))+'px';
  root.style.right='auto';
}
let dragResetTimer;
function up(){
  if(dragStart&&drag){
    db.settings.position={left:root.style.left,top:root.style.top};
    save();
    clearTimeout(dragResetTimer);
    dragResetTimer=setTimeout(()=>{drag=false},100);
  }
  dragStart=null;
}
D.addEventListener('pointermove',move);
D.addEventListener('pointerup',up);
if(db.settings.position){
  root.style.left=db.settings.position.left;
  root.style.top=db.settings.position.top;
  root.style.right='auto';
}
applyGain(1);

function readPlayback(){
  const saved=db.settings.playback;
  if(!Array.isArray(saved?.queue)||!saved.queue[saved.index])return;
  queue=saved.queue;queueRevision++;queueIndex=saved.index;playing=queue[queueIndex];
  queuePlaylistName=String(saved.name||'声屿');
  resumePosition=checkpoint.read(saved);
  status('已恢复上次歌曲，点击播放继续',false);
}
function restoreBackup(input){
  if(disposed)throw Error('声屿已关闭');
  const next=commitMusicBackup(W.localStorage,db,input);
  if(next===db)return 'unchanged';
  resetStoryJobs();
  stopPlaybackWork();
  playing=null;
  queue=[];
  queueRevision++;
  queueIndex=-1;
  resumePosition=0;
  actualQuality='';
  audioError='';
  clearAudio();
  fullPlayer?.resetOnline();
  db=next;
  playMode=db.settings.playMode||'order';
  syncNativeLoop();
  applyGain(1);
  readPlayback();
  selected='';
  current='';
  sync();
  updateMedia();
  render();
  return 'merged';
}
async function timelineSongs(){
  const ch=character(),scope=storyKey();
  const revision=indexRevision;
  if(!ch||!scope||chatId()==='unknown'||!await updateBgmIndex(scope)||disposed||storyKey()!==scope||revision!==indexRevision)return [];
  const tracks=new Map((db.playlists[ch.id]?.songs||[]).map(track=>[track.id,track]));
  const online=shared.online?.ready();
  return bgmIndex.entries().flatMap(({id,found})=>found.map(track=>{
    const saved=tracks.get(track.id);
    return {...track,floor:id,coverUrl:saved?.coverUrl,playable:!!saved&&(!!validUrl(saved.audioUrl)||!!online&&(!!saved.neteaseId||!saved.autoMatchDisabled))};
  }));
}
function connectionChanged(){
  resetStoryJobs();
  const loading=resolving;
  stopPlaybackWork();
  if(loading)clearAudio();
  else applyGain(1);
  scanFollowSignature=null;
  matchAttempts=new WeakMap();
  fullPlayer?.resetOnline();
  render();
}
readPlayback();
sync();
render();
fullPlayer=mountNowPlaying({
  D,W,audio,shared,
  state:()=>({playing,queue,queueRevision,queueIndex,actualQuality,preferredQuality:db.settings.preferredQuality||'jymaster',canChangeQuality:!!playing?.neteaseId&&(!validUrl(playing?.audioUrl)||!!actualQuality&&actualQuality!=='手动音源')&&!!shared.online?.ready(),playMode,resolving,started,statusText,userVolume:targetVolume(),volumeSupported:volumeCapability(),volumeBackend:volumeBackend(),diagnostic:()=>diagnostic()}),
  quality(level){
    if(!qualityOrder.includes(level)||resolving||!playing?.neteaseId||(validUrl(playing.audioUrl)&&actualQuality==='手动音源')||!shared.online?.ready())return;
    db.settings.preferredQuality=level;
    save();
    if(!audio.paused)void playQueued(queueIndex,audio.currentTime||resumePosition||0,true);
  },
  volume(value){const requested=Math.max(0,Math.min(1,Number(value)||0));db.settings.volume=requested;applyGain(fadeGain);save()},
  mode(){playMode=playMode==='order'?'shuffle':playMode==='shuffle'?'one':'order';db.settings.playMode=playMode;syncNativeLoop();save()},
  toggle:toggleAudio,next:nextTrack,play:playQueued,
  move(from,to){
    if(resolving||from<0||to<0||from>=queue.length||to>=queue.length)return;
    const active=queue[queueIndex];
    const [track]=queue.splice(from,1);
    queue.splice(to,0,track);
    queueIndex=queue.indexOf(active);
    queueRevision++;
    fullPlayer.refresh();
  },
  remove(index){
    if(resolving||index===queueIndex||index<0||index>=queue.length)return;
    queue.splice(index,1);
    if(index<queueIndex)queueIndex--;
    queueRevision++;
    fullPlayer.refresh();
  },
});
if(autoPref("startup")&&playing&&!resolving)void toggleAudio();
shared.onMusicConnectionChange=connectionChanged;
W[INSTANCE]={
  root,
  openPlayer(){fullPlayer.open();if(autoPref("open")&&!manualPause&&audio.paused&&!resolving)void toggleAudio()},
  closePlayer(){fullPlayer.close()},
  isPlayerOpen(){return fullPlayer.isOpen()},
  rolePlaylist(){
    const list=db.playlists[character()?.id];
    return list?{id:list.id,name:list.name,songs:list.songs.map(({neteaseId,title,artist})=>({neteaseId,title,artist}))}:null;
  },
  backup(){return JSON.parse(JSON.stringify(db))},
  restoreBackup,
  restore:restoreBackup,
  diagnostics(){
    return {'声屿索引上次访问楼层':lastVisitCount,'声屿索引上次分片':lastSliceCount,'声屿索引作废次数':cancelledBgmScans,'声屿待稳定标签':pendingTags.size,'声屿音源加载':resolving?'进行中':'空闲'};
  },
  async tick(task){if(!disposed){checkStory();await scan(false,task);if(!disposed&&!task?.signal.aborted&&!pendingScope)void autoMatch()}},
  show(){opened=true;render()},
  hide(){opened=false;render()},
  playCloud(rows,index,name){
    queue=rows.map(track=>({id:'cloud:'+track.id,neteaseId:track.id,title:track.title,artist:track.artists.join('/'),coverUrl:track.cover}));
    queueRevision++;
    queuePlaylistName=name;
    return playQueued(index);
  },
  timelineSongs,
  playStoryQueue(ids,name){
    const list=db.playlists[character()?.id];
    if(!list)return;
    const songs=new Map(list.songs.map(track=>[track.id,track]));
    const chosen=[...new Set(ids)].map(id=>songs.get(id)).filter(Boolean);
    if(!chosen.length)return status('暂无已收录歌曲');
    queue=chosen;
    queueRevision++;
    queuePlaylistName=name;
    return playQueued(0);
  },
  playTimeline(id){
    const list=db.playlists[character()?.id];
    const index=list?.songs.findIndex(track=>track.id===id)??-1;
    if(index<0)return status('当前角色没有此歌曲');
    selected=list.id;
    return playIndex(index);
  },
  title(){return (audio.paused?'':'▮▮ ')+(playing?.title||'声屿')},
  backgroundPriority(){return backgroundPriority()},
  setBackgroundPriority(value){
    db.settings.audioBackgroundPreference=Boolean(value);save();
    // Playing audio is not moved between audio elements mid-track.
    // Change takes effect on the next track/restart, avoiding audible jumps.
    return true;
  },
  destroy(){
    if(disposed)return;
    storePlayback();
    disposed=true;
    artworkJob?.abort();
    releasePlaybackSession();
    stopPlaybackWork();
    storyTasks.cancel();
    autoMatchTasks.cancel();
    closeSongPicker?.();
    closeLibraryMenus(root);
    if(shared.onMusicConnectionChange===connectionChanged)delete shared.onMusicConnectionChange;
    D.removeEventListener('visibilitychange',onMediaVisibility);
    W.removeEventListener('pageshow',onMediaRestore);
    W.removeEventListener('pagehide',onMediaPageHide);
    D.removeEventListener('resume',onMediaRestore);
    if(mediaSession){
      for(const action of mediaActions)try{mediaSession.setActionHandler(action,null)}catch{}
      try{mediaSession.metadata=null;mediaSession.playbackState='none';mediaSession.setPositionState()}catch{}
    }
    fullPlayer?.destroy();
    bgmIndex.clear();
    pendingTags.clear();
    clearTimeout(followTimer);
    clearTimeout(dragResetTimer);
    unbindScan();
    D.removeEventListener('pointermove',move);
    D.removeEventListener('pointerup',up);
    disposeAudio();
    root.remove();
    style.remove();
    if(W[INSTANCE]===this)delete W[INSTANCE];
  },
};
checkStory();
console.info('[声屿] 已启动');
return W[INSTANCE];
}
