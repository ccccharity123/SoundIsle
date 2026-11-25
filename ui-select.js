import { icon } from './icons.js';
import { popover } from './ui-popover.js';

const roots = new WeakMap();
const documents = new WeakMap();
const adapters = new WeakMap();
const preferenceKey = 'capricorn_native_selects';
let optionId = 0;

function stateFor(document) {
  if (documents.has(document)) return documents.get(document);
  let native = false;
  try { native = document.defaultView.localStorage.getItem(preferenceKey) === '1'; } catch (_) {}
  const state = { native, controllers: new Set() };
  documents.set(document, state);
  return state;
}

export function nativeSelectsEnabled(document) {
  return stateFor(document).native;
}

export function setNativeSelects(document, enabled) {
  const state = stateFor(document);
  state.native = !!enabled;
  try {
    if (state.native) document.defaultView.localStorage.setItem(preferenceKey, '1');
    else document.defaultView.localStorage.removeItem(preferenceKey);
  } catch (_) {}
  state.controllers.forEach(controller => controller.update());
}

function element(D, tag, className, text = '') {
  const node = D.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function eligible(select) {
  return select.tagName === 'SELECT' && !select.multiple && select.size <= 1 &&
    !select.hidden && !select.closest('dialog') && select.style.display !== 'none' &&
    select.dataset.capSelect !== 'native' && select.getAttribute('aria-hidden') !== 'true';
}

function disabled(option) {
  return option.disabled || (option.parentElement.tagName === 'OPTGROUP' && option.parentElement.disabled);
}

function visibleOptions(select) {
  return Array.from(select.options).filter(option => !option.hidden && !option.parentElement.hidden);
}

function textLabels(select) {
  const labels = Array.from(select.labels || []);
  return labels.map(label => {
    // Label may also contain the original select and its new presentation.
    const walker = label.ownerDocument.createTreeWalker(label, 4);
    let text = '';
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.parentElement.closest('select, .cap-select-ui')) text += node.textContent + ' ';
    }
    return text.trim();
  }).filter(Boolean).join(' ');
}

function labelFor(select) {
  return select.getAttribute('aria-label') || textLabels(select) ||
    select.getAttribute('title') || '选项';
}

function addCaption(row, option) {
  const D = row.ownerDocument;
  const color = option.dataset.capSwatch;
  if (/^#[0-9a-f]{6}$/i.test(color || '')) {
    const swatch = element(D, 'span', 'cap-select-swatch');
    swatch.style.backgroundColor = color;
    row.appendChild(swatch);
  }
  row.appendChild(element(D, 'span', 'cap-select-caption', option.label));
}

function restore(node, attr, value) {
  if (value == null) node.removeAttribute(attr);
  else node.setAttribute(attr, value);
}

function focus(node) {
  try { node.focus({ preventScroll: true }); } catch (_) { node.focus(); }
}

function scrollItem(list, row) {
  const clip = list.getBoundingClientRect();
  const box = row.getBoundingClientRect();
  if (box.top < clip.top) list.scrollTop -= clip.top - box.top;
  if (box.bottom > clip.bottom) list.scrollTop += box.bottom - clip.bottom;
}

