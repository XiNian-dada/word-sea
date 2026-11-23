import { Program } from '../gl/context.js';
import { COMMON } from '../gl/shaders/sky.js';

// Rain, snow and the friends' lanterns. All are camera-facing quads expanded in
// the vertex shader from one instanced attribute, depth-tested against the sea.

const BOX = [70, 34, 90];
const wrap = (value, size) => value - Math.floor(value / size) * size;

const PARTICLE_VERTEX = /* glsl */`
in vec4 aSeed;                 // x, y, z in 0…1, w random
uniform mat4 uViewProj;
uniform vec3 uCamera;
uniform float uTime;
uniform float uSnow;           // 0 rain, 1 snow
uniform vec2 uWind;
uniform vec2 uDrift;           // sideways travel so far, wrapped to the box
uniform float uFall;
uniform float uAmount;
uniform vec2 uViewport;
out vec2 vQuad;
out float vAlpha;
const vec3 BOX = vec3(${BOX.map(v => v.toFixed(1)).join(', ')});

void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)) * 2.0 - 1.0;
  vQuad = corner;
  vAlpha = step(aSeed.w, uAmount);
  float speed = mix(uFall, uFall * .09, uSnow) * (.8 + aSeed.w * .4);
  vec3 p = aSeed.xyz * BOX - vec3(0.0, uTime * speed, 0.0) + vec3(uDrift.x, 0.0, uDrift.y);
  // Wrap the volume around the eye so particles never run out.
  vec3 origin = uCamera - vec3(BOX.x * .5, 2.0, BOX.z * .95);
  p = origin + mod(p - origin, BOX);
  if (uSnow > .5) {
    p.x += sin(uTime * .9 + aSeed.w * 30.0) * .35;
    p.z += cos(uTime * .7 + aSeed.w * 17.0) * .35;
    vec4 clip = uViewProj * vec4(p, 1.0);
    float size = (.05 + aSeed.w * .07) * uViewport.y / clip.w;
    clip.xy += corner * max(size, 1.2) / uViewport * clip.w * 2.0;
    gl_Position = clip;
    vAlpha *= clamp(1.0 - clip.w / 85.0, 0.0, 1.0);
  } else {
    // A streak is the drop's path during one exposure: from p to p - velocity·dt.
    vec3 velocity = vec3(uWind.x, -speed, uWind.y);
    vec4 a = uViewProj * vec4(p, 1.0), b = uViewProj * vec4(p - velocity * .035, 1.0);
    vec2 sa = a.xy / a.w, sb = b.xy / b.w;
    vec2 axis = normalize((sa - sb) * uViewport + 1e-5);
    vec2 normal = vec2(-axis.y, axis.x) / uViewport * 2.0 * .65;
    vec4 clip = corner.y > 0.0 ? a : b;
    clip.xy += normal * corner.x * clip.w;
    gl_Position = clip;
    vAlpha *= clamp(1.0 - a.w / 70.0, 0.0, 1.0) * clamp(a.w / 1.5, 0.0, 1.0);
  }
}
`;

const PARTICLE_FRAGMENT = /* glsl */`
in vec2 vQuad;
in float vAlpha;
out vec4 outColor;
uniform vec3 uColor;
uniform float uSnow;
void main() {
  float shape = uSnow > .5 ? smoothstep(1.0, .2, length(vQuad)) : (1.0 - abs(vQuad.x)) * smoothstep(-1.0, .2, vQuad.y);
  float a = shape * vAlpha * mix(.32, .85, uSnow);
  if (a < .003) discard;
  outColor = vec4(uColor * a, a);
}
`;

const LANTERN_VERTEX = /* glsl */`
in vec4 aLantern;              // world position, level (hover)
in vec4 aColor;                // rgb, visibility
uniform mat4 uViewProj;
uniform vec2 uViewport;
uniform float uTime;
out vec2 vQuad;
out vec3 vColor;
out float vLevel;
out float vKind;
out float vPhase;
void main() {
  int corner = gl_VertexID % 4;
  int kind = gl_VertexID / 4;          // 0 halo, 1 lantern flame, 2 soft light stem, 3 water glow ring
  vec2 q = vec2(float(corner & 1), float((corner >> 1) & 1)) * 2.0 - 1.0;
  vQuad = q; vColor = aColor.rgb; vLevel = aLantern.w; vKind = float(kind);
  vPhase = aLantern.x * .7 + aLantern.z * .4;
  float breathe = .92 + .08 * sin(uTime * 2.1 + vPhase) + .035 * sin(uTime * 5.7 + aLantern.z);
  float sway = sin(uTime * 1.25 + vPhase) * .09;
  vec3 lampPos = aLantern.xyz + vec3(sway, sin(uTime * 1.9 + vPhase) * .04, 0.0);
  vec3 waterPos = vec3(aLantern.x, aLantern.y - 2.55, aLantern.z);
  vec4 clip = uViewProj * vec4(kind == 3 ? waterPos : lampPos, 1.0);
  float distFade = mix(.5, 1.0, smoothstep(95.0, 28.0, clip.w));
  float pixels = uViewport.y / max(clip.w, .2);
  vec2 size;
  if (kind == 0) {
    size = vec2(1.0) * pixels * (1.8 + aLantern.w * .75) * breathe;
  } else if (kind == 1) {
    // Graceful elongated floating lantern silhouette.
    size = vec2(.3, .44) * pixels * (1.0 + aLantern.w * .28) * (.55 + .45 * aColor.a * distFade);
  } else if (kind == 2) {
    // Soft luminous filament descending gently towards the waves.
    vec4 base = uViewProj * vec4(waterPos, 1.0);
    clip = mix(base, clip, q.y * .5 + .5);
    size = vec2(max(pixels * .045, 1.5), 0.0);
  } else {
    // Foreshortened glow pool & ripple ring floating on the water surface beneath the lamp.
    size = vec2(1.45, .34) * pixels * (1.0 + aLantern.w * .55) * breathe;
  }
  clip.xy += q * size / uViewport * 2.0 * clip.w * vec2(1.0, kind == 2 ? 0.0 : 1.0);
  gl_Position = clip;
  vColor *= aColor.a * distFade * breathe;
}
`;

const LANTERN_FRAGMENT = /* glsl */`
in vec2 vQuad;
in vec3 vColor;
in float vLevel;
in float vKind;
in float vPhase;
uniform float uTime;
out vec4 outColor;
void main() {
  float r = length(vQuad);
  vec3 c = vec3(0.0);
  if (vKind < .5) {
    // Soft layered atmospheric bloom around the lantern (keeps its tint without clipping to white).
    float inner = exp(-r * r * 10.5) * (.25 + vLevel * .26);
    float outer = exp(-r * 4.0) * (.055 + vLevel * .055);
    c = vColor * (inner + outer);
  } else if (vKind < 1.5) {
    // Floating glass/paper lantern body with warm incandescent inner wick.
    vec2 p = vec2(vQuad.x * (1.0 + .16 * vQuad.y), vQuad.y);
    float pr = length(p);
    float shell = smoothstep(.95, .28, pr) * exp(-pr * pr * 3.4);
    float wick = exp(-dot(vQuad - vec2(0.0, -.04), vQuad - vec2(0.0, -.04)) * 22.0);
    vec3 warmCore = mix(vColor, vec3(1.0, .95, .84), .62);
    c = vColor * shell * (.72 + vLevel * .38) + warmCore * wick * (1.35 + vLevel * .45);
  } else if (vKind < 2.5) {
    // Softly feathered beam stem, vanishing cleanly into both lamp and sea.
    float horiz = exp(-vQuad.x * vQuad.x * 6.0);
    float vert = smoothstep(-1.0, -.25, vQuad.y) * smoothstep(1.0, .15, vQuad.y);
    c = vColor * horiz * vert * (.14 + .20 * (vQuad.y * .5 + .5) + vLevel * .10);
  } else {
    // Silky water-surface glow pool & delicate luminous ripple ring (zero hard edge).
    float shimmer = .84 + .16 * sin(uTime * 3.2 + vPhase + vQuad.x * 9.0);
    float fade = smoothstep(1.0, .28, r);
    float pool = exp(-r * r * 8.5) * (.15 + vLevel * .16);
    float ringWave = fract(uTime * .28 + vPhase * .31);
    float ringR = mix(.20, .82, ringWave);
    float ring = exp(-pow((r - ringR) * 16.0, 2.0)) * (1.0 - ringWave) * (.16 + vLevel * .24);
    c = vColor * (pool + ring) * shimmer * fade;
  }
  outColor = vec4(c, 0.0);
}
`;

