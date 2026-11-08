import { tools } from './tools.js';

export default function setup() {
  const dialog = document.createElement('dialog');
  if (typeof dialog.showModal !== 'function') return;
  dialog.className = 'image-lightbox';
  dialog.setAttribute('aria-label', '图片预览');
  dialog.innerHTML = `<div class="lightbox-toolbar" aria-label="图片工具">
    <button type="button" data-zoom="out" aria-label="缩小图片">−</button>
    <output class="lightbox-zoom" aria-live="polite">100%</output>
    <button type="button" data-zoom="in" aria-label="放大图片">+</button>
    <button type="button" data-zoom="reset">适应窗口</button>
    <button type="button" data-close aria-label="关闭图片预览" autofocus>×</button>
  </div><div class="lightbox-stage" tabindex="0" aria-label="图片，可缩放、放大后拖动">
    <img class="lightbox-image" alt="" draggable="false" hidden>
  </div><div class="lightbox-caption"><div class="lightbox-title"></div><span>按钮 / 滚轮 / 双指缩放 · 放大后拖动 · Esc 关闭</span></div>`;
  document.body.append(dialog);
  const stage = dialog.querySelector('.lightbox-stage'),
    image = dialog.querySelector('img');
  const title = dialog.querySelector('.lightbox-title'),
    percentage = dialog.querySelector('output');
  const zoomIn = dialog.querySelector('[data-zoom="in"]'),
    zoomOut = dialog.querySelector('[data-zoom="out"]');
  const pointers = new Map();
  let source = null,
    zoom = 1,
    x = 0,
    y = 0,
    fitWidth = 0,
    fitHeight = 0,
    gesture = null,
    moved = false;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function render() {
    const rect = stage.getBoundingClientRect();
    const maxX = Math.max(0, (fitWidth * zoom - rect.width) / 2),
      maxY = Math.max(0, (fitHeight * zoom - rect.height) / 2);
    x = clamp(x, -maxX, maxX);
    y = clamp(y, -maxY, maxY);
    image.style.transform = `translate(calc(-50% + ${x}px),calc(-50% + ${y}px)) scale(${zoom})`;
    const label = Math.round(zoom * 100) + '%';
    if (percentage.value !== label) percentage.value = label;
    zoomIn.disabled = zoom >= 4;
    zoomOut.disabled = zoom <= 0.5;
    stage.classList.toggle('is-zoomed', zoom > 1);
  }
  function fit(reset = false) {
    if (!image.naturalWidth || !dialog.open) return;
    const rect = stage.getBoundingClientRect(),
      gap = innerWidth < 700 ? 24 : 72;
    const scale = Math.min(
      1,
      Math.max(1, rect.width - gap) / image.naturalWidth,
      Math.max(1, rect.height - gap) / image.naturalHeight,
    );
    fitWidth = image.naturalWidth * scale;
    fitHeight = image.naturalHeight * scale;
    image.style.width = fitWidth + 'px';
    image.style.height = fitHeight + 'px';
    if (reset) {
      zoom = 1;
      x = 0;
      y = 0;
    }
    render();
  }
  function setZoom(next, point) {
    next = clamp(next, 0.5, 4);
    if (point) {
      const rect = stage.getBoundingClientRect(),
        px = point.x - rect.left - rect.width / 2,
        py = point.y - rect.top - rect.height / 2;
      const ratio = next / zoom;
      x = px - (px - x) * ratio;
      y = py - (py - y) * ratio;
    }
    zoom = next;
    render();
  }
  function close() {
    if (dialog.open) dialog.close();
  }
  function usableSource(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, location.href);
      return /^https?:$/.test(url.protocol) || url.protocol === 'blob:' || /^data:image\//i.test(value)
        ? url.href
        : null;
    } catch {
      return null;
    }
  }
  function open(target) {
    const link = target.closest('a[href]');
    const original =
      target.dataset.full ||
      target.dataset.original ||
      (link && /\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i.test(link.href) ? link.href : null);
    const preview = usableSource(target.currentSrc || target.src),
      url = usableSource(original) || preview;
    if (!url) return;
    source = target;
    zoom = 1;
    x = 0;
    y = 0;
    moved = false;
    gesture = null;
    pointers.clear();
    image.hidden = true;
    image.alt = target.alt;
    title.textContent = '正在载入图片…';
    dialog.showModal();
    image.onload = () => {
      if (dialog.open) {
        image.hidden = false;
        title.textContent = target.alt || '图片预览';
        fit(true);
      }
    };
    image.onerror = () => {
      if (image.src !== preview && preview) {
        image.src = preview;
        return;
      }
      title.textContent = '图片暂时无法载入，请关闭后重试。';
    };
    image.src = url;
    render();
  }
  // textContent preserves indentation, newlines and decoded HTML entities.
  const copyCode = (button, pre) => tools.copy(button, (pre.querySelector('code') || pre).textContent, '复制');
  function decorateArticle() {
    for (const pre of document.querySelectorAll('.post-content pre')) {
      if (pre.parentElement.classList.contains('code-window')) continue;
      const frame = document.createElement('div'),
        bar = document.createElement('div');
      frame.className = 'code-window';
      bar.className = 'code-window-bar';
      for (let i = 0; i < 3; i++) {
        const dot = document.createElement('span');
        dot.className = 'code-window-dot';
        dot.setAttribute('aria-hidden', 'true');
        bar.append(dot);
      }
      const language = [...(pre.querySelector('code')?.classList || [])].find(name => /^(?:language|lang)-/.test(name));
      if (language) {
        const label = document.createElement('span');
        label.className = 'code-window-label';
        label.textContent = language.replace(/^(?:language|lang)-/, '');
        bar.append(label);
      }
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'code-copy';
      copy.textContent = '复制';
      copy.dataset.label = '复制代码';
      copy.setAttribute('aria-label', '复制代码');
      copy.setAttribute('aria-live', 'polite');
      copy.title = '复制完整代码';
      copy.addEventListener('click', () => copyCode(copy, pre));
      bar.append(copy);
      pre.before(frame);
      frame.append(bar, pre);
    }
    for (const target of document.querySelectorAll('.post-content img')) {
      if (
        target.matches('.emoji,.smiley,[data-no-lightbox]') ||
        target.closest('button') ||
        target.hasAttribute('data-wordsea-zoom')
      )
        continue;
      // Small emoji and decorative icons keep their ordinary inline behavior.
      if (target.complete && target.naturalWidth > 0 && target.naturalWidth < 80 && target.naturalHeight < 80) continue;
      target.dataset.wordseaZoom = '';
      target.setAttribute('role', 'button');
      target.tabIndex = 0;
      target.setAttribute('aria-label', target.alt ? '查看大图：' + target.alt : '查看大图');
    }
  }
  document.addEventListener('click', event => {
    const target = event.target.closest('.post-content img[data-wordsea-zoom]');
    if (
      !target ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    open(target);
  });
  // Capture modal keys before the background's Esc / space / H shortcuts.
  document.addEventListener(
    'keydown',
    event => {
      if (dialog.open) {
        event.stopImmediatePropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        } else if (['+', '=', '-', '0'].includes(event.key)) {
          event.preventDefault();
          if (event.key === '0') fit(true);
          else setZoom(zoom * (event.key === '-' ? 1 / 1.25 : 1.25));
        }
        return;
      }
      if (event.target.matches('.post-content img[data-wordsea-zoom]') && ['Enter', ' '].includes(event.key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        open(event.target);
      }
    },
    true,
  );
  dialog.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button?.hasAttribute('data-close')) close();
    else if (button?.dataset.zoom === 'reset') fit(true);
    else if (button?.dataset.zoom) setZoom(zoom * (button.dataset.zoom === 'in' ? 1.25 : 1 / 1.25));
    else if (event.target === stage && !moved) close();
  });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('close', () => {
    pointers.clear();
    gesture = null;
    stage.classList.remove('is-manipulating');
    image.onload = image.onerror = null;
    image.removeAttribute('src');
    image.hidden = true;
    if (source?.isConnected) source.focus({ preventScroll: true });
    source = null;
  });
  stage.addEventListener(
    'wheel',
    event => {
      event.preventDefault();
      setZoom(zoom * Math.exp(-clamp(event.deltaY, -100, 100) * 0.003), { x: event.clientX, y: event.clientY });
    },
    { passive: false },
  );
  image.addEventListener('dblclick', event => {
    event.preventDefault();
    setZoom(zoom > 1 ? 1 : 2, { x: event.clientX, y: event.clientY });
  });
  function pointerShape() {
    const points = [...pointers.values()],
      first = points[0];
    if (points.length < 2) return { x: first.x, y: first.y, distance: 0 };
    const second = points[1];
    return {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
      distance: Math.hypot(first.x - second.x, first.y - second.y),
    };
  }
  function beginGesture() {
    if (!pointers.size) {
      gesture = null;
      return;
    }
    gesture = { ...pointerShape(), panX: x, panY: y, zoom };
  }
  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    if (!pointers.size) moved = false;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    (event.target === image ? image : stage).setPointerCapture(event.pointerId);
    beginGesture();
    stage.classList.add('is-manipulating');
  });
  stage.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const shape = pointerShape(),
      dx = shape.x - gesture.x,
      dy = shape.y - gesture.y;
    if (Math.hypot(dx, dy) > 4 || Math.abs(shape.distance - gesture.distance) > 4) moved = true;
    if (shape.distance > 0 && gesture.distance > 0) {
      const rect = stage.getBoundingClientRect(),
        ratio = clamp((gesture.zoom * shape.distance) / gesture.distance, 0.5, 4) / gesture.zoom;
      const px = gesture.x - rect.left - rect.width / 2,
        py = gesture.y - rect.top - rect.height / 2;
      zoom = gesture.zoom * ratio;
      x = px - (px - gesture.panX) * ratio + dx;
      y = py - (py - gesture.panY) * ratio + dy;
    } else {
      x = gesture.panX + dx;
      y = gesture.panY + dy;
    }
    render();
  });
  function endPointer(event) {
    pointers.delete(event.pointerId);
    beginGesture();
    if (!pointers.size) stage.classList.remove('is-manipulating');
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  addEventListener('resize', () => fit());
  document.addEventListener('wordsea:viewport', () => fit());
  document.addEventListener('wordsea:before-navigate', close);
  document.addEventListener('wordsea:article-ready', decorateArticle);
  decorateArticle();
}