function makeList(adapter, searchable) {
  const { select, D } = adapter;
  const content = element(D, 'div', 'cap-select-picker');
  const list = element(D, 'div', 'cap-select-options');
  list.id = 'cap-select-list-' + (++optionId);
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', labelFor(select));
  list.tabIndex = 0;
  let search;
  if (searchable) {
    const field = element(D, 'div', 'cap-select-search');
    const glyph = element(D, 'span');
    glyph.innerHTML = icon('magnifying-glass', 16);
    field.appendChild(glyph);
    search = element(D, 'input', 'cap-select-query');
    search.type = 'search';
    search.autocomplete = 'off';
    search.placeholder = '搜索选项';
    search.setAttribute('role', 'combobox');
    search.setAttribute('aria-label', '搜索' + labelFor(select));
    search.setAttribute('aria-autocomplete', 'list');
    search.setAttribute('aria-controls', list.id);
    search.setAttribute('aria-expanded', 'true');
    field.appendChild(search);
    content.appendChild(field);
  }
  content.appendChild(list);
  let rows = [];
  let active = -1;

  function highlight(index, scroll) {
    if (rows[active]) rows[active].row.removeAttribute('data-active');
    active = index;
    const current = rows[active];
    for (const node of [list, search]) {
      if (!node) continue;
      if (current) node.setAttribute('aria-activedescendant', current.row.id);
      else node.removeAttribute('aria-activedescendant');
    }
    if (current) {
      current.row.dataset.active = 'true';
      if (scroll) scrollItem(list, current.row);
    }
  }

  function choose(option) {
    if (!option || disabled(option) || !adapter.options.includes(option)) return;
    popover.close('select');
    adapter.choose(option);
  }

  function draw(keepActive = true) {
    const previous = keepActive && rows[active] && rows[active].option;
    active = -1;
    rows = [];
    list.textContent = '';
    const groups = new Map();
    const query = search ? search.value.trim().toLocaleLowerCase() : '';
    for (const option of adapter.options) {
      if (query && !option.label.toLocaleLowerCase().includes(query)) continue;
      const parent = option.parentElement;
      let target = list;
      if (parent.tagName === 'OPTGROUP') {
        if (!groups.has(parent)) {
          const group = element(D, 'div', 'cap-select-optgroup');
          group.setAttribute('role', 'group');
          group.setAttribute('aria-label', parent.label);
          const heading = element(D, 'div', 'cap-popover-heading', parent.label);
          heading.setAttribute('aria-hidden', 'true');
          group.appendChild(heading);
          list.appendChild(group);
          groups.set(parent, group);
        }
        target = groups.get(parent);
      }
      const row = element(D, 'div', 'cap-popover-item cap-select-option');
      row.id = list.id + '-' + option.index;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(option.selected));
      if (disabled(option)) row.setAttribute('aria-disabled', 'true');
      addCaption(row, option);
      if (option.selected) {
        const check = element(D, 'span', 'cap-popover-check');
        check.innerHTML = icon('check', 16);
        row.appendChild(check);
      }
      row.addEventListener('click', () => choose(option));
      target.appendChild(row);
      if (!disabled(option)) rows.push({ row, option });
    }
    if (!list.children.length) {
      const empty = element(D, 'div', 'cap-select-empty', query ? '没有匹配选项' : '暂无可选项');
      empty.setAttribute('role', 'status');
      list.appendChild(empty);
    }
    const initial = rows.findIndex(item => item.option === previous || (!previous && item.option.selected));
    highlight(initial >= 0 ? initial : (rows.length ? 0 : -1), !!list.isConnected);
  }

  function keydown(event) {
    if (event.isComposing || !rows.length) return;
    let index = active;
    switch (event.key) {
      case 'ArrowDown': index = (active + 1) % rows.length; break;
      case 'ArrowUp': index = active <= 0 ? rows.length - 1 : active - 1; break;
      case 'Home': if (event.target === search && search.value) return; index = 0; break;
      case 'End': if (event.target === search && search.value) return; index = rows.length - 1; break;
      case ' ': if (event.target === search) return;
      /* falls through */
      case 'Enter': event.preventDefault(); choose(rows[active] && rows[active].option); return;
      default: return;
    }
    event.preventDefault();
    highlight(index, true);
  }

  content.addEventListener('keydown', keydown);
  if (search) search.addEventListener('input', () => draw(false));
  draw(false);
  return {
    content,
    draw,
    initialFocus(keyboard) {
      if (rows[active]) scrollItem(list, rows[active].row);
      return searchable && keyboard ? search : list;
    }
  };
}

