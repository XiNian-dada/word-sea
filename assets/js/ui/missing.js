// The 404 page lends its space to one family's search: a random record from
// 宝贝回家 (baobeihuijia.com), served by the 盒盖 API. Every field is
// third-party text, so it is only ever assigned as text, never parsed as markup.
const API = 'https://api.hgovo.cn/API/test/baobeihuijia?type=json';
const UNKNOWN = /^(无|暂无|不详|未知|不清楚|不知道|记不清(楚)?了?)[。.]?$/;
// A visitor meets this card by chance, so intimate or medical details stay on the charity's own page.
const PRIVATE = /生殖|下体|私处|阴部|隐私|臀部|屁股|乳房|智障|智力|精神|痴呆/;

function text(value, max) {
  const clean = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (UNKNOWN.test(clean)) return '';
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}
function feature(value) {
  return typeof value === 'string' && !PRIVATE.test(value) ? text(value.replace(/^\s*特征[:：]/, '').replace(/(姓名|年龄|身高|籍贯)[:：]\s*\S+?(?=\s|[，,；;]|$)[\s，,；;]*/g, ''), 90) : '';
}
// 1900-01-01 is the charity's placeholder for an unknown date.
const day = value => (/^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('1900') ? value.replaceAll('-', '.') : '');
// Addresses often repeat the province and city, e.g. 广东省,珠海市,金湾区,广东省珠海市金湾区贵山.
function place(value) {
  const kept = [];
  for (let part of typeof value === 'string' ? value.split(/[,，\s]+/) : []) {
    for (const earlier of kept) if (part.startsWith(earlier)) part = part.slice(earlier.length);
    if (part && !kept.includes(part)) kept.push(part);
  }
  return text(kept.join(' '), 80);
}
function photo(value) {
  try {
    // Only the charity's own image host, so the API cannot place arbitrary images here.
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || !/(^|\.)baobeihuijia\.com$/.test(url.hostname)) return '';
    url.protocol = 'https:';
    return url.href;
  } catch {
    return '';
  }
}
function record(json) {
  const data = json?.code === 200 && json.success !== false ? json.data : null,
    name = text(data?.name, 40);
  if (!name || /已找到|已回家|已团圆/.test(name + (data.typeName || ''))) throw new Error('Unusable record');
  return {
    name,
    about: [data.sex === '男' || data.sex === '女' ? data.sex : '', text(data.typeName, 12)].filter(Boolean).join(' · '),
    facts: [
      ['出生', day(data.birthDay)],
      ['失散', day(data.lostDay)],
      ['地点', place(data.lostAddress)],
      ['特征', feature(data.feature)],
    ].filter(([, value]) => value),
    photo: data.isPhotos ? photo(data.photoUrl) : '',
  };
}
function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}
function portrait(person) {
  if (!person.photo) return null;
  const image = new Image();
  image.alt = person.name + '的照片';
  // Neither the visitor's address nor a hot-link check reaches the photo host.
  image.referrerPolicy = 'no-referrer';
  image.decoding = 'async';
  let retried = false;
  image.addEventListener('load', () => image.parentNode?.classList.add('has-photo'));
  image.addEventListener('error', () => {
    // The host's firewall answers bursts with a 429 and Retry-After: 5, so try once more after that.
    if (!retried) {
      retried = true;
      setTimeout(() => { if (image.isConnected) image.src = person.photo; }, 5500);
    } else image.remove();
  });
  image.src = person.photo;
  return image;
}
// Hold the previous card briefly so the photo arrives with the name instead of popping in after it.
function settled(image, signal) {
  if (!image || image.complete) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(done, 2500);
    function done() {
      clearTimeout(timer);
      image.removeEventListener('load', done);
      image.removeEventListener('error', done);
      signal.removeEventListener('abort', done);
      resolve();
    }
    image.addEventListener('load', done);
    image.addEventListener('error', done);
    signal.addEventListener('abort', done);
  });
}
function render(box, person, image) {
  // The frame shows 寻 until the photo arrives, and keeps it if there is none.
  const frame = element('span', 'missing-frame');
  if (image) {
    frame.append(image);
    if (image.complete && image.naturalWidth) frame.classList.add('has-photo');
  }
  const name = element('p', 'missing-name', person.name);
  if (person.about) name.append(element('small', '', person.about));
  const facts = element('dl', 'missing-facts');
  for (const [term, value] of person.facts) facts.append(element('dt', '', term), element('dd', '', value));
  const copy = element('div', 'missing-copy');
  copy.append(name, facts);
  box.replaceChildren(frame, copy);
}

export default function setup() {
  let controller = null;
  async function load(section) {
    const box = section.querySelector('.missing-person'),
      next = section.querySelector('.missing-next');
    controller?.abort();
    const request = (controller = new AbortController()),
      timer = setTimeout(() => request.abort(), 8000);
    section.setAttribute('aria-busy', 'true');
    // Not disabled: that would drop keyboard focus on every 换一位.
    next.setAttribute('aria-disabled', 'true');
    try {
      let person = null;
      // Some records are marked as already found; draw again rather than show them.
      for (let attempt = 0; !person && attempt < 4; attempt++) {
        const response = await fetch(API, {
          signal: request.signal,
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        try { person = record(await response.json()); } catch { if (attempt === 3) throw new Error('No usable record'); }
      }
      const image = portrait(person);
      await settled(image, request.signal);
      if (request.signal.aborted) throw new Error('Aborted');
      render(box, person, image);
      section.hidden = false;
      next.textContent = '换一位';
    } catch {
      // The card stays hidden until a record arrives; a failed 换一位 keeps the one shown.
      next.textContent = '再试一次';
    } finally {
      clearTimeout(timer);
      if (controller === request) {
        controller = null;
        section.removeAttribute('aria-busy');
        next.removeAttribute('aria-disabled');
      }
    }
  }
  function start() {
    const section = document.querySelector('[data-wordsea-missing]');
    if (!section || section.dataset.started) return;
    section.dataset.started = 'true';
    section.querySelector('.missing-next').addEventListener('click', () => { if (!controller) load(section); });
    load(section);
  }
  document.addEventListener('wordsea:journal-ready', start);
  document.addEventListener('wordsea:before-navigate', () => controller?.abort());
  start();
}
