import { popover } from './ui-popover.js';

const pages = [
  ['appearance', '外观'], ['background', '背景'], ['fonts', '字体/CSS'],
  ['services', '服务'], ['backup', '备份'],
];

export function mountSettings(root) {
  const document = root.ownerDocument;
  const tabs = document.createElement('div');
  const views = document.createElement('div');
  const groups = new Map();
  tabs.className = 'cap-settings-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', '声屿设置分类');
  views.className = 'cap-settings-views';

  function activate(id, focus) {
    popover.closeWithin(views);
    for (const [key, entry] of groups) {
      const current = key === id;
      entry.tab.setAttribute('aria-selected', String(current));
      entry.tab.tabIndex = current ? 0 : -1;
      entry.view.hidden = !current;
    }
    if (focus) groups.get(id).tab.focus();
  }

  for (const [id, label] of pages) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'cap-settings-tab-' + id;
    button.textContent = label;
    button.setAttribute('role', 'tab');
    const view = document.createElement('section');
    view.id = 'cap-settings-' + id;
    view.className = 'cap-settings-view';
    view.setAttribute('role', 'tabpanel');
    view.setAttribute('aria-labelledby', button.id);
    button.setAttribute('aria-controls', view.id);
    button.onclick = () => activate(id, false);
    groups.set(id, { tab: button, view });
    tabs.append(button);
    views.append(view);
  }

  function classify() {
    for (const node of Array.from(root.children)) {
      if (node === tabs || node === views) continue;
      const group = groups.get(node.dataset.capSettingsSection) || groups.get('services');
      group.view.append(node);
    }
  }
  tabs.onkeydown = event => {
    const buttons = Array.from(tabs.children);
    const index = buttons.indexOf(event.target);
    if (index < 0) return;
    let next;
    switch (event.key) {
      case 'ArrowLeft': next = (index + buttons.length - 1) % buttons.length; break;
      case 'ArrowRight': next = (index + 1) % buttons.length; break;
      case 'Home': next = 0; break;
      case 'End': next = buttons.length - 1; break;
      default: return;
    }
    event.preventDefault();
    activate(pages[next][0], true);
  };
  root.prepend(tabs, views);
  classify();
  activate('appearance', false);
  root.classList.add('cap-settings-paged');
  const Observer = document.defaultView.MutationObserver;
  const observer = typeof Observer === 'function' ? new Observer(classify) : null;
  if (observer) observer.observe(root, { childList: true });
  return {
    destroy() {
      if (observer) observer.disconnect();
      for (const entry of groups.values()) root.append(...entry.view.children);
      tabs.remove();
      views.remove();
      root.classList.remove('cap-settings-paged');
    },
  };
}
