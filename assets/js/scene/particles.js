import { Program } from '../gl/context.js';

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
void main() {
  int corner = gl_VertexID % 4;
  int kind = gl_VertexID / 4;          // 0 halo, 1 core, 2 pole
  vec2 q = vec2(float(corner & 1), float((corner >> 1) & 1)) * 2.0 - 1.0;
  vQuad = q; vColor = aColor.rgb; vLevel = aLantern.w; vKind = float(kind);
  float flicker = .94 + .06 * sin(uTime * 7.3 + aLantern.x) * sin(uTime * 3.1 + aLantern.z);
  vec4 clip = uViewProj * vec4(aLantern.xyz, 1.0);
  float pixels = uViewport.y / clip.w;
  vec2 size;
  if (kind == 0) size = vec2(1.0) * pixels * (1.5 + aLantern.w * .9) * flicker;
  else if (kind == 1) size = vec2(1.0) * max(pixels * .22, 2.5);
  else {
    // A faint column of light from the lamp down to the water.
    vec4 base = uViewProj * vec4(aLantern.xyz - vec3(0.0, 2.6, 0.0), 1.0);
    clip = mix(base, clip, q.y * .5 + .5);
    size = vec2(max(pixels * .03, 1.0), 0.0);
  }
  clip.xy += q * size / uViewport * 2.0 * clip.w * vec2(1.0, kind == 2 ? 0.0 : 1.0);
  gl_Position = clip;
  vColor *= aColor.a * flicker;
}
`;

const LANTERN_FRAGMENT = /* glsl */`
in vec2 vQuad;
in vec3 vColor;
in float vLevel;
in float vKind;
out vec4 outColor;
void main() {
  float r = length(vQuad);
  vec3 c;
  if (vKind < .5) c = vColor * (exp(-r * r * 10.0) * (.32 + vLevel * .4) + exp(-r * 4.0) * .07);
  else if (vKind < 1.5) c = mix(vColor, vec3(1.0, .97, .9), .6) * smoothstep(1.0, .35, r) * 2.2;
  else c = vColor * (1.0 - abs(vQuad.x)) * (.18 + .3 * (vQuad.y * .5 + .5));
  outColor = vec4(c, 0.0);
}
`;

export class Particles {
  constructor(renderer, count = 6000) {
    const gl = renderer.gl;
    this.gl = gl;
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
    // Three quads per lantern: halo, core and the column of light.
    const indices = [];
    for (let k = 0; k < 3; k++) { const o = k * 4; indices.push(o, o + 1, o + 2, o + 2, o + 1, o + 3); }
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
    gl.drawElementsInstanced(gl.TRIANGLES, 18, gl.UNSIGNED_SHORT, 0, this.count);
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
}