export class Particles {
  constructor(renderer, count = 6000) {
    const gl = renderer.gl;
    this.gl = gl;
    this.maxCount = count;
    this.count = count;
    this.program = new Program(gl, { vertex: PARTICLE_VERTEX, fragment: PARTICLE_FRAGMENT, label: 'particles' });
    const seeds = new Float32Array(count * 4);
    let s = 1234567;
    for (let i = 0; i < seeds.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; seeds[i] = s / 4294967296; }
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    const location = gl.getAttribLocation(this.program.program, 'aSeed');
    gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 4, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(location, 1);
    gl.bindVertexArray(null);
    this.viewport = new Float32Array(2);
    this.color = new Float32Array(3);
    this.wind = new Float32Array(2);
    this.drift = new Float32Array(2);
  }

  setBudget(count) {
    this.count = Math.min(this.maxCount, Math.max(0, Math.round(count)));
  }

  draw(frame, renderer) {
    const w = frame.weather;
    if (!frame.sea.visible || frame.camera.underwater || (w.rain < .003 && w.snow < .003)) return;
    const gl = this.gl, p = this.program.use();
    this.viewport[0] = renderer.width; this.viewport[1] = renderer.height;
    const a = frame.atmosphere;
    // Drops are lit by the sky around them; at night they are barely there.
    const lum = Math.min(1, (a.ambient[0] + a.ambient[1] + a.ambient[2]) * a.exposure * .6);
    for (let i = 0; i < 3; i++) this.color[i] = (.25 + lum * .9) * [.82, .88, .95][i];
    this.wind[0] = frame.sea.windDir[0] * w.windSpeed; this.wind[1] = frame.sea.windDir[1] * w.windSpeed;
    p.set('uViewProj', frame.camera.viewProj).set('uCamera', frame.camera.eye).set('uTime', frame.time)
      .set('uWind', this.wind).set('uViewport', this.viewport).set('uColor', this.color);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    for (const [snow, amount] of [[0, w.rain], [1, w.snow]]) {
      if (amount < .003) continue;
      // Snow drifts at under half the wind's pace.
      const carried = snow ? .45 : 1;
      this.drift[0] = wrap(w.drift[0] * carried, BOX[0]); this.drift[1] = wrap(w.drift[1] * carried, BOX[2]);
      p.set('uSnow', snow).set('uFall', 26).set('uAmount', amount).set('uDrift', this.drift);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, Math.round(this.count * Math.min(1, .25 + amount)));
    }
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
}

export class Lanterns {
  constructor(renderer) {
    const gl = renderer.gl;
    this.gl = gl;
    this.program = new Program(gl, { vertex: LANTERN_VERTEX, fragment: LANTERN_FRAGMENT, label: 'lanterns' });
    this.data = new Float32Array(6 * 8);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const a = gl.getAttribLocation(this.program.program, 'aLantern'), c = gl.getAttribLocation(this.program.program, 'aColor');
    gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(a, 1);
    gl.enableVertexAttribArray(c); gl.vertexAttribPointer(c, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(c, 1);
    gl.bindVertexArray(null);
    // Four quads per lantern: halo, floating flame, soft light stem and water-surface glow ring.
    const indices = [];
    for (let k = 0; k < 4; k++) { const o = k * 4; indices.push(o, o + 1, o + 2, o + 2, o + 1, o + 3); }
    gl.bindVertexArray(this.vao);
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.count = 0;
    this.viewport = new Float32Array(2);
  }

  update(nodes) {
    this.count = nodes.length;
    // A zero length would upload the whole array in WebGL2; there is nothing to draw anyway.
    if (!this.count) return;
    const d = this.data;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i], o = i * 8;
      d[o] = n.x; d[o + 1] = n.y; d[o + 2] = n.z; d[o + 3] = n.level;
      d[o + 4] = n.color[0]; d[o + 5] = n.color[1]; d[o + 6] = n.color[2]; d[o + 7] = n.alpha;
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, d, 0, nodes.length * 8);
  }

  draw(frame, renderer) {
    if (!this.count || frame.sea.harbor <= .001 || !frame.sea.visible) return;
    const gl = this.gl, p = this.program.use();
    this.viewport[0] = renderer.width; this.viewport[1] = renderer.height;
    p.set('uViewProj', frame.camera.viewProj).set('uViewport', this.viewport).set('uTime', frame.time);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(this.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, 24, gl.UNSIGNED_SHORT, 0, this.count);
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
}

const MAX_GULLS = 3;
const MAX_FISH = 2;
const MAX_SPLASH = 36;

