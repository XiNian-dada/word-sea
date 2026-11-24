import { clamp, damp, easeInOut, lerp, smoothstep } from '../core/math.js';
import { Renderer } from './renderer.js';
import { World, CRUISE } from './world.js';
import { Corridor } from './corridor.js';
import { Particles, Lanterns, Wildlife } from './particles.js';
import { PRESETS, moonPhaseInfo, themeAtHour } from './atmosphere.js';
import { buildAtlas } from './atlas.js';
import { Governor, Pacer } from './pacing.js';
import { QualityController, atlasSizeFor, detectInitialTier, isSoftwareRenderer, parseQualityOverride, shouldUseAntialias } from './quality.js';

const SEA_WORDS = ['海', 'sea', 'mer', 'mar', 'Meer', 'mare', 'море', 'θάλασσα', 'بحر', 'ים', 'समुद्र', 'সমুদ্র', 'கடல்', 'సముద్రం', 'ทะเล', 'biển', '바다', 'laut', 'deniz', 'bahari', 'havet', 'meri', 'sjór', 'muir'];
const CLOUD_WORDS = ['云', '雲', 'cloud', 'nuage', 'nube', 'Wolke', 'nuvola', 'облако', 'سحابة', 'ענן', 'बादल', 'মেঘ', 'மேகம்', 'เมฆ', 'mây', '구름', 'awan', 'bulut', 'wingu', 'moln', 'pilvi', 'ský', 'scamall'];
const ACCENTS = {
  daybreak: ['#f4c1c9', '#1c1f3d'], morning: ['#ffe0b2', '#3f6f93'], noon: ['#e6f3ff', '#3f7fb2'],
  afternoon: ['#ffd8a8', '#3d6d97'], sunset: ['#ffc59a', '#25182b'], night: ['#bed3ff', '#070c1b'],
};
const LABELS = { sea: '由多语言文字组成的动态海洋', article: '多语言名言长廊与文章阅读', friends: '文字海洋上的友链灯火' };

const $ = id => document.getElementById(id);
const config = JSON.parse($('wordsea-config').textContent);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)');
const canvas = $('scene-canvas');
const root = $('wordsea-scene');

function fail(message) {
  document.body.classList.add('no-effects');
  if (message) console.warn(message);
}

const query = new URLSearchParams(location.search);
const qualityOverride = parseQualityOverride(query.get('quality'));
const antialias = shouldUseAntialias({
  coarse: coarse.matches,
  cores: navigator.hardwareConcurrency,
  memory: navigator.deviceMemory,
  override: qualityOverride,
});

let renderer = null;
try { renderer = new Renderer(canvas, { antialias }); } catch (error) { fail(error.message); }

if (renderer) start();

