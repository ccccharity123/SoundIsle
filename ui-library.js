import { icon } from './icons.js';
import { popover } from './ui-popover.js';

export function libraryButton(parent, label, action, iconName) {
  const button = parent.ownerDocument.createElement('button');
  button.type = 'button';
  if (iconName) {
    button.innerHTML = icon(iconName, 19);
    button.setAttribute('aria-label', label);
    button.title = label;
  } else {
    button.textContent = label;
  }
  button.onclick = action;
  parent.append(button);
  return button;
}

const fallbacks = new WeakMap();

function closeFallback(document, parent) {
  const fallback = fallbacks.get(document);
  if (fallback && (!parent || parent.contains(fallback.anchor))) fallback.close();
}

export function closeLibraryMenus(root) {
  popover.closeWithin(root);
  closeFallback(root.ownerDocument, root);
}

export function libraryMenu(parent, label, iconName, options) {
  const document = parent.ownerDocument;
  const anchor = libraryButton(parent, label, open, iconName);
  anchor.className = 'cap-library-icon';
  anchor.setAttribute('aria-haspopup', options.content ? 'dialog' : 'menu');
  anchor.setAttribute('aria-expanded', 'false');

  function open() {
    const fallback = fallbacks.get(document);
    if (fallback && fallback.anchor === anchor) {
      fallback.close();
      anchor.focus();
      return;
    }
    closeFallback(document);
    const settings = Object.assign({
      anchor,
      label,
      className: 'cap-library-popover',
    }, options);
    if (typeof settings.items === 'function') settings.items = settings.items();
    if (popover.open(settings)) return;

    // Keep every action reachable if the browser cannot run the portal.
    const panel = document.createElement('div');
    panel.className = 'cap-library-fallback';
    const content = settings.content;
    const originalParent = content && content.parentNode;
    const originalNext = content && content.nextSibling;
    if (content) {
      panel.append(content);
    } else {
      for (const item of settings.items) {
        if (item.heading) {
          const heading = document.createElement('strong');
          heading.textContent = item.heading;
          panel.append(heading);
        } else {
          const button = libraryButton(panel, item.label, () => {
            close();
            anchor.focus();
            item.action();
          });
          button.disabled = Boolean(item.disabled);
          if (item.danger) button.classList.add('cap-library-danger');
        }
      }
    }
    function close() {
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('keydown', onKey, true);
      if (originalParent) originalParent.insertBefore(content, originalNext);
      panel.remove();
      anchor.setAttribute('aria-expanded', 'false');
      fallbacks.delete(document);
    }
    function onOutside(event) {
      if (!panel.contains(event.target) && !anchor.contains(event.target)) close();
    }
    function onKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        anchor.focus();
      }
    }
    // Attach to the section rather than the row, preserving the song row height.
    const library = anchor.closest('.cap-local-library, .cap-cloud-library') || parent;
    library.insertBefore(panel, library.querySelector('.cap-library-scroll'));
    fallbacks.set(document, { anchor, close });
    anchor.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    const focus = panel.querySelector('input:not([type="hidden"]), button:not(:disabled)');
    if (focus) focus.focus();
  }

  return anchor;
}