// Sculpted 3D seagull mesh: lofted fuselage (breast, neck, head, hooked beak),
// fanned 3D tail, and two cambered airfoil wings with wrist bend & tapered tips.
// Local space is right-handed: +X right wing, +Y up, -Z forward (beak).
function buildGullMesh() {
  const pos = [], part = [], indices = [];
  const addVert = (x, y, z, pid, spanT, side, chordT) => {
    const idx = pos.length / 3;
    pos.push(x, y, z);
    part.push(pid, spanT, side, chordT);
    return idx;
  };
  // Loft closed rings ordered with decreasing Z so (v00, v10, v11) is CCW outward.
  const loftRings = (rings, flip = false) => {
    const n = rings[0].length;
    for (let i = 0; i < rings.length - 1; i++) {
      const a = rings[i], b = rings[i + 1];
      for (let j = 0; j < n; j++) {
        const jn = (j + 1) % n;
        const v00 = a[j], v10 = b[j], v11 = b[jn], v01 = a[jn];
        if (!flip) indices.push(v00, v10, v11, v00, v11, v01);
        else indices.push(v00, v11, v10, v00, v01, v11);
      }
    }
  };

  // 1. Sleek aerodynamic fuselage + neck + head + beak (z from tail root +0.34 to beak tip -0.57).
  const bodyStations = [
    [ .34, -.006, .001, .001, 0],
    [ .31, -.008, .022, .016, 0],
    [ .20, -.014, .040, .033, 0],
    [ .08, -.020, .056, .048, 0],
    [-.04, -.022, .062, .054, 0],
    [-.15, -.017, .056, .048, 0],
    [-.24, -.003, .040, .036, 0],
    [-.31,  .014, .030, .029, 0],
    [-.37,  .027, .035, .034, 0],
    [-.42,  .028, .031, .030, 0],
    [-.455, .022, .016, .015, 0],
    [-.465, .021, .013, .013, 1],
    [-.52,  .018, .008, .010, 1],
    [-.56,  .011, .0035, .0045, 1],
    [-.575, .007, .0006, .0006, 1],
  ];
  const RINGS = 10;
  const bodyRings = bodyStations.map(([z, yc, rx, ry, pid]) => {
    const ring = [];
    for (let j = 0; j < RINGS; j++) {
      const a = (j / RINGS) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const belly = sa < 0 ? 1.06 : .94;
      ring.push(addVert(rx * ca, yc + ry * sa * belly, z, pid, 0, 0, .5));
    }
    return ring;
  });
  loftRings(bodyRings, false);

  // 2. Slender fanned 3D tail (z from trailing edge +0.58 forward to +0.28 inside rump).
  const tailStations = [
    [.58, -.014, .004, .0007, 1.0],
    [.555, -.013, .092, .0018, .92],
    [.50, -.011, .112, .0030, .75],
    [.40, -.009, .068, .0055, .38],
    [.28, -.006, .024, .0080, .00],
  ];
  const tailRings = tailStations.map(([z, yc, rx, ry, chordT]) => {
    const ring = [];
    for (let j = 0; j < RINGS; j++) {
      const a = (j / RINGS) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      ring.push(addVert(rx * ca, yc + ry * sa, z, 2, 0, 0, chordT));
    }
    return ring;
  });
  loftRings(tailRings, false);

  // 3. Long, narrow, high-aspect-ratio cambered gull wings (left & right).
  // Remember: -Z is forward, so leadZ is negative and trailZ is positive.
  const wingStations = [
    // spanT, leadZ,  trailZ, thick, camber
    [0.02, -0.125,  0.085, 0.022, 0.011],
    [0.14, -0.140,  0.075, 0.020, 0.014],
    [0.26, -0.155,  0.055, 0.018, 0.015],
    [0.37, -0.172,  0.030, 0.015, 0.014],
    [0.45, -0.180,  0.012, 0.013, 0.011], // carpal wrist bend (furthest forward)
    [0.56, -0.125,  0.055, 0.011, 0.008],
    [0.68, -0.045,  0.105, 0.0085, 0.0055],
    [0.80,  0.045,  0.152, 0.0060, 0.0035],
    [0.90,  0.128,  0.188, 0.0040, 0.0018],
    [0.96,  0.178,  0.205, 0.0022, 0.0008],
    [1.00,  0.215,  0.222, 0.0006, 0.0],
  ];
  // 10-point closed cambered airfoil profile: (c in 0..1 leading->trailing, upper/lower y factors).
  const airfoil = [
    [1.00,  0.00,  0.00], // trailing edge
    [0.72,  0.46,  0.55], // upper aft
    [0.42,  0.86,  0.95], // upper mid
    [0.16,  0.96,  0.62], // upper front
    [0.02,  0.44,  0.12], // leading upper
    [0.00,  0.00,  0.00], // leading nose
    [0.04, -0.34,  0.10], // leading lower
    [0.24, -0.36,  0.52], // lower front
    [0.56, -0.18,  0.74], // lower concave mid
    [0.84, -0.06,  0.34], // lower aft
  ];
  for (const side of [1, -1]) {
    const rings = wingStations.map(([spanT, leadZ, trailZ, thick, camber]) => {
      const ring = [];
      const x = side * spanT;
      for (const [c, yf, cf] of airfoil) {
        const z = leadZ + (trailZ - leadZ) * c;
        const y = .012 + thick * yf + camber * cf;
        ring.push(addVert(x, y, z, 3, spanT, side, c));
      }
      return ring;
    });
    // On right wing (+X span, airfoil goes trail->upper->lead = -Z), cross(+X, -Z) = +Y outward!
    loftRings(rings, side < 0);
  }

  // Area-weighted smooth outward vertex normals from exact triangle winding.
  const vCount = pos.length / 3;
  const norm = new Float32Array(pos.length);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3, ib = indices[i + 1] * 3, ic = indices[i + 2] * 3;
    const abx = pos[ib] - pos[ia], aby = pos[ib + 1] - pos[ia + 1], abz = pos[ib + 2] - pos[ia + 2];
    const acx = pos[ic] - pos[ia], acy = pos[ic + 1] - pos[ia + 1], acz = pos[ic + 2] - pos[ia + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    for (const k of [ia, ib, ic]) { norm[k] += nx; norm[k + 1] += ny; norm[k + 2] += nz; }
  }
  const verts = new Float32Array(vCount * 10);
  for (let i = 0; i < vCount; i++) {
    const nx = norm[i * 3], ny = norm[i * 3 + 1], nz = norm[i * 3 + 2];
    const inv = 1 / (Math.hypot(nx, ny, nz) || 1);
    const o = i * 10;
    verts[o] = pos[i * 3]; verts[o + 1] = pos[i * 3 + 1]; verts[o + 2] = pos[i * 3 + 2];
    verts[o + 3] = nx * inv; verts[o + 4] = ny * inv; verts[o + 5] = nz * inv;
    verts[o + 6] = part[i * 4]; verts[o + 7] = part[i * 4 + 1]; verts[o + 8] = part[i * 4 + 2]; verts[o + 9] = part[i * 4 + 3];
  }
  return { verts, indices: new Uint16Array(indices) };
}

const GULL_VERTEX = /* glsl */`
in vec3 aPos;
in vec3 aNorm;
in vec4 aPart;     // partId (0 body, 1 beak, 2 tail, 3 wing), spanT, side (-1/+1), chordT
in vec4 aState;    // world x, y, z, scale (half-wingspan in meters)
in vec4 aForward;  // unit forward x, y, z, bank (rad)
in vec4 aWing;     // innerAngle, outerAngle, wingSweep, alpha
uniform mat4 uViewProj;
uniform vec3 uCamera;
out vec3 vNormal;
out vec3 vLocalNorm;
out vec3 vViewDir;
out vec4 vPart;
out float vDist;
out float vAlpha;

vec2 rot2(vec2 v, float a) {
  float c = cos(a), s = sin(a);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

void main() {
  vPart = aPart;
  vAlpha = aWing.w;
  if (vAlpha <= .002) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vNormal = vec3(0.0, 1.0, 0.0);
    vLocalNorm = vNormal;
    vViewDir = vec3(0.0, 0.0, -1.0);
    vDist = 100.0;
    return;
  }

  vec3 p = aPos;
  vec3 n = aNorm;
  if (aPart.x > 2.5) {
    // 2-bone articulated gull wing: outer hand pivots at the wrist, whole wing pivots at the shoulder.
    float side = aPart.z;
    float spanT = aPart.y;
    float wOut = smoothstep(.39, .51, spanT);
    float wIn = smoothstep(.04, .14, spanT);

    // Subtle aero pitch twist on outer primaries during downstroke/upstroke.
    float twist = -(aWing.y + .22) * .28 * wOut;
    if (abs(twist) > 1e-4) {
      vec2 tyz = rot2(vec2(p.y - .015, p.z + .06), twist);
      p.y = tyz.x + .015; p.z = tyz.y - .06;
      vec2 nyz = rot2(n.yz, twist);
      n.yz = nyz;
    }

    // Outer wing bend around wrist joint + gentle backward sweep.
    vec2 wristPivot = vec2(side * .46, .012);
    float aOut = side * aWing.y * wOut;
    p.xy = wristPivot + rot2(p.xy - wristPivot, aOut);
    n.xy = rot2(n.xy, aOut);
    p.z += aWing.z * max(0.0, spanT - .44) * .55;

    // Inner wing dihedral / stroke around shoulder joint.
    vec2 shoulderPivot = vec2(side * .06, .012);
    float aIn = side * aWing.x * wIn;
    p.xy = shoulderPivot + rot2(p.xy - shoulderPivot, aIn);
    n.xy = rot2(n.xy, aIn);
  }

  // Right-handed world basis (R, U, -F) with aerodynamic banking into turns.
  vec3 F = normalize(aForward.xyz);
  vec3 upRef = abs(F.y) > .98 ? vec3(0.0, 0.0, -1.0) : vec3(0.0, 1.0, 0.0);
  vec3 rawR = normalize(cross(F, upRef));
  vec3 rawU = cross(rawR, F);
  float cb = cos(aForward.w), sb = sin(aForward.w);
  vec3 R = rawR * cb - rawU * sb;
  vec3 U = rawR * sb + rawU * cb;

  vec3 worldPos = aState.xyz + (R * p.x + U * p.y - F * p.z) * aState.w;
  vNormal = normalize(R * n.x + U * n.y - F * n.z);
  vLocalNorm = normalize(n);
  vec3 toPos = worldPos - uCamera;
  vDist = length(toPos);
  vViewDir = toPos / max(vDist, 1e-4);
  gl_Position = uViewProj * vec4(worldPos, 1.0);
}
`;

