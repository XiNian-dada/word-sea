export default function setup() {
  const compact = matchMedia('(max-width:700px), (max-width:1000px) and (max-height:500px)');
  const opener = document.getElementById('sea-settings-open'),
    dialog = document.getElementById('sea-settings-dialog');
  if (!opener || !dialog) return;
  const body = dialog.querySelector('.sea-settings-body');
  const nodes = [...document.querySelectorAll('.controls .themes,.controls .range-group,.controls #clouds')];
  let slots = [],
    viewportFrame = 0,
    lastHeight = 0,
    restingWidth = innerWidth,
    restingHeight = window.visualViewport?.height || innerHeight;
  function restore() {
    for (const { node, slot } of slots) {
      slot.replaceWith(node);
    }
    slots = [];
    opener.setAttribute('aria-expanded', 'false');
  }
  function close() {
    if (dialog.open) dialog.close();
    restore();
  }
  opener.addEventListener('click', () => {
    if (!compact.matches) return;
    slots = nodes.map(node => {
      const slot = document.createComment('sea-settings');
      node.replaceWith(slot);
      body.append(node);
      return { node, slot };
    });
    opener.setAttribute('aria-expanded', 'true');
    dialog.showModal();
  });
  dialog.querySelector('.sea-settings-close').addEventListener('click', close);
  dialog.addEventListener('close', restore);
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
  });
  compact.addEventListener('change', () => {
    close();
    scheduleViewport();
  });
  document.addEventListener('wordsea:before-navigate', close);

  // Follow browser chrome and the keyboard only on viewport/focus events.
  // Pinch zoom keeps the scene's layout, rather than resizing its canvases.
  function updateViewport() {
    viewportFrame = 0;
    const view = window.visualViewport;
    if (view && Math.abs(view.scale - 1) > 0.01) return;
    const height = Math.max(1, Math.round(view?.height || innerHeight));
    const active = document.activeElement;
    const editing = active?.matches(
      'textarea,input:not([type=range]):not([type=checkbox]):not([type=button]):not([type=submit]),[contenteditable=true]',
    );
    // A rotated viewport needs its own baseline, even while the input keeps focus.
    if (!editing || innerWidth !== restingWidth) restingHeight = height;
    restingWidth = innerWidth;
    restingHeight = Math.max(restingHeight, height, innerHeight);
    const keyboard = compact.matches && editing && height < restingHeight * 0.78;
    document.body.classList.toggle('keyboard-open', Boolean(keyboard));
    if (height !== lastHeight) {
      lastHeight = height;
      document.documentElement.style.setProperty('--viewport-height', height + 'px');
      document.dispatchEvent(new Event('wordsea:viewport'));
    }
    if (editing && active) {
      const scroll = active.closest('.article-scroll');
      if (scroll) {
        const r = active.getBoundingClientRect(),
          s = scroll.getBoundingClientRect();
        if (r.bottom > s.bottom - 12) scroll.scrollTop += r.bottom - s.bottom + 12;
        else if (r.top < s.top + 12) scroll.scrollTop -= s.top - r.top + 12;
      }
    }
  }
  function scheduleViewport() {
    if (!viewportFrame) viewportFrame = requestAnimationFrame(updateViewport);
  }
  window.visualViewport?.addEventListener('resize', scheduleViewport, { passive: true });
  addEventListener('resize', scheduleViewport, { passive: true });
  document.addEventListener('focusin', scheduleViewport);
  document.addEventListener('focusout', scheduleViewport);
  updateViewport();
}
