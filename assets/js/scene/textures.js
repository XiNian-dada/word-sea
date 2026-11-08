import { random } from '../core/math.js';

/** Tileable value noise: four independent channels of seeded random bytes. */
export function noisePixels(size = 256, seed = 7613) {
  const rand = random(seed), data = new Uint8Array(size * size * 4);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rand() * 256);
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
