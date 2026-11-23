// Prism is 59 KB that only articles with code need, so it is fetched the
// first time one appears rather than parsed on every page.
const LANGUAGE = /(?:^|\s)lang(?:uage)?-([\w+-]+)(?=\s|$)/i;
const PLAIN = /^(?:none|plain|plaintext|text|txt)$/i;
const ALIASES = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  'c++': 'cpp',
  cxx: 'cpp',
  cc: 'cpp',
  rs: 'rust',
  md: 'markdown',
};
let loading = null;

function language(code) {
  for (let node = code; node; node = node.parentElement) {
    const match = LANGUAGE.exec(node.className);
    if (match) {
      const raw = match[1].toLowerCase();
      return ALIASES[raw] || raw;
    }
  }
  return '';
}

function inferLanguage(text) {
  const sample = text.trim();
  if (!sample) return '';
  if (/<\?php\b/.test(sample)) return 'php';
  if (/^\s*(?:<!doctype\b|<html\b|<svg\b|<[a-z][\w-]*(?:\s[^>]*)?>[\s\S]*<\/[a-z][\w-]*>\s*$)/i.test(sample)) return 'markup';
  if (/^\s*[\{\[]/.test(sample) && /"[^"]+"\s*:/.test(sample)) {
    try { JSON.parse(sample); return 'json'; } catch {}
  }
  if (/^@@ .* @@$/m.test(sample) || /^(?:\+\+\+|---) \S+/m.test(sample)) return 'diff';
  if (/^\s*(?:SELECT\s+[\s\S]+\bFROM\b|INSERT\s+INTO\b|UPDATE\s+\w+\s+SET\b|DELETE\s+FROM\b|CREATE\s+TABLE\b)/im.test(sample)) return 'sql';
  if (/\bfn\s+\w+\s*\(|\blet\s+mut\b|\bpub\s+(?:fn|struct|enum)\b|::<\w+>/.test(sample)) return 'rust';
  if (/\bfunc\s+\w+\s*\(|\bpackage\s+\w+\b|:=/.test(sample)) return 'go';
  if (/^\s*(?:def|class)\s+\w+[^:\n]*:\s*$|\bfrom\s+[\w.]+\s+import\b/m.test(sample)) return 'python';
  if (/^\s*#!.*\b(?:sh|bash|zsh)\b|^\s*(?:curl|git|npm|pnpm|php|docker|systemctl|export)\s+/m.test(sample)) return 'bash';
  if (/\b(?:interface|type)\s+\w+(?:\s*=\s*|\s*\{)|:\s*(?:string|number|boolean|unknown)\b/.test(sample)) return 'typescript';
  if (/\b(?:const|let|export\s+(?:default|function|const)|import\s+[\w{*]|\basync\s+function)\b|=>|console\.log/.test(sample)) return 'javascript';
  if (/^\s*#include\s*[<"]/m.test(sample)) return /\b(?:std::|template\s*<|class\s+\w+|namespace\s+)/.test(sample) ? 'cpp' : 'c';
  if (/^\s*(?:[.#@][\w-]+|\w+(?:\s*,\s*[.#\w-]+)*)\s*\{[^}]*:[^}]*\}/s.test(sample)) return 'css';
  return '';
}
function prism() {
  if (window.Prism) return Promise.resolve(window.Prism);
  if (loading) return loading;
  let url = '';
  try { url = JSON.parse(document.getElementById('wordsea-config').textContent).prism; } catch {}
  if (!url) return Promise.reject(new Error('No Prism URL'));
  return (loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    // data-manual stops Prism from highlighting the whole page on its own.
    script.dataset.manual = '';
    script.dataset.wordseaRuntime = '';
    script.async = true;
    script.src = url;
    script.onload = () => (window.Prism ? resolve(window.Prism) : reject(new Error('Prism missing')));
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('Prism failed to load'));
    };
    document.head.append(script);
  }).then(library => {
    library.languages.arduino = library.languages.cpp;
    return library;
  }));
}

export default function setup() {
  const root = document.getElementById('article-scroll');
  let library = null;
  function highlight(code) {
    if (!code.isConnected || code.dataset.wordseaHighlight || code.matches('.hljs') || code.querySelector('.token'))
      return;
    library.highlightElement(code);
    code.dataset.wordseaHighlight = 'prism';
  }
  const observer =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          entries => {
            for (const entry of entries)
              if (entry.isIntersecting) {
                observer.unobserve(entry.target);
                highlight(entry.target);
              }
          },
          { root, rootMargin: '300px 0px' },
        )
      : null;
  let generation = 0;
  async function prepare() {
    observer?.disconnect();
    const run = ++generation;
    const targets = [];
    for (const code of document.querySelectorAll('.post-content pre code')) {
      let name = language(code);
      let inferred = false;
      if (!name) {
        name = inferLanguage(code.textContent);
        inferred = Boolean(name);
      }
      if (!name || PLAIN.test(name)) continue;
      targets.push({ code, name, inferred });
    }
    if (!targets.length) return;
    try {
      library = await prism();
    } catch {
      return;
    }
    if (run !== generation) return;
    for (const { code, name, inferred } of targets) {
      const grammar = library.languages[name];
      if (!grammar || typeof grammar !== 'object') continue;
      if (inferred) {
        code.classList.add('language-' + name);
        const bar = code.closest('.code-window')?.querySelector('.code-window-bar');
        if (bar && !bar.querySelector('.code-window-label')) {
          const label = document.createElement('span');
          label.className = 'code-window-label';
          label.textContent = name;
          const copy = bar.querySelector('.code-copy');
          if (copy) copy.before(label);
          else bar.append(label);
        }
      }
      if (observer) observer.observe(code);
      else highlight(code);
    }
  }
  document.addEventListener('wordsea:article-ready', prepare);
  prepare();
}
