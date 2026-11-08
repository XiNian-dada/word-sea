import { Program, createContext, createTarget, createTexture } from '../gl/context.js';
import { FULLSCREEN_VERTEX, SKY_FRAGMENT, SKY_LUT_FRAGMENT } from '../gl/shaders/sky.js';
import { OCEAN_FRAGMENT, OCEAN_VERTEX, WAVE_COUNT } from '../gl/shaders/ocean.js';
import { noisePixels, detailNormalPixels } from './textures.js';

const LUT_SIZE = 64;

/**
 * Owns the single WebGL2 canvas. Everything visible in the three scenes is
 * drawn here in one pass list; the DOM above it only holds text and controls.
 */
export class Renderer {
  constructor(canvas) {
    const context = createContext(canvas);
    if (!context) throw new Error('WebGL2 unavailable');
    this.canvas = canvas;
    this.gl = context.gl;
    this.caps = context.caps;
    const gl = this.gl;
    this.vao = gl.createVertexArray();

    this.lut = this.caps.halfFloatTarget ? createTarget(gl, LUT_SIZE, LUT_SIZE, { float: true }) : null;
    this.lutEncoded = !this.lut;
    if (!this.lut) this.lut = createTarget(gl, LUT_SIZE, LUT_SIZE);
    const lutDefines = this.lutEncoded ? { LUT_ENCODED: 1 } : {};

    this.programs = {
      lut: new Program(gl, { vertex: FULLSCREEN_VERTEX, fragment: SKY_LUT_FRAGMENT, defines: { FULLSCREEN_DEPTH: '0.0', ...lutDefines }, label: 'sky table' }),
      sky: new Program(gl, { vertex: FULLSCREEN_VERTEX, fragment: SKY_FRAGMENT, defines: { FULLSCREEN_DEPTH: '1.0', ...lutDefines }, label: 'sky' }),
      ocean: new Program(gl, { vertex: OCEAN_VERTEX, fragment: OCEAN_FRAGMENT, defines: lutDefines, label: 'ocean' }),
    };
    this.lutDefines = lutDefines;

    this.textures = {
      noise: createTexture(gl, { width: 256, height: 256, data: noisePixels(), wrap: gl.REPEAT, mipmaps: true }),
      detail: createTexture(gl, { width: 256, height: 256, data: detailNormalPixels(), wrap: gl.REPEAT, mipmaps: true, anisotropy: 4, caps: this.caps }),
      // A blank lettering tile until the generated one arrives.
      glyphs: createTexture(gl, { width: 1, height: 1, data: new Uint8Array([0, 0, 0, 0]), wrap: gl.REPEAT }),
    };
    this.mesh = null;
    this.meshAspect = 0;
    this.width = 0; this.height = 0;
    this.passes = [];
  }

  setGlyphs(pixels, size) {
    const gl = this.gl;
    gl.deleteTexture(this.textures.glyphs);
    this.textures.glyphs = createTexture(gl, { width: size, height: size, data: pixels, wrap: gl.REPEAT, mipmaps: true, anisotropy: 8, caps: this.caps });
  }

  resize(width, height, scale) {
    const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.width = w; this.height = h;
  }