function start() {
  const requested = query.get('theme'), moonParam = query.get('moon'), auroraParam = query.get('aurora');
  const software = isSoftwareRenderer(renderer.caps.renderer);
  const quality = new QualityController(detectInitialTier({
    coarse: coarse.matches,
    width: root.clientWidth || innerWidth,
    height: root.clientHeight || innerHeight,
    cores: navigator.hardwareConcurrency,
    memory: navigator.deviceMemory,
    renderer: renderer.caps.renderer,
    software,
    override: qualityOverride,
  }));
  const MOON_ALIASES = { new: 0, crescent: .14, first: .25, 'first-quarter': .25, full: .5, last: .75, 'last-quarter': .75 };
  const selected = requested || config.theme || 'auto';
  const state = {
    automatic: !PRESETS[selected],
    theme: PRESETS[selected] ? selected : themeAtHour(new Date().getHours()),
    immersive: false, userPaused: false, observation: null, baseWind: config.wind / 100, weatherWind: false,
  };
  const world = new World({ wind: config.wind / 100, density: config.density / 100, theme: state.theme });
  if (moonParam !== null) {
    const parsed = moonParam in MOON_ALIASES ? MOON_ALIASES[moonParam] : Number(moonParam);
    if (Number.isFinite(parsed)) { world.moonPhase = ((parsed % 1) + 1) % 1; }
  }
  // Rare night-sky easter egg (~18% per visit; ?aurora=1 or ?aurora=0 overrides for preview).
  const auroraRoll = auroraParam !== null
    ? (auroraParam === '1' || auroraParam === 'true' ? 1 : 0)
    : (Math.random() < .18 ? .78 + Math.random() * .22 : 0);
  world.aurora = auroraRoll;
  world.updateAtmosphere();
  world.paused = reducedMotion.matches;
  const corridor = new Corridor(renderer), particles = new Particles(renderer), lanterns = new Lanterns(renderer), wildlife = new Wildlife(renderer);
  renderer.passes = [wildlife, particles, lanterns, corridor];

  const articleView = $('article-view'), articleScroll = $('article-scroll'), friendsView = $('friends-view');
  const homeUi = [...document.querySelectorAll('[data-home-ui]')];
  const HARBOR_PAGE_STEP = 44;
  const scene = { target: 0, mix: 0, from: 0, started: 0, duration: 3200, transitioning: false, article: null, scroll: 0, scrollTarget: 0, frames: 0 };
  const harbor = { target: 0, mix: 0, pageMix: 0, from: 0, page: config.friendsPage || 1, cruise: 0, cruiseFrom: 0, cruiseTarget: CRUISE, paging: false, started: 0, duration: 3400, transitioning: false, hover: -1, frames: 0 };
  let friends = [], nodes = [];
  const quotes = window.wordSeaCollection?.quotes || [];

  // ——— Lettering, built once off the main thread ———
  let seaRequested = false;
  function requestSea() {
    if (seaRequested) return;
    seaRequested = true;
    const size = atlasSizeFor(quality.config, { maxTexture: renderer.caps.maxTexture, memory: navigator.deviceMemory });
    buildAtlas('sea', { size, seaWords: SEA_WORDS, cloudWords: CLOUD_WORDS }).then(({ pixels }) => {
      renderer.setGlyphs(pixels, size);
      document.body.classList.add('sea-lettered');
      invalidate();
    }).catch(error => console.warn('Sea lettering unavailable:', error));
  }
  let quotesRequested = false;
  function requestQuotes() {
    if (quotesRequested || !quotes.length) return;
    quotesRequested = true;
    const size = atlasSizeFor(quality.config, { maxTexture: renderer.caps.maxTexture, memory: navigator.deviceMemory });
    buildAtlas('quotes', { size, quotes: quotes.map(({ id, lang, text, author }) => ({ id, lang, text, author })) })
      .then(result => { corridor.setAtlas({ ...result, size }); invalidate(); })
      .catch(error => console.warn('Quotation walls unavailable:', error));
  }

  // ——— Frame scheduling ———
  let raf = 0, last = 0, lost = false, frames = 0;
  const pacer = new Pacer(), governor = new Governor();
  const viewport = { width: 1, height: 1 };
  function updateGovernorCeiling() {
    const q = quality.config;
    governor.setMax(Math.min(devicePixelRatio || 1, q.maxScale, Math.sqrt(q.maxPixels / (viewport.width * viewport.height))));
  }
  function applyQuality({ initial = false } = {}) {
    const q = quality.config;
    renderer.setQuality(q);
    particles.setBudget(q.particles);
    document.body.classList.toggle('low-power', q.lowPower);
    pacer.setInterval(q.frameInterval);
    governor.setPace(q.frameInterval);
    if (!initial) {
      updateGovernorCeiling();
      governor.setMin(q.minScale);
      renderer.resize(viewport.width, viewport.height, governor.scale);
    } else {
      governor.setMin(q.minScale);
    }
  }
  function measure() {
    viewport.width = Math.max(1, root.clientWidth); viewport.height = Math.max(1, root.clientHeight);
    // Background detail has a bounded pixel budget; DOM text stays at native resolution.
    updateGovernorCeiling();
    world.setViewport(viewport.width, viewport.height);
    renderer.resize(viewport.width, viewport.height, governor.scale);
    layoutLanterns();
    invalidate();
  }
  function invalidate() { if (!raf && !document.hidden && !lost) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    if (document.hidden || lost) return;
    if (!pacer.due(now)) { raf = requestAnimationFrame(frame); return; }
    const dt = last ? Math.min((now - last) / 1000, .1) : 0;
    // Measured smoothness drives resolution: keep motion fluid before keeping pixels.
    const resized = governor.sample(now);
    if (quality.observe(governor.consumeEvent())) applyQuality();
    else if (resized) renderer.resize(viewport.width, viewport.height, governor.scale);
    last = now;
    let animating = false;

    if (scene.transitioning) {
      const t = clamp((now - scene.started) / scene.duration, 0, 1);
      scene.mix = lerp(scene.from, scene.target, easeInOut(t));
      if (t === 1) { scene.mix = scene.target; scene.transitioning = false; finishScene(); }
      animating = true;
    }
    if (harbor.transitioning) {
      const t = clamp((now - harbor.started) / harbor.duration, 0, 1), e = easeInOut(t);
      harbor.mix = harbor.paging ? 1 : lerp(harbor.from, harbor.target, e);
      harbor.cruise = lerp(harbor.cruiseFrom, harbor.cruiseTarget, e);
      harbor.pageMix = harbor.paging ? e : harbor.mix;
      if (t === 1) {
        harbor.mix = harbor.target; harbor.cruise = harbor.cruiseTarget; harbor.pageMix = harbor.target;
        harbor.transitioning = false; harbor.paging = false; finishFriends();
      }
      animating = true;
    }
    applyVisuals();
    world.dive = scene.mix;
    world.cruise = harbor.cruise;
    const reading = scene.mix >= 1 && !scene.transitioning;
    // While reading, the sea is hidden: hold its clock and only redraw the walls.
    if (!reading) {
      animating = world.update(dt, { reducedMotion: reducedMotion.matches }) || animating;
      wildlife.update(world, dt, { reducedMotion: reducedMotion.matches });
    } else {
      animating = world.updateTheme(dt, { reducedMotion: reducedMotion.matches }) || animating;
      world.updateAtmosphere();
      if (state.immersive && !world.paused && !reducedMotion.matches) {
        const p = world.pointer;
        p.sx = damp(p.sx, p.x, 2.6, dt); p.sy = damp(p.sy, p.y, 2.6, dt);
        if (Math.abs(p.sx - p.x) > 1e-3 || Math.abs(p.sy - p.y) > 1e-3) animating = true;
      }
    }

    scene.scroll = reducedMotion.matches ? scene.scrollTarget : damp(scene.scroll, scene.scrollTarget, 5, dt);
    if (Math.abs(scene.scroll - scene.scrollTarget) < 1e-4) scene.scroll = scene.scrollTarget; else animating = true;
    if (corridor.updateHighlight(now)) animating = true;
    if (harbor.mix > 0 && updateLanterns(dt)) animating = true;
    updateCorridor();

    const f = world.frame;
    f.sea.visible = corridor.state.reveal < .36;
    f.sea.harbor = harbor.mix;
    renderer.render(f);
    frames++;
    if (corridor.state.reveal > 0) scene.frames++;
    if (harbor.mix > 0) harbor.frames++;
    if (animating) raf = requestAnimationFrame(frame);
    else { last = 0; governor.restart(); }
  }

  function updateCorridor() {
    const s = corridor.state, mix = scene.mix;
    // Leave room to pass below the water before the walls gradually emerge.
    // Their descent still shares the camera's progress throughout the handoff.
    s.reveal = smoothstep(.36, .98, mix);
    s.descent = (1 - mix) * 70;
    s.travel = scene.scroll * 14;
    s.blur = scene.transitioning ? .003 * (1 - smoothstep(.75, 1, mix)) * smoothstep(.36, .6, mix) : 0;
    const quiet = mix >= 1 && !state.immersive;
    s.look[0] = quiet ? 0 : world.pointer.sx; s.look[1] = quiet ? 0 : world.pointer.sy;
    // Ease the corridor light down as its lettering emerges.
    corridor.updateLighting(world.preset, lerp(1.05, .35, state.immersive ? 0 : s.reveal));
    corridor.updateCamera(world.frame.camera, mix, viewport.width / viewport.height);
  }

  // ——— Scene visuals and state ———
  // Inline styles are written only when they change, so idle frames cost no style work.
  const styles = new WeakMap();
  function style(element, key, value) {
    let previous = styles.get(element);
    if (!previous) styles.set(element, previous = {});
    if (previous[key] === value) return;
    previous[key] = value;
    if (key.startsWith('--')) element.style.setProperty(key, value); else element.style[key] = value;
  }
  function applyVisuals() {
    style(articleView, 'opacity', String(smoothstep(.84, 1, scene.mix)));
    style(friendsView, 'opacity', String(smoothstep(.35, .85, harbor.mix) * (1 - smoothstep(0, .3, scene.mix))));
    // Only the friends' cards read it; set higher up, it would restyle the article every frame.
    style(friendsView, '--harbor', harbor.pageMix.toFixed(3));
  }
  function syncTransition() { document.body.classList.toggle('scene-transition', scene.transitioning || harbor.transitioning); }
  function label() { root.setAttribute('aria-label', LABELS[scene.target ? 'article' : harbor.target ? 'friends' : 'sea']); }
  function focus(id) { if (!state.immersive) $(id)?.focus({ preventScroll: true }); }

  function finishScene() {
    applyVisuals(); syncTransition();
    if (scene.target) {
      document.body.classList.add('article-mode'); articleView.inert = false;
      focus('article-heading');
    } else {
      articleView.hidden = true; document.body.classList.remove('article-mode');
      for (const ui of homeUi) ui.inert = false;
      if (scene.article && !harbor.target) focus('journal-heading');
      scene.article = null;
      if (harbor.target && !harbor.transitioning) { friendsView.inert = false; focus('friends-heading'); }
    }
    label();
  }
  function setArticle(id, animate) {
    const target = id === 'article' ? 1 : 0;
    if (target === scene.target && (!target || scene.article === id)) return;
    if (target) requestQuotes();
    if (state.immersive) setImmersive(false);
    if (target) {
      articleScroll.scrollTop = 0; scene.scrollTarget = scene.scroll = 0;
      world.pointer.x = world.pointer.y = 0;
      articleView.hidden = false; articleView.inert = true;
      document.body.classList.add('article-mode'); scene.article = id;
      for (const ui of homeUi) ui.inert = true;
    } else articleView.inert = true;
    scene.from = scene.mix; scene.target = target; scene.started = performance.now();
    scene.duration = 3200 * Math.max(.3, Math.abs(target - scene.from));
    scene.transitioning = animate && !reducedMotion.matches;
    syncTransition(); label();
    if (!scene.transitioning) { scene.mix = target; finishScene(); }
    invalidate();
  }
  function finishFriends() {
    applyVisuals(); syncTransition();
    if (harbor.target) {
      friendsView.inert = Boolean(scene.target);
      if (!scene.target) focus('friends-heading');
    } else {
      friendsView.hidden = true; friendsView.inert = true; document.body.classList.remove('friends-mode');
      if (!scene.target) focus('open-friends');
    }
    label();
  }
  function setFriends(on, animate) {
    const target = on ? 1 : 0;
    if (target === harbor.target) return;
    if (state.immersive) setImmersive(false);
    harbor.hover = -1;
    harbor.paging = false;
    const destCruise = target ? CRUISE + (harbor.page - 1) * HARBOR_PAGE_STEP : 0;
    if (target) {
      world.pointer.x = world.pointer.y = 0;
      harbor.cruiseTarget = destCruise;
      friendsView.hidden = false; friendsView.inert = true; document.body.classList.add('friends-mode'); layoutLanterns();
    } else {
      friendsView.inert = true;
      harbor.cruiseTarget = 0;
    }
    harbor.from = harbor.mix; harbor.cruiseFrom = harbor.cruise; harbor.target = target; harbor.started = performance.now();
    harbor.duration = 3400 * Math.max(.3, Math.abs(target - harbor.from));
    harbor.transitioning = animate && !reducedMotion.matches;
    syncTransition(); label();
    if (!harbor.transitioning) { harbor.mix = target; harbor.pageMix = target; harbor.cruise = harbor.cruiseTarget; finishFriends(); }
    invalidate();
  }
  function setScene(id, animate = true) {
    if (id !== 'article') requestSea();
    if (id === 'friends') { setArticle(null, animate); setFriends(true, animate); }
    else { setFriends(false, animate); setArticle(id, animate); }
  }
  const navigate = id => document.dispatchEvent(new CustomEvent('wordsea:navigate', { detail: { scene: id || 'sea' } }));

  // ——— Friends' lanterns ———
  const projected = { x: 0, y: 0, w: 1 };
  function layoutLanterns() {
    const cruise = harbor.target ? harbor.cruiseTarget : CRUISE + (harbor.page - 1) * HARBOR_PAGE_STEP;
    for (const node of nodes) {
      const p = world.harborPoint(node.friend.at[0], node.friend.at[1], cruise);
      node.x = p.x; node.z = p.z;
    }
  }
  function bindFriends(data, page = harbor.page) {
    const prevPage = harbor.page;
    harbor.page = Math.max(1, page || 1);
    friends = (data || []).slice(0, 6);
    harbor.hover = -1;
    if (harbor.target === 1 && harbor.page !== prevPage) {
      harbor.cruiseFrom = harbor.cruise;
      harbor.cruiseTarget = CRUISE + (harbor.page - 1) * HARBOR_PAGE_STEP;
      if (Math.abs(harbor.cruiseTarget - harbor.cruiseFrom) < 1) harbor.cruiseFrom = harbor.cruiseTarget - HARBOR_PAGE_STEP;
      if (!reducedMotion.matches) {
        harbor.paging = true; harbor.transitioning = true; harbor.pageMix = 0;
        harbor.started = performance.now(); harbor.duration = 2200;
        friendsView.inert = true; syncTransition();
      } else {
        harbor.cruise = harbor.cruiseTarget; harbor.pageMix = 1; harbor.paging = false;
      }
    } else {
      harbor.cruiseTarget = harbor.target ? CRUISE + (harbor.page - 1) * HARBOR_PAGE_STEP : 0;
    }
    const anchors = [...document.querySelectorAll('.friend-link')];
    nodes = friends.map((friend, i) => ({
      friend, i, x: 0, y: 0, z: 0, level: 0, alpha: 0, anchor: anchors[i],
      color: friend.color.map(v => v / 255),
    }));
    layoutLanterns();
    for (const node of nodes) {
      const anchor = node.anchor;
      if (!anchor) continue;
      const light = () => { if (harbor.hover !== node.i) { harbor.hover = node.i; world.addRipple(node.x, node.z, .8); invalidate(); } };
      const leave = () => { if (harbor.hover === node.i) { harbor.hover = -1; invalidate(); } };
      anchor.addEventListener('pointerenter', light); anchor.addEventListener('focus', light);
      anchor.addEventListener('pointerleave', () => { if (document.activeElement !== anchor) leave(); });
      anchor.addEventListener('blur', () => { if (!anchor.matches(':hover')) leave(); });
    }
    invalidate();
  }
  function updateLanterns(dt) {
    let settling = false;
    const sea = world.frame.sea;
    sea.lanterns.fill(0); sea.lanternColors.fill(0);
    const compact = viewport.width <= 1150 || viewport.height <= 650;
    const progress = harbor.paging ? harbor.pageMix : harbor.mix;
    for (const node of nodes) {
      const target = harbor.hover === node.i ? 1 : 0;
      node.level = reducedMotion.matches ? target : damp(node.level, target, 6, dt);
      if (Math.abs(node.level - target) < 1e-3) node.level = target; else settling = true;
      const nearness = clamp((node.friend.at[1] - .6) / .3, 0, 1);
      const start = (.50 - nearness * .16) + (node.i % 3) * .03;
      const end = Math.min(.96, start + .36);
      node.alpha = smoothstep(start, end, progress);
      node.y = world.waterHeight(node.x, node.z) + lerp(.4, 2.6, node.alpha);
      const strength = (1 + node.level * 1.6) * node.alpha;
      for (let c = 0; c < 3; c++) sea.lanternColors[node.i * 3 + c] = node.color[c] * strength;
      sea.lanterns[node.i * 3] = node.x; sea.lanterns[node.i * 3 + 1] = node.y; sea.lanterns[node.i * 3 + 2] = node.z;
      if (node.anchor && !compact) {
        // Labels stay anchored while the lanterns themselves ride the waves.
        world.project(projected, node.x, 2.6, node.z);
        const right = node.friend.at[0] > .62;
        const x = clamp(projected.x + (right ? -282 : 34), 16, viewport.width - 264);
        style(node.anchor, 'transform', `translate3d(${x.toFixed(1)}px,${(projected.y - 30).toFixed(1)}px,0)`);
        style(node.anchor, 'opacity', String(node.alpha * smoothstep(.52, .92, progress)));
      } else if (node.anchor) { style(node.anchor, 'transform', ''); style(node.anchor, 'opacity', ''); }
    }
    lanterns.update(nodes);
    return settling || !world.paused;
  }

  // ——— Controls ———
  const play = $('play');
  const PAUSE_ICON = '<path d="M9 5v14M15 5v14"/>', PLAY_ICON = '<path d="m8 5 11 7-11 7Z"/>';
  function setPaused(paused, system = false) {
    if (!system) state.userPaused = paused;
    world.paused = paused;
    for (const button of document.querySelectorAll('[data-action="pause"]')) {
      button.setAttribute('aria-pressed', String(paused));
      button.setAttribute('aria-label', paused ? '继续动画' : '暂停动画');
      button.querySelector('svg').innerHTML = paused ? PLAY_ICON : PAUSE_ICON;
    }
    invalidate();
  }
  function weatherTheme() {
    const localHour = new Date().getHours();
    const data = state.observation;
    if (!data) return themeAtHour(localHour);
    if (data.timezone) {
      try {
        const zoneHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: data.timezone, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
        const diff = Math.abs((((zoneHour - localHour) % 24) + 36) % 24 - 12);
        if (diff > 2) return themeAtHour(localHour);
      } catch {}
    }
    const now = Date.now() / 1000;
    let rise = NaN, set = NaN, nearest = Infinity;
    for (let i = 0; i < (data.sunrise?.length || 0); i++) {
      const r = data.sunrise[i], s = data.sunset?.[i], distance = Math.abs(now - (r + s) / 2);
      if (Number.isFinite(r) && Number.isFinite(s) && s > r && distance < nearest) { rise = r; set = s; nearest = distance; }
    }
    if (Number.isFinite(rise) && nearest < 36 * 3600) {
      if (now >= rise - 35 * 60 && now < rise + 45 * 60) return 'daybreak';
      if (now >= set - 50 * 60 && now < set + 35 * 60) return 'sunset';
      if (now < rise || now >= set) return 'night';
      const progress = (now - rise) / (set - rise);
      return progress < .25 ? 'morning' : progress < .62 ? 'noon' : 'afternoon';
    }
    if (data.isDay === 0) return 'night';
    if (data.timezone) {
      try { return themeAtHour(Number(new Intl.DateTimeFormat('en-GB', { timeZone: data.timezone, hour: '2-digit', hourCycle: 'h23' }).format(new Date()))); } catch {}
    }
    return themeAtHour(new Date().getHours());
  }
  function setTheme(value, animate = true) {
    if (value === 'dawn') value = 'morning';
    state.automatic = value === 'auto' || !PRESETS[value];
    state.theme = state.automatic ? weatherTheme() : value;
    world.setTheme(state.theme, animate && !reducedMotion.matches);
    for (const button of document.querySelectorAll('.theme')) button.setAttribute('aria-pressed', String(button.dataset.theme === (state.automatic ? 'auto' : state.theme)));
    const [accent, sky] = ACCENTS[state.theme];
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.dataset.time = state.theme;
    document.querySelector('meta[name="theme-color"]').content = sky;
    const current = $('theme-current');
    const moon = moonPhaseInfo(world.frame.atmosphere.moonPhase);
    const phaseText = state.theme === 'night' ? ' · ' + moon.name : '';
    const nightBtn = document.querySelector('.theme[data-theme="night"]');
    if (nightBtn) {
      nightBtn.textContent = state.theme === 'night' ? '月夜 · ' + moon.name : '月夜';
      nightBtn.title = `月夜 · ${moon.name}（照明 ${moon.illumination}%）`;
    }
    if (current) current.textContent = PRESETS[state.theme].label + phaseText + (state.automatic ? ' · 自动' : '');
    document.querySelector('.themes')?.setAttribute('aria-label', '时段 · ' + PRESETS[state.theme].label + phaseText + (state.automatic ? ' · 跟随本地时间' : ''));
    invalidate();
  }
  function setRange(key, value) {
    value = Math.round(value);
    world[key] = value / 100;
    const input = $(key), output = $(key + '-value');
    if (input) { input.value = String(value); input.style.setProperty('--fill', ((value - input.min) / (input.max - input.min) * 100).toFixed(1) + '%'); }
    if (output) output.textContent = value + '%';
    invalidate();
  }
  function setClouds(on) {
    world.cloudsTarget = on ? 1 : 0;
    $('clouds')?.setAttribute('aria-pressed', String(on));
    invalidate();
  }
  function setImmersive(on) {
    state.immersive = on;
    world.pointer.x = world.pointer.y = world.pointer.sx = world.pointer.sy = 0;
    document.body.classList.toggle('immersive', on);
    if (on) $('restore').focus({ preventScroll: true });
    else $(scene.target ? 'passage-immersive' : harbor.target ? 'friends-immersive' : 'immersive')?.focus({ preventScroll: true });
    invalidate();
  }
  function setWeather(data) {
    state.observation = data;
    const t = world.weatherTarget;
    const limit = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
    if (!data) {
      for (const key of ['active', 'cloud', 'rain', 'snow', 'fog', 'storm']) t[key] = 0;
      if (state.weatherWind) setRange('wind', state.baseWind * 100);
      state.weatherWind = false;
    } else {
      if (!state.weatherWind) state.baseWind = world.wind;
      state.weatherWind = true;
      const code = data.code;
      const rainy = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 97, 99].includes(code), snowy = [71, 73, 75, 77, 85, 86].includes(code);
      t.active = 1; t.cloud = limit(data.cloud / 100, 0, 1);
      t.rain = limit(Math.sqrt(Math.max(data.rain || 0, rainy ? .35 : 0)) / 3.6, 0, 1);
      t.snow = limit(Math.sqrt(Math.max(data.snow || 0, snowy ? .15 : 0)) / 1.7, 0, 1);
      t.fog = [45, 48].includes(code) ? .88 : t.rain * .16 + t.snow * .1;
      t.storm = [95, 96, 97, 99].includes(code) ? 1 : 0;
      // Meteorological wind direction reports where wind blows FROM; scene wind blows TO.
      t.angle = ((limit(data.direction, 0, 360) + 180) % 360) * Math.PI / 180;
      setRange('wind', limit(.08 + Math.pow(limit(data.wind, 0, 160) / 55, .65) * .83, .04, .98) * 100);
    }
    if (state.automatic) setTheme('auto');
    invalidate();
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'pause') setPaused(!world.paused);
    else if (action === 'immersive') setImmersive(true);
    else if (action === 'restore') setImmersive(false);
  });
  for (const button of document.querySelectorAll('.theme')) button.addEventListener('click', () => setTheme(button.dataset.theme));
  for (const key of ['wind', 'density']) $(key)?.addEventListener('input', event => setRange(key, Number(event.target.value)));
  $('clouds')?.addEventListener('click', () => setClouds(world.cloudsTarget < .5));
  addEventListener('keydown', event => {
    if (event.defaultPrevented || document.querySelector('dialog[open]:not(.collection-card)')) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable) return;
    if (event.key === 'Escape') { if (state.immersive) setImmersive(false); else if (scene.target || harbor.target) navigate(null); return; }
    if (event.code === 'Space' && !(target instanceof HTMLButtonElement) && !articleScroll.contains(target) && !friendsView.contains(target)) { event.preventDefault(); setPaused(!world.paused); }
    if (event.key.toLowerCase() === 'h' && !event.metaKey && !event.ctrlKey && !event.altKey) setImmersive(!state.immersive);
  });
  addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || world.paused || reducedMotion.matches || scene.transitioning || harbor.transitioning) return;
    if (((scene.target || harbor.target) && !state.immersive) || event.target.closest('dialog[open]')) return;
    const strength = state.immersive ? 1 : .4;
    world.pointer.x = (event.clientX / viewport.width - .5) * 2 * strength;
    world.pointer.y = (event.clientY / viewport.height - .5) * 2 * strength;
    invalidate();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => {
    if (world.paused || (scene.target && !state.immersive)) return;
    world.pointer.x = world.pointer.y = 0; invalidate();
  });

  // A tap is a short press without travel; scrolling and pinching never count.
  let press = null;
  // The full-width transparent scrollport covers the walls in reading mode.
  // Its empty margins can pick a quote; article text and controls keep their input.
  const wallTarget = target => target === canvas || (scene.target && target === articleScroll);
  root.addEventListener('pointerdown', event => {
    press = event.isPrimary && event.button === 0 && wallTarget(event.target) && !scene.transitioning && !harbor.transitioning
      ? { x: event.clientX, y: event.clientY, id: event.pointerId, time: performance.now() } : null;
  });
  root.addEventListener('pointermove', event => {
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) press = null;
  }, { passive: true });
  root.addEventListener('pointercancel', () => { press = null; });
  root.addEventListener('pointerup', event => {
    const down = press; press = null;
    if (!down || !wallTarget(event.target) || down.id !== event.pointerId || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 8 || performance.now() - down.time > 700) return;
    if (scene.transitioning || harbor.transitioning) return;
    if (scene.target) {
      const id = corridor.pick(event.clientX, event.clientY, viewport.width, viewport.height);
      if (id !== null) document.dispatchEvent(new CustomEvent('wordsea:collect', { detail: { kind: 'quote', id } }));
    } else if (world.rippleAt(event.clientX, event.clientY)) {
      wildlife.triggerNear(world);
      invalidate();
    }
  });
  document.addEventListener('wordsea:quote-picked', event => {
    if (corridor.setPicked(event.detail?.id ?? null, performance.now(), reducedMotion.matches)) invalidate();
  });
  articleScroll.addEventListener('scroll', () => {
    press = null;
    scene.scrollTarget = clamp(articleScroll.scrollTop / Math.max(1, articleScroll.scrollHeight - articleScroll.clientHeight), 0, 1);
    invalidate();
  }, { passive: true });
  reducedMotion.addEventListener('change', () => {
    setPaused(reducedMotion.matches || state.userPaused, true);
    if (reducedMotion.matches) {
      world.pointer.x = world.pointer.y = 0;
      if (scene.transitioning) { scene.mix = scene.target; scene.transitioning = false; finishScene(); }
      if (harbor.transitioning) { harbor.mix = harbor.target; harbor.pageMix = harbor.target; harbor.cruise = harbor.cruiseTarget; harbor.paging = false; harbor.transitioning = false; finishFriends(); }
    }
    invalidate();
  });
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf); raf = 0; last = 0; governor.restart();
    if (!document.hidden) { if (state.automatic) setTheme('auto'); invalidate(); }
  });
  setInterval(() => { if (state.automatic && weatherTheme() !== state.theme) setTheme('auto'); }, 30000);
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true; cancelAnimationFrame(raf); raf = 0; $('error').hidden = false; });
  canvas.addEventListener('webglcontextrestored', () => location.reload());
  new ResizeObserver(measure).observe(root);
  document.addEventListener('wordsea:viewport', measure);
  if (coarse.matches) { const hint = $('hint'); if (hint) hint.textContent = '轻触海面，泛起涟漪'; }

  // ——— Public interface for the other modules and for browser tools ———
  window.wordSea = {
    setWeather,
    setScene: (mode, animate = true) => setScene(mode === 'sea' ? null : mode, animate),
    setFriends: bindFriends,
    getState: () => ({
      theme: PRESETS[state.theme].label, automatic: state.automatic, wind: world.wind, density: world.density,
      windDir: [+world.frame.sea.windDir[0].toFixed(3), +world.frame.sea.windDir[1].toFixed(3)],
      paused: world.paused, clouds: world.cloudsTarget > .5, time: world.time, frames, scale: +governor.scale.toFixed(2),
      quality: quality.config.name, software, antialias: renderer.caps.antialias,
      words: SEA_WORDS.length, ripples: world.ripples.length,
      scene: scene.target ? 'article' : harbor.target ? 'friends' : 'sea', article: scene.article,
      transitioning: scene.transitioning || harbor.transitioning, transition: scene.mix, passageFrames: scene.frames,
      friendsTransition: harbor.mix, travel: harbor.cruise, friendHover: harbor.hover, beaconFrames: harbor.frames,
      moonPhase: moonPhaseInfo(world.frame.atmosphere.moonPhase),
      aurora: world.aurora > 0,
      wildlife: { gulls: wildlife.gullCount, leaps: wildlife.activeLeaps },
      weather: state.observation ? { code: state.observation.code, preview: Boolean(state.observation.preview), ...world.weather, wind: world.waveWind } : null,
    }),
  };
  if (document.modelContext?.registerTool) registerTool({ setTheme, setRange, setPaused, setClouds, state, world });

  setPaused(world.paused, true);
  setTheme(state.automatic ? 'auto' : state.theme, false);
  setRange('wind', config.wind); setRange('density', config.density);
  bindFriends(config.friends, config.friendsPage);
  applyQuality({ initial: true });
  measure();
  setScene(config.scene === 'sea' ? null : config.scene, false);
  if (config.scene === 'article') requestQuotes();
  document.body.classList.add('effects-ready');
}

