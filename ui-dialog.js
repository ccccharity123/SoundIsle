/* Capricorn Apple Liquid Glass Dialogs & Floating HUD Toast */
import { icon } from './icons.js';
import { prefersReducedMotion } from './ui-motion.js';

const dialogStack = [];
let toastNode = null;
let toastTimer = 0;
let toastHideTimer = 0;

function docOf(options) {
  return options?.doc || document;
}

function focusSafe(el) {
  if (!el || typeof el.focus !== 'function') return;
  try { el.focus({ preventScroll: true }); } catch { try { el.focus(); } catch {} }
}

export function uiToast(message, options = {}) {
  const text = String(message ?? '').trim();
  if (!text) return;
  const D = docOf(options);
  const W = D.defaultView || window;
  if (!D.body) return;
  const duration = Math.max(1200, Math.min(6000, Number(options.duration) || 2400));
  const kind = options.kind || 'info'; // 'info' | 'success' | 'warn' | 'error'

  W.clearTimeout(toastTimer);
  W.clearTimeout(toastHideTimer);

  if (!toastNode || !toastNode.isConnected || toastNode.ownerDocument !== D) {
    toastNode?.remove();
    toastNode = D.createElement('div');
    toastNode.className = 'cap-hud-toast';
    toastNode.setAttribute('role', 'status');
    toastNode.setAttribute('aria-live', 'polite');
    D.body.append(toastNode);
  }

  const glyph = kind === 'error' || kind === 'warn' ? 'warning' : kind === 'success' ? 'check' : 'info';
  toastNode.dataset.kind = kind;
  toastNode.innerHTML = `<span class="cap-hud-icon" aria-hidden="true">${icon(glyph, 15)}</span><span class="cap-hud-text"></span>`;
  toastNode.querySelector('.cap-hud-text').textContent = text;
  toastNode.classList.remove('is-leaving');
  toastNode.classList.add('is-visible');

  toastTimer = W.setTimeout(() => {
    if (!toastNode) return;
    toastNode.classList.remove('is-visible');
    toastNode.classList.add('is-leaving');
    const delay = prefersReducedMotion(W) ? 0 : 210;
    toastHideTimer = W.setTimeout(() => {
      if (toastNode?.classList.contains('is-leaving')) {
        toastNode.remove();
        toastNode = null;
      }
    }, delay);
  }, duration);
}

