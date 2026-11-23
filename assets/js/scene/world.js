import { DEG, clamp, damp, lerp, mat4, smoothstep } from '../core/math.js';
import { PRESETS, blendPreset, lightDirection, moonPhase, scatter, transmittance } from './atmosphere.js';
import { WAVE_COUNT } from './renderer.js';

// Swell directions, wavenumbers, amplitudes, phases and steepness. Long waves
// carry the shape; short ones add chop. Sum of k·a·Q stays below 1 at full wind.
const SWELLS = [
  [.18, .98, .291, 1.32, 1.1, .34], [-.43, .90, .407, .95, 4.6, .34], [.68, .73, .173, .82, 2.8, .30], [.91, .41, .109, .60, 5.9, .28],
  [-.80, .60, .557, .40, .6, .26], [.51, .86, .921, .20, 5.2, .22], [-.22, .97, 1.347, .09, 3.5, .18], [-.65, .76, .733, .22, 1.9, .20],
];

const EYE = 6.4;
export const CRUISE = 64;
const LANTERN_HEIGHT = 2.6;

/**
 * Everything that moves: time, waves, light, weather and the camera. It owns
 * no GPU state; each update fills `frame`, which the renderer reads.
 */
export class World {
  constructor({ wind = .45, density = .95, theme = 'sunset' } = {}) {
    this.time = 0;
    this.waveTime = 0;
    this.wind = wind; this.waveWind = wind;
    this.density = density;
    this.paused = false;
    this.clouds = 1; this.cloudsTarget = 1;
    this.pointer = { x: 0, y: 0, sx: 0, sy: 0 };
    this.ripples = [];
    this.cloudOffset = [0, 0];
    this.dive = 0;
    this.cruise = 0;
    this.aurora = 0;
    this.lightning = { next: NaN, started: -Infinity, strength: 1, duration: .12, echo: Infinity, echoDuration: .04 };
    this.seed = 17329;

    this.theme = theme;
    this.presetFrom = PRESETS[theme];
    this.preset = blendPreset({}, PRESETS[theme], PRESETS[theme], 1);
    this.presetTarget = PRESETS[theme];
    this.presetBlend = 1;

    this.weather = { active: 0, cloud: 0, rain: 0, snow: 0, fog: 0, storm: 0, angle: 0 };
    this.weatherTarget = { ...this.weather };

    const wavesA = new Float32Array(WAVE_COUNT * 4), wavesB = new Float32Array(WAVE_COUNT * 4);
    this.swells = SWELLS.map(([dx, dz, k, a, phase, q], i) => {
      const l = Math.hypot(dx, dz);
      wavesA.set([dx / l, dz / l, k, a], i * 4);
      wavesB.set([phase, q, 0, 0], i * 4);
      return { dx: dx / l, dz: dz / l, k, a, phase, q };
    });
    this.frame = {
      time: 0,
      camera: {
        eye: new Float32Array(3), pitch: 0, yaw: 0, fovY: 0, tanHalfX: 1, tanHalfY: 1, underwater: false,
        view: new Float32Array(16), proj: new Float32Array(16), viewProj: new Float32Array(16), invViewProj: new Float32Array(16),
        gridOrigin: new Float32Array(2),
      },
      atmosphere: {
        dirty: true, lightDir: new Float32Array(3), power: 22, rayleigh: 1, mie: 1, mieG: .76,
        lightColor: new Float32Array(3), ambient: new Float32Array(3), exposure: 1, overcast: 0,
        overcastColor: new Float32Array([.78, .82, .88]), fog: .003, flash: 0,
        discDir: new Float32Array(3), discColor: new Float32Array(3), discSize: .012, moon: 0, moonPhase: moonPhase(), stars: 0, aurora: 0,
        water: new Float32Array(3), ink: new Float32Array(3), skyTint: new Float32Array([1, 1, 1]),
        gradeShadow: new Float32Array([1, 1, 1]), gradeHighlight: new Float32Array([1, 1, 1]), gradeSat: 1, gradeContrast: 0,
      },
      sea: {
        visible: true, waveTime: 0, amplitude: 1, wavesA, wavesB, windDir: new Float32Array([0, -1]), windAlign: 0,
        ripples: new Float32Array(16), textScale: 26, density, wind, rain: 0, harbor: 0,
        lanterns: new Float32Array(18), lanternColors: new Float32Array(18),
      },
      clouds: { offset: new Float32Array(2), cover: .3, heaviness: 0, ink: 1, enabled: 1 },
      weather: { rain: 0, snow: 0, windSpeed: 0, drift: [0, 0] },
    };
    this.viewport = { width: 1, height: 1 };
    this.lightDirty = true;
    this.updateAtmosphere();
  }