function registerTool({ setTheme, setRange, setPaused, setClouds, state, world }) {
  const lifecycle = new AbortController();
  try {
    Promise.resolve(document.modelContext.registerTool({
      name: 'configure_word_ocean', title: '调节文字海洋',
      description: 'Set the visible ocean controls: lighting, wave strength, word density, animation pause and word clouds.',
      inputSchema: { type: 'object', properties: { theme: { type: 'string', enum: [...Object.keys(PRESETS), 'auto', 'dawn'] }, wind: { type: 'number', minimum: 0, maximum: 100 }, density: { type: 'number', minimum: 30, maximum: 100 }, paused: { type: 'boolean' }, clouds: { type: 'boolean' } }, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected an object.');
        for (const [key, value] of Object.entries(input)) {
          if (!['theme', 'wind', 'density', 'paused', 'clouds'].includes(key)) throw new Error('Unknown setting.');
          if (key === 'theme' && value !== 'auto' && value !== 'dawn' && !Object.hasOwn(PRESETS, value)) throw new Error('Unknown theme.');
          if ((key === 'wind' || key === 'density') && (typeof value !== 'number' || !Number.isFinite(value) || value < (key === 'density' ? 30 : 0) || value > 100)) throw new Error('Setting outside allowed range.');
          if ((key === 'paused' || key === 'clouds') && typeof value !== 'boolean') throw new Error('Expected a boolean.');
        }
        if (input.theme !== undefined) setTheme(input.theme);
        for (const key of ['wind', 'density']) if (input[key] !== undefined) setRange(key, input[key]);
        if (input.paused !== undefined) setPaused(input.paused);
        if (input.clouds !== undefined) setClouds(input.clouds);
        return { theme: state.theme, automatic: state.automatic, wind: world.wind * 100, density: world.density * 100, paused: world.paused, clouds: world.cloudsTarget > .5 };
      },
    }, { signal: lifecycle.signal })).catch(error => console.warn('Optional browser controls unavailable:', error.message));
  } catch (error) { console.warn('Optional browser controls unavailable:', error.message); }
  addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
