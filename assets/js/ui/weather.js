export default function setup() {
  const scene = window.wordSea,
    config = JSON.parse(document.getElementById('wordsea-config').textContent);
  const entry = document.getElementById('weather-open'),
    summary = document.getElementById('weather-summary');
  if (!scene?.setWeather) {
    entry.hidden = true;
    return;
  }
  const options = config.weather || { mode: 'auto', city: '' },
    ttl = 20 * 60 * 1000;
  const storage = {
    get(key, session = false) {
      try {
        return JSON.parse((session ? sessionStorage : localStorage).getItem(key));
      } catch {
        return null;
      }
    },
    set(key, value, session = false) {
      try {
        (session ? sessionStorage : localStorage).setItem(key, JSON.stringify(value));
      } catch {}
    },
  };
  const preference = storage.get('wordsea-weather-enabled');
  let enabled = typeof preference === 'boolean' ? preference : options.mode !== 'off';
  let place = null,
    actual = null,
    preview = 'live',
    started = false,
    generation = 0,
    request = null,
    searchRequest = null;
  const names = {
    0: '晴',
    1: '晴间多云',
    2: '多云',
    3: '阴天',
    45: '雾',
    48: '冻雾',
    51: '小毛雨',
    53: '毛雨',
    55: '密集毛雨',
    56: '冻毛雨',
    57: '冻毛雨',
    61: '小雨',
    63: '雨',
    65: '大雨',
    66: '冻雨',
    67: '冻雨',
    71: '小雪',
    73: '雪',
    75: '大雪',
    77: '雪粒',
    80: '阵雨',
    81: '阵雨',
    82: '强阵雨',
    85: '阵雪',
    86: '大阵雪',
    95: '雷雨',
    96: '雷雨伴冰雹',
    97: '强雷雨',
    99: '雷雨伴冰雹',
  };
  const demos = {
    clear: { code: 0, cloud: 3, rain: 0, snow: 0, wind: 7 },
    cloudy: { code: 2, cloud: 65, rain: 0, snow: 0, wind: 12 },
    overcast: { code: 3, cloud: 100, rain: 0, snow: 0, wind: 18 },
    rain: { code: 63, cloud: 96, rain: 4.5, snow: 0, wind: 23 },
    snow: { code: 73, cloud: 88, rain: 0, snow: 0.9, wind: 9 },
    fog: { code: 45, cloud: 94, rain: 0, snow: 0, wind: 4 },
    storm: { code: 95, cloud: 100, rain: 11, snow: 0, wind: 46 },
  };
  const dialog = document.createElement('dialog');
  dialog.id = 'weather-dialog';
  dialog.className = 'weather-dialog';
  dialog.setAttribute('aria-labelledby', 'weather-title');
  dialog.innerHTML =
    '<div class="weather-heading"><h2 id="weather-title">窗外的天气，海上的风</h2><button type="button" class="weather-close" aria-label="关闭天气设置">×</button></div><p class="weather-description">让这片字海，与你所在的地方共享阴晴。</p><label class="weather-toggle"><input id="weather-enabled" type="checkbox">跟随天气</label><form class="weather-search"><label for="weather-city">选择城市<input id="weather-city" type="search" placeholder="例如 成都、上海、Tokyo" autocomplete="off" maxlength="80"></label><button type="submit">查找</button></form><ul class="weather-results" aria-label="匹配的城市"></ul><div class="weather-location-actions"><button type="button" id="weather-locate">使用我的位置</button><button type="button" id="weather-ip">按 IP 估算城市</button><button type="button" id="weather-refresh">更新天气</button></div><p class="weather-location-note">定位只在你点击时申请，取一次位置，按附近区域查询。</p><p id="weather-status" class="weather-status" role="status" aria-live="polite"></p><label class="weather-preview" for="weather-preview">天气体验<select id="weather-preview"><option value="live">跟随实况</option><option value="clear">晴天</option><option value="cloudy">多云</option><option value="overcast">阴天</option><option value="rain">雨</option><option value="snow">雪</option><option value="fog">雾</option><option value="storm">雷雨</option></select></label><p class="weather-preview-note">体验模式只改变字海氛围，切回「跟随实况」恢复当地天气。</p><div class="weather-attribution">天气：<a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a><small>城市：<a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a> · IP 位置估算：<a href="https://ipwhois.io/" target="_blank" rel="noopener noreferrer">ipwho.is</a></small></div>';
  document.body.append(dialog);
  const toggle = dialog.querySelector('#weather-enabled'),
    status = dialog.querySelector('#weather-status'),
    form = dialog.querySelector('form'),
    input = dialog.querySelector('#weather-city'),
    results = dialog.querySelector('.weather-results'),
    select = dialog.querySelector('select');
  toggle.checked = enabled;
  function message(text) {
    status.textContent = text;
  }
  function validPlace(value) {
    return (
      value &&
      Number.isFinite(value.latitude) &&
      Math.abs(value.latitude) <= 90 &&
      Number.isFinite(value.longitude) &&
      Math.abs(value.longitude) <= 180 &&
      typeof value.name === 'string' &&
      value.name.length <= 160
    );
  }
  function roundedPlace(value) {
    return {
      latitude: Math.round(value.latitude * 100) / 100,
      longitude: Math.round(value.longitude * 100) / 100,
      name: value.name.slice(0, 160),
      source: value.source || 'city',
      saved: Date.now(),
    };
  }
  function cacheKey(p) {
    return 'wordsea-weather:' + p.latitude + ',' + p.longitude;
  }
  function validWeather(value) {
    return (
      value &&
      Number.isFinite(value.code) &&
      Number.isFinite(value.cloud) &&
      Number.isFinite(value.wind) &&
      Number.isFinite(value.fetched)
    );
  }
  function caption() {
    if (!enabled) {
      summary.textContent = '天气已关闭 · 点击设置';
      return;
    }
    if (preview !== 'live') {
      summary.textContent = names[demos[preview].code] + ' · 天气体验';
      return;
    }
    if (!actual) {
      summary.textContent = place ? place.name + ' · 等待天气' : '让字海跟随天气';
      return;
    }
    summary.textContent =
      place.name +
      ' · ' +
      (names[actual.code] || '天气') +
      (Number.isFinite(actual.temperature) ? ' ' + Math.round(actual.temperature) + '°' : '');
  }
  function apply() {
    if (!enabled) {
      scene.setWeather(null);
      caption();
      return;
    }
    const sample =
      preview === 'live'
        ? actual
        : { ...(actual || {}), ...demos[preview], direction: actual?.direction ?? 235, preview: true };
    scene.setWeather(sample);
    caption();
  }
  function cancel() {
    generation++;
    request?.abort();
    request = null;
  }
  async function json(url, signal) {
    const controller = new AbortController(),
      abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 10000);
    try {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const response = await fetch(url, {
        signal: controller.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (data.error || data.success === false) throw new Error('Service unavailable');
      return data;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  function weatherFrom(data) {
    const c = data.current;
    if (!c || !Number.isFinite(c.weather_code) || !Number.isFinite(c.cloud_cover) || !Number.isFinite(c.wind_speed_10m))
      throw new Error('Incomplete weather');
    const snowCodes = [71, 73, 75, 77, 85, 86],
      snowy = snowCodes.includes(c.weather_code),
      hours = 3600 / Math.max(1, c.interval || 900);
    return {
      code: c.weather_code,
      cloud: Math.max(0, Math.min(100, c.cloud_cover)),
      rain: snowy
        ? Math.max(0, (c.rain || 0) + (c.showers || 0)) * hours
        : Math.max(0, (c.rain || 0) + (c.showers || 0), c.precipitation || 0) * hours,
      snow: Math.max(0, c.snowfall || 0) * hours,
      wind: Math.max(0, c.wind_speed_10m),
      direction: c.wind_direction_10m || 0,
      temperature: c.temperature_2m,
      isDay: c.is_day,
      observed: c.time,
      timezone: data.timezone,
      sunrise: data.daily?.sunrise || [],
      sunset: data.daily?.sunset || [],
      fetched: Date.now(),
    };
  }
  function describe(data, stale = false) {
    const updated = new Date(data.observed * 1000);
    let time = '';
    try {
      time = new Intl.DateTimeFormat('zh-CN', {
        timeZone: data.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(updated);
    } catch {}
    message(
      place.name +
        ' · ' +
        (names[data.code] || '天气') +
        ' · 风速 ' +
        Math.round(data.wind) +
        ' km/h' +
        (time ? ' · ' + time + ' 更新' : '') +
        (place.source === 'ip' ? ' · IP 估算位置' : '') +
        (stale ? ' · 更新暂缓，沿用上一份天气' : ''),
    );
  }
  async function refresh(force = false) {
    if (!place || !enabled) return;
    cancel();
    const version = generation,
      p = place,
      cached = storage.get(cacheKey(p), p.source !== 'city');
    if (!force && validWeather(cached) && Date.now() - cached.fetched < ttl) {
      actual = cached;
      apply();
      describe(actual);
      return;
    }
    const controller = new AbortController();
    request = controller;
    message('正在听 ' + p.name + ' 的风……');
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({
      latitude: String(p.latitude),
      longitude: String(p.longitude),
      current:
        'weather_code,cloud_cover,precipitation,rain,showers,snowfall,wind_speed_10m,wind_direction_10m,temperature_2m,is_day',
      daily: 'sunrise,sunset',
      forecast_days: '2',
      timezone: 'auto',
      timeformat: 'unixtime',
      wind_speed_unit: 'kmh',
    });
    try {
      const data = weatherFrom(await json(url, controller.signal));
      if (version !== generation || !enabled) return;
      actual = data;
      storage.set(cacheKey(p), data, p.source !== 'city');
      apply();
      describe(data);
    } catch {
      if (version !== generation || !enabled) return;
      if (validWeather(cached) && Date.now() - cached.fetched < 2 * 60 * 60 * 1000) {
        actual = cached;
        apply();
        describe(cached, true);
      } else {
        actual = null;
        apply();
        message('暂时听不到当地的天气。字海照常流动，可以稍后更新或先体验其他天气。');
      }
    } finally {
      if (version === generation) request = null;
    }
  }
  async function choose(value) {
    if (!validPlace(value)) return;
    cancel();
    place = roundedPlace(value);
    enabled = true;
    toggle.checked = true;
    storage.set('wordsea-weather-enabled', true);
    // City choices persist; device/IP coordinates stay in this browser session only.
    storage.set('wordsea-weather-place', place, place.source !== 'city');
    if (place.source !== 'city') storage.set('wordsea-weather-place', null);
    else storage.set('wordsea-weather-place', null, true);
    results.replaceChildren();
    if (preview === 'live') caption();
    else apply();
    await refresh();
  }
  async function lookup(name, signal) {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.search = new URLSearchParams({ name, count: '6', language: 'zh', format: 'json' });
    return (await json(url, signal)).results || [];
  }
  function matchesLocalZone(p) {
    if (!p || !Number.isFinite(p.longitude)) return false;
    const localOffset = -new Date().getTimezoneOffset() / 60;
    const diff = Math.abs((((p.longitude / 15 - localOffset) % 24) + 36) % 24 - 12);
    return diff <= 3.5;
  }
  const TIMEZONE_PLACES = {
    'Asia/Shanghai': { latitude: 30.67, longitude: 104.06, name: '成都' },
    'Asia/Chongqing': { latitude: 30.67, longitude: 104.06, name: '成都' },
    'Asia/Harbin': { latitude: 45.75, longitude: 126.65, name: '哈尔滨' },
    'Asia/Urumqi': { latitude: 43.82, longitude: 87.62, name: '乌鲁木齐' },
    'Asia/Hong_Kong': { latitude: 22.32, longitude: 114.17, name: '香港' },
    'Asia/Taipei': { latitude: 25.03, longitude: 121.57, name: '台北' },
    'Asia/Tokyo': { latitude: 35.68, longitude: 139.69, name: 'Tokyo' },
    'Asia/Seoul': { latitude: 37.57, longitude: 126.98, name: 'Seoul' },
    'Asia/Singapore': { latitude: 1.35, longitude: 103.82, name: 'Singapore' },
    'Europe/London': { latitude: 51.51, longitude: -0.13, name: 'London' },
    'America/New_York': { latitude: 40.71, longitude: -74.01, name: 'New York' },
    'America/Los_Angeles': { latitude: 34.05, longitude: -118.24, name: 'Los Angeles' },
  };
  async function estimate() {
    cancel();
    const version = generation,
      controller = new AbortController();
    request = controller;
    message('正在估算附近的城市……');
    try {
      let candidate = null;
      try {
        const p = await json('https://get.geojs.io/v1/ip/geo.json', controller.signal);
        if (version !== generation) return;
        const parsed = { latitude: Number(p.latitude), longitude: Number(p.longitude), name: p.city || p.region || p.country };
        if (validPlace(parsed) && matchesLocalZone(parsed)) candidate = parsed;
      } catch (error) {
        if (error?.name === 'AbortError' || controller.signal.aborted || version !== generation) throw error;
      }
      if (!candidate) {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const fallback = TIMEZONE_PLACES[tz];
        if (validPlace(fallback)) candidate = fallback;
      }
      if (!candidate) throw new Error('No place');
      await choose({ ...candidate, source: 'ip' });
    } catch {
      if (version === generation) message('暂时无法估算城市。输入城市名，或点击「使用我的位置」。');
    } finally {
      if (version === generation) request = null;
    }
  }
  async function start() {
    if (started || !enabled) return;
    started = true;
    const saved = storage.get('wordsea-weather-place') || storage.get('wordsea-weather-place', true);
    if (validPlace(saved) && (saved.source !== 'ip' || matchesLocalZone(saved)) && (saved.source === 'city' || Date.now() - saved.saved < 4 * 60 * 60 * 1000)) {
      place = roundedPlace(saved);
      await refresh();
      return;
    }
    if (options.city) {
      const version = generation;
      try {
        const list = await lookup(options.city);
        if (version !== generation || !enabled) return;
        if (list.length) {
          const p = list[0];
          await choose({ ...p, name: p.name, source: 'city' });
          return;
        }
      } catch {
        if (version !== generation || !enabled) return;
      }
    }
    if (!enabled) return;
    if (options.mode === 'auto') await estimate();
    else message('选择一个城市，让字海与它共享天气。');
  }
  entry.addEventListener('click', () => {
    if (!dialog.open) dialog.showModal();
  });
  dialog.querySelector('.weather-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)
        dialog.close();
    }
  });
  document.addEventListener('wordsea:before-navigate', () => dialog.close());
  toggle.addEventListener('change', () => {
    enabled = toggle.checked;
    storage.set('wordsea-weather-enabled', enabled);
    cancel();
    apply();
    if (enabled) {
      if (place) refresh();
      else {
        started = false;
        start();
      }
    } else message('天气已关闭，保留你选择的时段与风浪。');
  });
  select.addEventListener('change', () => {
    preview = select.value;
    enabled = true;
    toggle.checked = true;
    storage.set('wordsea-weather-enabled', true);
    apply();
    if (preview === 'live' && !actual) {
      if (place) refresh();
      else {
        started = false;
        start();
      }
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (name.length < 2) {
      message('请输入至少两个字的城市名称。');
      return;
    }
    searchRequest?.abort();
    const controller = new AbortController();
    searchRequest = controller;
    const button = form.querySelector('button');
    button.disabled = true;
    results.replaceChildren();
    message('正在寻找 ' + name + '……');
    try {
      const list = await lookup(name, controller.signal);
      if (searchRequest !== controller) return;
      if (!list.length) {
        message('没有找到这个城市，试试完整名称或英文名。');
        return;
      }
      for (const p of list) {
        if (!validPlace({ ...p, name: p.name })) continue;
        const li = document.createElement('li'),
          b = document.createElement('button');
        b.type = 'button';
        b.textContent = [p.name, p.admin2, p.admin1, p.country]
          .filter((s, i, a) => s && a.indexOf(s) === i)
          .join(' · ');
        b.addEventListener('click', () => choose({ ...p, name: p.name, source: 'city' }));
        li.append(b);
        results.append(li);
      }
      message('选择你所在的城市。');
    } catch {
      if (searchRequest === controller) message('城市搜索暂时不可用，请稍后再试，或使用定位。');
    } finally {
      if (searchRequest === controller) {
        button.disabled = false;
        searchRequest = null;
      }
    }
  });
  dialog.querySelector('#weather-locate').addEventListener('click', () => {
    if (!navigator.geolocation) {
      message('这个浏览器暂不支持定位，请手动选择城市。');
      return;
    }
    cancel();
    const version = generation;
    message('等待你允许使用当前位置……');
    navigator.geolocation.getCurrentPosition(
      position => {
        if (version === generation)
          choose({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            name: '附近',
            source: 'gps',
          });
      },
      () => {
        if (version === generation) message('没有取得位置。你仍然可以手动选择城市。');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 15 * 60 * 1000 },
    );
  });
  dialog.querySelector('#weather-ip').addEventListener('click', estimate);
  dialog.querySelector('#weather-refresh').addEventListener('click', () => {
    if (place) refresh(true);
    else message('先选择城市或取得位置，再更新天气。');
  });
  function resume() {
    if (document.hidden || scene.getState().scene === 'article') return;
    if (!started) start();
    else if (enabled && place && (!actual || Date.now() - actual.fetched >= ttl)) refresh();
  }
  document.addEventListener('visibilitychange', resume);
  document.addEventListener('wordsea:sea-ready', resume);
  setInterval(resume, ttl);
  caption();
  if (!enabled) message('天气已关闭，可随时开启或体验不同天气。');
  if (config.scene !== 'article') start();
}