const GULL_FRAGMENT = /* glsl */`
${COMMON}
in vec3 vNormal;
in vec3 vLocalNorm;
in vec3 vViewDir;
in vec4 vPart;
in float vDist;
in float vAlpha;
out vec4 outColor;

void main() {
  if (vAlpha <= .002) discard;
  vec3 N = normalize(vNormal);
  float partId = vPart.x;
  float spanT = vPart.y;
  float chordT = vPart.w;

  // Classic coastal gull plumage: luminous white body/tail/underwing, pearl-grey mantle,
  // dark primary wingtips with crisp pale trailing margin, warm amber beak.
  vec3 albedo = vec3(.93, .94, .95);
  if (partId > .5 && partId < 1.5) {
    albedo = vec3(.84, .60, .22); // beak
  } else if (partId > 1.5 && partId < 2.5) {
    albedo = mix(vec3(.93, .94, .95), vec3(.82, .84, .88), smoothstep(.65, 1.0, chordT) * .3);
  } else if (partId > 2.5) {
    float upper = smoothstep(-.10, .20, vLocalNorm.y);
    float trailEdge = smoothstep(.76, .95, chordT) * (1.0 - smoothstep(.64, .82, spanT));
    vec3 upperWing = mix(vec3(.52, .56, .62), vec3(.92, .93, .95), trailEdge);
    vec3 underWing = mix(vec3(.88, .90, .93), vec3(.66, .70, .76), smoothstep(.62, 1.0, chordT) * .42);
    albedo = mix(underWing, upperWing, upper);
    // Crisp dark primary tips on outer hand feathers.
    float blackTip = smoothstep(.68, .80, spanT) * smoothstep(.04, .24, chordT + (spanT - .68) * 2.0);
    float mirror = smoothstep(.85, .90, spanT) * (1.0 - smoothstep(.90, .95, spanT)) * (1.0 - smoothstep(.28, .55, chordT));
    albedo = mix(albedo, vec3(.08, .09, .11), blackTip * (1.0 - mirror * .65));
  } else {
    // Subtle pearl saddle across the upper back between the wings.
    float backMask = smoothstep(.35, .82, vLocalNorm.y);
    albedo = mix(albedo, vec3(.66, .70, .75), backMask * .3);
  }

  // Physically-aligned coastal lighting: direct sun/moon + sky dome + bright sea-surface bounce
  // so white feathers read as luminous coastal white rather than dark silhouettes in daylight.
  float ndl = max(dot(N, uLightDir), 0.0);
  float wrap = max((dot(N, uLightDir) + .5) / 1.5, 0.0);
  float skyFill = .5 + .5 * N.y;
  vec3 horizonGlow = skyRadiance(normalize(vec3(vViewDir.x, .16, vViewDir.z)));
  vec3 seaBounce = (horizonGlow * .55 + uAmbient * .45 + uWaterDeep * 1.2) * (1.0 - skyFill);
  vec3 skyLight = mix(horizonGlow * .65, uAmbient * 1.15, skyFill) * (.45 + .55 * skyFill);
  // Warm translucent rim when wing feathers are backlit by low sunrise/sunset sun.
  float backlit = pow(max(dot(vViewDir, uLightDir), 0.0), 4.0) * smoothstep(1.5, 2.6, partId) * smoothstep(.45, 1.0, chordT);
  vec3 light = skyLight + seaBounce + uLightColor * (ndl * .55 + wrap * .24 + backlit * .45);

  vec3 color = albedo * light;
  color = applyFog(color, vViewDir, vDist * .55);
  vec3 mapped = dither(tonemap(color));
  outColor = vec4(mapped * vAlpha, vAlpha);
}
`;

// Sculpted 3D flying fish mesh: streamlined silver body, forked caudal tail,
// swept dorsal fin, and gliding pectoral wing-fins.
// Local space is right-handed: +X right, +Y up, -Z nose forward, +Z tail.
function buildFishMesh() {
  const pos = [], part = [], indices = [];
  const addVert = (x, y, z, pid, spanT, side, chordT) => {
    const idx = pos.length / 3;
    pos.push(x, y, z);
    part.push(pid, spanT, side, chordT);
    return idx;
  };
  const loftRings = (rings, flip = false) => {
    const n = rings[0].length;
    for (let i = 0; i < rings.length - 1; i++) {
      const a = rings[i], b = rings[i + 1];
      for (let j = 0; j < n; j++) {
        const jn = (j + 1) % n;
        const v00 = a[j], v10 = b[j], v11 = b[jn], v01 = a[jn];
        if (!flip) indices.push(v00, v10, v11, v00, v11, v01);
        else indices.push(v00, v11, v10, v00, v01, v11);
      }
    }
  };

  // 1. Streamlined fusiform body (z from tail peduncle +0.58 to snout -0.68).
  const bodyStations = [
    [ .58,  .000, .001, .002],
    [ .54,  .000, .016, .030],
    [ .40,  .002, .036, .062],
    [ .22,  .004, .060, .098],
    [ .04,  .006, .082, .128],
    [-.14,  .006, .094, .142],
    [-.32,  .004, .092, .134],
    [-.46,  .000, .074, .106],
    [-.56, -.004, .048, .070],
    [-.63, -.006, .024, .036],
    [-.68, -.008, .001, .001],
  ];
  const RINGS = 10;
  const bodyRings = bodyStations.map(([z, yc, rx, ry]) => {
    const ring = [];
    for (let j = 0; j < RINGS; j++) {
      const a = (j / RINGS) * Math.PI * 2;
      ring.push(addVert(rx * Math.cos(a), yc + ry * Math.sin(a), z, 0, 0, 0, (z + .68) / 1.26));
    }
    return ring;
  });
  loftRings(bodyRings, false);

  // 2. Forked caudal tail fin (upper & lower swept lobes for an authentic V-fork).
  const lobeProfile = [
    [1.00, 0.00], [0.55, 0.85], [0.00, 0.00], [0.55, -0.85],
  ];
  for (const dirY of [1, -1]) {
    const lobeStations = [
      // spanY, leadZ, trailZ, halfThick
      [0.015, 0.50, 0.62, 0.014],
      [0.09,  0.58, 0.72, 0.010],
      [0.18,  0.69, 0.84, 0.007],
      [0.27,  0.83, 0.94, 0.004],
      [0.33,  0.94, 0.97, 0.001],
    ];
    const rings = lobeStations.map(([sy, leadZ, trailZ, th], si) =>
      lobeProfile.map(([c, xf]) => {
        const z = leadZ + (trailZ - leadZ) * c;
        return addVert(th * xf, dirY * sy, z, 1, si / 4, 0, c);
      }));
    loftRings(rings, dirY > 0);
  }

  // 3. Swept dorsal fin along upper back.
  const dorsalStations = [
    [0.09, -0.02, 0.30, 0.012],
    [0.16,  0.07, 0.34, 0.008],
    [0.23,  0.18, 0.38, 0.004],
    [0.27,  0.29, 0.36, 0.001],
  ];
  const dorsalRings = dorsalStations.map(([y, leadZ, trailZ, th], si) =>
    lobeProfile.map(([c, xf]) => addVert(th * xf, y, leadZ + (trailZ - leadZ) * c, 1, si / 3, 0, c)));
  loftRings(dorsalRings, true);

  // 4. Translucent gliding pectoral wing-fins (left & right).
  const pecStations = [
    // spanX, yOff, leadZ, trailZ, thick
    [0.06, -0.01, -0.28,  0.02, 0.012],
    [0.20,  0.01, -0.22,  0.09, 0.009],
    [0.36,  0.025, -0.11, 0.17, 0.006],
    [0.52,  0.02,  0.03,  0.24, 0.0035],
    [0.64,  0.005, 0.16,  0.28, 0.0015],
    [0.70, -0.01,  0.24,  0.28, 0.0005],
  ];
  const pecProfile = [
    [1.00, 0.00], [0.55, 0.90], [0.00, 0.00], [0.55, -0.45],
  ];
  for (const side of [1, -1]) {
    const rings = pecStations.map(([sx, yo, leadZ, trailZ, th]) =>
      pecProfile.map(([c, yf]) => {
        const z = leadZ + (trailZ - leadZ) * c;
        return addVert(side * sx, yo + th * yf, z, 2, sx / .70, side, c);
      }));
    loftRings(rings, side < 0);
  }

  const vCount = pos.length / 3;
  const norm = new Float32Array(pos.length);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3, ib = indices[i + 1] * 3, ic = indices[i + 2] * 3;
    const abx = pos[ib] - pos[ia], aby = pos[ib + 1] - pos[ia + 1], abz = pos[ib + 2] - pos[ia + 2];
    const acx = pos[ic] - pos[ia], acy = pos[ic + 1] - pos[ia + 1], acz = pos[ic + 2] - pos[ia + 2];
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    for (const k of [ia, ib, ic]) { norm[k] += nx; norm[k + 1] += ny; norm[k + 2] += nz; }
  }
  const verts = new Float32Array(vCount * 10);
  for (let i = 0; i < vCount; i++) {
    const nx = norm[i * 3], ny = norm[i * 3 + 1], nz = norm[i * 3 + 2];
    const inv = 1 / (Math.hypot(nx, ny, nz) || 1);
    const o = i * 10;
    verts[o] = pos[i * 3]; verts[o + 1] = pos[i * 3 + 1]; verts[o + 2] = pos[i * 3 + 2];
    verts[o + 3] = nx * inv; verts[o + 4] = ny * inv; verts[o + 5] = nz * inv;
    verts[o + 6] = part[i * 4]; verts[o + 7] = part[i * 4 + 1]; verts[o + 8] = part[i * 4 + 2]; verts[o + 9] = part[i * 4 + 3];
  }
  return { verts, indices: new Uint16Array(indices) };
}

