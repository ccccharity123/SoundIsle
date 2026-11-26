import { icon } from './icons.js';
import { popover } from './ui-popover.js';

const SETTING_GROUPS = [
  {
    title: '核心模块',
    items: [
      { id: 'memory', label: '拾忆 · 剧情记忆', subtitle: '便签、表格、留痕档案与归档', icon: 'bookmark' },
      { id: 'music', label: '声屿 · 音乐播放', subtitle: '播放器、曲库与跟随剧情切歌', icon: 'music' },
    ],
  },
  {
    title: '视觉与交互',
    items: [
      { id: 'appearance', label: '外观与悬浮控件', subtitle: '日夜模式、材质、悬浮球与唤起', icon: 'swatches' },
      { id: 'background', label: '背景与封面', subtitle: '专辑铺满、模糊遮罩与封面边框', icon: 'image' },
      { id: 'fonts', label: '字体与自定义 CSS', subtitle: '导入 TTF 字体与样式微调', icon: 'note-pencil' },
    ],
  },
  {
    title: '连接与系统',
    items: [
      { id: 'services', label: '音源与运行服务', subtitle: '隐私模式、GD/网易云与运行诊断', icon: 'sliders-horizontal' },
      { id: 'preset', label: '预设与隐藏正则', subtitle: '酒馆预设条目安装与标签隐藏', icon: 'package' },
      { id: 'backup', label: '数据备份与索引', subtitle: '统一导出恢复与重建检索缓存', icon: 'archive' },
    ],
  },
];

const ALL_ITEMS = SETTING_GROUPS.flatMap(g => g.items);

export function mountSettings(root, options = {}) {
  const D = root.ownerDocument;
  const W = D.defaultView;
  const getSummary = typeof options.getSummary === 'function' ? options.getSummary : () => '';

  const home = D.createElement('div');
  home.className = 'cap-settings-home';
  home.setAttribute('aria-label', '摩羯座设置首页');

  const subbar = D.createElement('div');
  subbar.className = 'cap-settings-subhead';
  subbar.hidden = true;

  const backBtn = D.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'cap-settings-back';
  backBtn.innerHTML = `${icon('left', 16)}<span>设置</span>`;
  backBtn.onclick = () => showHome(true);

  const subTitle = D.createElement('strong');
  subTitle.className = 'cap-settings-subtitle';

  const spacer = D.createElement('span');
  spacer.className = 'cap-settings-subspacer';
  spacer.setAttribute('aria-hidden', 'true');

  subbar.append(backBtn, subTitle, spacer);

  const views = D.createElement('div');
  views.className = 'cap-settings-views';
  views.hidden = true;

  const groups = new Map();
  let currentId = 'home';

  for (const group of SETTING_GROUPS) {
    const sec = D.createElement('div');
    sec.className = 'cap-settings-group';
    const heading = D.createElement('div');
    heading.className = 'cap-settings-group-title';
    heading.textContent = group.title;
    sec.append(heading);

    const card = D.createElement('div');
    card.className = 'cap-settings-list-card';

    for (const item of group.items) {
      const row = D.createElement('button');
      row.type = 'button';
      row.className = 'cap-settings-row';
      row.dataset.settingsTarget = item.id;

      const ico = D.createElement('span');
      ico.className = 'cap-settings-row-ico';
      ico.setAttribute('aria-hidden', 'true');
      ico.innerHTML = icon(item.icon, 17);

      const text = D.createElement('span');
      text.className = 'cap-settings-row-text';
      const title = D.createElement('strong');
      title.textContent = item.label;
      const sub = D.createElement('small');
      sub.textContent = item.subtitle;
      text.append(title, sub);

      const summary = D.createElement('span');
      summary.className = 'cap-settings-row-summary';

      const chev = D.createElement('span');
      chev.className = 'cap-settings-row-chev';
      chev.setAttribute('aria-hidden', 'true');
      chev.innerHTML = icon('right', 14);

      row.append(ico, text, summary, chev);
      row.onclick = () => activate(item.id, false);
      card.append(row);

      const view = D.createElement('section');
      view.id = 'cap-settings-' + item.id;
      view.className = 'cap-settings-view';
      view.hidden = true;
      views.append(view);

      groups.set(item.id, { item, row, summary, view });
    }

    sec.append(card);
    home.append(sec);
  }

  function refreshSummaries() {
    for (const [id, entry] of groups) {
      let info = '';
      try { info = getSummary(id) || ''; } catch {}
      if (typeof info === 'object' && info) {
        if (entry.summary.textContent !== (info.text || '')) entry.summary.textContent = info.text || '';
        if (entry.summary.dataset.tone !== (info.tone || '')) entry.summary.dataset.tone = info.tone || '';
      } else {
        if (entry.summary.textContent !== String(info || '')) entry.summary.textContent = String(info || '');
        if (entry.summary.dataset.tone) entry.summary.dataset.tone = '';
      }
      if (entry.summary.hidden !== !entry.summary.textContent) entry.summary.hidden = !entry.summary.textContent;
    }
  }

  function showHome(focusBack = false) {
    popover.closeWithin(views);
    const prev = currentId;
    currentId = 'home';
    root.dataset.settingsPage = 'home';
    subbar.hidden = true;
    views.hidden = true;
    for (const entry of groups.values()) entry.view.hidden = true;
    home.hidden = false;
    home.classList.remove('is-pop');
    if (prev !== 'home') {
      void home.offsetWidth;
      home.classList.add('is-pop');
    }
    refreshSummaries();
    root.scrollTop = 0;
    if (focusBack && groups.has(prev)) {
      try { groups.get(prev).row.focus({ preventScroll: true }); } catch {}
    }
  }

  function activate(id, focus = false) {
    if (!groups.has(id)) {
      showHome(false);
      return;
    }
    popover.closeWithin(views);
    currentId = id;
    root.dataset.settingsPage = id;
    home.hidden = true;
    subbar.hidden = false;
    views.hidden = false;
    const entry = groups.get(id);
    subTitle.textContent = entry.item.label;
    for (const [key, g] of groups) {
      g.view.hidden = key !== id;
    }
    entry.view.classList.remove('is-push');
    void entry.view.offsetWidth;
    entry.view.classList.add('is-push');
    root.scrollTop = 0;
    if (focus) {
      try { backBtn.focus({ preventScroll: true }); } catch {}
    }
  }

  function classify() {
    for (const node of Array.from(root.children)) {
      if (node === home || node === subbar || node === views) continue;
      const group = groups.get(node.dataset.capSettingsSection) || groups.get('services');
      group.view.append(node);
    }
  }

  root.prepend(home, subbar, views);
  classify();
  showHome(false);
  root.classList.add('cap-settings-paged');

  const Observer = W?.MutationObserver;
  const observer = typeof Observer === 'function' ? new Observer(classify) : null;
  if (observer) observer.observe(root, { childList: true });

  return {
    activate(id) { activate(id, false); },
    home() { showHome(false); },
    current: () => currentId,
    isHome: () => currentId === 'home',
    refreshSummaries,
    sync() { refreshSummaries(); },
    destroy() {
      if (observer) observer.disconnect();
      for (const entry of groups.values()) root.append(...entry.view.children);
      home.remove();
      subbar.remove();
      views.remove();
      root.classList.remove('cap-settings-paged');
      delete root.dataset.settingsPage;
    },
  };
}
