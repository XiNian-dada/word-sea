(() => {
  'use strict';
  const data=window.wordSeaCollection,tools=window.wordSeaTools;
  if(!data||!tools||!data.quotes.length)return;
  const quotes=data.quotes,byId=new Map(quotes.map(item=>[item.id,item]));
  const card=document.createElement('dialog');
  card.id='wordsea-collection';card.className='collection-card';
  card.setAttribute('aria-labelledby','collection-title');
  card.setAttribute('aria-describedby','collection-original collection-meaning');
  // This is a non-modal card: the article remains scrollable and keeps its position.
  card.innerHTML='<div class="collection-top"><span id="collection-title">从语廊拾起一句话</span><button type="button" class="collection-close" aria-label="放回这句话">×</button></div><p class="collection-language"></p><blockquote id="collection-original" dir="auto"></blockquote><p class="collection-author"></p><div class="collection-translation"><span>中文意译</span><p></p></div><div class="collection-explanation"><span>这句话的意思</span><p id="collection-meaning"></p></div><a class="collection-source" target="_blank" rel="noopener noreferrer"></a><div class="collection-bottom"><button type="button" class="collection-copy" aria-live="polite">复制摘句</button><button type="button" class="collection-next">再拾一句 →</button></div>';
  document.body.append(card);
  const original=card.querySelector('#collection-original'),language=card.querySelector('.collection-language');
  const author=card.querySelector('.collection-author'),translation=card.querySelector('.collection-translation');
  const meaning=card.querySelector('#collection-meaning'),source=card.querySelector('.collection-source');
  const closeButton=card.querySelector('.collection-close'),nextButton=card.querySelector('.collection-next');
  const copyButton=card.querySelector('.collection-copy');
  let opener=null,item=null,highlightTimer=0,bag=[];
  function close(restore=false){
    if(!card.open)return;
    card.close();document.dispatchEvent(new CustomEvent('wordsea:quote-picked',{detail:{id:null}}));
    if(restore&&opener?.isConnected&&!opener.closest('[inert]'))opener.focus({preventScroll:true});opener=null;
  }
  function show(quote,trigger){
    if(!quote||document.body.classList.contains('scene-transition'))return;
    if(!card.open)opener=trigger||document.activeElement;
    item=quote;bag=bag.filter(id=>id!==item.id);
    language.textContent=item.language+' · '+(quotes.indexOf(item)+1)+' / '+quotes.length;
    original.textContent=item.text;original.lang=item.lang;author.textContent=item.author;
    translation.querySelector('p').textContent=item.translation;meaning.textContent=item.meaning;
    source.href=item.url;source.textContent='出处：'+item.source+' ↗';
    card.scrollTop=0;
    document.dispatchEvent(new CustomEvent('wordsea:quote-picked',{detail:{id:item.id}}));
    if(!card.open){card.show();closeButton.focus({preventScroll:true});}
  }
  function randomQuote(){
    if(!bag.length){
      bag=quotes.map(quote=>quote.id);
      for(let i=bag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
      if(bag.length>1&&bag[bag.length-1]===item?.id)[bag[0],bag[bag.length-1]]=[bag[bag.length-1],bag[0]];
    }
    return byId.get(bag.pop());
  }
  document.addEventListener('wordsea:collect',event=>{if(event.detail?.kind==='quote')show(byId.get(event.detail.id),document.activeElement);});
  const pickButton=document.getElementById('pick-quote');
  pickButton?.addEventListener('click',()=>show(randomQuote(),pickButton));
  nextButton.addEventListener('click',()=>show(randomQuote()));
  copyButton.addEventListener('click',()=>{if(item)tools.copy(copyButton,item.text+'\n\n'+item.translation+'\n— '+item.author+' · '+item.language+'\n出处：'+item.source+'\n'+item.url,'复制摘句');});
  closeButton.addEventListener('click',()=>close(true));
  document.addEventListener('pointerdown',event=>{if(card.open&&!card.contains(event.target)&&!event.target.closest('.pick-entry'))close();});
  document.getElementById('article-scroll')?.addEventListener('scroll',()=>close(),{passive:true});
  document.addEventListener('wordsea:before-navigate',()=>close());
  document.getElementById('passage-immersive')?.addEventListener('click',()=>close());
  document.getElementById('immersive')?.addEventListener('click',()=>close());
  addEventListener('keydown',event=>{
    if(card.open&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close(true);}
  },true);
  document.addEventListener('wordsea:sea-ready',event=>{
    const path=value=>{const url=new URL(value,location.href);return url.origin+url.pathname+url.search;};
    const target=path(event.detail.fromArticle),link=[...document.querySelectorAll('.story-link')].find(a=>path(a.href)===target);
    if(!link)return;
    document.querySelector('.story-link.just-read')?.classList.remove('just-read');clearTimeout(highlightTimer);
    link.classList.add('just-read');highlightTimer=setTimeout(()=>link.classList.remove('just-read'),2400);
  });
})();
