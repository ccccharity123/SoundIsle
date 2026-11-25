import { icon } from './icons.js';
import { viewport } from './viewport.js';

const focusable = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]';
const hostModal = 'dialog[open], [aria-modal="true"], #dialogue_popup, .modal.show, .swal2-container';
const restoreReasons = new Set(['escape', 'select', 'toggle', 'tab']);
let active = null;
let nextId = 0;

function focus(node) {
  if (!node || !node.isConnected) return;
  try { node.focus({ preventScroll: true }); } catch (_) { node.focus(); }
}

function setBack(node, attribute, value) {
  if (value == null) node.removeAttribute(attribute);
  else node.setAttribute(attribute, value);
}

function report(error) {
  console.warn('[Capricorn] 浮层组件已回退', error);
}

function restoreContent(entry) {
  if (!entry.marker) return;
  if (entry.marker.parentNode) entry.marker.parentNode.replaceChild(entry.content, entry.marker);
  if (entry.content.nodeType === 1) entry.content.hidden = entry.wasHidden;
  entry.marker = null;
}

function close(reason = 'close') {
  const entry = active;
  if (!entry) return;
  active = null;
  entry.cleanups.forEach(remove => remove());
  if (entry.frame) entry.W.cancelAnimationFrame(entry.frame);
  restoreContent(entry);
  if (entry.portal.parentNode) entry.portal.parentNode.removeChild(entry.portal);
  setBack(entry.anchor, 'aria-expanded', entry.oldExpanded);
  setBack(entry.anchor, 'aria-controls', entry.oldControls);
  setBack(entry.anchor, 'aria-haspopup', entry.oldHasPopup);
  if (restoreReasons.has(reason)) focus(entry.anchor);
  if (entry.onClose) {
    try { entry.onClose(reason); } catch (error) { report(error); }
  }
}

function modalCovers(entry) {
  return Array.from(entry.D.querySelectorAll(hostModal)).some(node =>
    !node.contains(entry.anchor) && !node.contains(entry.portal) &&
    node.getClientRects().length && entry.W.getComputedStyle(node).visibility !== 'hidden'
  );
}

function place(entry) {
  const { anchor, portal, panel, W } = entry;
  if (!anchor.isConnected || !anchor.getClientRects().length ||
      anchor.closest('[hidden], [inert], [aria-hidden="true"]')) {
    close('detached');
    return false;
  }
  if (modalCovers(entry)) {
    close('modal');
    return false;
  }
  const v = viewport(W);
  const a = anchor.getBoundingClientRect();
  if (a.right <= v.x || a.left >= v.x + v.w || a.bottom <= v.y || a.top >= v.y + v.h) {
    close('detached');
    return false;
  }
  const insets = W.getComputedStyle(portal);
  const sx = Math.min(8, v.w / 8);
  const sy = Math.min(8, v.h / 8);
  const left = v.x + Math.max(sx, parseFloat(insets.paddingLeft) || 0);
  const right = v.x + v.w - Math.max(sx, parseFloat(insets.paddingRight) || 0);
  const top = v.y + Math.max(sy, parseFloat(insets.paddingTop) || 0);
  const bottom = v.y + v.h - Math.max(sy, parseFloat(insets.paddingBottom) || 0);
  if (right <= left || bottom <= top) {
    close('detached');
    return false;
  }
  const width = right - left;
  panel.style.maxWidth = width + 'px';
  panel.style.minWidth = Math.min(width, Math.max(entry.minWidth, a.width)) + 'px';
  panel.style.maxHeight = 'none';
  const menu = panel.getBoundingClientRect();
  const gap = 6;
  const below = Math.max(0, bottom - a.bottom - gap);
  const above = Math.max(0, a.top - top - gap);
  const up = menu.height > below && above > below;
  const room = up ? above : below;
  // Short, zoomed viewports still need enough height to expose at least one item.
  panel.style.maxHeight = Math.min(bottom - top, Math.max(room, 54)) + 'px';
  const height = panel.getBoundingClientRect().height;
  const aligned = entry.align === 'start' ? a.left : a.right - menu.width;
  panel.style.left = Math.round(Math.max(left, Math.min(right - menu.width, aligned))) + 'px';
  panel.style.top = Math.round(Math.max(top, Math.min(bottom - height, up ? a.top - gap - height : a.bottom + gap))) + 'px';
  panel.dataset.placement = up ? 'top' : 'bottom';
  return true;
}

