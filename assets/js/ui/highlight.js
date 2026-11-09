// Prism is 59 KB that only articles with code need, so it is fetched the
// first time one appears rather than parsed on every page.
const LANGUAGE = /(?:^|\s)lang(?:uage)?-([\w-]+)(?=\s|$)/i;
const PLAIN = /^(?:none|plain|plaintext|text|txt)$/i;
let loading = null;

function language(code) {
  for (let node = code; node; node = node.parentElement) {
    const match = LANGUAGE.exec(node.className);
    if (match) return match[1].toLowerCase();
  }
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
    const blocks = [...document.querySelectorAll('.post-content pre code')].filter(code => {
      const name = language(code);
      return name && !PLAIN.test(name);
    });
    if (!blocks.length) return;
    try {
      library = await prism();
    } catch {
      return;
    }
    if (run !== generation) return;
    for (const code of blocks) {
      const grammar = library.languages[language(code)];
      if (!grammar || typeof grammar !== 'object') continue;
      if (observer) observer.observe(code);
      else highlight(code);
    }
  }
  document.addEventListener('wordsea:article-ready', prepare);
  prepare();
}
