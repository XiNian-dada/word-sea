import { random } from '../core/math.js';

/**
 * Tileable 256x256 four-channel noise table shared by stars, aurora, moon craters
 * and clouds: R is uniform value noise, G is a fixed offset of R for 1-tap 3D
 * sampling, B is normalized Perlin-Worley base cloud shape, and A is normalized
 * inverted Worley billow erosion detail.
 */
export function noisePixels(size = 256, seed = 7613) {
  const total = size * size;
  const rand = random(seed), data = new Uint8Array(total * 4);
  for (let i = 0; i < total; i++) data[i * 4] = Math.floor(rand() * 256);
  // Offset R by (37, 17) so .rg bilinear lookup yields two consecutive z slices in one tap.
  for (let y = 0; y < size; y++) {
    const sy = ((y + 17) % size) * size;
    const dy = y * size;
    for (let x = 0; x < size; x++) {
      data[(dy + x) * 4 + 1] = data[(sy + (x + 37) % size) * 4];
    }
  }

  const rawB = new Float32Array(total);
  const rawA = new Float32Array(total);

  // Periodic cubic-smoothstep 2D value FBM for organic large-scale cloud drift.
  for (const [freq, weight] of [[4, .52], [8, .26], [16, .14], [32, .08]]) {
    const lattice = new Float32Array(freq * freq);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
    const ix0 = new Int32Array(size), ix1 = new Int32Array(size), ux = new Float32Array(size);
    for (let x = 0; x < size; x++) {
      const u = (x / size) * freq, i = Math.floor(u), f = u - i;
      ix0[x] = i % freq; ix1[x] = (i + 1) % freq; ux[x] = f * f * (3 - 2 * f);
    }
    for (let y = 0; y < size; y++) {
      const v = (y / size) * freq, j = Math.floor(v), f = v - j;
      const iy0 = (j % freq) * freq, iy1 = ((j + 1) % freq) * freq, uy = f * f * (3 - 2 * f);
      const row = y * size;
      for (let x = 0; x < size; x++) {
        const a = lattice[iy0 + ix0[x]], b = lattice[iy0 + ix1[x]];
        const c = lattice[iy1 + ix0[x]], d = lattice[iy1 + ix1[x]];
        const n = a + (b - a) * ux[x] + (c - a + (a - b - c + d) * ux[x]) * uy;
        rawB[row + x] += n * weight * .52;
      }
    }
  }

  // Accumulate tileable inverted Worley cellular lobes using a 1-cell padded grid so
  // edge-wrapping requires zero modulo ops inside the pixel loop.
  const accumulateWorley = (out, octaves, scale, worleySeed) => {
    const wRand = random(worleySeed);
    for (const [cells, weight] of octaves) {
      const baseX = new Float32Array(cells * cells), baseY = new Float32Array(cells * cells);
      for (let i = 0; i < baseX.length; i++) { baseX[i] = wRand(); baseY[i] = wRand(); }
      const stride = cells + 2;
      const fx = new Float32Array(stride * stride), fy = new Float32Array(stride * stride);
      for (let py = 0; py < stride; py++) {
        const wy = py - 1, sy = ((wy % cells) + cells) % cells;
        for (let px = 0; px < stride; px++) {
          const wx = px - 1, sx = ((wx % cells) + cells) % cells;
          const si = sy * cells + sx, di = py * stride + px;
          fx[di] = wx + baseX[si];
          fy[di] = wy + baseY[si];
        }
      }
      const step = cells / size, mul = weight * scale;
      for (let y = 0; y < size; y++) {
        const gy = y * step, cy = Math.floor(gy), row = y * size;
        const r0 = cy * stride, r1 = r0 + stride, r2 = r1 + stride;
        for (let x = 0; x < size; x++) {
          const gx = x * step, cx = Math.floor(gx);
          const i0 = r0 + cx, i1 = r1 + cx, i2 = r2 + cx;
          let d0 = fx[i0] - gx, d1 = fy[i0] - gy, m = d0 * d0 + d1 * d1;
          d0 = fx[i0 + 1] - gx; d1 = fy[i0 + 1] - gy; let d = d0 * d0 + d1 * d1; if (d < m) m = d;
          d0 = fx[i0 + 2] - gx; d1 = fy[i0 + 2] - gy; d = d0 * d0 + d1 * d1; if (d < m) m = d;
          d0 = fx[i1] - gx; d1 = fy[i1] - gy; d = d0 * d0 + d1 * d1; if (d < m) m = d;
          d0 = fx[i1 + 1] - gx; d1 = fy[i1 + 1] - gy; d = d0 * d0 + d1 * d1; if (d < m) m = d;
          d0 = fx[i1 + 2] - gx; d1 = fy[i1 + 2] - gy; d = d0 * d0 + d1 * d1; if (d < m) m = d;
          d0 = fx[i2] - gx; d1 = fy[i2] - gy; d = d0 * d0 + d1 * d1; if (d < m) m = d;
          d0 = fx[i2 + 1] - gx; d1 = fy[i2 + 1] - gy; d = d0 * d0 + d1 * d1; if (d < m) m = d;
          d0 = fx[i2 + 2] - gx; d1 = fy[i2 + 2] - gy; d = d0 * d0 + d1 * d1; if (d < m) m = d;
          const lobe = 1 - Math.sqrt(m);
          if (lobe > 0) out[row + x] += lobe * mul;
        }
      }
    }
  };

  accumulateWorley(rawB, [[5, .58], [10, .28], [20, .14]], .48, seed + 1931);
  accumulateWorley(rawA, [[8, .56], [16, .30], [32, .14]], 1, seed + 4999);

  const normalizeChannel = (src, channelOffset) => {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < total; i++) {
      const v = src[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const span = max - min || 1;
    // Trim extreme 0.5% tails via a 512-bin histogram so rare extrema don't crush cloud contrast.
    const bins = new Int32Array(512);
    for (let i = 0; i < total; i++) bins[Math.min(511, ((src[i] - min) / span * 511) | 0)]++;
    const cut = total * .005;
    let loBin = 0, hiBin = 511, count = 0;
    for (let b = 0; b < 512; b++) { count += bins[b]; if (count >= cut) { loBin = b; break; } }
    count = 0;
    for (let b = 511; b >= 0; b--) { count += bins[b]; if (count >= cut) { hiBin = b; break; } }
    const lo = min + (loBin / 511) * span;
    const hi = min + (hiBin / 511) * span;
    const range = hi - lo || span;
    for (let i = 0; i < total; i++) {
      const t = (src[i] - lo) / range;
      data[i * 4 + channelOffset] = t <= 0 ? 0 : t >= 1 ? 255 : Math.round(t * 255);
    }
  };
  normalizeChannel(rawB, 2);
  normalizeChannel(rawA, 3);
  return data;
}

/**
 * Small-scale water: a sum of short waves with integer wave numbers, so the
 * tile repeats exactly. Stores the slope (∂h/∂x, ∂h/∂z) in RG around 0.5.
 */
export function detailNormalPixels(size = 256, seed = 4111) {
  const rand = random(seed), waves = [];
  for (let i = 0; i < 28; i++) {
    const angle = (rand() - .5) * Math.PI * 1.25 - Math.PI / 2;
    const frequency = 2 + Math.floor(Math.pow(rand(), 1.6) * 14);
    const kx = Math.round(Math.cos(angle) * frequency), kz = Math.round(Math.sin(angle) * frequency);
    if (!kx && !kz) continue;
    const length = Math.hypot(kx, kz);
    waves.push({ kx, kz, amplitude: .9 / Math.pow(length, 1.25), phase: rand() * Math.PI * 2 });
  }
  const data = new Uint8Array(size * size * 4), dx = new Float32Array(size * size), dz = new Float32Array(size * size);
  let max = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let sx = 0, sz = 0;
    for (const w of waves) {
      const theta = (w.kx * x + w.kz * y) / size * Math.PI * 2 + w.phase;
      const c = Math.cos(theta) * w.amplitude;
      sx += c * w.kx; sz += c * w.kz;
    }
    const i = y * size + x;
    dx[i] = sx; dz[i] = sz;
    max = Math.max(max, Math.abs(sx), Math.abs(sz));
  }
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = Math.round((dx[i] / max * .5 + .5) * 255);
    data[i * 4 + 1] = Math.round((dz[i] / max * .5 + .5) * 255);
    data[i * 4 + 3] = 255;
  }
  return data;
}