function schedule(entry) {
  if (entry !== active || entry.frame) return;
  entry.frame = entry.W.requestAnimationFrame(() => {
    entry.frame = 0;
    if (entry !== active) return;
    try { place(entry); } catch (error) { close('error'); report(error); }
  });
}

function listen(entry, target, name, handler, options) {
  target.addEventListener(name, handler, options);
  entry.cleanups.push(() => target.removeEventListener(name, handler, options));
}

function menuRows(entry) {
  return Array.from(entry.panel.querySelectorAll('[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]'))
    .filter(node => node.getClientRects().length && !node.disabled &&
      node.getAttribute('aria-disabled') !== 'true');
}

function keydown(entry, event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close('escape');
    return;
  }
  if (event.key === 'Tab') {
    if (entry.role === 'dialog') {
      const controls = Array.from(entry.panel.querySelectorAll(focusable))
        .filter(node => node.getClientRects().length && node.tabIndex >= 0);
      const index = controls.indexOf(entry.D.activeElement);
      if ((event.shiftKey && index > 0) || (!event.shiftKey && index < controls.length - 1)) return;
    }
    close('tab');
    return;
  }
  if (entry.role !== 'menu' || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const rows = menuRows(entry);
  if (!rows.length) return;
  const index = rows.indexOf(entry.D.activeElement);
  let next = event.key === 'ArrowUp' ? (index < 0 ? rows.length - 1 : (index - 1 + rows.length) % rows.length) : (index + 1) % rows.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = rows.length - 1;
  event.preventDefault();
  focus(rows[next]);
  rows[next].scrollIntoView({ block: 'nearest' });
}

function observe(entry) {
  const { anchor, D, W, panel } = entry;
  const outside = event => {
    if (!panel.contains(event.target) && !anchor.contains(event.target)) close('outside');
  };
  if (W.PointerEvent) listen(entry, D, 'pointerdown', outside, true);
  else {
    listen(entry, D, 'mousedown', outside, true);
    listen(entry, D, 'touchstart', outside, { capture: true, passive: true });
  }
  listen(entry, D, 'focusin', outside, true);
  listen(entry, D, 'keydown', event => keydown(entry, event), true);
  listen(entry, W, 'resize', () => schedule(entry));
  listen(entry, W, 'scroll', event => {
    if (!event.target.nodeType || !panel.contains(event.target)) schedule(entry);
  }, true);
  if (W.visualViewport) {
    listen(entry, W.visualViewport, 'resize', () => schedule(entry));
    listen(entry, W.visualViewport, 'scroll', () => schedule(entry));
  }
  if (W.ResizeObserver) {
    const resize = new W.ResizeObserver(() => schedule(entry));
    entry.cleanups.push(() => resize.disconnect());
    resize.observe(anchor);
    resize.observe(panel);
  }
  if (W.MutationObserver) {
    const changes = new W.MutationObserver(() => {
      if (!anchor.isConnected || !anchor.getClientRects().length) close('detached');
      else schedule(entry);
    });
    entry.cleanups.push(() => changes.disconnect());
    for (let node = anchor; node && node.nodeType === 1; node = node.parentElement) {
      changes.observe(node, {
        childList: true,
        attributes: true,
        attributeFilter: ['hidden', 'class', 'style', 'inert', 'aria-hidden', 'open', 'data-cap-look']
      });
    }
  }
}