  random() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  setViewport(width, height) { this.viewport.width = width; this.viewport.height = height; }

  setTheme(name, animate = true) {
    if (!PRESETS[name]) return;
    this.theme = name;
    if (this.presetTarget === PRESETS[name]) return;
    this.presetFrom = { ...this.preset, water: [...this.preset.water], ink: [...this.preset.ink] };
    this.presetTarget = PRESETS[name];
    this.presetBlend = animate ? 0 : 1;
    if (!animate) blendPreset(this.preset, this.presetFrom, this.presetTarget, 1);
    this.lightDirty = true;
  }

  /** Advance the shared daylight even when reading holds the sea clock still. */
  updateTheme(dt, { reducedMotion = false } = {}) {
    if (this.presetBlend >= 1) return false;
    this.presetBlend = reducedMotion ? 1 : Math.min(1, this.presetBlend + dt / 2.6);
    const t = this.presetBlend;
    blendPreset(this.preset, this.presetFrom, this.presetTarget, t * t * (3 - 2 * t));
    this.lightDirty = true;
    return this.presetBlend < 1;
  }

  /** Height of the swell (without ripples) at a world point. */
  waterHeight(x, z) {
    const amplitude = this.frame.sea.amplitude, w = this.weather;
    const wx = Math.sin(w.angle), wz = -Math.cos(w.angle);
    // Gerstner points move sideways; two fixed-point steps find the crest above (x, z).
    let px = x, pz = z;
    for (let iteration = 0; iteration < 2; iteration++) {
      let ox = 0, oz = 0;
      for (const s of this.swells) {
        const along = s.dx * wx + s.dz * wz;
        const a = s.a * amplitude * lerp(1, .55 + .45 * along * along + .25 * Math.max(along, 0), w.active);
        const c = Math.cos(s.k * (s.dx * px + s.dz * pz) - Math.sqrt(9.81 * s.k) * this.waveTime + s.phase);
        ox += s.dx * s.q * a * c; oz += s.dz * s.q * a * c;
      }
      px = x - ox; pz = z - oz;
    }
    let height = 0;
    for (const s of this.swells) {
      const along = s.dx * wx + s.dz * wz;
      const a = s.a * amplitude * lerp(1, .55 + .45 * along * along + .25 * Math.max(along, 0), w.active);
      height += a * Math.sin(s.k * (s.dx * px + s.dz * pz) - Math.sqrt(9.81 * s.k) * this.waveTime + s.phase);
    }
    return height;
  }

  /** Where a screen point (0…1 fractions) meets calm water, seen from the end of the cruise. */
  harborPoint(fx, fy, cruise = CRUISE) {
    const { width, height } = this.viewport, aspect = width / height;
    const tanY = Math.max(Math.tan(22.5 * DEG), .36 / aspect), tanX = tanY * aspect, pitch = Math.atan(.2 * tanY);
    // Keep the nearest lights a little way out on the water.
    fy = .56 + (fy - .6) * .62;
    const vx = (fx * 2 - 1) * tanX * .92, vy = (1 - fy * 2) * tanY;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const dy = vy * cp - sp, dz = -(vy * sp + cp);
    const t = dy < -.02 ? (EYE - LANTERN_HEIGHT * .55) / -dy : 140;
    return { x: vx * t, z: -cruise + dz * t };
  }