  /**
   * A sea grid in camera-relative coordinates: dense near the eye, sparse at
   * the horizon, wide enough for the field of view plus parallax.
   */
  buildMesh(tanHalfX) {
    if (this.mesh && Math.abs(this.meshAspect - tanHalfX) < 1e-3) return;
    this.meshAspect = tanHalfX;
    const gl = this.gl, rows = 260, cols = 200;
    const vertices = new Float32Array((rows + 1) * (cols + 1) * 2);
    let v = 0;
    for (let r = 0; r <= rows; r++) {
      const t = r / rows, depth = .4 + 1100 * Math.pow(t, 2.35);
      const half = depth * tanHalfX * 1.35 + 8;
      for (let c = 0; c <= cols; c++) {
        // Columns bunch towards the centre, where most glitter and words are seen.
        const u = c / cols * 2 - 1, x = Math.sign(u) * Math.pow(Math.abs(u), 1.35) * half;
        vertices[v++] = x; vertices[v++] = -depth;
      }
    }
    const indices = new Uint32Array(rows * cols * 6);
    let i = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1;
      indices[i++] = a; indices[i++] = d; indices[i++] = b;
      indices[i++] = b; indices[i++] = d; indices[i++] = e;
    }
    if (this.mesh) { gl.deleteVertexArray(this.mesh.vao); gl.deleteBuffer(this.mesh.vbo); gl.deleteBuffer(this.mesh.ibo); }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const location = gl.getAttribLocation(this.programs.ocean.program, 'aGrid');
    gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.mesh = { vao, vbo, ibo, count: indices.length };
  }

  /** Re-bakes the scattering table; called only while the light moves. */
  updateSkyTable(atmosphere) {
    const gl = this.gl, p = this.programs.lut.use();
    p.set('uLightDir', atmosphere.lightDir).set('uLightPower', atmosphere.power)
      .set('uRayleigh', atmosphere.rayleigh).set('uMie', atmosphere.mie).set('uMieG', atmosphere.mieG);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lut.framebuffer);
    gl.viewport(0, 0, LUT_SIZE, LUT_SIZE);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  shareAtmosphere(program, frame) {
    const a = frame.atmosphere;
    program.texture('uSkyLut', this.lut.texture)
      .set('uLightDir', a.lightDir).set('uLightColor', a.lightColor).set('uAmbient', a.ambient)
      .set('uExposure', a.exposure).set('uOvercast', a.overcast).set('uOvercastColor', a.overcastColor)
      .set('uFogDensity', a.fog).set('uFlash', a.flash).set('uSkyTint', a.skyTint);
  }

  render(frame) {
    const gl = this.gl;
    if (frame.atmosphere.dirty) { this.updateSkyTable(frame.atmosphere); frame.atmosphere.dirty = false; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.depthMask(true);
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.BLEND);

    if (frame.sea.visible) {
      this.drawOcean(frame);
      this.drawSky(frame);
    }
    for (const pass of this.passes) pass.draw(frame, this);
  }

  drawOcean(frame) {
    const gl = this.gl, p = this.programs.ocean.use(), s = frame.sea, cam = frame.camera;
    this.buildMesh(cam.tanHalfX);
    this.shareAtmosphere(p, frame);
    p.set('uViewProj', cam.viewProj).set('uCamera', cam.eye).set('uGridOrigin', cam.gridOrigin)
      .set('uTime', frame.time).set('uWaveTime', s.waveTime).set('uAmplitude', s.amplitude)
      .set('uWaveA', s.wavesA).set('uWaveB', s.wavesB).set('uWindDir', s.windDir).set('uWindAlign', s.windAlign)
      .set('uRipples', s.ripples).set('uTextScale', s.textScale).set('uDensity', s.density).set('uWind', s.wind)
      .set('uWaterDeep', frame.atmosphere.water).set('uInk', frame.atmosphere.ink).set('uRain', s.rain)
      .set('uUnderwater', cam.underwater ? 1 : 0).set('uHarbor', s.harbor)
      .set('uLanterns', s.lanterns).set('uLanternColors', s.lanternColors)
      .texture('uGlyphs', this.textures.glyphs).texture('uDetail', this.textures.detail);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
    // Seen from below, the visible side of the surface flips.
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.mesh.vao);
    gl.drawElements(gl.TRIANGLES, this.mesh.count, gl.UNSIGNED_INT, 0);
  }

  drawSky(frame) {
    const gl = this.gl, p = this.programs.sky.use(), a = frame.atmosphere, c = frame.clouds;
    this.shareAtmosphere(p, frame);
    p.set('uInvViewProj', frame.camera.invViewProj).set('uCamera', frame.camera.eye).set('uTime', frame.time)
      .set('uSunDir', a.discDir).set('uDiscColor', a.discColor).set('uDiscSize', a.discSize)
      .set('uMoon', a.moon).set('uMoonPhase', a.moonPhase).set('uStars', a.stars)
      .set('uCloudOffset', c.offset).set('uCloudCover', c.cover).set('uCloudInk', c.ink).set('uClouds', c.enabled)
      .set('uUnderwater', frame.camera.underwater ? 1 : 0).set('uWaterDeep', a.water)
      .texture('uNoise', this.textures.noise).texture('uCloudGlyphs', this.textures.glyphs);
    // Only pixels the sea did not cover still hold the far depth.
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);
  }
}

export { WAVE_COUNT };