function addItems(entry, items) {
  const { D, panel } = entry;
  for (const item of items) {
    if (item.heading) {
      const heading = D.createElement('div');
      heading.className = 'cap-popover-heading';
      heading.textContent = item.heading;
      panel.appendChild(heading);
      continue;
    }
    const row = D.createElement('button');
    row.type = 'button';
    row.className = 'cap-popover-item';
    row.tabIndex = -1;
    row.disabled = !!item.disabled;
    row.setAttribute('role', typeof item.checked === 'boolean' ? 'menuitemradio' : 'menuitem');
    if (typeof item.checked === 'boolean') row.setAttribute('aria-checked', String(item.checked));
    if (item.danger) row.dataset.danger = 'true';
    if (item.icon) {
      const glyph = D.createElement('span');
      glyph.innerHTML = icon(item.icon, 18);
      row.appendChild(glyph);
    }
    const label = D.createElement('span');
    label.className = 'cap-popover-label';
    label.textContent = item.label;
    row.appendChild(label);
    if (item.checked) {
      const check = D.createElement('span');
      check.className = 'cap-popover-check';
      check.innerHTML = icon('check', 16);
      row.appendChild(check);
    }
    row.addEventListener('click', event => {
      close('select');
      if (item.action) item.action(event);
    });
    panel.appendChild(row);
  }
}

function raise(portal, anchor, W) {
  let z = 2147481000;
  for (let node = anchor; node; node = node.parentElement) {
    const layer = parseInt(W.getComputedStyle(node).zIndex, 10);
    if (Number.isFinite(layer)) z = Math.max(z, layer);
  }
  portal.style.zIndex = String(Math.min(z + 1, 2147483647));
}

function open(options) {
  const { anchor } = options;
  if (!anchor || !anchor.isConnected || anchor.disabled || anchor.closest('dialog[open]')) return false;
  if (active && active.anchor === anchor) {
    close('toggle');
    return true;
  }
  close('replaced');
  const D = anchor.ownerDocument;
  const W = D.defaultView;
  if (!W || !D.body) return false;
  const portal = D.createElement('div');
  portal.className = 'cap-ui-portal';
  const panel = D.createElement('div');
  const role = options.role || 'menu';
  panel.className = 'cap-popover' + (options.className ? ' ' + options.className : '');
  panel.id = 'cap-popover-' + (++nextId);
  panel.tabIndex = -1;
  panel.setAttribute('role', role);
  const label = options.label || anchor.getAttribute('aria-label') || anchor.title;
  if (label) panel.setAttribute('aria-label', label);
  portal.appendChild(panel);
  const entry = {
    D, W, anchor, portal, panel, role,
    align: options.align,
    minWidth: options.minWidth || 156,
    oldExpanded: anchor.getAttribute('aria-expanded'),
    oldControls: anchor.getAttribute('aria-controls'),
    oldHasPopup: anchor.getAttribute('aria-haspopup'),
    onClose: options.onClose,
    cleanups: [],
    frame: 0,
    marker: null
  };
  active = entry;
  try {
    if (options.items) addItems(entry, options.items);
    if (options.content) {
      const content = typeof options.content === 'function' ? options.content(panel) : options.content;
      if (content && content.nodeType) {
        if (content.parentNode) {
          entry.content = content;
          entry.wasHidden = content.hidden;
          entry.marker = D.createComment('Capricorn popover');
          content.parentNode.insertBefore(entry.marker, content);
          if (content.nodeType === 1) content.hidden = false;
        }
        panel.appendChild(content);
      }
    }
    raise(portal, anchor, W);
    D.body.appendChild(portal);
    anchor.setAttribute('aria-controls', panel.id);
    anchor.setAttribute('aria-expanded', 'true');
    anchor.setAttribute('aria-haspopup', role);
    if (!place(entry)) return false;
    observe(entry);
    let initial = typeof options.initialFocus === 'function' ? options.initialFocus(panel) : options.initialFocus;
    if (!initial && role === 'menu') {
      const rows = menuRows(entry);
      initial = rows.find(row => row.getAttribute('aria-checked') === 'true') || rows[0];
    }
    focus(initial || panel);
    return active === entry;
  } catch (error) {
    if (active === entry) close('error');
    report(error);
    return false;
  }
}

export const popover = {
  open,
  close,
  isOpen(anchor) { return !!active && (!anchor || active.anchor === anchor); },
  closeWithin(root) {
    if (root && active && root.contains(active.anchor)) close('detached');
  },
  destroy() { close('destroy'); }
};