  project(out, x, y, z) {
    const m = this.frame.camera.viewProj;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    out.x = (cx / cw * .5 + .5) * this.viewport.width;
    out.y = (.5 - cy / cw * .5) * this.viewport.height;
    out.w = cw;
    return out;
  }

  /** Places a ring on the water under a screen point (CSS pixels). */
  rippleAt(clientX, clientY) {
    const cam = this.frame.camera, { width, height } = this.viewport;
    const ndcX = clientX / width * 2 - 1, ndcY = 1 - clientY / height * 2;
    const near = [0, 0, 0, 0], far = [0, 0, 0, 0], m = cam.invViewProj;
    for (const [out, z] of [[near, -1], [far, 1]]) {
      for (let r = 0; r < 4; r++) out[r] = m[r] * ndcX + m[4 + r] * ndcY + m[8 + r] * z + m[12 + r];
      for (let r = 0; r < 3; r++) out[r] /= out[3];
    }
    const dy = far[1] - near[1];
    if (dy >= 0) return false;
    const t = -near[1] / dy;
    this.addRipple(near[0] + (far[0] - near[0]) * t, near[2] + (far[2] - near[2]) * t, 1);
    return true;
  }

  addRipple(x, z, strength = 1) {
    this.ripples.push({ x, z, time: this.time, strength });
    if (this.ripples.length > 4) this.ripples.shift();
  }

  updateCamera() {
    const cam = this.frame.camera, { width, height } = this.viewport, aspect = width / height;
    // Keep a usable horizontal view on tall phones without a fish-eye desktop.
    const tanHalfY = Math.max(Math.tan(22.5 * DEG), .36 / aspect);
    cam.fovY = 2 * Math.atan(tanHalfY);
    cam.tanHalfY = tanHalfY; cam.tanHalfX = tanHalfY * aspect;
    // The horizon rests at 40 % of the height, as in a photograph framed on the sea.
    const horizonPitch = Math.atan(.2 * tanHalfY);
    // `dive` is eased once by the scene timeline. Keep descending and advancing
    // through the handoff to the walls; separate approach/submerge curves used
    // to stop the eye early and tilt it back towards the surface.
    cam.pitch = horizonPitch + this.pointer.sy * .012 + smoothstep(0, .4, this.dive) * .18;
    cam.yaw = this.pointer.sx * .028;
    cam.eye[0] = this.pointer.sx * 1.1;
    cam.eye[1] = EYE - this.pointer.sy * .35 - this.dive * 26;
    cam.eye[2] = -this.cruise - this.dive * 20;
    cam.underwater = cam.eye[1] < .05;
    mat4.perspective(cam.proj, cam.fovY, aspect, .3, 2400);
    mat4.view(cam.view, cam.eye, cam.pitch, cam.yaw);
    mat4.multiply(cam.viewProj, cam.proj, cam.view);
    mat4.invert(cam.invViewProj, cam.viewProj);
    cam.gridOrigin[0] = cam.eye[0]; cam.gridOrigin[1] = cam.eye[2];
  }

