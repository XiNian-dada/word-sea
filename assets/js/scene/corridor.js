import { Program, createTexture } from '../gl/context.js';
import { FULLSCREEN_VERTEX } from '../gl/shaders/sky.js';
import { CORRIDOR_FRAGMENT } from '../gl/shaders/corridor.js';
import { clamp, lerp, smoothstep } from '../core/math.js';

const WALL = 4.2;
const READING_TAN = 1 / 1.62;
const LIGHT_ELEVATION = .12 + Math.atan(.17 * READING_TAN);

/** The quotation corridor, drawn over the sea while diving and alone while reading. */
export class Corridor {
  constructor(renderer) {
    const gl = renderer.gl;
    this.gl = gl;
    this.caps = renderer.caps;
    this.program = new Program(gl, { vertex: FULLSCREEN_VERTEX, fragment: CORRIDOR_FRAGMENT, defines: { FULLSCREEN_DEPTH: '0.0' }, label: 'corridor' });
    this.vao = renderer.vao;
    this.quotes = createTexture(gl, { width: 1, height: 1, data: new Uint8Array(4), wrap: gl.REPEAT });
    this.ids = createTexture(gl, { width: 1, height: 1, data: new Uint8Array(4), wrap: gl.REPEAT, filter: gl.NEAREST });
    this.pickedPixels = new Uint8Array(256 * 4);
    this.picked = createTexture(gl, { width: 256, height: 1, data: this.pickedPixels, filter: gl.NEAREST });
    this.columns = [];
    this.tile = 1;
    this.ready = false;
    this.highlight = { target: 0, weights: new Float32Array(256), from: new Float32Array(256), started: 0, active: false, strength: 0 };
    this.state = { reveal: 0, travel: 0, descent: 0, blur: 0, exposure: 1.05, look: new Float32Array(2), tan: new Float32Array(2), angles: new Float32Array([.12, 0]), eyeX: 0, offsetY: .1, lightNdc: new Float32Array([0, .27]), glow: new Float32Array([.95, .74, .46]) };
  }

  updateCamera(camera, progress, aspect) {
    const s = this.state;
    // Match the sea's rays while both scenes are visible. Once the corridor
    // is opaque, ease towards its reading composition along the same timeline.
    const settle = smoothstep(.64, 1, progress);
    // The analytic corridor ray uses the opposite rotation signs to mat4.view.
    s.angles[0] = lerp(-camera.pitch, .12 + s.look[1] * .02, settle);
    s.angles[1] = lerp(-camera.yaw, s.look[0] * .035, settle);
    s.eyeX = lerp(camera.eye[0], s.look[0] * .25, settle);
    s.offsetY = lerp(0, .1, settle);
    s.tan[1] = lerp(camera.tanHalfY, READING_TAN, settle);
    s.tan[0] = s.tan[1] * aspect;

    // Project a fixed light direction so the light follows the turning view.
    const cp = Math.cos(s.angles[0]), sp = Math.sin(s.angles[0]);
    const cy = Math.cos(s.angles[1]), sy = Math.sin(s.angles[1]);
    const ly = Math.sin(LIGHT_ELEVATION), lz = -Math.cos(LIGHT_ELEVATION) * cy;
    const depth = sp * ly - cp * lz;
    s.lightNdc[0] = Math.cos(LIGHT_ELEVATION) * sy / depth / s.tan[0];
    s.lightNdc[1] = (cp * ly + sp * lz) / depth / s.tan[1] + s.offsetY;
  }

  setAtlas({ pixels, columns, size }) {
    const gl = this.gl;
    gl.deleteTexture(this.quotes);
    this.quotes = createTexture(gl, { width: size, height: size, data: pixels, wrap: gl.REPEAT, mipmaps: true, anisotropy: 8, caps: this.caps });
    const ids = new Uint8Array(size * 4);
    for (const column of columns) {
      for (let x = Math.floor(column.left); x < Math.min(size, Math.ceil(column.left + column.width)); x++) { ids[x * 4] = column.id + 1; ids[x * 4 + 3] = 255; }
    }
    gl.deleteTexture(this.ids);
    this.ids = createTexture(gl, { width: size, height: 1, data: ids, wrap: gl.REPEAT, filter: gl.NEAREST });
    this.columns = columns; this.tile = size; this.ready = true;
  }

