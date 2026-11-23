import { DEG, lerp, vec3 } from '../core/math.js';

// Six times of day. Light positions are given relative to the camera's view;
// colour comes from the scattering model, the rest is exposure and water tint.
export const PRESETS = {
  daybreak: {
    label: '破晓', light: 'sun', elevation: -1.1, azimuth: -22, power: 24, rayleigh: 1.05, mie: 1.1, mieG: .78,
    exposure: 3.2, water: [.010, .020, .042], ink: [.95, .82, .9], disc: .0125, stars: .5, fog: .0036, hour: 6,
    gradeShadow: [.92, .96, 1.10], gradeHighlight: [1.06, .98, .94], gradeSat: 1.08, gradeContrast: .18,
  },
  morning: {
    label: '清晨', light: 'sun', elevation: 9, azimuth: -24, power: 22, rayleigh: 1, mie: 1.0, mieG: .78,
    exposure: .42, water: [.006, .028, .046], ink: [.85, .95, 1], disc: .0115, stars: 0, fog: .0032, hour: 8,
    gradeShadow: [.94, 1.0, 1.06], gradeHighlight: [1.05, 1.0, .92], gradeSat: 1.05, gradeContrast: .15,
  },
  noon: {
    label: '正午', light: 'sun', elevation: 34, azimuth: -10, power: 22, rayleigh: 1, mie: .5, mieG: .76,
    exposure: .34, water: [.004, .032, .055], ink: [.85, .96, 1], disc: .011, stars: 0, fog: .0018, hour: 12,
    gradeShadow: [.92, 1.0, 1.08], gradeHighlight: [1.0, 1.0, 1.02], gradeSat: 1.12, gradeContrast: .14,
  },
  afternoon: {
    label: '午后', light: 'sun', elevation: 7, azimuth: -16, power: 22, rayleigh: 1, mie: 1.15, mieG: .78,
    exposure: .42, water: [.005, .026, .045], ink: [1, .94, .86], disc: .0115, stars: 0, fog: .003, hour: 15,
    gradeShadow: [.94, .98, 1.06], gradeHighlight: [1.06, .99, .90], gradeSat: 1.06, gradeContrast: .16,
  },
  sunset: {
    label: '夕照', light: 'sun', elevation: 1.25, azimuth: -4, power: 24, rayleigh: 1.1, mie: 1.7, mieG: .82,
    exposure: .38, water: [.012, .016, .036], ink: [1, .86, .8], disc: .0135, stars: .15, fog: .0034, hour: 18,
    gradeShadow: [.90, .94, 1.12], gradeHighlight: [1.06, .97, .88], gradeSat: 1.10, gradeContrast: .20,
  },
  night: {
    label: '月夜', light: 'moon', elevation: 11, azimuth: -12, power: .35, rayleigh: 1, mie: .45, mieG: .9,
    exposure: 4, water: [.010, .022, .045], ink: [.75, .86, 1], disc: .019, stars: 1, fog: .0032, hour: 22,
    gradeShadow: [.94, 1.0, 1.10], gradeHighlight: [.98, 1.0, 1.04], gradeSat: .95, gradeContrast: .12,
  },
};

export const themeAtHour = h => h >= 5 && h < 7 ? 'daybreak' : h >= 7 && h < 10 ? 'morning' : h >= 10 && h < 14 ? 'noon'
  : h >= 14 && h < 17 ? 'afternoon' : h >= 17 && h < 20 ? 'sunset' : 'night';

const R0 = 6360e3, R1 = 6420e3, HR = 7994, HM = 1200;
const BR = [5.8e-6, 13.5e-6, 33.1e-6], BM = 21e-6;
// Ozone: absorption only. Its column is folded onto the air's scale height, so
// the same optical depth carries both and no extra loop runs; the extra weight
// stands in for the high layer that twilight light still crosses.
const BO = [.65e-6 * 2.8, 1.881e-6 * 2.8, .085e-6 * 2.8];

function sphereFar(ox, oy, oz, dx, dy, dz, r) {
  const b = ox * dx + oy * dy + oz * dz, c = ox * ox + oy * oy + oz * oz - r * r, h = b * b - c;
  return h < 0 ? -1 : -b + Math.sqrt(h);
}
function sphereNear(ox, oy, oz, dx, dy, dz, r) {
  const b = ox * dx + oy * dy + oz * dz, c = ox * ox + oy * oy + oz * oz - r * r, h = b * b - c;
  return h < 0 ? -1 : -b - Math.sqrt(h);
}

