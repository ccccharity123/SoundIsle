import {viewport,playerRect} from './viewport.js';
import { icon } from './icons.js';
import { popover } from './ui-popover.js';
import { createLatestTask } from './music-tasks.js';
export function parseLrc(text) {
  const out = [];
  const offsetMatch = String(text).match(/\[offset:([+-]?\d+)\]/i);
  const offset = Number(offsetMatch ? offsetMatch[1] : 0) / 1000;
  const tag = /\[(\d+):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  for (const line of String(text || '').split(/\r?\n/)) {
    const words = line.replace(/\[[^\]]*\]/g, '').trim();
    if (!words) continue;
    let t;
    while ((t = tag.exec(line))) {
      out.push({
        time: Math.max(0, +t[1] * 60 + +t[2] + Number('0.' + (t[3] || '0')) + offset),
        text: words
      });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

const ICONS = {
  prev: icon('prev', 22), next: icon('next', 22),
  play: icon('play', 28, { weight: 'fill' }), pause: icon('pause', 28, { weight: 'fill' }),
  stop: icon('stop', 24, { weight: 'fill' }),
  lyrics: icon('lyrics', 20), queue: icon('queue', 20)
};
const sizeLabels = { compact: '悬浮卡片', half: '半屏', large: '大半屏' };

export function mountNowPlaying({ D, W, audio, shared, state, toggle, next, play, move, remove, volume, mode, quality }) {
  const panel = D.createElement('section');
  panel.className = 'cap-full-player cap-player-layout';
  const android = /Android/i.test(W.navigator.userAgent);
  const media = W.matchMedia ? W.matchMedia.bind(W) : () => null;
  const coarse = media('(pointer: coarse)');
  const mobile = android || Boolean(coarse && coarse.matches);
  const motion = media('(prefers-reduced-motion: reduce)');
  const transparency = media('(prefers-reduced-transparency: reduce)');
  const reduce = () => Boolean((motion && motion.matches) || (transparency && transparency.matches) ||
    (W.navigator.deviceMemory > 0 && W.navigator.deviceMemory <= 4));
  let viewportFrame = 0;
  let observedComposer = null;
  const composerObserver = W.ResizeObserver ? new W.ResizeObserver(scheduleViewport) : null;
  function fitViewport() {
    if (panel.hidden) return;
    panel.dataset.light = String(reduce());
    const box = viewport(W);
    const computed = W.getComputedStyle(q('.cap-fp-safe'));
    const insets = {
      top: parseFloat(computed.paddingTop) || 0,
      bottom: parseFloat(computed.paddingBottom) || 0,
      left: parseFloat(computed.paddingLeft) || 0,
      right: parseFloat(computed.paddingRight) || 0
    };
    const composer = D.getElementById('send_form') || D.getElementById('send_textarea');
    if (composer !== observedComposer && composerObserver) {
      composerObserver.disconnect();
      if (composer) composerObserver.observe(composer);
      observedComposer = composer;
    }
    if (composer) {
      const bounds = composer.getBoundingClientRect();
      if (bounds.width && bounds.height && bounds.top >= box.y &&
          bounds.top < box.y + box.h && bounds.right > box.x && bounds.left < box.x + box.w) {
        insets.composer = box.y + box.h - bounds.top;
      }
    }
    const rect = playerRect(box, panel.dataset.size, insets, panel.dataset.bilingual === 'true');
    panel.dataset.short = String(rect.h < 375);
    panel.style.setProperty('--cap-rect-x', rect.x + 'px');
    panel.style.setProperty('--cap-rect-y', rect.y + 'px');
    panel.style.setProperty('--cap-rect-w', rect.w + 'px');
    panel.style.setProperty('--cap-rect-h', rect.h + 'px');
  }
  function scheduleViewport() {
    if (viewportFrame || panel.hidden) return;
    viewportFrame = W.requestAnimationFrame(() => { viewportFrame = 0; fitViewport(); });
  }
  function mediaListener(query, method) {
    if (!query) return;
    if (query[method + 'EventListener']) query[method + 'EventListener']('change', scheduleViewport);
    else if (query[method + 'Listener']) query[method + 'Listener'](scheduleViewport);
  }
  W.addEventListener('resize', scheduleViewport);
  if (W.visualViewport) {
    W.visualViewport.addEventListener('resize', scheduleViewport);
    W.visualViewport.addEventListener('scroll', scheduleViewport);
  }
  mediaListener(motion, 'add');
  mediaListener(transparency, 'add');
  function visibility() { if (!D.hidden) { scheduleViewport(); refresh(); } }
  D.addEventListener('visibilitychange', visibility);
  panel.hidden = true;
  panel.setAttribute('aria-label', '声屿播放器');
  function iconControl(attr, label, graphic, extra = '') {
    return '<button type="button" ' + attr + ' aria-label="' + label + '" title="' + label + '" ' +
      extra + '>' + graphic + '</button>';
  }
  panel.innerHTML =
    '<div class="cap-fp-safe" aria-hidden="true"></div>' +
    '<div class="cap-ambient" aria-hidden="true"></div>' +
    '<div class="cap-fp-shell">' +
      '<header class="cap-fp-header">' +
        '<span data-heading class="cap-fp-heading">声屿</span>' +
        iconControl('data-close class="cap-fp-pill"', '收起播放器', icon('down', 20)) +
        iconControl('data-size-switch', '选择播放器尺寸', icon('size', 20), 'aria-haspopup="menu" aria-expanded="false"') +
        iconControl('data-settings', '设置', icon('settings', 20)) +
      '</header>' +
      '<div class="cap-fp-main">' +
        '<div class="cap-art"><img alt="专辑封面" hidden><span>' + icon('music', 30) + '</span></div>' +
        '<div class="cap-meta"><div class="cap-meta-text"><h2></h2><p data-artist></p></div></div>' +
        '<div class="cap-transport">' +
          iconControl('data-prev', '上一首', ICONS.prev) +
          iconControl('data-toggle class="cap-play-btn"', '播放', ICONS.play) +
          iconControl('data-next', '下一首', ICONS.next) +
        '</div>' +
      '</div>' +
      '<p data-status role="status" class="cap-fp-status"></p>' +
      '<div class="cap-scrubber">' +
        '<input data-seek type="range" min="0" max="0" step="0.1" aria-label="播放进度">' +
        '<div class="cap-clock-row"><span data-elapsed>0:00</span><span data-duration>0:00</span></div>' +
      '</div>' +
      '<p data-current-lyric class="cap-current-lyric"><span data-line></span><span data-translation hidden></span></p>' +
      '<div data-detail class="cap-fp-detail" hidden></div>' +
      '<small class="cap-color-note">封面跨域限制，已使用模糊封面代替取色</small>' +
      '<nav class="cap-fp-tabs" aria-label="播放工具">' +
        '<button type="button" class="cap-quality" data-quality aria-label="切换音质" title="切换音质" aria-haspopup="menu" aria-expanded="false"></button>' +
        iconControl('data-mode', '播放模式', icon('repeat', 20)) +
        iconControl('data-lyrics', '歌词', ICONS.lyrics, 'aria-pressed="false"') +
        iconControl('data-queue', '播放队列', ICONS.queue, 'aria-pressed="false"') +
        iconControl('data-library', '曲库', icon('library', 20)) +
        iconControl('data-volume-button', '音量', icon('volumeHigh', 20), 'aria-haspopup="dialog" aria-expanded="false"') +
        iconControl('data-compact-more', '更多播放工具', icon('more', 20), 'aria-haspopup="menu" aria-expanded="false"') +
      '</nav>' +
      '<div class="cap-volume-store" hidden>' +
        '<div class="cap-volume-content">' +
          '<label class="cap-volume-label"><span>音量</span><output data-volume-value></output>' +
            '<input data-volume type="range" min="0" max="1" step="0.01" aria-label="音量"></label>' +
          '<small data-volume-note class="cap-volume-note"></small>' +
        '</div>' +
      '</div>' +
    '</div>';
  D.body.append(panel);

  const q = selector => panel.querySelector(selector);
  const detail = q('[data-detail]');
  const sizeButton = q('[data-size-switch]');
  const qualityButton = q('[data-quality]');
  const volumeButton = q('[data-volume-button]');
  const moreButton = q('[data-compact-more]');
  const volumeStore = q('.cap-volume-store');
  const volumeContent = q('.cap-volume-content');
  const volumeSlider = q('[data-volume]');
  const volumeValue = q('[data-volume-value]');
  const volumeNote = q('[data-volume-note]');
  const volumeGraphic = icon('volumeHigh', 20);
  const muteGraphic = icon('volumeLow', 20);
  const qualityCaret = icon('caret-up-down', 13);
  const qualityLabels = {
    standard: '标准', higher: '高清', exhigh: '极高', lossless: '无损',
    hires: 'Hi-Res', jyeffect: '高清环绕', sky: '沉浸环绕', jymaster: '超清母带'
  };
  const qualityText = D.createElement('span');
  qualityButton.append(qualityText);
  qualityButton.insertAdjacentHTML('beforeend', qualityCaret);
  let size = 'half';
  try {
    const saved = W.localStorage.getItem('capricorn_player_size');
    if (Object.keys(sizeLabels).includes(saved)) size = saved;
  } catch (_) {}
  panel.dataset.size = size;
  sizeButton.title = '当前：' + sizeLabels[size];

  // A local control stays available if the host cannot display a portal.
  let inline = null;
  function closeInline(restoreFocus) {
    if (!inline) return;
    const entry = inline;
    inline = null;
    D.removeEventListener('pointerdown', inlineOutside, true);
    D.removeEventListener('keydown', inlineEscape, true);
    entry.anchor.setAttribute('aria-expanded', 'false');
    if (entry.restore) entry.restore();
    entry.box.remove();
    if (restoreFocus) entry.anchor.focus();
  }
  function inlineOutside(event) {
    if (inline && !inline.box.contains(event.target) && !inline.anchor.contains(event.target)) closeInline(false);
  }
  function inlineEscape(event) {
    if (event.key === 'Escape' && inline) {
      event.preventDefault();
      closeInline(true);
    }
  }
  function showInline(anchor, label, content, restore) {
    const box = D.createElement('div');
    box.className = 'cap-fp-inline';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', label);
    const close = D.createElement('button');
    close.type = 'button';
    close.className = 'cap-fp-inline-close';
    close.textContent = '关闭';
    close.onclick = () => closeInline(true);
    box.append(close, content);
    panel.append(box);
    inline = { anchor, box, restore };
    anchor.setAttribute('aria-expanded', 'true');
    D.addEventListener('pointerdown', inlineOutside, true);
    D.addEventListener('keydown', inlineEscape, true);
    close.focus();
  }
  function closeMenus() {
    popover.closeWithin(panel);
    closeInline(false);
  }
  function openSurface(options, makeFallback) {
    if (inline && inline.anchor === options.anchor) { closeInline(true); return; }
    closeInline(false);
    if (!popover.open(options)) makeFallback();
  }
  function openChoices(anchor, label, items) {
    openSurface({ anchor, label, items }, () => {
      const menu = D.createElement('div');
      menu.className = 'cap-fp-inline-items';
      for (const item of items) {
        const button = D.createElement('button');
        button.type = 'button';
        button.textContent = item.label;
        if (item.checked != null) button.setAttribute('aria-pressed', String(item.checked));
        button.disabled = Boolean(item.disabled);
        button.onclick = () => { closeInline(true); item.action(); };
        menu.append(button);
      }
      showInline(anchor, label, menu);
    });
  }
  function animateFrom(rect, target = panel) {
    if (!rect || !rect.width || !rect.height || reduce() || !target.animate || mobile) return;
    const bounds = target.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    target.animate([
      { transformOrigin:'top left',
        transform:'translate(' + (rect.left - bounds.left) + 'px,' + (rect.top - bounds.top) +
          'px) scale(' + (rect.width / bounds.width) + ',' + (rect.height / bounds.height) + ')', opacity:.65 },
      { transformOrigin:'top left', transform:'none', opacity:1 }
    ], { duration:250, easing:'cubic-bezier(.22,1,.36,1)' });
  }
  function setSize(value) {
    if (size === value) return;
    closeMenus();
    const art = q('.cap-art');
    const before = art.getBoundingClientRect();
    size = value;
    panel.dataset.size = size;
    sizeButton.title = '当前：' + sizeLabels[size];
    if (size === 'large' && !tab) showTab('lyrics');
    else updateTabState();
    fitViewport();
    try { W.localStorage.setItem('capricorn_player_size', size); } catch (_) {}
    animateFrom(before, art);
  }
  function closePanel() {
    closeMenus();
    if (panel.hidden) return;
    panel.hidden = true;
    if (composerObserver) composerObserver.disconnect();
    observedComposer = null;
    if (shared.onPlayerClose) shared.onPlayerClose();
  }
  function openAux(name) {
    closePanel();
    if (shared.openPlayerAux) shared.openPlayerAux(name);
  }
  function showTab(name) {
    tab = name;
    updateTabState();
    if (tab === 'lyrics') {
      void loadLyrics(true);
      drawLyrics();
    }
    if (tab === 'queue') {
      queueSignature = '';
      queuePage = Math.max(0, Math.floor(state().queueIndex / queuePageSize));
      drawQueue();
    }
  }
  function openCompactDetail(name, label) {
    showTab(name);
    openSurface({
      anchor: moreButton, label, role: 'dialog', content: detail, className: 'cap-fp-detail-popover',
      minWidth: 250, onClose: updateTabState
    }, () => {
      const restore = detail.parentNode;
      detail.hidden = false;
      showInline(moreButton, label, detail, () => { restore.append(detail); updateTabState(); });
    });
    if (!detail.hidden) updateTime();
  }
  function switchMode() {
    if (mode) mode();
    refresh();
  }
  sizeButton.onclick = () => openChoices(sizeButton, '播放器尺寸', Object.keys(sizeLabels).map(value => ({
    label: sizeLabels[value], checked: size === value, action: () => setSize(value)
  })));
  qualityButton.onclick = () => openChoices(qualityButton, '播放音质', Object.keys(qualityLabels).map(level => ({
    label: qualityLabels[level], checked: state().preferredQuality === level, action: () => { if (quality) quality(level); }
  })));
  q('[data-settings]').onclick = () => openAux('settings');
  q('[data-library]').onclick = () => openAux('library');
  q('[data-mode]').onclick = switchMode;
  moreButton.onclick = () => openChoices(moreButton, '播放工具', [
    { label: '歌词', icon: 'lyrics', action: () => openCompactDetail('lyrics', '同步歌词') },
    { label: '播放队列', icon: 'queue', action: () => openCompactDetail('queue', '播放队列') },
    { label: '播放模式：' + (q('[data-mode]').title || '顺序播放'), icon: 'repeat', action: switchMode },
    { label: '曲库', icon: 'library', action: () => openAux('library') },
    { label: '设置', icon: 'settings', action: () => openAux('settings') }
  ]);
  let volumeDragging = false;
  function updateVolume() {
    const audioState = state();
    const value = audioState.userVolume == null ? audio.volume : audioState.userVolume;
    const percent = Math.round(value * 100) + '%';
    if (!volumeDragging) volumeSlider.value = value;
    if (volumeValue.textContent !== percent) {
      volumeValue.textContent = percent;
      volumeSlider.setAttribute('aria-valuetext', percent);
      volumeButton.title = '音量 ' + percent;
    }
    const supports = audioState.volumeSupported !== false;
    const hint = supports ? '' : '当前音源仅支持系统音量键';
    if (volumeNote.textContent !== hint) volumeNote.textContent = hint;
    volumeSlider.title = supports ? '音量' : '当前音源可能需要系统音量键';
    const muted = String(value === 0);
    if (volumeButton.dataset.muted !== muted) {
      volumeButton.dataset.muted = muted;
      volumeButton.innerHTML = muted === 'true' ? muteGraphic : volumeGraphic;
    }
  }
  function applyVolume() {
    const value = Number(volumeSlider.value);
    const before = state().userVolume;
    if (volume && value !== (before == null ? audio.volume : before)) volume(value);
    updateVolume();
  }
  volumeButton.onclick = () => {
    updateVolume();
    openSurface({
      anchor: volumeButton, role: 'dialog', label: '音量', content: volumeContent,
      initialFocus: volumeSlider, minWidth: 216, onClose: () => { volumeDragging = false; }
    }, () => showInline(volumeButton, '音量', volumeContent, () => {
      volumeDragging = false;
      volumeStore.append(volumeContent);
    }));
  };
  volumeSlider.onpointerdown = () => { volumeDragging = true; };
  volumeSlider.oninput = applyVolume;
  volumeSlider.onchange = () => { applyVolume(); volumeDragging = false; };
  volumeSlider.onpointerup = volumeSlider.onpointercancel = volumeSlider.onblur = () => { volumeDragging = false; };

  const img = q('.cap-art img');
  const ambient = q('.cap-ambient');
  const seek = q('[data-seek]');
  const lyricTasks = createLatestTask();
  const lyricCache = new Map();
  const retirements = new Set();
  const queuePageSize = 60;
  let tab = '', identity = '', lyricIdentity = '', lyricStatus = '';
  let lines = [], active = -1, dead = false, dragging = false;
  let queuePage = 0, queueSignature = '';
  let lastIslandSig = '', manualScrollUntil = 0;
  let bgEpoch = 0, bgURL = null, bgActive = null, bgPending = null, bgFrame = 0, colorProbe = null;
  let coverUrl = '', colorUrl = '', backdropSource = '';
  const backgroundObserver = W.MutationObserver ? new W.MutationObserver(syncBackdrop) : null;
  if (backgroundObserver) backgroundObserver.observe(D.body, { attributes: true, attributeFilter: ['data-cap-bg-source'] });
  panel.dataset.coverState = 'missing';
  ambient.replaceChildren();
  detail.addEventListener('touchstart',()=>{manualScrollUntil=Date.now()+5000},{passive:true});
  detail.addEventListener('wheel',()=>{manualScrollUntil=Date.now()+5000},{passive:true});

  function cancelAmbientLoad(){
    W.cancelAnimationFrame(bgFrame);
    if(!bgPending)return;
    bgPending.onload=bgPending.onerror=null;
    bgPending.removeAttribute('src');
    bgPending=null;
  }
  function retire(layer){
    if(!layer)return;
    layer.style.opacity='0';
    const timer=setTimeout(()=>{retirements.delete(timer);if(layer!==bgActive)layer.remove()},1300);
    retirements.add(timer);
  }
  function setAmbient(url){
    if(url===bgURL)return;
    bgURL=url;
    const epoch=++bgEpoch;
    cancelAmbientLoad();
    panel.dataset.coverState='missing';
    const old=bgActive;
    bgActive=null;
    retire(old);
    if(!url)return;
    panel.dataset.coverState='loading';
    const layer=D.createElement('div'),art=D.createElement('img');
    bgPending=art;
    layer.className='cap-ambient-layer';
    layer.style.opacity='0';
    art.alt='';
    layer.append(art);
    art.onload=()=>{
      if(dead||epoch!==bgEpoch)return;
      bgPending=null;
      panel.dataset.coverState='ready';
      ambient.append(layer);
      bgActive=layer;
      bgFrame=W.requestAnimationFrame(()=>{bgFrame=W.requestAnimationFrame(()=>{
        if(!dead&&bgActive===layer)layer.style.opacity='1';
      })});
    };
    art.onerror=()=>{
      if(dead||epoch!==bgEpoch)return;
      bgPending=null;
      panel.dataset.coverState='missing';
    };
    art.src=url;
  }
  function cancelColorProbe(){
    if(!colorProbe)return;
    colorProbe.onload=colorProbe.onerror=null;
    colorProbe.removeAttribute('src');
    colorProbe=null;
  }
  img.onerror=()=>{
    img.hidden=true;
    img.alt='封面加载失败';
  };
  function syncBackdrop() {
    if (dead || panel.hidden) return;
    const source = D.body.dataset.capBgSource;
    const colored = source === 'color';
    const url = coverUrl;
    setAmbient(colored || source === 'album' ? url : '');
    if (!colored || !url) {
      if (backdropSource !== source || colorUrl) {
        backdropSource = source;
        cancelColorProbe();
        colorUrl = '';
        panel.dataset.colorStatus = 'missing';
        panel.style.removeProperty('--cap-art-color');
      }
      return;
    }
    backdropSource = source;
    if (url === colorUrl) return;
    cancelColorProbe();
    colorUrl = url;
    panel.style.removeProperty('--cap-art-color');
    const probe=new W.Image();
    colorProbe=probe;
    probe.crossOrigin='anonymous';
    panel.dataset.colorStatus='loading';
    probe.onload=()=>{
      if (dead || colorUrl !== url) return;
      colorProbe=null;
      try{
        const canvas=D.createElement('canvas');
        canvas.width=canvas.height=24;
        const context=canvas.getContext('2d');
        context.drawImage(probe,0,0,24,24);
        const pixels=context.getImageData(0,0,24,24).data;
        let red=0,green=0,blue=0,total=0;
        for(let i=0;i<pixels.length;i+=4){
          if(pixels[i+3]<128)continue;
          const weight=1+(Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2]))/80;
          red+=pixels[i]*weight;green+=pixels[i+1]*weight;blue+=pixels[i+2]*weight;total+=weight;
        }
        if(!total)throw Error('empty');
        panel.style.setProperty('--cap-art-color',`rgb(${Math.round(red/total)},${Math.round(green/total)},${Math.round(blue/total)})`);
        panel.dataset.colorStatus='ready';
      }catch{panel.dataset.colorStatus='fallback'}
    };
    probe.onerror=()=>{
      if (dead || colorUrl !== url) return;
      colorProbe=null;
      panel.dataset.colorStatus='fallback';
    };
    probe.src=url;
  }
  const clock = n => Number.isFinite(n) ? `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}` : '0:00';
  function button(label, fn) {
    const node = D.createElement('button');
    node.type = 'button';
    node.textContent = label;
    node.onclick = fn;
    return node;
  }
  function queueControl(name, label, fn) {
    const node = button('', fn);
    node.innerHTML = icon(name, 18);
    node.title = label;
    node.setAttribute('aria-label', label);
    return node;
  }
  function currentLyricIndex(time) {
    let lo=0,hi=lines.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(lines[mid].time<=time)lo=mid+1;else hi=mid;}
    return lo-1;
  }
  function emitIsland() {
    if (dead || typeof shared.onIslandUpdate !== 'function') return;
    const track = state().playing;
    const isPlaying = !audio.paused && !audio.ended && !!track;
    const index = isPlaying && lines.length ? currentLyricIndex(audio.currentTime || 0) : -1;
    const lyric = lines[index]?.text || '';
    const translation = lines[index]?.translation || '';
    const fallback = track ? (track.artist ? `${track.title} · ${track.artist}` : track.title) : '声屿';
    const text = lyric || fallback;
    const signature = JSON.stringify([isPlaying,text,translation,track?.coverUrl]);
    if (signature === lastIslandSig) return;
    lastIslandSig = signature;
    shared.onIslandUpdate({playing:isPlaying,lyric,translation,title:track?.title||'声屿',artist:track?.artist||'',text,coverUrl:track?.coverUrl||''});
  }
  function updateTabState() {
    q('[data-lyrics]').setAttribute('aria-pressed', String(tab === 'lyrics'));
    q('[data-queue]').setAttribute('aria-pressed', String(tab === 'queue'));
    panel.dataset.detail = tab;
    detail.hidden = !tab || (size === 'compact' && detail.parentNode === q('.cap-fp-shell'));
  }
  function drawQueue(){
    const {queue,queueRevision,queueIndex,resolving}=state();
    const pages=Math.max(1,Math.ceil(queue.length/queuePageSize));
    queuePage=Math.min(pages-1,Math.max(0,queuePage));
    const signature=JSON.stringify([queueRevision,queueIndex,queuePage,resolving]);
    if(signature===queueSignature)return;
    queueSignature=signature;
    detail.replaceChildren();
    if(!queue.length){detail.textContent='播放队列为空';return;}
    const start=queuePage*queuePageSize,end=Math.min(start+queuePageSize,queue.length);
    const fragment=D.createDocumentFragment();
    for(let i=start;i<end;i++){
      const track=queue[i];
      const row=D.createElement('div');
      row.className='cap-queue-row'+(i===queueIndex?' is-current':'');
      const name = button(track.title + ' — ' + track.artist, () => play(i));
      if (i === queueIndex) {
        name.insertAdjacentHTML('afterbegin', icon('music', 15, { weight: 'fill' }));
        name.setAttribute('aria-current', 'true');
      }
      const up = queueControl('up', '上移', () => move(i, i - 1));
      const down = queueControl('arrowdown', '下移', () => move(i, i + 1));
      const del = queueControl('trash', '移除', () => remove(i));
      del.className = 'cap-fp-danger';
      up.disabled=resolving||i===0;
      down.disabled=resolving||i===queue.length-1;
      del.disabled=resolving||i===queueIndex;
      row.append(name,up,down,del);
      fragment.append(row);
    }
    if(pages>1){
      const nav=D.createElement('div'),label=D.createElement('span');
      nav.className='cap-queue-row';
      const previous=button('上一页',()=>{queuePage--;drawQueue();detail.scrollTop=0});
      const next=button('下一页',()=>{queuePage++;drawQueue();detail.scrollTop=0});
      previous.disabled=queuePage===0;
      next.disabled=queuePage===pages-1;
      label.textContent=`${queuePage+1} / ${pages}`;
      nav.append(previous,label,next);
      fragment.append(nav);
    }
    detail.append(fragment);
  }
  function drawLyrics(){
    if(panel.hidden||tab!=='lyrics')return;
    detail.replaceChildren();
    active=-1;
    if(!lines.length){
      const empty=D.createElement('div');
      empty.className='cap-fp-empty';
      const labels={loading:'正在读取歌词…',missing:'未关联网易云或服务未连接',error:'歌词读取失败，可重新点击歌词重试'};
      empty.textContent=labels[lyricStatus]||'暂无同步歌词';
      detail.append(empty);
      return;
    }
    const fragment=D.createDocumentFragment();
    for(const line of lines){
      const row=button(line.text,()=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.min(audio.duration,line.time)});
      row.className='cap-lyric';
      if(line.translation){
        const text=D.createElement('small');
        text.textContent=line.translation;
        row.append(text);
      }
      fragment.append(row);
    }
    detail.append(fragment);
    updateTime();
  }
  function lyricKey(track){return track?.neteaseId ? JSON.stringify([track.id,track.neteaseId]) : '';}
  async function loadLyrics(retry=false){
    const track=state().playing,key=lyricKey(track);
    if(key!==lyricIdentity){
      lyricIdentity=key;
      lyricTasks.cancel();
      lines=[];
      lyricStatus='';
      active=-1;
    }
    if(lyricStatus==='loading'||lyricStatus==='loaded'||(lyricStatus==='error'&&!retry))return;
    if(!key||!shared.online?.ready()){
      lyricStatus='missing';
      drawLyrics();
      return;
    }
    const task=lyricTasks.start();
    lyricStatus='loading';
    drawLyrics();
    try{
      let data=lyricCache.get(key);
      if(!data)data=await shared.online.get('/music/lyric?id='+encodeURIComponent(track.neteaseId),25000,task.signal);
      if(dead||!task.active()||key!==lyricKey(state().playing))return;
      lyricCache.set(key,data);
      if(lyricCache.size>64)lyricCache.delete(lyricCache.keys().next().value);
      const translations=parseLrc(data.translation);
      let start=0;
      lines=parseLrc(data.lyric).map(line=>{
        while(start<translations.length&&translations[start].time<=line.time-0.15)start++;
        const match=translations[start];
        const translation=match&&Math.abs(match.time-line.time)<0.15&&match.text!==line.text?match.text:'';
        return {...line,translation};
      });
      lyricStatus='loaded';
      if (tab === 'lyrics') drawLyrics();
      else updateTime();
      emitIsland();
    }catch{
      if(!dead&&task.active()){lyricStatus='error';drawLyrics();}
    }
  }
  function updateTime(){
    if(D.hidden)return;
    emitIsland();
    if(panel.hidden)return;
    const time=audio.currentTime||0,duration=Number.isFinite(audio.duration)?audio.duration:0;
    seek.max=duration;
    if(!dragging)seek.value=time;
    seek.style.setProperty('--cap-progress',(duration>0?Math.min(100,Math.max(0,time/duration*100)):0)+'%');
    q('[data-elapsed]').textContent=clock(time);
    q('[data-duration]').textContent=clock(audio.duration);
    const index = currentLyricIndex(time);
    const current = lines[index];
    const text = current ? current.text : '';
    const translation = current ? current.translation : '';
    const currentLine = q('[data-line]');
    const translatedLine = q('[data-translation]');
    if (currentLine.textContent !== text) currentLine.textContent = text;
    if (translatedLine.textContent !== translation) translatedLine.textContent = translation;
    translatedLine.hidden = !translation;
    const bilingual = String(Boolean(translation));
    if (panel.dataset.bilingual !== bilingual) {
      panel.dataset.bilingual = bilingual;
      if (size === 'compact') fitViewport();
    }
    updateVolume();
    if(tab!=='lyrics'||detail.hidden||!lines.length||index===active)return;
    detail.children[active]?.classList.remove('active');
    active=index;
    const line=detail.children[index];
    if(line){
      line.classList.add('active');
      if (Date.now() >= manualScrollUntil) {
        const top = detail.scrollTop + line.getBoundingClientRect().top - detail.getBoundingClientRect().top -
          detail.clientHeight / 2 + line.offsetHeight / 2;
        if (reduce() || !detail.scrollTo) detail.scrollTop = top;
        else {
          try { detail.scrollTo({ top, behavior: 'smooth' }); } catch (_) { detail.scrollTop = top; }
        }
      }
    }
  }
  function refresh(){
    if(dead)return;
    const {playing:track,actualQuality,resolving,started,statusText,canChangeQuality,playMode}=state();
    const key=lyricKey(track);
    if(key!==lyricIdentity){
      if(!audio.paused||!panel.hidden)void loadLyrics();
      else{lyricTasks.cancel();lines=[];lyricIdentity='';lyricStatus='';}
    }
    emitIsland();
    if(panel.hidden)return;
    q('[data-heading]').textContent=resolving?'正在加载':started&&!audio.paused?'正在播放':'声屿';
    q('[data-status]').textContent=statusText||'';
    q('h2').textContent=track?.title||'尚未播放';
    q('[data-artist]').textContent=track?.artist||'选择一首歌曲';
    qualityText.textContent = qualityLabels[actualQuality] || actualQuality || '音质';
    qualityButton.disabled = resolving || !canChangeQuality;
    if (qualityButton.disabled) {
      popover.closeWithin(qualityButton);
      if (inline && inline.anchor === qualityButton) closeInline(false);
    }
    const transport = q('[data-toggle]');
    const transportIcon = resolving ? 'stop' : audio.paused ? 'play' : 'pause';
    const actionLabel = resolving ? '取消加载' : audio.paused ? '播放' : '暂停';
    if (transport.dataset.icon !== transportIcon) {
      transport.dataset.icon = transportIcon;
      transport.innerHTML = ICONS[transportIcon];
      transport.title = actionLabel;
      transport.setAttribute('aria-label', actionLabel);
    }
    panel.dataset.playing=String(!audio.paused);
    const modeButton=q('[data-mode]');
    const modeIcon=playMode==='shuffle'?'shuffle':playMode==='one'?'one':'repeat';
    if(modeButton.dataset.icon!==modeIcon){
      modeButton.innerHTML=icon(modeIcon, 20);
      modeButton.dataset.icon=modeIcon;
      modeButton.title=playMode==='shuffle'?'随机播放':playMode==='one'?'单曲循环':'顺序播放';
      modeButton.setAttribute('aria-label',modeButton.title+'，点击切换');
    }
    const id=JSON.stringify([track?.id,track?.neteaseId,track?.coverUrl]);
    if(id!==identity){
      identity=id;
      img.hidden=true;
      img.removeAttribute('src');
      img.alt='专辑封面';
      coverUrl = '';
      try{
        const url=new URL(track?.coverUrl);
        if(url.protocol==='https:'||url.protocol==='http:'){img.hidden=false;img.src=url.href;coverUrl=url.href;}
      }catch{}
    }
    syncBackdrop();
    if(tab==='queue')drawQueue();
    updateTime();
  }
  function resetOnline(){
    lyricTasks.cancel();
    lyricCache.clear();
    lyricIdentity='';lyricStatus='';lines=[];active=-1;
    if(tab==='lyrics')void loadLyrics();
    refresh();
  }

  for (const el of panel.querySelectorAll('[data-close]')) {
    el.onclick = closePanel;
  }
  q('[data-toggle]').onclick = toggle;
  q('[data-prev]').onclick = () => next(-1);
  q('[data-next]').onclick = () => next(1);
  q('[data-lyrics]').onclick = () => { showTab(tab === 'lyrics' ? '' : 'lyrics'); };
  q('[data-queue]').onclick = () => { showTab(tab==='queue'?(size==='large'?'lyrics':''):'queue'); };
  seek.oninput = () => {
    dragging = true;
    const dur = Number(seek.max) || 0;
    seek.style.setProperty('--cap-progress', (dur > 0 ? (Number(seek.value) / dur) * 100 : 0) + '%');
    q('[data-elapsed]').textContent = clock(Number(seek.value));
  };
  seek.onchange = () => {
    if (Number.isFinite(audio.duration)) audio.currentTime = Number(seek.value);
    dragging = false;
  };
  seek.onpointercancel = () => { dragging = false; };

  const events = ['timeupdate', 'durationchange', 'play', 'pause', 'ended', 'loadedmetadata', 'volumechange'];
  const onTime=()=>updateTime(); for (const ev of events) audio.addEventListener(ev, ev==='timeupdate'?onTime:refresh);
  emitIsland();
  return {
    open() {
      if (!panel.hidden) return;
      const island = D.querySelector('#capricorn-hub .cap-island');
      panel.hidden = false;
      fitViewport();
      manualScrollUntil = 0;
      showTab(tab || (size === 'large' ? 'lyrics' : ''));
      refresh();
      animateFrom(island && island.getBoundingClientRect());
    },
    close: closePanel,
    isOpen: () => !panel.hidden,
    refresh,resetOnline,
    destroy(){
      dead=true;
      closeMenus();
      if (composerObserver) composerObserver.disconnect();
      if (backgroundObserver) backgroundObserver.disconnect();
      lyricTasks.cancel();
      cancelAmbientLoad();
      cancelColorProbe();
      for(const timer of retirements)clearTimeout(timer);
      W.cancelAnimationFrame(viewportFrame);
      W.removeEventListener('resize',scheduleViewport);
      W.visualViewport?.removeEventListener('resize',scheduleViewport);
      W.visualViewport?.removeEventListener('scroll',scheduleViewport);
      mediaListener(motion, 'remove');
      mediaListener(transparency, 'remove');
      D.removeEventListener('visibilitychange',visibility);
      for(const event of events)audio.removeEventListener(event,event==='timeupdate'?onTime:refresh);
      img.onload=img.onerror=null;
      img.removeAttribute('src');
      panel.remove();
    }
  };
}
