import { tools } from './tools.js';

export default function setup() {
  const view = document.getElementById('article-view'),
    scroll = document.getElementById('article-scroll');
  const article = document.getElementById('article-text'),
    progress = document.getElementById('reading-progress');
  const toc = document.getElementById('reading-toc');
  if (!view || !scroll || !article || !progress || !toc) return;
  const fill = progress.querySelector('span'),
    toggle = toc.querySelector('button'),
    list = toc.querySelector('ol');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'),
    hover = matchMedia('(hover: hover)');
  let body = null,
    sections = [],
    finish = 0,
    frame = 0,
    dirty = true,
    active = -1,
    percent = -1,
    pinned = false;
  let bookmark = null,
    resume = null,
    saveTimer = 0,
    engaged = false;
  const storageKey = 'wordsea:reading:v1';

  function records() {
    const entries = tools?.read(storageKey, []);
    return Array.isArray(entries)
      ? entries
          .filter(
            entry =>
              entry &&
              typeof entry.key === 'string' &&
              entry.key.length < 1500 &&
              typeof entry.version === 'string' &&
              Number.isFinite(entry.ratio) &&
              entry.ratio >= 0 &&
              entry.ratio <= 1 &&
              Number.isFinite(entry.time) &&
              Date.now() - entry.time < 180 * 86400000,
          )
          .slice(0, 40)
      : [];
  }
  function remember() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (
      !bookmark ||
      !body?.isConnected ||
      !engaged ||
      view.hidden ||
      view.inert ||
      document.body.classList.contains('scene-transition')
    )
      return;
    if (dirty) measure();
    const ratio = finish > 0 ? Math.min(1, scroll.scrollTop / finish) : 1;
    const entries = records().filter(entry => entry.key !== bookmark.key);
    // Finished posts and the beginning need no resume prompt next time.
    if (ratio < 0.98 && scroll.scrollTop >= 120) {
      let section = -1;
      for (let i = 0; i < sections.length && sections[i].top <= scroll.scrollTop + 20; i++) section = i;
      const anchor = sections[section],
        end = sections[section + 1]?.top || finish;
      entries.unshift({
        ...bookmark,
        time: Date.now(),
        ratio,
        anchor: anchor?.heading.id || '',
        fraction: anchor ? (scroll.scrollTop - anchor.top) / Math.max(1, end - anchor.top) : 0,
      });
    }
    tools?.write(storageKey, entries.slice(0, 40));
  }
  function hideResume() {
    resume?.remove();
    resume = null;
  }
  function offerResume() {
    if (!bookmark || location.hash || history.state?.scroll > 0) return;
    const saved = records().find(
      entry =>
        entry.key === bookmark.key && entry.version === bookmark.version && entry.ratio > 0 && entry.ratio < 0.98,
    );
    if (!saved) return;
    resume = document.createElement('div');
    resume.className = 'reading-resume';
    resume.setAttribute('role', 'group');
    resume.setAttribute('aria-label', '续读书签');
    const note = document.createElement('span');
    note.textContent = '上次读到 ' + Math.round(saved.ratio * 100) + '%';
    const proceed = document.createElement('button'),
      restart = document.createElement('button');
    proceed.type = restart.type = 'button';
    proceed.textContent = '继续阅读';
    restart.textContent = '从头阅读';
    resume.append(note, proceed, restart);
    body.before(resume);
    proceed.addEventListener('click', () => {
      hideResume();
      dirty = true;
      measure();
      engaged = true;
      const section = sections.find(section => section.heading.id === saved.anchor),
        at = sections.indexOf(section);
      const target =
        section && Number.isFinite(saved.fraction)
          ? section.top + saved.fraction * Math.max(1, (sections[at + 1]?.top || finish) - section.top)
          : saved.ratio * finish;
      scroll.focus({ preventScroll: true });
      scroll.scrollTo({ top: Math.max(0, Math.min(finish, target)), behavior: reduced.matches ? 'instant' : 'smooth' });
    });
    restart.addEventListener('click', () => {
      tools?.write(
        storageKey,
        records().filter(entry => entry.key !== bookmark.key),
      );
      hideResume();
      dirty = true;
      engaged = true;
      scroll.focus({ preventScroll: true });
      schedule(true);
    });
  }

  function open(value) {
    toc.classList.toggle('is-open', value);
    toggle.setAttribute('aria-expanded', String(value));
    toggle.setAttribute('aria-label', value ? '收起文章目录' : '展开文章目录');
  }
  function close() {
    pinned = false;
    open(false);
  }
  function reset() {
    cancelAnimationFrame(frame);
    frame = 0;
    observer?.disconnect();
    clearTimeout(saveTimer);
    saveTimer = 0;
    hideResume();
    bookmark = null;
    engaged = false;
    body = null;
    sections = [];
    list.replaceChildren();
    active = -1;
    percent = -1;
    fill.style.transform = 'scaleX(0)';
    progress.setAttribute('aria-valuenow', '0');
    progress.hidden = true;
    toc.hidden = true;
    close();
  }
  function measure() {
    const rect = scroll.getBoundingClientRect(),
      offset = scroll.scrollTop - rect.top;
    // Finish at the end of the body, before neighbouring posts and comments.
    finish = Math.max(0, body.getBoundingClientRect().bottom + offset - scroll.clientHeight);
    for (const section of sections) section.top = section.heading.getBoundingClientRect().top + offset;
    dirty = false;
  }
  function update() {
    frame = 0;
    if (!body || view.hidden || document.hidden) return;
    if (dirty) measure();
    const ratio = finish > 0 ? Math.min(1, Math.max(0, scroll.scrollTop / finish)) : 1;
    fill.style.transform = `scaleX(${ratio})`;
    const nextPercent = Math.round(ratio * 100);
    if (nextPercent !== percent) {
      percent = nextPercent;
      progress.setAttribute('aria-valuenow', String(percent));
    }
    let nextActive = -1;
    for (let i = 0; i < sections.length && sections[i].top <= scroll.scrollTop + 80; i++) nextActive = i;
    if (nextActive !== active) {
      if (active >= 0) sections[active].link.removeAttribute('aria-current');
      active = nextActive;
      if (active >= 0) sections[active].link.setAttribute('aria-current', 'location');
    }
  }
  function schedule(remeasure = false) {
    dirty = dirty || remeasure;
    // One coalesced update per scroll/resize event; no idle animation loop.
    if (body && !frame && !document.hidden) frame = requestAnimationFrame(update);
  }
  const observer = 'ResizeObserver' in window ? new ResizeObserver(() => schedule(true)) : null;
  function prepare() {
    reset();
    body = article.querySelector('.post-content');
    if (!body || body.querySelector('.protected')) {
      body = null;
      return;
    }
    if (tools && body.dataset.readingKey) {
      try {
        const url = new URL(body.dataset.readingKey, location.href);
        if (url.origin === location.origin)
          bookmark = { key: url.pathname + url.search, version: body.dataset.readingVersion || '' };
      } catch {}
    }
    progress.hidden = false;
    const ids = new Set(Array.from(document.querySelectorAll('[id]'), node => node.id));
    const headings = Array.from(body.querySelectorAll('h1,h2,h3')).filter(
      heading => heading.textContent.trim() && !heading.closest('pre,table'),
    );
    if (headings.length >= 2) {
      const baseLevel = Math.min(...headings.map(heading => Number(heading.tagName.slice(1))));
      let number = 0;
      for (const heading of headings) {
        if (!heading.id || document.getElementById(heading.id) !== heading) {
          let id;
          do {
            id = 'wordsea-section-' + ++number;
          } while (ids.has(id));
          heading.id = id;
          ids.add(id);
        }
        if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
        const item = document.createElement('li'),
          link = document.createElement('a');
        link.href = '#' + encodeURIComponent(heading.id);
        link.textContent = heading.textContent.trim().replace(/\s+/g, ' ');
        link.title = link.textContent;
        item.dataset.level = String(Number(heading.tagName.slice(1)) - baseLevel);
        item.classList.toggle('reading-toc-sub', Number(item.dataset.level) > 0);
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'reading-section-copy';
        copy.textContent = '复制';
        copy.dataset.label = '复制章节链接：' + link.textContent;
        copy.setAttribute('aria-label', copy.dataset.label);
        copy.setAttribute('aria-live', 'polite');
        copy.title = '复制章节链接';
        copy.addEventListener('click', () => {
          const url = new URL(body.dataset.readingKey || location.href, location.href);
          url.hash = heading.id;
          tools?.copy(copy, url.href, '复制');
        });
        item.append(link, copy);
        list.append(item);
        sections.push({ heading, link, top: 0 });
      }
      toc.hidden = false;
    }
    offerResume();
    observer?.observe(article);
    observer?.observe(scroll);
    schedule(true);
  }

  toggle.addEventListener('click', () => {
    pinned = !pinned;
    open(pinned);
  });
  document.addEventListener('pointerdown', event => {
    if (toc.classList.contains('is-open') && !toc.contains(event.target)) close();
  });
  toc.addEventListener('pointerenter', () => {
    if (hover.matches) open(true);
  });
  toc.addEventListener('pointerleave', () => {
    if (!pinned && !toc.contains(document.activeElement)) open(false);
  });
  toc.addEventListener('focusin', () => open(true));
  toc.addEventListener('focusout', event => {
    if (!pinned && !toc.contains(event.relatedTarget) && !(hover.matches && toc.matches(':hover'))) open(false);
  });
  toc.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toc.classList.contains('is-open')) {
      event.preventDefault();
      event.stopPropagation();
      toggle.focus({ preventScroll: true });
      close();
    }
  });
  list.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const section = sections.find(section => section.link === link);
    if (!section) return;
    event.preventDefault();
    if (dirty) measure();
    const top = Math.max(0, section.top - 20);
    // Replace the fragment without adding a history entry for every chapter.
    const url = new URL(location.href);
    url.hash = section.heading.id;
    history.replaceState({ ...history.state, scroll: top }, '', url.href);
    section.heading.focus({ preventScroll: true });
    close();
    scroll.scrollTo({ top, behavior: reduced.matches ? 'instant' : 'smooth' });
  });
  scroll.addEventListener(
    'scroll',
    () => {
      schedule();
      if (bookmark && !view.hidden && !view.inert && !document.body.classList.contains('scene-transition')) {
        if (resume && scroll.scrollTop < 120) return;
        if (resume) {
          hideResume();
          dirty = true;
        }
        engaged = true;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(remember, 700);
      }
    },
    { passive: true },
  );
  article.addEventListener('load', () => schedule(true), true);
  addEventListener('resize', () => schedule(true), { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) remember();
    else schedule(true);
  });
  addEventListener('pagehide', remember);
  document.addEventListener('wordsea:before-navigate', () => {
    remember();
    close();
    hideResume();
  });
  document.addEventListener('wordsea:article-ready', prepare);
  document.addEventListener('wordsea:article-cleared', reset);
  prepare();
}
