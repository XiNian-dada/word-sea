import { extractDisplayTex, splitMath } from './math-parser.js';

// KaTeX is loaded strictly on demand, only when an article contains valid LaTeX.
const SKIP_TAGS = new Set(['PRE', 'CODE', 'SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT', 'SVG', 'MATH', 'KBD', 'SAMP', 'OPTION']);
let loading = null;

function readConfig() {
  try { return JSON.parse(document.getElementById('wordsea-config')?.textContent || '{}').katex || null; } catch { return null; }
}

function loadStylesheet(href) {
  if (!href) return Promise.resolve();
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    if (link.href === href) return Promise.resolve();
  }
  return new Promise(resolve => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.wordseaRuntime = '';
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.append(link);
  });
}

function loadScript(src) {
  if (window.katex) return Promise.resolve(window.katex);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    script.dataset.wordseaRuntime = '';
    script.onload = () => (window.katex ? resolve(window.katex) : reject(new Error('KaTeX missing')));
    script.onerror = () => { script.remove(); reject(new Error('KaTeX failed to load')); };
    document.head.append(script);
  });
}

function loadKatex() {
  if (window.katex) return Promise.resolve(window.katex);
  if (loading) return loading;
  const urls = readConfig();
  if (!urls?.js) return Promise.reject(new Error('No KaTeX URL'));
  loading = Promise.all([loadStylesheet(urls.css), loadScript(urls.js)])
    .then(([, lib]) => lib)
    .catch(error => { loading = null; throw error; });
  return loading;
}

function paragraphRuns(p) {
  const runs = [];
  for (const child of p.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      runs.push({ kind: 'text', value: child.nodeValue });
    } else if (child.nodeName === 'BR') {
      runs.push({ kind: 'br' });
    } else if (child.nodeName === 'EM' && [...child.childNodes].every(n => n.nodeType === Node.TEXT_NODE)) {
      runs.push({ kind: 'em', value: child.textContent });
    } else {
      return null;
    }
  }
  return runs;
}

function renderTex(katex, tex, displayMode) {
  const node = document.createElement(displayMode ? 'div' : 'span');
  katex.render(tex, node, {
    displayMode,
    throwOnError: false,
    strict: 'ignore',
    trust: false,
    maxExpand: 1000,
  });
  return node.firstElementChild || node;
}

export default function setup() {
  let generation = 0;

  async function prepare() {
    const body = document.querySelector('.post-content');
    if (!body || body.dataset.wordseaMath === 'done') return;
    const run = ++generation;

    // 1. Collect standalone display-math paragraphs first (handles HyperDown `_` -> `<em>`).
    const blockTargets = [];
    const claimed = new Set();
    for (const p of body.querySelectorAll('p')) {
      if (p.closest('pre, code, .katex, [data-no-math]')) continue;
      const runs = paragraphRuns(p);
      if (!runs) continue;
      const tex = extractDisplayTex(runs);
      if (!tex) continue;
      blockTargets.push({ element: p, tex });
      claimed.add(p);
    }

    // 2. Collect inline/mixed math inside remaining text nodes.
    const textTargets = [];
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || (!node.nodeValue.includes('$') && !node.nodeValue.includes('\\'))) {
          return NodeFilter.FILTER_SKIP;
        }
        const parent = node.parentElement;
        if (!parent || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest('pre, code, .katex, [data-no-math]')) return NodeFilter.FILTER_REJECT;
        const p = parent.closest('p');
        if (p && claimed.has(p)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let node; (node = walker.nextNode()); ) {
      const parts = splitMath(node.nodeValue);
      if (parts) textTargets.push({ node, parts });
    }

    if (!blockTargets.length && !textTargets.length) return;

    let katex;
    try {
      katex = await loadKatex();
    } catch {
      return;
    }
    if (run !== generation || !body.isConnected) return;

    for (const { element, tex } of blockTargets) {
      if (!element.isConnected) continue;
      const rendered = renderTex(katex, tex, true);
      element.replaceChildren(rendered);
      element.classList.add('math-block');
    }

    for (const { node, parts } of textTargets) {
      if (!node.isConnected) continue;
      const frag = document.createDocumentFragment();
      for (const part of parts) {
        if (part.type === 'text') frag.append(part.value);
        else frag.append(renderTex(katex, part.value, part.type === 'display'));
      }
      node.replaceWith(frag);
    }

    body.dataset.wordseaMath = 'done';
  }

  document.addEventListener('wordsea:article-ready', prepare);
  prepare();
}