const FISH_VERTEX = /* glsl */`
in vec3 aPos;
in vec3 aNorm;
in vec4 aPart;     // partId (0 body, 1 tail/dorsal, 2 pectoral wing), spanT, side, chordT
in vec4 aState;    // world x, y, z, scale (meters)
in vec4 aForward;  // unit velocity x, y, z, roll (rad)
in vec4 aMeta;     // alpha, seed, unused, unused
uniform mat4 uViewProj;
uniform vec3 uCamera;
uniform float uTime;
out vec3 vNormal;
out vec3 vLocalNorm;
out vec3 vViewDir;
out vec4 vPart;
out float vDist;
out float vAlpha;

void main() {
  vPart = aPart;
  vAlpha = aMeta.x;
  if (vAlpha <= .002) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vNormal = vec3(0.0, 1.0, 0.0);
    vLocalNorm = vNormal;
    vViewDir = vec3(0.0, 0.0, -1.0);
    vDist = 100.0;
    return;
  }

  vec3 p = aPos;
  vec3 n = aNorm;
  float phase = p.z * 5.2 - uTime * 22.0 + aMeta.y * 6.283;
  float tailFlex = smoothstep(-.25, .95, p.z);
  p.x += sin(phase) * .085 * tailFlex;
  p.y -= .08 * p.z * p.z;
  if (aPart.x > 1.5) {
    // Subtle gliding flutter on the outstretched pectoral wing-fins.
    p.y += sin(uTime * 16.0 + aMeta.y * 9.0 - aPart.y * 2.4) * .025 * aPart.y;
  }

  vec3 F = normalize(aForward.xyz);
  vec3 upRef = abs(F.y) > .98 ? vec3(0.0, 0.0, -1.0) : vec3(0.0, 1.0, 0.0);
  vec3 rawR = normalize(cross(F, upRef));
  vec3 rawU = cross(rawR, F);
  float cb = cos(aForward.w), sb = sin(aForward.w);
  vec3 R = rawR * cb - rawU * sb;
  vec3 U = rawR * sb + rawU * cb;

  vec3 worldPos = aState.xyz + (R * p.x + U * p.y - F * p.z) * aState.w;
  vNormal = normalize(R * n.x + U * n.y - F * n.z);
  vLocalNorm = normalize(n);
  vec3 toPos = worldPos - uCamera;
  vDist = length(toPos);
  vViewDir = toPos / max(vDist, 1e-4);
  gl_Position = uViewProj * vec4(worldPos, 1.0);
}
`;

const FISH_FRAGMENT = /* glsl */`
${COMMON}
in vec3 vNormal;
in vec3 vLocalNorm;
in vec3 vViewDir;
in vec4 vPart;
in float vDist;
in float vAlpha;
out vec4 outColor;

void main() {
  if (vAlpha <= .002) discard;
  vec3 N = normalize(vNormal);
  vec3 V = -normalize(vViewDir);
  float partId = vPart.x;

  // Deep ocean-blue dorsal back grading to liquid-silver flanks and translucent blue-white fins.
  vec3 albedo;
  float alpha = vAlpha;
  if (partId < .5) {
    float dorsal = smoothstep(-.08, .55, vLocalNorm.y);
    albedo = mix(vec3(.90, .95, 1.0), vec3(.05, .15, .30), dorsal);
  } else {
    albedo = mix(vec3(.55, .68, .82), vec3(.86, .92, .98), smoothstep(.4, 1.0, vPart.y));
    alpha *= mix(.82, .68, smoothstep(.2, 1.0, vPart.y));
  }

  float fresnel = .08 + .92 * pow(1.0 - max(dot(N, V), 0.0), 4.0);
  vec3 R = reflect(-V, N); R.y = abs(R.y) + .05;
  vec3 env = skyRadiance(normalize(R));
  vec3 H = normalize(V + uLightDir);
  float spec = pow(max(dot(N, H), 0.0), 44.0) * (1.4 + fresnel * 1.6);
  float ndl = max(dot(N, uLightDir), 0.0);
  float wrap = max((dot(N, uLightDir) + .45) / 1.45, 0.0);
  vec3 color = albedo * (uAmbient * 1.15 + uLightColor * (ndl * .6 + wrap * .24))
             + env * fresnel * .48 + uLightColor * spec * 1.5;

  color = applyFog(color, vViewDir, vDist * .45);
  vec3 mapped = dither(tonemap(color));
  outColor = vec4(mapped * alpha, alpha);
}
`;

