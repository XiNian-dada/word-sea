// Thin WebGL2 helpers: programs with cached uniforms, textures and render targets.

export function createContext(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: true, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance',
    desynchronized: true,
  });
  if (!gl) return null;
  const anisotropic = gl.getExtension('EXT_texture_filter_anisotropic');
  const halfFloat = gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float');
  return {
    gl,
    caps: {
      anisotropy: anisotropic ? Math.min(8, gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) : 0,
      anisotropic,
      halfFloatTarget: Boolean(halfFloat),
      maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    },
  };
}

function compile(gl, type, source, label) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    const lines = source.split('\n').map((line, i) => `${String(i + 1).padStart(4)} ${line}`).join('\n');
    throw new Error(`${label} shader failed:\n${log}\n${lines}`);
  }
  return shader;
}

const PRELUDE = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n';

/**
 * A linked program whose uniforms are uploaded only when their value changes.
 * Scalars compare directly; vectors and matrices compare element by element.
 */
export class Program {
  constructor(gl, { vertex, fragment, defines = {}, label = 'program' }) {
    const header = PRELUDE + Object.entries(defines).map(([k, v]) => `#define ${k} ${v}\n`).join('');
    const vs = compile(gl, gl.VERTEX_SHADER, header + vertex, `${label} vertex`);
    const fs = compile(gl, gl.FRAGMENT_SHADER, header + fragment, `${label} fragment`);
    const program = gl.createProgram();
    gl.attachShader(program, vs); gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`${label} link failed: ${gl.getProgramInfoLog(program)}`);
    this.gl = gl; this.program = program; this.label = label;
    this.uniforms = new Map();
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      const name = info.name.replace(/\[0\]$/, '');
      this.uniforms.set(name, { location: gl.getUniformLocation(program, info.name), type: info.type, size: info.size, cache: null });
    }
    this.textureUnits = new Map();
  }
  use() { this.gl.useProgram(this.program); return this; }
  set(name, value) {
    const uniform = this.uniforms.get(name);
    if (!uniform) return this;
    const { gl } = this;
    if (typeof value === 'number' || typeof value === 'boolean') {
      if (uniform.cache === value) return this;
      uniform.cache = value;
      if (uniform.type === gl.INT || uniform.type === gl.BOOL || uniform.type === gl.SAMPLER_2D) gl.uniform1i(uniform.location, value);
      else gl.uniform1f(uniform.location, value);
      return this;
    }
    let cache = uniform.cache;
    if (!cache || cache.length !== value.length) cache = uniform.cache = new Float32Array(value.length).fill(NaN);
    let changed = false;
    for (let i = 0; i < value.length; i++) if (cache[i] !== value[i]) { cache[i] = value[i]; changed = true; }
    if (!changed) return this;
    switch (uniform.type) {
      case gl.FLOAT: gl.uniform1fv(uniform.location, value); break;
      case gl.FLOAT_VEC2: gl.uniform2fv(uniform.location, value); break;
      case gl.FLOAT_VEC3: gl.uniform3fv(uniform.location, value); break;
      case gl.FLOAT_VEC4: gl.uniform4fv(uniform.location, value); break;
      case gl.FLOAT_MAT4: gl.uniformMatrix4fv(uniform.location, false, value); break;
      case gl.FLOAT_MAT3: gl.uniformMatrix3fv(uniform.location, false, value); break;
      default: throw new Error(`Unsupported uniform type for ${name}`);
    }
    return this;
  }
  /** Binds a texture to a fixed unit chosen the first time the sampler is used. */
  texture(name, texture, target = this.gl.TEXTURE_2D) {
    const uniform = this.uniforms.get(name);
    if (!uniform) return this;
    let unit = this.textureUnits.get(name);
    if (unit === undefined) { unit = this.textureUnits.size; this.textureUnits.set(name, unit); }
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target, texture);
    this.set(name, unit);
    return this;
  }
}

export function createTexture(gl, { width, height, internalFormat = gl.RGBA8, format = gl.RGBA, type = gl.UNSIGNED_BYTE,
  data = null, source = null, filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE, mipmaps = false, anisotropy = 0, caps = null }) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  if (source) gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, format, type, source);
  else gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.NEAREST ? gl.NEAREST : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmaps ? gl.LINEAR_MIPMAP_LINEAR : filter);
  if (mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
  if (anisotropy && caps?.anisotropic) gl.texParameterf(gl.TEXTURE_2D, caps.anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(anisotropy, caps.anisotropy));
  return texture;
}

/** A colour-only render target (no depth), used for look-up tables. */
export function createTarget(gl, width, height, { float = false } = {}) {
  const texture = createTexture(gl, float
    ? { width, height, internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT }
    : { width, height });
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!complete) { gl.deleteFramebuffer(framebuffer); gl.deleteTexture(texture); return null; }
  return { texture, framebuffer, width, height, float };
}

/** One vertex array with no attributes: full-screen passes derive positions from gl_VertexID. */
export function emptyVertexArray(gl) {
  return gl.createVertexArray();
}