  /** Fades every copy of one quotation to gold; `id` null puts it back. */
  setPicked(id, now, instant = false) {
    const next = id === null || id === undefined ? 0 : id + 1, h = this.highlight;
    if (next === h.target) return false;
    h.from.set(h.weights); h.target = next; h.started = now; h.active = true; h.instant = instant;
    return true;
  }

  updateHighlight(now) {
    const h = this.highlight;
    if (!h.active) return false;
    const t = h.instant ? 1 : clamp((now - h.started) / 520, 0, 1), ease = t * t * (3 - 2 * t);
    let strength = 0, changed = false;
    for (let id = 1; id < 256; id++) {
      const value = lerp(h.from[id], id === h.target ? 1 : 0, ease);
      h.weights[id] = value; strength = Math.max(strength, value);
      const byte = Math.round(value * 255);
      if (this.pickedPixels[id * 4] !== byte) { this.pickedPixels[id * 4] = byte; changed = true; }
    }
    h.strength = strength; h.active = t < 1;
    if (changed) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.picked);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pickedPixels);
    }
    return h.active;
  }

  /** Same ray as the shader: returns the quotation id under a screen point. */
  pick(clientX, clientY, width, height) {
    const s = this.state;
    if (!this.ready || s.reveal < .99) return null;
    const nx = clientX / width * 2 - 1, ny = 1 - clientY / height * 2;
    let dx = nx * s.tan[0], dy = (ny - s.offsetY) * s.tan[1], dz = -1;
    const length = Math.hypot(dx, dy, dz); dx /= length; dy /= length; dz /= length;
    const pitch = s.angles[0], cp = Math.cos(pitch), sp = Math.sin(pitch);
    [dy, dz] = [cp * dy - sp * dz, sp * dy + cp * dz];
    const yaw = s.angles[1], cy = Math.cos(yaw), sy = Math.sin(yaw);
    [dx, dz] = [cy * dx + sy * dz, -sy * dx + cy * dz];
    const side = dx >= 0 ? 1 : 0, ex = s.eyeX, ey = s.descent, ez = -s.travel;
    const t = ((side * 2 - 1) * WALL - ex) / dx;
    if (!(t > 0) || t > 90) return null;
    const hz = ez + dz * t, hy = ey + dy * t;
    const u = (side ? -hz : hz) / 20 + side * .317, v = -hy / 10.5 + side * .193;
    const x = (u - Math.floor(u)) * this.tile, y = (v - Math.floor(v)) * this.tile;
    const column = this.columns.find(c => x >= c.left && x <= c.left + c.width);
    if (!column) return null;
    const offset = ((y - column.start) % column.period + column.period) % column.period;
    return offset <= column.run ? column.id : null;
  }

  draw(frame) {
    const s = this.state;
    if (s.reveal <= .001 || !this.ready) return;
    const gl = this.gl, p = this.program.use();
    p.set('uTan', s.tan).set('uAngles', s.angles).set('uEyeX', s.eyeX).set('uOffsetY', s.offsetY).set('uLightNdc', s.lightNdc)
      .set('uTravel', s.travel).set('uDescent', s.descent)
      .set('uReveal', s.reveal).set('uPickedStrength', this.highlight.strength).set('uTime', frame.time)
      .set('uExposure', s.exposure).set('uBlur', s.blur).set('uGlow', s.glow).set('uTile', this.tile)
      .texture('uQuotes', this.quotes).texture('uQuoteIds', this.ids).texture('uPicked', this.picked);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
  }
}
