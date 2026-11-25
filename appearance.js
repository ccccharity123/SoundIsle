import {
  listFonts,
  saveFontFile,
  ensureFontLoaded,
  deleteFont,
  saveBgImage,
  loadBgImageUrl,
  clearBgImage
} from './fonts.js';
import { refreshSelect } from './ui-select.js';

export function mountAppearance(settings, root, themeSelect, memoryRoot) {
  const D = root.ownerDocument, W = D.defaultView, key = 'capricorn_appearance_v1';
  const defaults = {
    material: 'glass',
    playerTheme: 'default',
    playerBgColor: '',
    bgSource: 'auto', coverShape: 'rounded', coverSize: 250, coverPadding: 0, coverOpacity: 100, coverFit: 'cover', coverPlate: 'none', coverRadius: 18, coverBorder: 0, coverBorderColor: '#ffffff', coverBorderStyle: 'solid', coverShadow: 0, bgSaturation: 100, bgShade: 15,
    playerBgOpacity: 82,
    playerBgBlur: 24,
    playerIslandCss: '',
    playerThemeCss: '',
    playerCustomCss: '',
    sharedFontId: '',
    noteFontId: 'shared',
    paper: 'white',
    paperMode: 'auto',
    paperPattern: 'none',
    noteDecor: 'minimal',
    side: '',
    note: '',
    custom: ''
  };
  let p = { ...defaults };
  try { p = { ...p, ...JSON.parse(W.localStorage.getItem(key) || '{}') }; } catch {}

  let installedFonts = [];
  let bgImageUrl = '';
  let disposed = false;
  let fontRevision = 0;

  const NOTE_PRESETS = {
    glass: {
      side: '--note-bg: rgba(255, 252, 245, 0.78);\n--note-blur: 22px;\n--note-width: 380px;',
      note: '--note-card: rgba(255, 255, 255, 0.72);\n--note-radius: 14px;\n--note-shadow: 0 4px 16px rgba(0,0,0,0.06);',
      custom: ''
    },
    kraft: {
      side: '--note-bg: #dfd0b8;\n--note-line: #c4b090;\n--note-fg: #3b2f22;\n--note-muted: #75614a;\n--note-tab-bg: #c9b28e;\n--note-tab-fg: #3b2f22;',
      note: '--note-card: #efe3cf;\n--note-accent: #a67c52;\n--note-radius: 6px;',
      custom: '.cap-story-title { letter-spacing: 0.03em; }'
    },
    compact: {
      side: '--note-width: 320px;\nborder-radius: 20px 0 0 20px;',
      note: '--note-radius: 10px;\npadding: 11px 12px;\nfont-size: 13px;',
      custom: '.cap-story-title { font-size: 14px; }'
    },
    journal: {
      side: '--note-width: 420px;',
      note: '--note-radius: 16px;\nfont-size: 15px;\nline-height: 1.85;',
      custom: '.cap-story p { text-indent: 1.5em; }'
    }
  };

  const PLAYER_PRESETS = {
    crystal: {
      playerIslandCss: 'border: 1px solid rgba(255,255,255,0.55);\nbox-shadow: inset 0 1px 2px rgba(255,255,255,0.8), 0 10px 30px rgba(0,0,0,0.2);',
      playerThemeCss: '--am-accent: #0a84ff;\nborder-radius: 28px;',
      playerCustomCss: ''
    },
    aurora: {
      playerIslandCss: 'background: linear-gradient(135deg, rgba(120,210,255,0.45), rgba(190,130,255,0.45));\nborder-color: rgba(255,255,255,0.45);',
      playerThemeCss: '--am-accent: #7c5cff;\nbackground: linear-gradient(155deg, rgba(28,32,54,0.82), rgba(45,26,58,0.82));',
      playerCustomCss: '.cap-island[data-playing="true"] { border-radius: 18px; }'
    },
    minimal: {
      playerIslandCss: 'box-shadow: 0 4px 16px rgba(0,0,0,0.12);',
      playerThemeCss: 'border-radius: 20px;\n--am-accent: #1d1d1f;',
      playerCustomCss: '.cap-island-orb { background: transparent !important; box-shadow: none !important; }'
    },
    neon: {
      playerIslandCss: 'border: 1px solid rgba(255, 78, 138, 0.7);\nbox-shadow: 0 0 18px rgba(255, 78, 138, 0.35);',
      playerThemeCss: '--am-accent: #ff4e8a;\nborder: 1px solid rgba(255, 78, 138, 0.45);',
      playerCustomCss: '.cap-island[data-playing="true"] { letter-spacing: 0.03em; }'
    }
  };

  function buildPlayerForm() {
    const el = D.createElement('section');
    el.className = 'cap-appearance cap-player-appearance';
    el.innerHTML = `
      <h4>播放器外观与主题</h4>
      <div class="cap-appearance-grid">
        <label>声屿材质
          <select data-pref="material" data-cap-select="segment">
            <option value="glass">液态玻璃</option>
            <option value="frost">磨砂玻璃</option>
            <option value="solid">实色</option>
          </select>
        </label>
        <label>播放器主题
          <select data-pref="playerTheme" data-cap-select="search">
            <option value="default" data-cap-swatch="#ededed">白 · 原生</option>
            <option value="black" data-cap-swatch="#272727">黑 · 原生</option>
            <option value="silverblue" data-cap-swatch="#9ab0c9">余音 · 银蓝手账</option>
            <optgroup label="旧版主题">
              <option value="mist" data-cap-swatch="#a6b7ef">晨雾</option>
              <option value="ocean" data-cap-swatch="#439bc3">海洋</option>
              <option value="sunset" data-cap-swatch="#e39a63">落日</option>
              <option value="sakura" data-cap-swatch="#da91b4">樱花</option>
              <option value="forest" data-cap-swatch="#7db39a">森林</option>
              <option value="gold" data-cap-swatch="#b3935a">鎏金</option>
              <option value="cyber" data-cap-swatch="#a278cc">赛博</option>
            </optgroup>
          </select>
        </label>
      </div>

      <details class="cap-bg-customizer" open><summary>背景与封面</summary>
<label>背景来源<select data-pref="bgSource"><option value="auto">主题默认 / 已导入图片</option><option value="album">专辑封面铺满</option><option value="color">专辑取色</option><option value="custom">自定义图片</option></select></label>
<label>封面形状<select data-pref="coverShape"><option value="auto">主题默认</option><option value="square">方形</option><option value="rounded">圆角</option><option value="circle">圆形</option></select></label>
<label>图片填充<select data-pref="coverFit"><option value="cover">铺满</option><option value="contain">完整显示</option></select></label><label>底板<select data-pref="coverPlate"><option value="none">无</option><option value="solid">纯色</option><option value="glass">玻璃</option></select></label><label>大卡片封面大小 (<span data-val="coverSize"></span>)<input type="range" min="40" max="320" data-pref-range="coverSize"></label><label>内边距 (<span data-val="coverPadding"></span>)<input type="range" min="0" max="40" data-pref-range="coverPadding"></label><label>边框透明度 (<span data-val="coverOpacity"></span>)<input type="range" min="0" max="100" data-pref-range="coverOpacity"></label><label>边框样式<select data-pref="coverBorderStyle"><option value="solid">实线</option><option value="dashed">虚线</option><option value="double">双线</option></select></label>
<label>边框颜色<input type="color" data-cover-color></label>
<label>圆角 (<span data-val="coverRadius"></span>)<input type="range" min="0" max="50" data-pref-range="coverRadius"></label><label>边框宽度 (<span data-val="coverBorder"></span>)<input type="range" min="0" max="12" data-pref-range="coverBorder"></label><label>阴影 (<span data-val="coverShadow"></span>)<input type="range" min="0" max="40" data-pref-range="coverShadow"></label><label>背景饱和度 (<span data-val="bgSaturation"></span>)<input type="range" min="0" max="200" data-pref-range="bgSaturation"></label><label>明暗遮罩 (<span data-val="bgShade"></span>)<input type="range" min="0" max="100" data-pref-range="bgShade"></label>
        <label>自定义背景色 / 渐变（留空使用主题默认）
          <div class="cap-color-row">
            <input type="color" data-bg-picker value="#1c1c1e" aria-label="选取背景颜色">
            <input type="text" data-pref-text="playerBgColor" placeholder="如 #1a1d2e 或 linear-gradient(135deg,#1d2b64,#f8cdda)">
            <button type="button" data-clear-bg-color title="清除自定义背景色">清除</button>
          </div>
        </label>
        <div class="cap-bg-image-row">
          <button type="button" data-upload-bg>上传背景图</button>
          <button type="button" data-clear-bg>移除背景图</button>
          <input type="file" accept="image/*" data-bg-file hidden>
          <span class="cap-inline-tip" data-bg-tip></span>
        </div>
        <div class="cap-appearance-grid">
          <label>背景透明度 (<span data-val="playerBgOpacity">82</span>%)
            <input type="range" min="0" max="100" step="1" data-pref-range="playerBgOpacity">
          </label>
          <label>背景模糊度 (<span data-val="playerBgBlur">24</span>px)
            <input type="range" min="0" max="60" step="1" data-pref-range="playerBgBlur">
          </label>
        </div>
      </details>

      <div class="cap-font-manager">
        <label>自定义字体（与拾忆互通 · 支持 .ttf）
          <select data-font-select="player" data-cap-select="search"></select>
        </label>
        <div class="cap-font-actions">
          <button type="button" data-import-font class="cap-btn-primary">导入 TTF 字体</button>
          <button type="button" data-delete-font>删除当前字体</button>
          <input type="file" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf" data-font-file hidden>
        </div>
        <p class="cap-css-status" data-font-status></p>
      </div>

      <details class="cap-css-editor">
        <summary>自定义 CSS（灵动岛形态 & 播放器主题）</summary>
        <p class="cap-css-hint">支持实时预览。可定制 <code>.cap-island</code>、<code>.cap-island[data-playing="false"]</code>（未播放球体）、<code>.cap-island[data-playing="true"]</code>（播放拉长态）、<code>nav</code> 及 <code>.cap-full-player</code>。</p>
        <div class="cap-css-presets">
          <span>快捷模板：</span>
          <button type="button" data-player-preset="crystal">晶透光球</button>
          <button type="button" data-player-preset="aurora">极光胶囊</button>
          <button type="button" data-player-preset="minimal">极简素雅</button>
          <button type="button" data-player-preset="neon">霓虹微光</button>
        </div>
        <label>灵动岛样式声明（无需大括号）
          <textarea data-pcss="playerIslandCss" rows="3" placeholder="border-radius: 999px;\n--island-orb-size: 46px;"></textarea>
        </label>
        <label>播放器面板样式声明（无需大括号）
          <textarea data-pcss="playerThemeCss" rows="3" placeholder="--am-accent: #fa243c;\nborder-radius: 26px;"></textarea>
        </label>
        <label>高级自定义 CSS（限定在播放器与灵动岛内）
          <textarea data-pcss="playerCustomCss" rows="3" placeholder=".cap-island[data-playing=&quot;false&quot;] { width: 48px; height: 48px; }\n.cap-island[data-playing=&quot;true&quot;] { max-width: 360px; }"></textarea>
        </label>
        <div class="cap-css-actions">
          <button type="button" data-psave class="cap-btn-primary">保存并应用</button>
          <button type="button" data-preset-reset>恢复默认 CSS</button>
        </div>
        <p data-pstatus role="status" class="cap-css-status"></p>
      </details>
    `;
    return el;
  }

  function buildNoteForm() {
    const el = D.createElement('section');
    el.className = 'cap-appearance cap-appearance-inline';
    el.innerHTML = `
      <div class="cap-font-manager">
        <label>拾忆字体（与播放器互通）
          <select data-font-select="note" data-cap-select="search"></select>
        </label>
        <div class="cap-font-actions">
          <button type="button" data-import-font class="cap-btn-primary">导入 TTF 字体</button>
          <button type="button" data-delete-font>删除所选字体</button>
          <input type="file" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf" data-font-file hidden>
        </div>
        <p class="cap-css-status" data-font-status></p>
      </div>
      <div class="cap-appearance-grid">
        <label>拾忆明暗
          <select data-pref="paperMode" data-cap-select="segment">
            <option value="auto">跟随系统</option>
            <option value="light">日间纸张</option>
            <option value="dark">夜间墨色</option>
          </select>
        </label>
        <label>便签主题
          <select data-pref="paper">
            <option value="white">极简纯白</option>
            <option value="ink">暗夜墨笺</option>
          </select>
        </label>
        <label>纸张底纹
          <select data-pref="paperPattern">
            <option value="dots">点阵手账</option>
            <option value="grid">方格便签</option>
            <option value="lines">横线信纸</option>
            <option value="none">纯净素纸</option>
          </select>
        </label>
        <label>便签装饰
          <select data-pref="noteDecor">
            <option value="tape">和纸胶带</option>
            <option value="strip">顶部色条</option>
            <option value="fold">折角便签</option>
            <option value="minimal">极简无饰</option>
          </select>
        </label>
      </div>
      <details class="cap-css-editor">
        <summary>拾忆自定义 CSS（侧边栏 & 便签主题）</summary>
        <p class="cap-css-hint">支持实时预览。可用变量：<code>--note-bg</code> <code>--note-width</code> <code>--note-blur</code> <code>--note-card</code> <code>--note-accent</code> <code>--note-fg</code> <code>--note-radius</code></p>
        <div class="cap-css-presets">
          <span>快捷模板：</span>
          <button type="button" data-preset="glass">磨砂浮窗</button>
          <button type="button" data-preset="kraft">复古牛皮纸</button>
          <button type="button" data-preset="compact">紧凑窄栏</button>
          <button type="button" data-preset="journal">手账大字</button>
        </div>
        <label>侧边栏样式声明（无需大括号）
          <textarea data-css="side" rows="3" placeholder="--note-bg: #f6efe2;\n--note-width: 380px;"></textarea>
        </label>
        <label>便签卡片样式声明（无需大括号）
          <textarea data-css="note" rows="3" placeholder="--note-card: #fff8dc;\n--note-radius: 12px;"></textarea>
        </label>
        <label>高级自定义 CSS（限定在拾忆侧边栏内）
          <textarea data-css="custom" rows="3" placeholder=".cap-story-title { color: #8c4a27; }"></textarea>
        </label>
        <div class="cap-css-actions">
          <button type="button" data-save class="cap-btn-primary">保存并应用</button>
          <button type="button" data-reset>恢复默认 CSS</button>
        </div>
        <p data-status role="status" class="cap-css-status"></p>
      </details>
    `;
    return el;
  }

  const playerBox = buildPlayerForm();
  playerBox.dataset.capSettingsSection = 'appearance';
  settings.prepend(playerBox);

  let inlineDrawer = null;
  let noteBox = null;
  if (memoryRoot) {
    inlineDrawer = D.createElement('div');
    inlineDrawer.className = 'cap-note-customizer';
    inlineDrawer.hidden = true;
    noteBox = buildNoteForm();
    inlineDrawer.append(noteBox);
    const contentHost = memoryRoot.querySelector('.shiyi-dock-content');
    const timelineEl = memoryRoot.querySelector('.cap-shiyi-scroll, .cap-timeline');
    if (timelineEl) timelineEl.before(inlineDrawer);
    else contentHost?.append(inlineDrawer);
  }

  const allBoxes = [playerBox, noteBox].filter(Boolean);
  const fontManagers = allBoxes.map(box => box.querySelector('.cap-font-manager'));
  const media = W.matchMedia('(prefers-color-scheme: dark)');
  const sheet = D.createElement('style');
  sheet.id = 'capricorn-custom-note-css';
  D.head.append(sheet);

  function declarations(s) {
    if (typeof s !== 'string' || s.length > 8000 || /[{}@\\<>]/.test(s) || /url\s*\(|image-set\s*\(|expression\s*\(|javascript:/i.test(s)) {
      throw Error('声明仅支持本地 CSS 属性，不支持大括号、@ 规则或外部资源');
    }
    return s;
  }

  function scopedCss(s, scopePrefix, keepPrefix) {
    if (typeof s !== 'string' || s.length > 16000) throw Error('高级 CSS 长度超出限制');
    if (/[<>\\]|@import|@charset|@font-face|url\s*\(|image-set\s*\(|expression\s*\(|javascript:/i.test(s)) {
      throw Error('高级 CSS 不支持外部资源、@import 或不安全字符');
    }
    const cleaned = s.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!cleaned) return '';
    return cleaned.replace(/([^{}]+)\{([^{}]*)\}/g, (_, sel, body) => {
      const trimmed = sel.trim();
      if (/^@keyframes\b/i.test(trimmed)) return `${trimmed} { ${body} }\n`;
      const scoped = trimmed.split(',').map(part => {
        const t = part.trim();
        if (!t) return '';
        if (keepPrefix.some(k => t.startsWith(k))) return t;
        return `${scopePrefix} ${t}`;
      }).filter(Boolean).join(', ');
      return scoped ? `${scoped} { ${body} }\n` : '';
    });
  }

  function safeBgColor(val) {
    const v = String(val || '').trim();
    if (!v) return '';
    if (/[{};<>\\]|url\s*\(|expression\s*\(|javascript:/i.test(v)) return '';
    return v;
  }

  function setFontStatus(msg) {
    for (const box of fontManagers) {
      const el = box.querySelector('[data-font-status]');
      if (el) el.textContent = msg;
    }
  }

  function renderFontSelects() {
    const pSel = fontManagers[0].querySelector('[data-font-select="player"]');
    if (pSel) {
      pSel.replaceChildren();
      const def = D.createElement('option');
      def.value = ''; def.textContent = '系统默认字体';
      pSel.append(def);
      for (const f of installedFonts) {
        const opt = D.createElement('option');
        opt.value = f.id; opt.textContent = f.name;
        pSel.append(opt);
      }
      pSel.value = installedFonts.some(f => f.id === p.sharedFontId) ? p.sharedFontId : '';
      refreshSelect(pSel);
    }
    const nSel = noteBox?.querySelector('[data-font-select="note"]');
    if (nSel) {
      nSel.replaceChildren();
      const syncOpt = D.createElement('option');
      syncOpt.value = 'shared'; syncOpt.textContent = '跟随播放器互通字体';
      const defOpt = D.createElement('option');
      defOpt.value = ''; defOpt.textContent = '系统默认字体';
      nSel.append(syncOpt, defOpt);
      for (const f of installedFonts) {
        const opt = D.createElement('option');
        opt.value = f.id; opt.textContent = f.name;
        nSel.append(opt);
      }
      const validNote = p.noteFontId === 'shared' || p.noteFontId === '' || installedFonts.some(f => f.id === p.noteFontId);
      nSel.value = validNote ? p.noteFontId : 'shared';
      refreshSelect(nSel);
    }
  }

  async function applyFonts(draft = p) {
    const revision = ++fontRevision;
    const playerFontId = draft.sharedFontId || '';
    const noteFontId = draft.noteFontId === 'shared' ? playerFontId : (draft.noteFontId || '');
    try {
      const pFam = playerFontId ? await ensureFontLoaded(playerFontId) : '';
      const nFam = noteFontId ? await ensureFontLoaded(noteFontId) : '';
      if (disposed || revision !== fontRevision) return;
      D.documentElement.style.setProperty(
        '--cap-player-font',
        pFam ? `"${pFam}", -apple-system, BlinkMacSystemFont, "PingFang SC", system-ui, sans-serif` : ''
      );
      D.documentElement.style.setProperty(
        '--cap-note-font',
        nFam ? `"${nFam}", -apple-system, BlinkMacSystemFont, "PingFang SC", system-ui, sans-serif` : ''
      );
      D.body.dataset.capHasPlayerFont = pFam ? '1' : '0';
      D.body.dataset.capHasNoteFont = nFam ? '1' : '0';
    } catch (e) {
      console.warn('[Capricorn] applyFonts failed:', e);
    }
  }

  function apply(draft = p) {
    if (disposed) return;
    const b = D.body;
    b.dataset.capMaterial = draft.material;
    b.dataset.capPlayerTheme = draft.playerTheme || 'default';
    b.dataset.capLook = themeSelect.value === 'auto' ? (media.matches ? 'dark' : 'light') : themeSelect.value;
    b.dataset.capPaper = draft.paper;
    b.dataset.capPaperMode = draft.paperMode === 'auto' ? (media.matches ? 'dark' : 'light') : draft.paperMode;
    b.dataset.capPaperPattern = draft.paperPattern;
    b.dataset.capNoteDecor = draft.noteDecor;
    b.dataset.capHasPlayerBg = bgImageUrl && ['auto','custom'].includes(draft.bgSource) ? '1' : '0';
    b.dataset.capBgSource = draft.bgSource;
    const artwork = String(draft.bgSource === 'color');
    if (root.dataset.islandArtwork !== artwork) {
      root.dataset.islandArtwork = artwork;
      root.dispatchEvent(new W.Event('capricorn-island-artwork'));
    }
    b.dataset.capCoverShape = draft.coverShape;
    b.dataset.capCoverPlate=draft.coverPlate; const vars = {'cover-size':Number(draft.coverSize)+'px','cover-padding':Number(draft.coverPadding)+'px','cover-opacity':Number(draft.coverOpacity)/100,'cover-fit':draft.coverFit==='contain'?'contain':'cover','cover-radius':Number(draft.coverRadius)+'px','cover-border':Number(draft.coverBorder)+'px','cover-color':/^#[0-9a-f]{6}$/i.test(draft.coverBorderColor)?draft.coverBorderColor:'#ffffff','cover-style':['solid','dashed','double'].includes(draft.coverBorderStyle)?draft.coverBorderStyle:'solid','cover-shadow':Number(draft.coverShadow)+'px','bg-saturation':Number(draft.bgSaturation)+'%','bg-shade':Number(draft.bgShade)/100};
    for(const [k,v] of Object.entries(vars)) D.documentElement.style.setProperty('--cap-'+k,v);
    if(draft.playerTheme==='black')b.dataset.capLook='dark';

    const bgColor = safeBgColor(draft.playerBgColor);
    const opacity = Math.min(1, Math.max(0, Number(draft.playerBgOpacity ?? 82) / 100));
    const blur = Math.min(60, Math.max(0, Number(draft.playerBgBlur ?? 24)));

    D.documentElement.style.setProperty('--cap-player-bg-image', bgImageUrl ? `url("${bgImageUrl}")` : 'none');
    D.documentElement.style.setProperty('--cap-player-bg-opacity', String(opacity));
    D.documentElement.style.setProperty('--cap-player-bg-blur', `${blur}px`);

    const sideCss = declarations(draft.side || '');
    const noteCss = declarations(draft.note || '');
    const extraNoteCss = scopedCss(draft.custom || '', '#shiyi-dock.cap-memory-side', ['#shiyi-dock']);
    const islandCss = declarations(draft.playerIslandCss || '');
    const pThemeCss = declarations(draft.playerThemeCss || '');
    const extraPlayerCss = scopedCss(draft.playerCustomCss || '', '#capricorn-hub', ['#capricorn-hub', '.cap-full-player']);

    const bgOverrideRule = bgColor
      ? `#capricorn-hub nav, .cap-full-player { background: ${bgColor} !important; }\n`
      : '';

    sheet.textContent =
      bgOverrideRule +
      `#capricorn-hub .cap-island { ${islandCss} }\n` +
      `#capricorn-hub nav, .cap-full-player { ${pThemeCss} }\n` +
      extraPlayerCss +
      `body[data-cap-paper] #shiyi-dock.cap-memory-side { ${sideCss} }\n` +
      `body[data-cap-paper] #shiyi-dock.cap-memory-side .cap-story { ${noteCss} }\n` +
      extraNoteCss;
  }

  function save() {
    W.localStorage.setItem(key, JSON.stringify(p));
    apply(p);
    void applyFonts(p);
  }

  // Bind common [data-pref] selects
  for (const box of allBoxes) {
    for (const el of box.querySelectorAll('[data-pref]')) {
      const k = el.dataset.pref;
      const valid = Array.from(el.options).some(option => option.value === p[k]);
      el.value = valid ? p[k] : defaults[k];
      refreshSelect(el);
      el.onchange = () => { p[k] = el.value; save(); };
    }
  }

  const cc=playerBox.querySelector('[data-cover-color]');cc.value=p.coverBorderColor;cc.oninput=()=>{p.coverBorderColor=cc.value;save()};
  // Player background controls
  const bgText = playerBox.querySelector('[data-pref-text="playerBgColor"]');
  const bgPicker = playerBox.querySelector('[data-bg-picker]');
  const bgClearColor = playerBox.querySelector('[data-clear-bg-color]');
  const bgUploadBtn = playerBox.querySelector('[data-upload-bg]');
  const bgClearBtn = playerBox.querySelector('[data-clear-bg]');
  const bgFileInput = playerBox.querySelector('[data-bg-file]');
  const bgTip = playerBox.querySelector('[data-bg-tip]');

  if (bgText) {
    bgText.value = p.playerBgColor || '';
    bgText.oninput = () => { p.playerBgColor = bgText.value.trim(); save(); };
  }
  if (bgPicker) {
    if (/^#[0-9a-f]{6}$/i.test(p.playerBgColor || '')) bgPicker.value = p.playerBgColor;
    bgPicker.oninput = () => {
      p.playerBgColor = bgPicker.value;
      if (bgText) bgText.value = bgPicker.value;
      save();
    };
  }
  if (bgClearColor) {
    bgClearColor.onclick = () => {
      p.playerBgColor = '';
      if (bgText) bgText.value = '';
      save();
    };
  }
  if (bgUploadBtn && bgFileInput) {
    bgUploadBtn.onclick = () => bgFileInput.click();
    bgFileInput.onchange = async () => {
      try {
        const f = bgFileInput.files?.[0];
        if (!f) return;
        if (f.size > 25 * 1024 * 1024) throw Error("图片不能超过25MB");
        bgImageUrl = await saveBgImage(f);
        if (bgTip) bgTip.textContent = '已应用背景图';
        apply(p);
      } catch (e) {
        if (bgTip) bgTip.textContent = e.message;
      } finally {
        bgFileInput.value = '';
      }
    

    };
  }
  if (bgClearBtn) bgClearBtn.onclick = async () => {
    await clearBgImage(); bgImageUrl = ''; if (bgTip) bgTip.textContent = '已移除背景图'; apply(p);
  };
  for (const el of playerBox.querySelectorAll('[data-pref-range]')) {
    const k = el.dataset.prefRange; el.value = p[k];
    const label = playerBox.querySelector(`[data-val="${k}"]`);
    const update = () => { if (label) label.textContent = el.value; };
    update(); el.oninput = () => { p[k] = Number(el.value); update(); save(); };
  }
  async function refreshFonts() {
    const fonts = await listFonts();
    if (disposed) return;
    installedFonts = fonts;
    renderFontSelects();
  }
  for (const box of allBoxes) {
    const sel = box.querySelector('[data-font-select]');
    const file = box.querySelector('[data-font-file]');
    const k = sel.dataset.fontSelect === 'player' ? 'sharedFontId' : 'noteFontId';
    sel.onchange = () => { p[k] = sel.value; save(); };
    box.querySelector('[data-import-font]').onclick = () => file.click();
    file.onchange = async () => {
      try { const f = file.files?.[0]; if (!f) return; if (f.size > 25*1024*1024) throw Error('字体不能超过25MB');
        const font = await saveFontFile(f); p[k] = font.id; await refreshFonts(); save(); setFontStatus('字体已导入');
      } catch(e) { setFontStatus(e.message); } finally { file.value = ''; }
    };
    box.querySelector('[data-delete-font]').onclick = async () => {
      const id = sel.value; if (!id || id === 'shared' || !W.confirm('删除共享字体？')) return;
      try { await deleteFont(id); if (p.sharedFontId === id) p.sharedFontId = ''; if (p.noteFontId === id) p.noteFontId = 'shared'; await refreshFonts(); save(); } catch(e) { setFontStatus(e.message); }
    };
  }
  function bindCss(box, attr, keys, presets, presetAttr, saveAttr, resetAttr, statusAttr) {
    if (!box) return;
    const fields = keys.map(k => box.querySelector(`[${attr}="${k}"]`));
    const statusNode = box.querySelector(`[${statusAttr}]`);
    const sync = () => fields.forEach((el,i) => { el.value = p[keys[i]] || ''; });
    const status = msg => { statusNode.textContent = msg; };
    function commit(values) {
      const old = p; p = {...p, ...values};
      try { apply(p); save(); sync(); status('已保存'); } catch(e) { p = old; apply(p); status(e.message); }
    }
    sync();
    fields.forEach((el,i) => { el.oninput = () => { try { apply({...p,...Object.fromEntries(fields.map((f,j)=>[keys[j],f.value]))}); status('预览中'); } catch(e) { status(e.message); } }; });
    box.querySelector(`[${saveAttr}]`).onclick = () => commit(Object.fromEntries(fields.map((f,i)=>[keys[i],f.value])));
    box.querySelector(`[${resetAttr}]`).onclick = () => commit(Object.fromEntries(keys.map(k=>[k,''])));
    for (const btn of box.querySelectorAll(`[${presetAttr}]`)) btn.onclick = () => commit(presets[btn.getAttribute(presetAttr)]);
  }
  bindCss(playerBox,'data-pcss',['playerIslandCss','playerThemeCss','playerCustomCss'],PLAYER_PRESETS,'data-player-preset','data-psave','data-preset-reset','data-pstatus');
  bindCss(noteBox,'data-css',['side','note','custom'],NOTE_PRESETS,'data-preset','data-save','data-reset','data-status');
  const backgroundBox = D.createElement('section');
  backgroundBox.className = 'cap-appearance';
  backgroundBox.dataset.capSettingsSection = 'background';
  backgroundBox.append(playerBox.querySelector('.cap-bg-customizer'));
  const layout = D.createElement('div');
  layout.className = 'cap-appearance-layout';
  const layoutTitle = D.createElement('h4');
  layoutTitle.textContent = '封面布局';
  layout.append(layoutTitle);
  for (const name of ['[data-pref="coverShape"]', '[data-pref-range="coverSize"]', '[data-pref-range="coverPadding"]', '[data-pref-range="coverRadius"]']) {
    layout.append(backgroundBox.querySelector(name).closest('label'));
  }
  playerBox.append(layout);
  const fontBox = D.createElement('section');
  fontBox.className = 'cap-appearance';
  fontBox.dataset.capSettingsSection = 'fonts';
  fontBox.append(fontManagers[0], playerBox.querySelector('.cap-css-editor'));
  settings.append(backgroundBox, fontBox);
  const onTheme = () => apply(p);
  themeSelect.addEventListener('change', onTheme);
  if (media.addEventListener) media.addEventListener('change', onTheme);
  else if (media.addListener) media.addListener(onTheme);
  try { apply(p); } catch(e) { console.warn('[Capricorn] invalid saved CSS',e); apply({...p,side:'',note:'',custom:'',playerIslandCss:'',playerThemeCss:'',playerCustomCss:''}); }
  void refreshFonts().then(()=>applyFonts(p)).catch(e=>setFontStatus(e.message));
  void loadBgImageUrl().then(url=>{bgImageUrl=url; if(bgTip && url) bgTip.textContent='已应用背景图'; apply(p);}).catch(e=>console.warn(e));
  return {
    refreshTheme: onTheme,
    closeInlineDrawer(){if(inlineDrawer) inlineDrawer.hidden=true;},
    toggleInlineDrawer(){if(inlineDrawer) inlineDrawer.hidden=!inlineDrawer.hidden;},
    destroy() {
      disposed = true;
      themeSelect.removeEventListener('change', onTheme);
      if (media.removeEventListener) media.removeEventListener('change', onTheme);
      else if (media.removeListener) media.removeListener(onTheme);
      sheet.remove();
      if (inlineDrawer) inlineDrawer.remove();
      playerBox.remove();
      backgroundBox.remove();
      fontBox.remove();
      for (const k of ['capMaterial', 'capPlayerTheme', 'capLook', 'capPaper', 'capPaperMode', 'capPaperPattern', 'capNoteDecor',
        'capHasPlayerBg', 'capHasPlayerFont', 'capHasNoteFont', 'capBgSource', 'capCoverShape', 'capCoverPlate']) delete D.body.dataset[k];
      for (const name of ['player-font', 'note-font', 'player-bg-image', 'player-bg-opacity', 'player-bg-blur', 'cover-size',
        'cover-padding', 'cover-opacity', 'cover-fit', 'cover-radius', 'cover-border', 'cover-color', 'cover-style', 'cover-shadow',
        'bg-saturation', 'bg-shade']) D.documentElement.style.removeProperty('--cap-' + name);
    },
  };
}