  updateAtmosphere() {
    const p = this.preset, a = this.frame.atmosphere, w = this.weather;
    const night = p.moonMix ?? 0;
    // Light only moves while a preset blends; the scattering is re-integrated then.
    if (this.lightDirty) {
      this.lightDirty = false; a.dirty = true;
      lightDirection(a.lightDir, p);
      a.power = p.power; a.rayleigh = p.rayleigh; a.mie = p.mie; a.mieG = p.mieG;
      transmittance(a.lightColor, a.lightDir, p.rayleigh, p.mie);
      for (let i = 0; i < 3; i++) a.lightColor[i] *= p.power;
      scatter(a.ambient, [0, 1, 0], a.lightDir, p.power, p.rayleigh, p.mie, p.mieG);
      // Scotopic shift: moonlight is reflected sunlight, but night vision reads it blue.
      const tint = [lerp(1, .3, night), lerp(1, .55, night), lerp(1, 1.35, night)];
      a.skyTint.set(tint);
      for (let i = 0; i < 3; i++) { a.ambient[i] *= tint[i]; a.lightColor[i] *= tint[i] * .8 + .2; }
    }
    const cover = w.cloud * w.active, fog = w.fog * w.active;
    const rain = w.rain * w.active, storm = w.storm * w.active;
    a.overcast = clamp(smoothstep(.55, .98, cover) * .74 + fog * .48 + rain * .16 + storm * .22, 0, .94);
    a.exposure = p.exposure * (1 + a.overcast * .08 - storm * .14);
    a.fog = p.fog * (1 + fog * 9 + rain * 2.5);
    a.discDir.set(a.lightDir);
    a.discSize = p.disc;
    // During a day ↔ night change the old disc sets before the new one rises.
    const swap = Math.abs(night * 2 - 1);
    const shade = Math.pow(1 - clamp(a.overcast * .85 + fog * .45, 0, 1), 2);
    const moon = p.light === 'moon';
    for (let i = 0; i < 3; i++) a.discColor[i] = a.lightColor[i] / Math.max(p.power, 1e-3) * swap * shade * (moon ? .9 : p.power / 22);
    a.moon = moon ? 1 : 0;
    a.moonPhase = Number.isFinite(this.moonPhase) ? this.moonPhase : moonPhase();
    a.stars = p.stars;
    a.aurora = this.aurora * smoothstep(.55, 1, night) * (1 - a.overcast * .85);
    a.water.set(p.water); a.ink.set(p.ink);
    a.gradeShadow.set(p.gradeShadow); a.gradeHighlight.set(p.gradeHighlight); a.gradeSat = p.gradeSat; a.gradeContrast = p.gradeContrast;
  }

  updateWeather(dt) {
    const rate = 1 / 2.6;
    let settling = false;
    for (const key of Object.keys(this.weather)) {
      const target = this.weatherTarget[key];
      let current = this.weather[key];
      if (key === 'angle') current += Math.atan2(Math.sin(target - current), Math.cos(target - current)) * (1 - Math.exp(-rate * dt));
      else current = damp(current, target, rate, dt);
      if (Math.abs(current - target) < 5e-4) current = target; else settling = true;
      this.weather[key] = current;
    }
    return settling;
  }

  /** A discharge lights up at once and fades within a few frames; sometimes it echoes. */
  updateLightning(reducedMotion) {
    const l = this.lightning, w = this.weather;
    if (!this.weatherTarget.storm || w.storm < .12 || this.paused || reducedMotion) { l.next = NaN; return 0; }
    if (!Number.isFinite(l.next)) { l.next = this.time + 2 + this.random() * 3; return 0; }
    if (this.time >= l.next) {
      l.started = this.time; l.next = this.time + 9 + this.random() * 15;
      l.strength = .7 + this.random() * .3; l.duration = .1 + this.random() * .05;
      l.echoDuration = .035 + this.random() * .02;
      l.echo = this.random() < .35 ? l.duration + .035 + this.random() * .025 : Infinity;
    }
    const envelope = (age, d) => age >= 0 && age < d ? Math.exp(-age / (d * .22)) * (1 - age / d) : 0;
    const age = this.time - l.started;
    return (envelope(age, l.duration) + .45 * envelope(age - l.echo, l.echoDuration)) * l.strength * w.storm * w.active;
  }

