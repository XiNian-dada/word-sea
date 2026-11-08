function read(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value && value.length < 65536 ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
function fallbackCopy(text) {
  const active = document.activeElement,
    selection = getSelection();
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange())
    : [];
  const input = document.createElement('textarea');
  input.value = text;
  input.readOnly = true;
  input.setAttribute('aria-hidden', 'true');
  input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  // A copy field inside an open dialog remains outside the inert background.
  (active?.closest('dialog[open]') || document.body).append(input);
  try {
    input.focus({ preventScroll: true });
    input.select();
    if (!document.execCommand('copy')) throw new Error('Copy unavailable');
  } finally {
    input.remove();
    if (active?.isConnected) active.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }
}
const timers = new WeakMap();
async function copy(button, text, label) {
  if (button.hasAttribute('aria-busy')) return;
  clearTimeout(timers.get(button));
  button.setAttribute('aria-busy', 'true');
  try {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        fallbackCopy(text);
      }
    } else fallbackCopy(text);
    button.textContent = '已复制';
    button.setAttribute('aria-label', '已复制');
  } catch {
    button.textContent = '复制失败';
    button.setAttribute('aria-label', '复制失败，请手动选择内容复制');
  } finally {
    button.removeAttribute('aria-busy');
    timers.set(
      button,
      setTimeout(() => {
        button.textContent = label;
        button.setAttribute('aria-label', button.dataset.label || label);
      }, 1800),
    );
  }
}
export const tools = { read, write, copy };