/** Light transmitted from the sun to sea level (per channel, 0 … 1). */
export function transmittance(out, light, rayleigh, mie) {
  const oy = R0 + 20;
  if (sphereNear(0, oy, 0, light[0], light[1], light[2], R0 - 200) > 0) { out[0] = out[1] = out[2] = 0; return out; }
  const distance = sphereFar(0, oy, 0, light[0], light[1], light[2], R1), steps = 32, segment = distance / steps;
  let depthR = 0, depthM = 0;
  for (let i = 0; i < steps; i++) {
    const t = segment * (i + .5), x = light[0] * t, y = oy + light[1] * t, z = light[2] * t;
    const h = Math.max(Math.hypot(x, y, z) - R0, 0);
    depthR += Math.exp(-h / HR) * segment; depthM += Math.exp(-h / HM) * segment;
  }
  for (let c = 0; c < 3; c++) out[c] = Math.exp(-((BR[c] * rayleigh + BO[c]) * depthR + BM * mie * 1.1 * depthM));
  return out;
}

/** Sky radiance in one direction; mirrors the shader so ambient light matches. */
export function scatter(out, dir, light, power, rayleigh, mie, g) {
  const oy = R0 + 20, distance = sphereFar(0, oy, 0, dir[0], dir[1], dir[2], R1), steps = 12, segment = distance / steps;
  const mu = dir[0] * light[0] + dir[1] * light[1] + dir[2] * light[2];
  const phaseR = 3 / (16 * Math.PI) * (1 + mu * mu);
  const phaseM = 3 / (8 * Math.PI) * ((1 - g * g) * (1 + mu * mu)) / ((2 + g * g) * Math.pow(1 + g * g - 2 * g * mu, 1.5));
  let depthR = 0, depthM = 0;
  const sumR = [0, 0, 0], sumM = [0, 0, 0];
  for (let i = 0; i < steps; i++) {
    const t = segment * (i + .5), px = dir[0] * t, py = oy + dir[1] * t, pz = dir[2] * t;
    const h = Math.hypot(px, py, pz) - R0;
    const hr = Math.exp(-h / HR) * segment, hm = Math.exp(-h / HM) * segment;
    depthR += hr; depthM += hm;
    if (sphereNear(px, py, pz, light[0], light[1], light[2], R0 - 200) > 0) continue;
    const lightDistance = sphereFar(px, py, pz, light[0], light[1], light[2], R1), ls = lightDistance / 6;
    let lr = 0, lm = 0;
    for (let j = 0; j < 6; j++) {
      const s = ls * (j + .5);
      const hq = Math.max(Math.hypot(px + light[0] * s, py + light[1] * s, pz + light[2] * s) - R0, 0);
      lr += Math.exp(-hq / HR) * ls; lm += Math.exp(-hq / HM) * ls;
    }
    for (let c = 0; c < 3; c++) {
      const attenuation = Math.exp(-((BR[c] * rayleigh + BO[c]) * (depthR + lr) + BM * mie * 1.1 * (depthM + lm)));
      sumR[c] += attenuation * hr; sumM[c] += attenuation * hm;
    }
  }
  for (let c = 0; c < 3; c++) out[c] = power * (sumR[c] * BR[c] * rayleigh * phaseR + sumM[c] * BM * mie * phaseM);
  return out;
}

const NUMERIC = ['elevation', 'azimuth', 'power', 'rayleigh', 'mie', 'mieG', 'exposure', 'disc', 'stars', 'fog', 'gradeSat', 'gradeContrast'];
const VECTORS = ['water', 'ink', 'gradeShadow', 'gradeHighlight'];

/** Mutable blend of two presets; exposure blends in log space. */
export function blendPreset(out, a, b, t) {
  for (const key of NUMERIC) out[key] = key === 'exposure' || key === 'power' ? Math.exp(lerp(Math.log(a[key]), Math.log(b[key]), t)) : lerp(a[key], b[key], t);
  for (const key of VECTORS) { out[key] ||= [0, 0, 0]; for (let i = 0; i < 3; i++) out[key][i] = lerp(a[key][i], b[key][i], t); }
  // The moon replaces the sun halfway through a day ↔ night change.
  out.light = t < .5 ? a.light : b.light;
  out.moonMix = lerp(a.moonMix ?? (a.light === 'moon' ? 1 : 0), b.moonMix ?? (b.light === 'moon' ? 1 : 0), t);
  return out;
}

export function lightDirection(out, preset) {
  return vec3.fromAngles(out, preset.elevation * DEG, preset.azimuth * DEG);
}

/** Lunar phase from the date: 0 new, .5 full. */
export function moonPhase(date = new Date()) {
  const synodic = 29.530588853, reference = Date.UTC(2000, 0, 6, 18, 14);
  const days = (date.getTime() - reference) / 86400000;
  return ((days / synodic) % 1 + 1) % 1;
}

/** Chinese lunar phase name and illuminated percentage from a 0…1 phase value. */
export function moonPhaseInfo(phase = moonPhase()) {
  const p = ((phase % 1) + 1) % 1;
  const name = p < .03 || p >= .97 ? '新月' : p < .22 ? '蛾眉月' : p < .28 ? '上弦月'
    : p < .47 ? '盈凸月' : p < .53 ? '满月' : p < .72 ? '亏凸月' : p < .78 ? '下弦月' : '残月';
  const illumination = Math.round((1 - Math.cos(p * 2 * Math.PI)) * 50);
  return { phase: p, name, illumination };
}
