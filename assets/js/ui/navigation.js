export default function setup() {
  const configNode = document.getElementById('wordsea-config');
  if (!configNode) return;
  let config = JSON.parse(configNode.textContent),
    controller = null,
    navigation = 0;
  let lastSeaUrl = config.scene === 'sea' ? location.href : config.homeUrl;
  let lastSeaScroll = 0,
    displayedUrl = location.href;
  const root = document.getElementById('wordsea-scene'),
    articleScroll = document.getElementById('article-scroll');
  const status = document.getElementById('site-status');
  const cleanUrl = value => {
    const url = new URL(value, location.href);
    return url.origin === location.origin && /^https?:$/.test(url.protocol) ? url : null;
  };

  // Native comment POSTs keep Typecho's anti-spam token and moderation rules.
  document.addEventListener('submit', event => {
    const form = event.target;
    if (form instanceof HTMLFormElement && form.matches('.comment-form') && form.dataset.commentToken) {
      let token = form.querySelector('input[name="_"]');
      if (!token) {
        token = document.createElement('input');
        token.type = 'hidden';
        token.name = '_';
        form.append(token);
      }
      token.value = form.dataset.commentToken;
    }
  });
  let replyHolder = null;
  window.TypechoComment = {
    reply(id, coid) {
      const comment = document.getElementById(id),
        respond = document.querySelector('#comments .respond');
      if (!comment || !respond) return true;
      if (!replyHolder || !replyHolder.isConnected) {
        replyHolder = document.createElement('span');
        replyHolder.hidden = true;
        respond.before(replyHolder);
      }
      const form = respond.querySelector('form');
      let parent = form.querySelector('input[name="parent"]');
      if (!parent) {
        parent = document.createElement('input');
        parent.type = 'hidden';
        parent.name = 'parent';
        form.append(parent);
      }
      parent.value = String(coid);
      comment.append(respond);
      const cancel = document.getElementById('cancel-comment-reply-link');
      if (cancel) cancel.style.display = 'inline';
      respond.querySelector('textarea')?.focus();
      return false;
    },
    cancelReply() {
      const respond = document.querySelector('#comments .respond');
      if (!respond) return true;
      const parent = respond.querySelector('input[name="parent"]');
      if (parent) parent.remove();
      if (replyHolder?.isConnected) {
        replyHolder.before(respond);
        replyHolder.remove();
        replyHolder = null;
      }
      const cancel = document.getElementById('cancel-comment-reply-link');
      if (cancel) cancel.style.display = 'none';
      return false;
    },
  };

  function rememberScroll() {
    history.replaceState(
      {
        ...history.state,
        wordSea: true,
        scroll: articleScroll.scrollTop,
        journal: document.querySelector('.journal-scroll')?.scrollTop || 0,
      },
      '',
      location.href,
    );
  }
  function metadata(doc) {
    document.title = doc.title;
    for (const selector of ['link[rel="canonical"]', 'meta[name="description"]', 'meta[name="keywords"]']) {
      document.head.querySelector(selector)?.remove();
      const node = doc.head.querySelector(selector);
      if (node) document.head.append(document.importNode(node, true));
    }
  }
  async function settled(sequence) {
    const until = performance.now() + 7000;
    while (sequence === navigation && window.wordSea?.getState().transitioning && performance.now() < until)
      await new Promise(resolve => setTimeout(resolve, 40));
  }
  async function navigate(value, { push = true, restore = null } = {}) {
    const url = cleanUrl(value);
    if (!url) return;
    document.dispatchEvent(new Event('wordsea:before-navigate'));
    if (!config.ajax || !window.wordSea) {
      location.assign(url.href);
      return;
    }
    const sequence = ++navigation;
    controller?.abort();
    controller = new AbortController();
    document.body.classList.add('is-loading');
    root.setAttribute('aria-busy', 'true');
    status.textContent = '';
    try {
      const response = await fetch(url.href, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'X-Word-Sea': 'navigation' },
      });
      if (!response.ok && response.status !== 404) throw new Error('Page unavailable');
      if (!cleanUrl(response.url)) throw new Error('External redirect');
      const html = await response.text();
      if (sequence !== navigation) return;
      const doc = new DOMParser().parseFromString(html, 'text/html'),
        incoming = doc.getElementById('wordsea-config');
      if (!incoming || !doc.getElementById('wordsea-scene')) throw new Error('Other template');
      // Plugins and posts that need scripts retain a complete normal page load.
      const needsScripts = [...doc.querySelectorAll('script')].some(
        script => script.type !== 'application/json' && !script.hasAttribute('data-wordsea-runtime'),
      );
      const styles = new Set([...document.querySelectorAll('link[rel="stylesheet"]')].map(link => link.href));
      const needsStyles = [...doc.querySelectorAll('link[rel="stylesheet"]')].some(
        link => !styles.has(new URL(link.getAttribute('href'), response.url).href),
      );
      if (needsScripts || needsStyles) {
        location.assign(url.href);
        return;
      }
      const next = JSON.parse(incoming.textContent);
      if (!['sea', 'article', 'friends'].includes(next.scene)) throw new Error('Unknown scene');
      const previousScene = config.scene,
        previousUrl = displayedUrl;
      if (previousScene === 'sea') lastSeaScroll = document.querySelector('.journal-scroll')?.scrollTop || 0;
      if (push) {
        rememberScroll();
        history.pushState({ wordSea: true, scroll: 0, journal: 0 }, '', url.href);
      }
      config = next;
      displayedUrl = url.href;
      configNode.textContent = incoming.textContent;
      metadata(doc);
      root.dataset.scene = next.scene;
      if (next.scene === 'sea') {
        lastSeaUrl = url.href;
        document.getElementById('journal').innerHTML = doc.getElementById('journal').innerHTML;
        document.dispatchEvent(new Event('wordsea:journal-ready'));
      }
      if (next.scene === 'article') {
        document.getElementById('article-text').innerHTML = doc.getElementById('article-text').innerHTML;
        document.dispatchEvent(new Event('wordsea:article-ready'));
      }
      if (next.scene === 'friends') {
        for (const id of ['friend-list', 'friends-foot', 'friends-pagination'])
          document.getElementById(id).innerHTML = doc.getElementById(id).innerHTML;
        window.wordSea.setFriends(next.friends);
      }
      document.getElementById('site-footer').innerHTML = doc.getElementById('site-footer').innerHTML;
      replyHolder = null;
      window.wordSea.setScene(next.scene, true);
      if (window.wordSea.getState().scene !== next.scene) throw new Error('Scene unavailable');
      if (next.scene === 'article') articleScroll.scrollTop = restore?.scroll || 0;
      document.body.classList.remove('is-loading');
      root.removeAttribute('aria-busy');
      await settled(sequence);
      if (sequence !== navigation) return;
      // Keep the outgoing article at its reading position until the ascent hides it.
      if (next.scene !== 'article') {
        document.getElementById('article-text').replaceChildren();
        articleScroll.scrollTop = 0;
        document.dispatchEvent(new Event('wordsea:article-cleared'));
      }
      if (restore) {
        const journal = document.querySelector('.journal-scroll');
        if (journal) journal.scrollTop = restore.journal || 0;
      } else if (next.scene === 'sea' && previousScene !== 'sea') {
        const journal = document.querySelector('.journal-scroll');
        if (journal) journal.scrollTop = lastSeaScroll;
        document.getElementById('journal-heading')?.focus({ preventScroll: true });
      } else if (url.hash) {
        let id;
        try {
          id = decodeURIComponent(url.hash.slice(1));
        } catch {
          return;
        }
        document.getElementById(id)?.scrollIntoView({ block: 'start' });
      } else
        document
          .getElementById(
            next.scene === 'article'
              ? 'article-heading'
              : next.scene === 'friends'
                ? 'friends-heading'
                : 'journal-heading',
          )
          ?.focus({ preventScroll: true });
      if (next.scene === 'sea' && previousScene === 'article')
        document.dispatchEvent(new CustomEvent('wordsea:sea-ready', { detail: { fromArticle: previousUrl } }));
    } catch (error) {
      if (error.name !== 'AbortError' && sequence === navigation) location.assign(url.href);
    } finally {
      if (sequence === navigation) {
        document.body.classList.remove('is-loading');
        root.removeAttribute('aria-busy');
      }
    }
  }
  if (window.wordSea && config.ajax) {
    document.addEventListener('click', event => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = event.target.closest(
        'a[data-wordsea-link],.page-navigator a,.post-near a,.post-tags a,.article-meta a',
      );
      if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
      const url = cleanUrl(link.href);
      if (!url) return;
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
      event.preventDefault();
      navigate(
        link.id === 'back-sea' || link.id === 'back-friends' || link.hasAttribute('data-wordsea-return')
          ? lastSeaUrl
          : url.href,
      );
    });
    addEventListener('popstate', event => navigate(location.href, { push: false, restore: event.state }));
    document.addEventListener('wordsea:navigate', event =>
      navigate(event.detail.scene === 'friends' ? config.friendsUrl : lastSeaUrl),
    );
  }
  // Direct article/comment URLs and refreshes are rendered by PHP first.
  if (location.hash) {
    let id;
    try {
      id = decodeURIComponent(location.hash.slice(1));
    } catch {
      return;
    }
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }
}