const SPLASH_VERTEX = /* glsl */`
in vec4 aState;   // world x, y, z, radius (meters)
in vec4 aMeta;    // kind (0 droplet, 1 surface foam ring), alpha, progress, seed
uniform mat4 uViewProj;
uniform vec3 uCamera;
uniform vec2 uViewport;
out vec2 vQuad;
out vec3 vViewDir;
out float vDist;
out float vKind;
out float vAlpha;
out float vProgress;

void main() {
  vec2 q = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)) * 2.0 - 1.0;
  vQuad = q;
  vKind = aMeta.x;
  vAlpha = aMeta.y;
  vProgress = aMeta.z;

  vec3 pos = aState.xyz;
  vec3 toPos = pos - uCamera;
  vDist = length(toPos);
  vViewDir = toPos / max(vDist, 1e-4);

  vec4 clip = uViewProj * vec4(pos, 1.0);
  if (clip.w <= .2 || vAlpha <= .002) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAlpha = 0.0;
    return;
  }

  float pxPerMeter = 1.2 * uViewport.y / clip.w;
  vec2 sizePx = vKind > .5
    ? vec2(aState.w * pxPerMeter, aState.w * pxPerMeter * .28)
    : vec2(max(aState.w * pxPerMeter, 1.5));
  clip.xy += q * sizePx / uViewport * 2.0 * clip.w;
  gl_Position = clip;
}
`;

const SPLASH_FRAGMENT = /* glsl */`
${COMMON}
in vec2 vQuad;
in vec3 vViewDir;
in float vDist;
in float vKind;
in float vAlpha;
in float vProgress;
out vec4 outColor;

void main() {
  if (vAlpha <= .002) discard;
  float r = length(vQuad);
  float alpha;
  if (vKind > .5) {
    // Expanding foamy splash crown ring on the water surface.
    float ringR = mix(.22, .88, vProgress);
    float ring = exp(-pow((r - ringR) * 7.5, 2.0));
    float innerMist = exp(-r * r * 5.0) * (1.0 - vProgress) * .55;
    alpha = (ring + innerMist) * smoothstep(1.0, .7, r) * vAlpha;
  } else {
    alpha = smoothstep(1.0, .2, r) * vAlpha;
  }
  if (alpha < .004) discard;
  vec3 color = (uAmbient * 1.45 + uLightColor * .65 + vec3(.05)) * vec3(.90, .95, 1.0);
  color = applyFog(color, vViewDir, vDist * .42);
  vec3 mapped = dither(tonemap(color));
  outColor = vec4(mapped * alpha, alpha);
}
`;

