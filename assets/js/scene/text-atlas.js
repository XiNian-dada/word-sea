// Builds the lettering textures as signed distance fields, so words stay crisp
// when the camera is close and dissolve smoothly when far away. The file is
// self-contained: it runs as a module worker and can also be imported directly.

const INF = 1e20;

function makeCanvas(size) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(size, size);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return canvas;
}

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// Felzenszwalb & Huttenlocher squared distance transform along one line.
function edt1d(grid, offset, stride, length, f, v, z) {
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 0; q < length; q++) f[q] = grid[offset + q * stride];
  for (let q = 1, k = 0, s = 0; q < length; q++) {
    do {
      const r = v[k];
      s = (f[q] - f[r] + q * q - r * r) / (q - r) / 2;
    } while (s <= z[k] && --k > -1);
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    grid[offset + q * stride] = f[r] + (q - r) * (q - r);
  }
}

function edt(grid, size, f, v, z) {
  for (let x = 0; x < size; x++) edt1d(grid, x, size, size, f, v, z);
  for (let y = 0; y < size; y++) edt1d(grid, y * size, 1, size, f, v, z);
}

/**
 * Converts antialiased coverage (one byte per pixel at `channel` of RGBA data)
 * into a distance field written to `out` at `outChannel`. 0.5 is the outline.
 */
function signedDistance(rgba, channel, size, radius, out, outChannel) {
  const count = size * size;
  const outer = new Float32Array(count), inner = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = rgba[i * 4 + channel] / 255;
    if (a >= 1) { outer[i] = 0; inner[i] = INF; }
    else if (a <= 0) { outer[i] = INF; inner[i] = 0; }
    else {
      const d = .5 - a;
      outer[i] = d > 0 ? d * d : 0;
      inner[i] = d < 0 ? d * d : 0;
    }
  }
  const f = new Float32Array(size), v = new Uint16Array(size), z = new Float32Array(size + 1);
  edt(outer, size, f, v, z);
  edt(inner, size, f, v, z);
  for (let i = 0; i < count; i++) {
    const d = Math.sqrt(outer[i]) - Math.sqrt(inner[i]);
    out[i * 4 + outChannel] = Math.max(0, Math.min(255, Math.round(255 * (.5 - d / (2 * radius)))));
  }
}

const SEA_FONT = '"Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", "Times New Roman", "Noto Serif", serif';

/**
 * Packs rotated words at random, wrapping on both axes so the tile repeats
 * seamlessly. Coverage goes to R, a per-word tone (for the density control)
 * goes to G as a dilated area.
 */