function makeAdapter(select, fallback) {
  const D = select.ownerDocument;
  const W = D.defaultView;
  const wrapper = element(D, 'span', 'cap-select-ui');
  const oldTab = select.getAttribute('tabindex');
  const oldAria = select.getAttribute('aria-hidden');
  let type = '';
  let trigger = null;
  let segmentSignature = '';
  let segmentButtons = [];
  let picker = null;
  let destroyed = false;
  const labels = Array.from(select.labels || []);
  let validation = null;
  const adapter = { select, D, options: [] };

  function applyLabel(node) {
    const labelledBy = select.getAttribute('aria-labelledby');
    if (labelledBy) node.setAttribute('aria-labelledby', labelledBy);
    else {
      node.removeAttribute('aria-labelledby');
      node.setAttribute('aria-label', labelFor(select));
    }
  }

  function currentControl() {
    return trigger || segmentButtons.find(b => b.tabIndex === 0) || segmentButtons[0];
  }

  function labelClick(event) {
    if (event.defaultPrevented || wrapper.contains(event.target) || event.target.closest('input,textarea,button,a,select')) return;
    const control = currentControl();
    if (control) {
      event.preventDefault();
      focus(control);
    }
  }

  function clearValidation() {
    if (!validation) return;
    validation.remove();
    validation = null;
    for (const control of trigger ? [trigger] : segmentButtons) {
      control.removeAttribute('aria-invalid');
      control.removeAttribute('aria-errormessage');
    }
  }

  function nativeInvalid(event) {
    const control = currentControl();
    if (!control || event.defaultPrevented) return;
    event.preventDefault();
    if (!validation) {
      validation = element(D, 'span', 'cap-select-validation');
      validation.id = 'cap-select-validation-' + (++optionId);
      validation.setAttribute('role', 'alert');
      wrapper.parentNode.insertBefore(validation, wrapper.nextSibling);
    }
    validation.textContent = select.validationMessage;
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-errormessage', validation.id);
    focus(control);
  }

  function sync() {
    try { update(); } catch (error) { fallback(error); }
  }

  function choose(option) {
    if (destroyed || select.matches(':disabled') || disabled(option) || !select.contains(option)) return;
    if (select.selectedIndex !== option.index) {
      select.selectedIndex = option.index;
      select.dispatchEvent(new W.Event('change', { bubbles: true }));
    }
    sync();
  }

  function show(event) {
    sync();
    if (destroyed || !trigger || trigger.disabled) return;
    if (popover.isOpen(trigger)) {
      popover.close('toggle');
      return;
    }
    const searchable = type === 'search';
    const keyboard = event.type === 'keydown' || event.detail === 0 ||
      (W.matchMedia && W.matchMedia('(pointer:fine)').matches);
    let cause;
    try {
      picker = makeList(adapter, searchable);
      const current = picker;
      const result = popover.open({
        anchor: trigger,
        role: searchable ? 'dialog' : 'listbox',
        align: 'start',
        className: 'cap-select-popover',
        label: labelFor(select),
        content: current.content,
        initialFocus: panel => {
          // For short dropdowns, the panel wraps the actual keyboard focus target.
          if (!searchable) {
            panel.removeAttribute('role');
            panel.removeAttribute('aria-label');
          }
          return current.initialFocus(keyboard);
        },
        onClose(reason) { cause = reason; picker = null; }
      });
      if (result && !searchable) {
        const list = current.content.querySelector('.cap-select-options');
        trigger.setAttribute('aria-controls', list.id);
      }
      if (!result && cause !== 'modal' && cause !== 'detached') throw new Error('无法打开选项');
    } catch (error) {
      fallback(error);
      if (select.isConnected) {
        focus(select);
        if (typeof select.showPicker === 'function') {
          try { select.showPicker(); } catch (_) {}
        }
      }
    }
  }

  function segmentKeys(event, index) {
    if (!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const rows = segmentButtons.filter(button => !button.disabled);
    if (!rows.length) return;
    const current = rows.indexOf(segmentButtons[index]);
    const backwards = event.key === 'ArrowUp' || event.key === 'ArrowLeft';
    let next = rows[(current + (backwards ? -1 : 1) + rows.length) % rows.length];
    if (event.key === 'Home') next = rows[0];
    if (event.key === 'End') next = rows[rows.length - 1];
    event.preventDefault();
    next.click();
    focus(currentControl());
  }

  function update() {
    if (destroyed) return;
    const unavailable = select.matches(':disabled');
    if (unavailable || select.validity.valid) clearValidation();
    const options = visibleOptions(select);
    const stable = select.dataset.capSelect === 'segment' && options.length >= 2 && options.length <= 3 &&
      options.every(option => option.parentElement === select);
    const nextType = stable ? 'segment' : (select.dataset.capSelect === 'search' || options.length > 8 ? 'search' : 'menu');
    adapter.options = options;
    const focused = wrapper.contains(D.activeElement);
    if (nextType !== type) {
      clearValidation();
      if (trigger) popover.closeWithin(wrapper);
      wrapper.textContent = '';
      type = nextType;
      wrapper.dataset.mode = type;
      segmentSignature = '';
      segmentButtons = [];
      trigger = null;
      if (stable) {
        wrapper.setAttribute('role', 'radiogroup');
        applyLabel(wrapper);
      } else {
        wrapper.removeAttribute('role');
        wrapper.removeAttribute('aria-label');
        wrapper.removeAttribute('aria-required');
        wrapper.removeAttribute('aria-labelledby');
        trigger = element(D, 'button', 'cap-select-trigger');
        trigger.type = 'button';
        trigger.setAttribute('aria-haspopup', type === 'search' ? 'dialog' : 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.addEventListener('click', event => {
          event.preventDefault();
          show(event);
        });
        trigger.addEventListener('keydown', event => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          if (!popover.isOpen(trigger)) show(event);
        });
        wrapper.appendChild(trigger);
      }
    }
    if (stable) {
      applyLabel(wrapper);
      wrapper.setAttribute('aria-required', String(select.required));
      const signature = JSON.stringify(options.map(option => [option.label, option.dataset.capSwatch]));
      if (signature !== segmentSignature) {
        wrapper.textContent = '';
        segmentSignature = signature;
        segmentButtons = options.map((option, index) => {
          const button = element(D, 'button', 'cap-select-segment');
          button.type = 'button';
          button.setAttribute('role', 'radio');
          addCaption(button, option);
          button.addEventListener('click', event => {
            event.preventDefault();
            choose(adapter.options[index]);
          });
          button.addEventListener('keydown', event => segmentKeys(event, index));
          wrapper.appendChild(button);
          return button;
        });
      }
      const selected = options.findIndex(option => option.selected && !disabled(option));
      const tab = selected >= 0 ? selected : options.findIndex(option => !disabled(option));
      segmentButtons.forEach((button, index) => {
        button.disabled = unavailable || disabled(options[index]);
        button.tabIndex = !button.disabled && index === tab ? 0 : -1;
        button.setAttribute('aria-checked', String(options[index].selected));
      });
    } else {
      trigger.disabled = unavailable || !options.length;
      applyLabel(trigger);
      const selected = select.options[select.selectedIndex];
      const display = selected ? selected.label : (options.length ? '请选择' : '暂无可选项');
      const caption = element(D, 'span', 'cap-select-value');
      const glyph = element(D, 'span', 'cap-select-caret');
      glyph.innerHTML = icon('caret-up-down', 16);
      if (selected) addCaption(caption, selected);
      else caption.textContent = display;
      trigger.textContent = '';
      trigger.appendChild(caption);
      trigger.appendChild(glyph);
      // The visible caption is part of the trigger's accessible name.
      if (!trigger.hasAttribute('aria-labelledby')) trigger.setAttribute('aria-label', labelFor(select) + ' · ' + display);
      if (trigger.disabled) popover.closeWithin(wrapper);
      if (picker) picker.draw();
    }
    if (focused && !wrapper.contains(D.activeElement) && currentControl()) focus(currentControl());
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    popover.closeWithin(wrapper);
    select.removeEventListener('change', sync);
    select.removeEventListener('invalid', nativeInvalid);
    labels.forEach(label => label.removeEventListener('click', labelClick));
    clearValidation();
    wrapper.remove();
    select.classList.remove('cap-select-native');
    restore(select, 'aria-hidden', oldAria);
    restore(select, 'tabindex', oldTab);
    adapters.delete(select);
  }

  adapter.update = sync;
  adapter.destroy = destroy;
  adapter.choose = choose;
  adapter.clearValidation = clearValidation;
  try {
    if (!select.parentNode) throw new Error('找不到选择器容器');
    select.parentNode.insertBefore(wrapper, select.nextSibling);
    update();
    select.classList.add('cap-select-native');
    select.setAttribute('aria-hidden', 'true');
    select.tabIndex = -1;
    select.addEventListener('change', sync);
    select.addEventListener('invalid', nativeInvalid);
    labels.forEach(label => label.addEventListener('click', labelClick));
    return adapter;
  } catch (error) {
    destroy();
    throw error;
  }
}

export function refreshSelect(select) {
  const adapter = adapters.get(select);
  if (adapter) adapter.update();
}

export function mountSelects(root) {
  if (roots.has(root)) return roots.get(root);
  const D = root.ownerDocument;
  const W = D.defaultView;
  const state = stateFor(D);
  const current = new Map();
  let observer;
  let resetTimer;
  let destroyed = false;
  let failed = false;
  const pendingForms = new Set();

  function clear() {
    if (observer) observer.disconnect();
    if (resetTimer != null) W.clearTimeout(resetTimer);
    resetTimer = null;
    pendingForms.clear();
    D.removeEventListener('reset', reset, true);
    current.forEach(adapter => adapter.destroy());
    current.clear();
  }

  function fallback(error) {
    if (failed) return;
    failed = true;
    clear();
    console.warn('[Capricorn] 下拉框已回退原生控件', error);
  }

  function inspect(select) {
    const adapter = current.get(select);
    if (adapter) {
      const supported = root.contains(select) && !select.hidden && !select.closest('dialog') && !select.multiple &&
        select.size <= 1 && select.style.display !== 'none' && select.dataset.capSelect !== 'native';
      if (supported) adapter.update();
      else {
        adapter.destroy();
        current.delete(select);
      }
    } else if (!adapters.has(select) && eligible(select) && root.contains(select)) {
      const created = makeAdapter(select, fallback);
      current.set(select, created);
      adapters.set(select, created);
    }
  }

  function reset(event) {
    if (!Array.from(current.keys()).some(select => select.form === event.target)) return;
    pendingForms.add(event.target);
    if (resetTimer != null) return;
    resetTimer = W.setTimeout(() => {
      resetTimer = null;
      try {
        current.forEach((adapter, select) => {
          if (pendingForms.has(select.form)) {
            adapter.clearValidation();
            adapter.update();
          }
        });
      } catch (error) { fallback(error); }
      pendingForms.clear();
    }, 0);
  }

  function collect(node, set) {
    if (node.nodeType !== 1) return;
    if (node.tagName === 'SELECT') set.add(node);
    else node.querySelectorAll('select').forEach(select => set.add(select));
  }

  function changed(records) {
    if (destroyed || state.native || failed) return;
    const affected = new Set();
    for (const record of records) {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (!target || target.closest('.cap-select-ui')) continue;
      if (target.closest('select')) affected.add(target.closest('select'));
      else if (record.type === 'childList') {
        record.addedNodes.forEach(node => collect(node, affected));
        record.removedNodes.forEach(node => collect(node, affected));
      } else if (target.tagName === 'FIELDSET') collect(target, affected);
    }
    try { affected.forEach(inspect); } catch (error) { fallback(error); }
  }

  function update() {
    if (destroyed || failed) return;
    if (state.native || root.hasAttribute('data-cap-native-selects') || !W.MutationObserver) {
      clear();
      return;
    }
    try {
      current.forEach((_, select) => { if (!root.contains(select)) inspect(select); });
      root.querySelectorAll('select').forEach(inspect);
      if (!observer) observer = new W.MutationObserver(changed);
      observer.observe(root, {
        subtree: true, childList: true, attributes: true, characterData: true,
        attributeFilter: ['selected','disabled','label','value','hidden','multiple','size','required',
          'aria-label','aria-labelledby','title','data-cap-select','data-cap-swatch','style']
      });
      D.addEventListener('reset', reset, true);
    } catch (error) { fallback(error); }
  }

  const controller = {
    update,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clear();
      state.controllers.delete(controller);
      roots.delete(root);
    }
  };
  roots.set(root, controller);
  state.controllers.add(controller);
  update();
  return controller;
}