export class Wildlife {
  constructor(renderer) {
    const gl = renderer.gl;
    this.gl = gl;

    // 1. Sculpted 3D seagull instanced pass.
    this.gullProgram = new Program(gl, { vertex: GULL_VERTEX, fragment: GULL_FRAGMENT, defines: renderer.lutDefines, label: 'gulls' });
    const mesh = buildGullMesh();
    this.gullIndexCount = mesh.indices.length;
    this.gullData = new Float32Array(MAX_GULLS * 12);
    this.gullActiveCount = 0;
    this.gullVao = gl.createVertexArray();
    gl.bindVertexArray(this.gullVao);
    this.gullMeshBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gullMeshBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.verts, gl.STATIC_DRAW);
    const gp = this.gullProgram.program;
    for (const [name, size, offset] of [['aPos', 3, 0], ['aNorm', 3, 12], ['aPart', 4, 24]]) {
      const loc = gl.getAttribLocation(gp, name);
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 40, offset);
      }
    }
    this.gullIndexBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.gullIndexBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    this.gullInstBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gullInstBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.gullData.byteLength, gl.DYNAMIC_DRAW);
    for (const [name, offset] of [['aState', 0], ['aForward', 16], ['aWing', 32]]) {
      const loc = gl.getAttribLocation(gp, name);
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 48, offset);
        gl.vertexAttribDivisor(loc, 1);
      }
    }
    gl.bindVertexArray(null);

    // 2. Sculpted 3D leaping flying fish instanced pass.
    this.fishProgram = new Program(gl, { vertex: FISH_VERTEX, fragment: FISH_FRAGMENT, defines: renderer.lutDefines, label: 'fish' });
    const fishMesh = buildFishMesh();
    this.fishIndexCount = fishMesh.indices.length;
    this.fishData = new Float32Array(MAX_FISH * 12);
    this.fishActiveCount = 0;
    this.fishVao = gl.createVertexArray();
    gl.bindVertexArray(this.fishVao);
    this.fishMeshBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fishMeshBuf);
    gl.bufferData(gl.ARRAY_BUFFER, fishMesh.verts, gl.STATIC_DRAW);
    const fp = this.fishProgram.program;
    for (const [name, size, offset] of [['aPos', 3, 0], ['aNorm', 3, 12], ['aPart', 4, 24]]) {
      const loc = gl.getAttribLocation(fp, name);
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 40, offset);
      }
    }
    this.fishIndexBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.fishIndexBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, fishMesh.indices, gl.STATIC_DRAW);
    this.fishInstBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fishInstBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.fishData.byteLength, gl.DYNAMIC_DRAW);
    for (const [name, offset] of [['aState', 0], ['aForward', 16], ['aMeta', 32]]) {
      const loc = gl.getAttribLocation(fp, name);
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 48, offset);
        gl.vertexAttribDivisor(loc, 1);
      }
    }
    gl.bindVertexArray(null);

    // 3. Splash spray droplets & expanding water-surface foam rings.
    this.splashProgram = new Program(gl, { vertex: SPLASH_VERTEX, fragment: SPLASH_FRAGMENT, defines: renderer.lutDefines, label: 'splash' });
    this.splashData = new Float32Array(MAX_SPLASH * 8);
    this.splashCount = 0;
    this.splashVao = gl.createVertexArray();
    gl.bindVertexArray(this.splashVao);
    this.splashBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.splashBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.splashData.byteLength, gl.DYNAMIC_DRAW);
    const sp = this.splashProgram.program;
    for (const [name, offset] of [['aState', 0], ['aMeta', 16]]) {
      const loc = gl.getAttribLocation(sp, name);
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 32, offset);
        gl.vertexAttribDivisor(loc, 1);
      }
    }
    gl.bindVertexArray(null);

    this.life = 0;
    this.seed = 48271;
    this.viewport = new Float32Array(2);

    // Off-screen-in -> off-screen-out gull pass pool (no looping orbits).
    this.gulls = Array.from({ length: MAX_GULLS }, () => ({ active: false }));
    this.lastSide = -1;
    this.nextPassAt = .2;
    this.firstPass = true;

    // 1 infrequent autonomous leap slot + 1 click-triggered slot.
    this.leaps = [
      { active: false, nextAt: 3.5, age: 0, duration: 1.25, x0: -6, z0: -46, x1: 0, z1: -44, height: 2.3, launched: false, splashed: false, seed: .2 },
      { active: false, nextAt: Infinity, age: 0, duration: 1.22, x0: 4, z0: -48, x1: -2, z1: -46, height: 2.1, launched: false, splashed: false, seed: .7 },
    ];
  }

  rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  get gullCount() {
    return this.gullActiveCount;
  }

  get activeLeaps() {
    return this.leaps.filter(l => l.active && l.age <= l.duration).length;
  }

  spawnGullPass(world) {
    const cam = world.frame.camera;
    const tanX = Math.max(cam.tanHalfX || .74, .62);
    const tanY = Math.max(cam.tanHalfY || .41, .34);
    // Alternate directions naturally so birds don't always stream from one edge.
    const dir = this.firstPass ? 1 : (this.rand() < .72 ? -this.lastSide : this.lastSide);
    this.lastSide = dir;

    const r = this.rand();
    const count = this.firstPass ? 2 : (r < .48 ? 1 : r < .86 ? 2 : 3);
    const baseDepth = this.firstPass ? 32 : 26 + this.rand() * 20;
    // Noticeable oblique crossing depth so gulls show graceful 3D swept wings instead of flat side edges.
    const depthSign = this.rand() < .5 ? 1 : -1;
    const depthDelta = depthSign * (12 + this.rand() * 12);
    const altFrac = this.firstPass ? .40 : .22 + this.rand() * .40;
    const altDrift = (this.rand() - .5) * .16;
    const baseSpeed = 8.4 + this.rand() * 2.4;
    const zBow = -depthSign * (4.0 + this.rand() * 6.0);
    const yBow = (this.rand() - .42) * 2.6;
    const glideBankBias = (this.rand() < .5 ? 1 : -1) * (.22 + this.rand() * .16);

    for (let i = 0; i < MAX_GULLS; i++) {
      const g = this.gulls[i];
      if (i >= count) { g.active = false; continue; }
      const d0 = Math.max(19, baseDepth + depthDelta * -.5 + i * (3.2 + this.rand() * 3.8));
      const d1 = Math.max(19, baseDepth + depthDelta * .5 + i * (3.2 + this.rand() * 3.8));
      // Start and end well outside the current viewport frustum (+12m margin).
      const edge0 = d0 * (tanX + .09) + 12;
      const edge1 = d1 * (tanX + .09) + 12;
      const x0 = -dir * edge0;
      const x1 = dir * edge1;
      const z0 = -d0;
      const z1 = -d1;
      const skySpan = Math.max(tanY - .09, .22);
      const frac0 = Math.max(.15, Math.min(.68, altFrac + (i ? (this.rand() - .5) * .14 : 0)));
      const frac1 = Math.max(.15, Math.min(.68, frac0 + altDrift));
      const y0 = 6.4 + d0 * (.05 + frac0 * skySpan);
      const y1 = 6.4 + d1 * (.05 + frac1 * skySpan);
      const pathLen = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      const speed = baseSpeed * (.94 + this.rand() * .14);
      const duration = pathLen / speed;
      const delay = i === 0 ? 0 : i * (.85 + this.rand() * .95);

      g.active = true;
      g.age = (this.firstPass && i === 0 ? .8 : 0) - delay;
      g.duration = duration;
      g.x0 = x0; g.y0 = y0; g.z0 = z0;
      g.x1 = x1; g.y1 = y1; g.z1 = z1;
      g.xm = (x0 + x1) * .5;
      g.ym = (y0 + y1) * .5 + yBow + (this.rand() - .5) * 1.1;
      g.zm = (z0 + z1) * .5 + zBow + (this.rand() - .5) * 2.5;
      g.scale = .80 + this.rand() * .16; // half-wingspan (total wingspan ~1.6–1.9m)
      g.bankBias = glideBankBias * (.85 + this.rand() * .3);
      g.beatFreq = 11.4 + this.rand() * 2.2; // ~1.8–2.2 calm beats/sec
      g.beatOffset = this.rand() * Math.PI * 2;
      g.glideOffset = this.rand() * Math.PI * 2;
      g.glideRate = .48 + this.rand() * .24;
      g.seed = this.rand();
    }
    this.firstPass = false;
  }

  gullSample(g, u, cruise) {
    // Quadratic Bezier sweep across the bay + gentle wind undulation.
    const omt = 1 - u;
    const x = omt * omt * g.x0 + 2 * omt * u * g.xm + u * u * g.x1;
    const y = omt * omt * g.y0 + 2 * omt * u * g.ym + u * u * g.y1 + Math.sin(u * Math.PI * 2.0 + g.glideOffset) * .45;
    const z = -cruise + omt * omt * g.z0 + 2 * omt * u * g.zm + u * u * g.z1;
    return { x, y, z };
  }

  spawnLeap(slot, world, centerX, centerZ) {
    const dir = this.rand() < .5 ? 1 : -1;
    const x0 = Number.isFinite(centerX)
      ? Math.max(-20, Math.min(14, centerX + (this.rand() - .5) * 4.0))
      : -16 + this.rand() * 24;
    const z0 = Number.isFinite(centerZ)
      ? Math.max(-world.cruise - 62, Math.min(-world.cruise - 34, centerZ))
      : -world.cruise - (38 + this.rand() * 24);
    slot.active = true;
    slot.age = 0;
    slot.duration = 1.15 + this.rand() * .25;
    slot.x0 = x0;
    slot.z0 = z0;
    slot.x1 = x0 + dir * (4.2 + this.rand() * 2.6);
    slot.z1 = z0 + (this.rand() - .5) * 4.5;
    slot.height = 1.9 + this.rand() * .9;
    slot.launched = false;
    slot.splashed = false;
    slot.seed = this.rand();
  }

  triggerNear(world) {
    if (world.paused) return;
    const last = world.ripples[world.ripples.length - 1];
    const idle = this.leaps.find(l => !l.active);
    if (idle) this.spawnLeap(idle, world, last?.x, last?.z);
  }

  pushGull(x, y, z, scale, fx, fy, fz, bank, innerAngle, outerAngle, wingSweep, alpha) {
    if (this.gullActiveCount >= MAX_GULLS) return;
    const o = this.gullActiveCount * 12, d = this.gullData;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = scale;
    d[o + 4] = fx; d[o + 5] = fy; d[o + 6] = fz; d[o + 7] = bank;
    d[o + 8] = innerAngle; d[o + 9] = outerAngle; d[o + 10] = wingSweep; d[o + 11] = alpha;
    this.gullActiveCount++;
  }

  pushFish(x, y, z, scale, fx, fy, fz, roll, alpha, seed) {
    if (this.fishActiveCount >= MAX_FISH) return;
    const o = this.fishActiveCount * 12, d = this.fishData;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = scale;
    d[o + 4] = fx; d[o + 5] = fy; d[o + 6] = fz; d[o + 7] = roll;
    d[o + 8] = alpha; d[o + 9] = seed; d[o + 10] = 0; d[o + 11] = 0;
    this.fishActiveCount++;
  }

  pushSplash(x, y, z, radius, kind, alpha, progress, seed) {
    if (this.splashCount >= MAX_SPLASH) return;
    const o = this.splashCount * 8, d = this.splashData;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = radius;
    d[o + 4] = kind; d[o + 5] = alpha; d[o + 6] = progress; d[o + 7] = seed;
    this.splashCount++;
  }

  update(world, dt, { reducedMotion = false } = {}) {
    const animate = !world.paused && !reducedMotion;
    if (animate) this.life += dt;
    this.gullActiveCount = 0;
    this.fishActiveCount = 0;
    this.splashCount = 0;

    // 1. Sculpted 3D seagulls flying in from off-screen and out past the far edge.
    const weatherFade = 1 - Math.min(.78, world.weather.active * (world.weather.fog * .68 + world.weather.storm * .5));
    let anyPassAlive = false;
    for (let i = 0; i < this.gulls.length; i++) {
      const g = this.gulls[i];
      if (!g.active) continue;
      if (animate) g.age += dt;
      if (g.age > g.duration) { g.active = false; continue; }
      anyPassAlive = true;
      if (g.age < 0) continue;

      const u = g.age / g.duration;
      const eps = .008;
      const pos = this.gullSample(g, u, world.cruise);
      const prev = this.gullSample(g, Math.max(0, u - eps), world.cruise);
      const next = this.gullSample(g, Math.min(1, u + eps), world.cruise);
      const du = (Math.min(1, u + eps) - Math.max(0, u - eps)) * g.duration || .05;
      const vx = (next.x - prev.x) / du;
      const vy = (next.y - prev.y) / du;
      const vz = (next.z - prev.z) / du;
      const speed = Math.hypot(vx, vy, vz) || 1;
      const fx = vx / speed, fy = vy / speed, fz = vz / speed;

      // Natural bank matching horizontal curvature + gentle coastal crosswind lean.
      const h1 = Math.atan2(pos.z - prev.z, pos.x - prev.x);
      const h2 = Math.atan2(next.z - pos.z, next.x - pos.x);
      const turnRate = Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1)) / (du * .5);
      const breezeRoll = Math.sin(g.age * .85 + g.glideOffset) * .16 + (g.bankBias || 0) * Math.sin(u * Math.PI);
      const bank = Math.max(-.52, Math.min(.52, turnRate * 1.6 + breezeRoll));

      // Natural coastal rhythm: 3–4 calm wingbeats alternating with arched gull-M glides.
      const cycle = Math.sin(g.age * g.glideRate + g.glideOffset) + .35 * Math.sin(g.age * g.glideRate * 2.1 + g.seed * 6.0);
      const climbBoost = Math.max(0, Math.min(1, (vy + .12) / .7));
      const rawEnv = Math.max(0, Math.min(1, (cycle + .18) * 1.35 + climbBoost * .45));
      const flapEnv = rawEnv * rawEnv * (3 - 2 * rawEnv);

      const beat = g.age * g.beatFreq + g.beatOffset;
      const s1 = Math.sin(beat);
      const s2 = Math.sin(beat - .95); // wrist & outer primaries lag behind the shoulder
      const glideInner = .34 + Math.sin(g.age * 1.2 + g.glideOffset) * .03;
      const glideOuter = -.52;
      const flapInner = .08 + .52 * s1;
      const flapOuter = -.16 + .58 * s2 - .18 * Math.max(0, s1);

      const innerAngle = glideInner + (flapInner - glideInner) * flapEnv;
      const outerAngle = glideOuter + (flapOuter - glideOuter) * flapEnv;
      const wingSweep = .14 + (.04 + .16 * Math.max(0, s1) - .14) * flapEnv;
      const bobY = -.042 * s1 * flapEnv * g.scale;

      // Soft alpha feather only right at the far off-screen margins as a safeguard.
      const edgeAlpha = Math.min(1, u / .04) * Math.min(1, (1 - u) / .04);
      this.pushGull(pos.x, pos.y + bobY, pos.z, g.scale, fx, fy, fz, bank, innerAngle, outerAngle, wingSweep, weatherFade * edgeAlpha);
    }

    if (!anyPassAlive && animate) {
      if (!Number.isFinite(this.nextPassAt)) {
        this.nextPassAt = this.life + 4.5 + this.rand() * 6.5;
      } else if (this.life >= this.nextPassAt) {
        this.spawnGullPass(world);
        this.nextPassAt = Infinity;
      }
    }

    if (this.gullActiveCount) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.gullInstBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.gullData, 0, this.gullActiveCount * 12);
    }

    // 2. Distant, infrequent leaping fish + subtle splashes + synced ripples.
    for (let s = 0; s < this.leaps.length; s++) {
      const l = this.leaps[s];
      if (!l.active) {
        if (s === 0 && animate && this.life >= l.nextAt) {
          this.spawnLeap(l, world);
        }
        continue;
      }
      if (animate) l.age += dt;
      const u = l.age / l.duration;
      if (u >= 1.45) {
        l.active = false;
        l.nextAt = s === 0 ? this.life + 11 + this.rand() * 7 : Infinity;
        continue;
      }
      if (animate && !l.launched && u >= .02) {
        l.launched = true;
        world.addRipple(l.x0, l.z0, .45);
      }
      if (animate && !l.splashed && u >= .92) {
        l.splashed = true;
        world.addRipple(l.x1, l.z1, .55);
      }
      if (u <= 1.02) {
        const cu = Math.min(1, u);
        const fx = l.x0 + (l.x1 - l.x0) * cu;
        const fz = l.z0 + (l.z1 - l.z0) * cu;
        const baseY = world.waterHeight(fx, fz);
        const fy = baseY + 4 * l.height * cu * (1 - cu) - .14;
        const vx = (l.x1 - l.x0) / l.duration;
        const vz = (l.z1 - l.z0) / l.duration;
        const vy = 4 * l.height * (1 - 2 * cu) / l.duration;
        const spd = Math.hypot(vx, vy, vz) || 1;
        const roll = Math.sin(cu * Math.PI) * (l.x1 >= l.x0 ? -.34 : .34);
        const fade = Math.min(1, u / .06) * Math.min(1, Math.max(0, (1.02 - u) / .08));
        this.pushFish(fx, fy, fz, .68, vx / spd, vy / spd, vz / spd, roll, fade, l.seed);
      }

      for (const [originX, originZ, tStart, tSpan, spread] of [
        [l.x0, l.z0, .02, .48, .90],
        [l.x1, l.z1, .90, .55, 1.15],
      ]) {
        const local = u - tStart;
        if (local < 0 || local > tSpan) continue;
        const p = local / tSpan;
        const tSec = local * l.duration;
        const waterY = world.waterHeight(originX, originZ);
        // Expanding white foam crown ring right on the sea surface.
        this.pushSplash(originX, waterY + .08, originZ, (.95 + p * 1.35) * spread, 1, (1 - p) * .72, p, l.seed);
        // Delicate glistening spray droplets arcing outward.
        const dropAlpha = Math.max(0, 1 - p) * .88;
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2 + l.seed * 6.28 + tStart * 4.0;
          const speed = (1.15 + (k % 3) * .55) * spread;
          const dx = Math.cos(a) * speed * tSec;
          const dz = Math.sin(a) * speed * tSec;
          const vUp = (2.6 + (k % 3) * .85) * spread;
          const dy = vUp * tSec - .5 * 14.5 * tSec * tSec;
          if (dy < -.32) continue;
          this.pushSplash(originX + dx, waterY + dy + .06, originZ + dz, .042 + (k % 2) * .022, 0, dropAlpha, p, l.seed);
        }
      }
    }

    const gl = this.gl;
    if (this.fishActiveCount) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.fishInstBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.fishData, 0, this.fishActiveCount * 12);
    }
    if (this.splashCount) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.splashBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.splashData, 0, this.splashCount * 8);
    }
    return animate;
  }

  draw(frame, renderer) {
    if (!frame.sea.visible || frame.camera.underwater) return;
    const gl = this.gl;

    if (this.gullActiveCount) {
      const gp = this.gullProgram.use();
      renderer.shareAtmosphere(gp, frame);
      gp.set('uViewProj', frame.camera.viewProj).set('uCamera', frame.camera.eye)
        .set('uWaterDeep', frame.atmosphere.water);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(this.gullVao);
      gl.drawElementsInstanced(gl.TRIANGLES, this.gullIndexCount, gl.UNSIGNED_SHORT, 0, this.gullActiveCount);
      gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    }

    if (this.fishActiveCount) {
      const fp = this.fishProgram.use();
      renderer.shareAtmosphere(fp, frame);
      fp.set('uViewProj', frame.camera.viewProj).set('uCamera', frame.camera.eye)
        .set('uTime', frame.time).set('uWaterDeep', frame.atmosphere.water);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(this.fishVao);
      gl.drawElementsInstanced(gl.TRIANGLES, this.fishIndexCount, gl.UNSIGNED_SHORT, 0, this.fishActiveCount);
      gl.disable(gl.BLEND);
    }

    if (this.splashCount) {
      const sp = this.splashProgram.use();
      renderer.shareAtmosphere(sp, frame);
      this.viewport[0] = renderer.width; this.viewport[1] = renderer.height;
      sp.set('uViewProj', frame.camera.viewProj).set('uCamera', frame.camera.eye)
        .set('uViewport', this.viewport).set('uWaterDeep', frame.atmosphere.water);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(this.splashVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.splashCount);
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
  }
}