function packWords(ctx, size, words, seed, sizes, gap, radius) {
  const rand = random(seed);
  const cells = 32, cell = size / cells;
  const buckets = Array.from({ length: cells * cells }, () => []);
  const metrics = new Map();
  const key = (x, y) => ((y % cells + cells) % cells) * cells + (x % cells + cells) % cells;
  const keysFor = b => {
    const keys = [];
    for (let y = Math.floor((b.y - b.ry) / cell); y <= Math.floor((b.y + b.ry) / cell); y++)
      for (let x = Math.floor((b.x - b.rx) / cell); x <= Math.floor((b.x + b.rx) / cell); x++) keys.push(key(x, y));
    return keys;
  };
  const overlaps = (a, b) => {
    let dx = b.x - a.x, dy = b.y - a.y;
    dx -= size * Math.round(dx / size); dy -= size * Math.round(dy / size);
    if (Math.abs(dx) >= a.rx + b.rx || Math.abs(dy) >= a.ry + b.ry) return false;
    for (const [x, y] of [[a.c, a.s], [-a.s, a.c], [b.c, b.s], [-b.s, b.c]]) {
      const ra = a.hw * Math.abs(x * a.c + y * a.s) + a.hh * Math.abs(-x * a.s + y * a.c);
      const rb = b.hw * Math.abs(x * b.c + y * b.s) + b.hh * Math.abs(-x * b.s + y * b.c);
      if (Math.abs(dx * x + dy * y) >= ra + rb) return false;
    }
    return true;
  };
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  let placed = 0;
  for (const [base, attempts] of sizes) {
    for (let i = 0; i < attempts; i++) {
      const word = words[Math.floor(rand() * words.length)];
      const fontSize = Math.round(base * (.9 + Math.floor(rand() * 3) * .08));
      const font = `600 ${fontSize}px ${SEA_FONT}`;
      const mk = font + word;
      ctx.font = font;
      if (!metrics.has(mk)) metrics.set(mk, ctx.measureText(word));
      const m = metrics.get(mk);
      const angle = (rand() - .5) * .42, c = Math.cos(angle), s = Math.sin(angle);
      const hw = (m.actualBoundingBoxLeft + m.actualBoundingBoxRight + gap) / 2;
      const hh = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent + gap) / 2;
      const b = { x: rand() * size, y: rand() * size, c, s, hw, hh, rx: Math.abs(c) * hw + Math.abs(s) * hh, ry: Math.abs(s) * hw + Math.abs(c) * hh };
      const keys = keysFor(b);
      let blocked = false;
      for (const k of keys) { for (const other of buckets[k]) if (overlaps(b, other)) { blocked = true; break; } if (blocked) break; }
      if (blocked) continue;
      for (const k of keys) buckets[k].push(b);
      const tone = 8 + Math.floor(rand() * 240);
      const ox0 = (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2, oy0 = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
      for (const oy of [-size, 0, size]) for (const ox of [-size, 0, size]) {
        if (b.x + ox + b.rx + radius < 0 || b.x + ox - b.rx - radius > size || b.y + oy + b.ry + radius < 0 || b.y + oy - b.ry - radius > size) continue;
        ctx.save(); ctx.translate(b.x + ox, b.y + oy); ctx.rotate(angle);
        // The tone halo covers the distance field's spread around the word.
        ctx.strokeStyle = ctx.fillStyle = `rgb(0,${tone},0)`;
        ctx.globalCompositeOperation = 'lighten';
        ctx.lineWidth = radius * 2;
        ctx.strokeText(word, ox0, oy0);
        ctx.fillStyle = `rgb(255,${tone},0)`;
        ctx.fillText(word, ox0, oy0);
        ctx.restore();
      }
      placed++;
    }
  }
  return placed;
}

export function buildSeaAtlas({ size = 2048, seaWords, cloudWords, seed = 9237 }) {
  const canvas = makeCanvas(size), ctx = canvas.getContext('2d', { willReadFrequently: true });
  const scale = size / 2048, radius = 7 * scale;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
  packWords(ctx, size, seaWords, seed, [[64, 2600], [55, 5200], [47, 9000], [40, 14000]].map(([s, n]) => [s * scale, n]), 9 * scale, radius);
  const sea = ctx.getImageData(0, 0, size, size).data;
  const out = new Uint8Array(size * size * 4);
  signedDistance(sea, 0, size, radius, out, 0);
  for (let i = 0; i < size * size; i++) out[i * 4 + 1] = sea[i * 4 + 1];
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
  packWords(ctx, size, cloudWords, seed + 811, [[46, 2600], [38, 5200], [31, 9000], [26, 12000]].map(([s, n]) => [s * scale, n]), 12 * scale, radius);
  const cloud = ctx.getImageData(0, 0, size, size).data;
  signedDistance(cloud, 0, size, radius, out, 2);
  for (let i = 0; i < size * size; i++) out[i * 4 + 3] = cloud[i * 4 + 1];
  return out;
}

const QUOTE_FONT = size => `${size}px "Songti SC", "Noto Serif CJK SC", "Hiragino Mincho ProN", "Times New Roman", "Noto Serif", serif`;

/**
 * Columns of complete quotations for the corridor walls. R: distance field,
 * G: a reveal priority per repetition. Returns the column layout for picking.
 */
