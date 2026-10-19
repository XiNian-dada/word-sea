(() => {
  'use strict';
  const prism=window.Prism;
  if(!prism)return;
  prism.languages.arduino=prism.languages.cpp;
  const root=document.getElementById('article-scroll');
  function highlight(code){
    if(!code.isConnected||code.dataset.wordseaHighlight||code.matches('.hljs')||code.querySelector('.token'))return;
    prism.highlightElement(code);
    code.dataset.wordseaHighlight='prism';
  }
  const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);highlight(entry.target);}
  },{root,rootMargin:'300px 0px'}):null;
  function prepare(){
    observer?.disconnect();
    for(const code of document.querySelectorAll('.post-content pre code')){
      const language=prism.util.getLanguage(code);
      if(!Object.prototype.hasOwnProperty.call(prism.languages,language)||typeof prism.languages[language]!=='object'||/^(?:none|plain|plaintext|text|txt)$/.test(language))continue;
      if(observer)observer.observe(code);else highlight(code);
    }
  }
  document.addEventListener('wordsea:article-ready',prepare);
  prepare();
})();
