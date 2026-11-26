/* Capricorn Apple Motion: iOS Sliding Segment Pill & Symmetric Exit Transitions */

export function prefersReducedMotion(W = window) {
  return Boolean(W?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

export function attachSegmentSlider(container, {
  itemSelector = 'button:not([hidden])',
  isActive = el => el.getAttribute('aria-selected') === 'true' ||
    el.getAttribute('aria-checked') === 'true' ||
    el.getAttribute('aria-pressed') === 'true',
} = {}) {
  if (!container) return { sync() {}, destroy() {} };
  const D = container.ownerDocument;
  const W = D.defaultView;
  let dead = false, placed = false, raf = 0;

  const thumb = D.createElement('span');
  thumb.className = 'cap-seg-thumb';
  thumb.setAttribute('aria-hidden', 'true');
  thumb.hidden = true;
  container.classList.add('cap-has-slider');
  container.prepend(thumb);

  function ensureThumb() {
    if (!dead && thumb.parentNode !== container) container.prepend(thumb);
  }

  function update(instant = false) {
    if (dead || !container.isConnected) return;
    ensureThumb();
    const items = Array.from(container.querySelectorAll(itemSelector));
    const active = items.find(isActive);
    if (!active || !active.offsetWidth || !active.offsetHeight) {
      thumb.hidden = true;
      return;
    }
    const noAnim = instant || !placed || prefersReducedMotion(W);
    if (noAnim) thumb.classList.add('is-instant');
    else thumb.classList.remove('is-instant');
    thumb.hidden = false;
    thumb.style.width = active.offsetWidth + 'px';
    thumb.style.height = active.offsetHeight + 'px';
    thumb.style.transform = `translate3d(${active.offsetLeft}px, ${active.offsetTop}px, 0)`;
    if (noAnim) {
      void thumb.offsetWidth;
      thumb.classList.remove('is-instant');
    }
    placed = true;
  }

  function schedule(instant = false) {
    if (dead) return;
    if (raf) W.cancelAnimationFrame(raf);
    raf = W.requestAnimationFrame(() => {
      raf = 0;
      update(instant);
    });
  }

  const ro = typeof W.ResizeObserver === 'function'
    ? new W.ResizeObserver(() => schedule(true))
    : null;
  if (ro) ro.observe(container);

  const mo = typeof W.MutationObserver === 'function'
    ? new W.MutationObserver(() => schedule(false))
    : null;
  if (mo) {
    mo.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-selected', 'aria-checked', 'aria-pressed', 'hidden', 'class'],
    });
  }

  schedule(true);
  return {
    sync(instant = false) { schedule(instant); },
    destroy() {
      dead = true;
      if (raf) W.cancelAnimationFrame(raf);
      ro?.disconnect();
      mo?.disconnect();
      thumb.remove();
      container.classList.remove('cap-has-slider');
    },
  };
}