export function buildQuoteAtlas({ size = 2048, quotes, seed = 10927 }) {
  const canvas = makeCanvas(size), ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rand = random(seed), scale = size / 2048, radius = 6 * scale;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  const columns = [];
  let order = [], occupied = 0;
  for (;;) {
    if (!order.length) {
      order = quotes.slice();
      for (let j = order.length - 1; j > 0; j--) { const k = Math.floor(rand() * (j + 1)); [order[j], order[k]] = [order[k], order[j]]; }
    }
    const quote = order.pop(), vertical = quote.lang === 'zh' || quote.lang === 'ja';
    const text = quote.text + ' · ' + quote.author + ' · ', chars = Array.from(text);
    let fontSize = (19 + rand() * 4) * scale;
    ctx.font = QUOTE_FONT(fontSize);
    const runOf = () => {
      if (vertical) return chars.length * fontSize * 1.16;
      const m = ctx.measureText(text);
      return m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    };
    let run = runOf();
    const repeats = Math.max(1, Math.round(size / (run + fontSize * 1.6))), period = size / repeats;
    // Fit complete quotations into the repeat by choosing the font size, never by stretching.
    fontSize *= period / (run + fontSize * 1.6);
    ctx.font = QUOTE_FONT(fontSize);
    const metric = ctx.measureText(text);
    const glyphMetrics = vertical ? chars.map(ch => ctx.measureText(ch)) : [];
    const inkWidth = vertical ? Math.max(...glyphMetrics.map(m => m.actualBoundingBoxLeft + m.actualBoundingBoxRight)) : metric.actualBoundingBoxAscent + metric.actualBoundingBoxDescent;
    const gutter = (7 + rand() * 3) * scale;
    if (occupied + inkWidth + gutter > size) break;
    run = runOf();
    columns.push({ quote, fontSize, chars, vertical, metric, glyphMetrics, inkWidth, run, repeats, period, gutter, start: -rand() * period, step: fontSize * 1.16 });
    occupied += inkWidth + gutter;
  }
  const spare = (size - occupied) / columns.length;
  let left = 0;
  for (const column of columns) {
    const gap = column.gutter + spare;
    left += gap / 2; column.left = left;
    ctx.font = QUOTE_FONT(column.fontSize);
    for (let repeat = 0; repeat < column.repeats; repeat++) {
      const y = column.start + repeat * column.period;
      const priority = Math.floor((.05 + rand() * .9) * 255);
      ctx.fillStyle = `rgb(255,${priority},0)`;
      for (const offset of [-size, 0, size]) {
        if (y + offset + column.run < 0 || y + offset > size) continue;
        if (column.vertical) {
          for (let j = 0; j < column.chars.length; j++) {
            const m = column.glyphMetrics[j], w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
            const x = left + (column.inkWidth - w) / 2 + m.actualBoundingBoxLeft;
            const baseline = y + offset + (j + .5) * column.step + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
            ctx.fillText(column.chars[j], x, baseline);
          }
        } else {
          ctx.save(); ctx.translate(left + column.metric.actualBoundingBoxDescent, y + offset + column.metric.actualBoundingBoxLeft);
          ctx.rotate(Math.PI / 2); ctx.fillText(column.chars.join(''), 0, 0); ctx.restore();
        }
      }
    }
    left += column.inkWidth + gap / 2;
  }
  const raster = ctx.getImageData(0, 0, size, size).data;
  const out = new Uint8Array(size * size * 4);
  signedDistance(raster, 0, size, radius, out, 0);
  // Priority is carried by the coverage channel's colour; keep it beside the glyphs.
  for (let i = 0; i < size * size; i++) { out[i * 4 + 1] = raster[i * 4] ? Math.round(raster[i * 4 + 1] * 255 / raster[i * 4]) : 0; out[i * 4 + 3] = 255; }
  return {
    pixels: out,
    columns: columns.map(c => ({ id: c.quote.id, left: c.left, width: c.inkWidth, start: c.start, period: c.period, run: c.run })),
  };
}

// When loaded as a worker, build on request and transfer the pixels back.
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = ({ data }) => {
    try {
      if (data.kind === 'sea') {
        const pixels = buildSeaAtlas(data.options);
        self.postMessage({ id: data.id, pixels }, [pixels.buffer]);
      } else if (data.kind === 'quotes') {
        const result = buildQuoteAtlas(data.options);
        self.postMessage({ id: data.id, ...result }, [result.pixels.buffer]);
      }
    } catch (error) {
      self.postMessage({ id: data.id, error: String(error?.message || error) });
    }
  };
}