function openDialog({
  doc,
  title = '',
  message = '',
  mode = 'alert', // 'alert' | 'confirm' | 'prompt'
  defaultValue = '',
  placeholder = '',
  multiline = false,
  readOnly = false,
  danger = false,
  confirmText = '确定',
  cancelText = '取消',
  copyOnConfirm = false,
}) {
  const D = doc || document;
  const W = D.defaultView || window;
  if (!D.body) {
    if (mode === 'confirm') return Promise.resolve(W.confirm(message));
    if (mode === 'prompt') return Promise.resolve(W.prompt(message, defaultValue));
    W.alert(message);
    return Promise.resolve();
  }

  return new Promise(resolve => {
    const priorFocus = D.activeElement;
    const overlay = D.createElement('div');
    overlay.className = 'cap-dialog-overlay';
    overlay.style.zIndex = String(2147483635 + dialogStack.length);

    const card = D.createElement('section');
    card.className = 'cap-dialog-card';
    if (multiline) card.classList.add('is-wide');
    card.setAttribute('role', mode === 'alert' ? 'alertdialog' : 'dialog');
    card.setAttribute('aria-modal', 'true');
    if (title) card.setAttribute('aria-label', title);

    const body = D.createElement('div');
    body.className = 'cap-dialog-body';
    if (title) {
      const h = D.createElement('h3');
      h.className = 'cap-dialog-title';
      h.textContent = title;
      body.append(h);
    }
    if (message) {
      const p = D.createElement('p');
      p.className = 'cap-dialog-message';
      p.textContent = String(message);
      body.append(p);
    }

    let input = null;
    if (mode === 'prompt') {
      input = D.createElement(multiline ? 'textarea' : 'input');
      input.className = 'cap-dialog-input';
      if (!multiline) input.type = 'text';
      else input.rows = 8;
      input.value = String(defaultValue ?? '');
      if (placeholder) input.placeholder = placeholder;
      if (readOnly) input.readOnly = true;
      body.append(input);
    }

    const actions = D.createElement('div');
    actions.className = 'cap-dialog-actions';
    if (mode === 'alert') actions.classList.add('is-single');

    let done = false;
    const entry = {
      overlay,
      cancel: () => finish(mode === 'confirm' ? false : mode === 'prompt' ? null : undefined),
    };

    function finish(result) {
      if (done) return;
      done = true;
      const idx = dialogStack.indexOf(entry);
      if (idx >= 0) dialogStack.splice(idx, 1);
      D.removeEventListener('keydown', onKey, true);
      const finishRemove = () => {
        overlay.remove();
        if (priorFocus && priorFocus.isConnected) focusSafe(priorFocus);
        resolve(result);
      };
      if (prefersReducedMotion(W)) {
        finishRemove();
      } else {
        overlay.classList.add('is-closing');
        W.setTimeout(finishRemove, 170);
      }
    }

    async function accept() {
      if (copyOnConfirm && input) {
        try {
          await W.navigator.clipboard.writeText(input.value);
          uiToast('已复制到剪贴板', { doc: D, kind: 'success' });
        } catch {
          input.select();
          uiToast('请手动复制选中的内容', { doc: D, kind: 'warn' });
          return;
        }
      }
      if (mode === 'confirm') finish(true);
      else if (mode === 'prompt') finish(input ? input.value : '');
      else finish(undefined);
    }

    if (mode !== 'alert') {
      const cancelBtn = D.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'cap-dialog-btn';
      cancelBtn.textContent = cancelText;
      cancelBtn.onclick = () => entry.cancel();
      actions.append(cancelBtn);
    }

    const okBtn = D.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'cap-dialog-btn ' + (danger ? 'is-danger' : 'is-primary');
    okBtn.textContent = confirmText;
    okBtn.onclick = () => void accept();
    actions.append(okBtn);

    card.append(body, actions);
    overlay.append(card);

    function onKey(event) {
      if (dialogStack[dialogStack.length - 1] !== entry) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        entry.cancel();
      } else if (event.key === 'Enter' && !event.isComposing && (!multiline || event.metaKey || event.ctrlKey || event.target !== input)) {
        if (event.target?.tagName === 'BUTTON') return;
        event.preventDefault();
        event.stopPropagation();
        void accept();
      }
    }

    overlay.addEventListener('pointerdown', event => {
      if (event.target === overlay) entry.cancel();
    });

    dialogStack.push(entry);
    D.addEventListener('keydown', onKey, true);
    D.body.append(overlay);

    W.requestAnimationFrame(() => {
      if (input) {
        focusSafe(input);
        if (readOnly) input.select();
        else if (!multiline) {
          try { input.setSelectionRange(input.value.length, input.value.length); } catch {}
        }
      } else {
        focusSafe(okBtn);
      }
    });
  });
}

export function uiAlert(message, options = {}) {
  return openDialog({
    doc: docOf(options),
    title: options.title || '提示',
    message,
    mode: 'alert',
    confirmText: options.confirmText || '好',
  });
}

export function uiConfirm(message, options = {}) {
  return openDialog({
    doc: docOf(options),
    title: options.title || '请确认',
    message,
    mode: 'confirm',
    danger: Boolean(options.danger),
    confirmText: options.confirmText || (options.danger ? '删除' : '确定'),
    cancelText: options.cancelText || '取消',
  });
}

export function uiPrompt(message, defaultValue = '', options = {}) {
  return openDialog({
    doc: docOf(options),
    title: options.title || '请输入',
    message,
    mode: 'prompt',
    defaultValue,
    placeholder: options.placeholder || '',
    multiline: Boolean(options.multiline),
    readOnly: Boolean(options.readOnly),
    confirmText: options.confirmText || '确定',
    cancelText: options.cancelText || '取消',
    copyOnConfirm: Boolean(options.copyOnConfirm),
  });
}