  update(dt, { reducedMotion = false } = {}) {
    const f = this.frame;
    let animating = !this.paused;
    if (!this.paused) this.time += dt;
    f.time = this.time;

    // Pointer parallax eases in; touch never steers the view.
    this.pointer.sx = reducedMotion ? this.pointer.x : damp(this.pointer.sx, this.pointer.x, 2.6, dt);
    this.pointer.sy = reducedMotion ? this.pointer.y : damp(this.pointer.sy, this.pointer.y, 2.6, dt);
    if (Math.abs(this.pointer.sx - this.pointer.x) > 1e-4 || Math.abs(this.pointer.sy - this.pointer.y) > 1e-4) animating = true;
    else { this.pointer.sx = this.pointer.x; this.pointer.sy = this.pointer.y; }

    if (this.updateTheme(dt, { reducedMotion })) animating = true;
    if (this.updateWeather(reducedMotion ? 1e3 : dt)) animating = true;

    const previousWind = this.waveWind;
    this.waveWind = damp(this.waveWind, this.wind, 1 / 2.4, reducedMotion ? 1e3 : dt);
    if (Math.abs(this.waveWind - this.wind) < 5e-4) this.waveWind = this.wind; else animating = true;
    const w = this.weather;
    if (!this.paused) {
      // Integrate speed: a new wind never re-times waves that already passed.
      this.waveTime += dt * (.62 + (previousWind + this.waveWind) * .2);
      const drift = lerp(1, (.4 + this.waveWind * 2.4) * (Math.sin(w.angle) >= 0 ? 1 : -1), w.active);
      this.cloudOffset[0] += dt * .0016 * drift;
      this.cloudOffset[1] += dt * .0004;
    }
    this.clouds = damp(this.clouds, this.cloudsTarget, 3, reducedMotion ? 1e3 : dt);
    if (Math.abs(this.clouds - this.cloudsTarget) < 1e-3) this.clouds = this.cloudsTarget; else animating = true;

    this.updateCamera();
    this.updateAtmosphere();
    f.atmosphere.flash = this.updateLightning(reducedMotion);
    if (f.atmosphere.flash > 0) animating = true;

    const s = f.sea;
    s.waveTime = this.waveTime;
    s.amplitude = .12 + this.waveWind * .72;
    s.wind = this.waveWind;
    s.density = this.density;
    s.windDir[0] = Math.sin(w.angle); s.windDir[1] = -Math.cos(w.angle);
    s.windAlign = w.active;
    s.rain = w.rain * w.active;
    s.ripples.fill(0);
    // Rings are added in time order, so the expired ones are always first.
    while (this.ripples.length && this.time - this.ripples[0].time >= 9) this.ripples.shift();
    for (let i = 0; i < this.ripples.length; i++) {
      const r = this.ripples[i];
      s.ripples[i * 4] = r.x; s.ripples[i * 4 + 1] = r.z; s.ripples[i * 4 + 2] = r.time; s.ripples[i * 4 + 3] = r.strength;
    }
    // Frozen ripples cannot expire until the clock resumes; they need no frames.
    if (this.ripples.length && !this.paused) animating = true;

    const c = f.clouds;
    c.offset[0] = this.cloudOffset[0]; c.offset[1] = this.cloudOffset[1];
    c.cover = clamp(lerp(.30, w.cloud, w.active), 0, 1);
    c.heaviness = clamp(w.rain * .65 + w.storm * .55 + Math.max(w.cloud - .82, 0) * 1.4, 0, 1) * w.active;
    c.enabled = this.clouds;

    f.weather.rain = w.rain * w.active;
    f.weather.snow = w.snow * w.active;
    f.weather.windSpeed = (1 + this.waveWind * 9) * w.active;
    if (!this.paused) {
      // Integrated as well: a gust never throws drops already in the air sideways.
      f.weather.drift[0] += s.windDir[0] * f.weather.windSpeed * dt;
      f.weather.drift[1] += s.windDir[1] * f.weather.windSpeed * dt;
    }
    return animating;
  }
}
