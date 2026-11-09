// Small numeric helpers shared by the renderer and the interface.

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential approach; `rate` is 1/seconds. */
export const damp = (current, target, rate, dt) => lerp(current, target, 1 - Math.exp(-rate * dt));
export const easeInOut = t => t * t * t * (t * (t * 6 - 15) + 10);
export const DEG = Math.PI / 180;

/** Deterministic LCG so every visitor sees the same arrangement of words. */
export function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export const vec3 = {
  fromAngles(out, elevation, azimuth) {
    // Azimuth 0 looks down -Z (the camera's forward direction); positive turns right.
    const c = Math.cos(elevation);
    out[0] = Math.sin(azimuth) * c; out[1] = Math.sin(elevation); out[2] = -Math.cos(azimuth) * c;
    return out;
  },
};

/** Column-major 4×4 matrices, enough for one perspective camera. */
export const mat4 = {
  perspective(out, fovY, aspect, near, far) {
    const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
    out.fill(0);
    out[0] = f / aspect; out[5] = f;
    out[10] = (far + near) * nf; out[11] = -1;
    out[14] = 2 * far * near * nf;
    return out;
  },
  /**
   * View matrix for a camera at `eye`. Positive pitch looks down, positive yaw
   * turns right; the camera looks down -Z when both are zero.
   */
  view(out, eye, pitch, yaw) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
    // Rows are right, up and backward (−forward), written column-major.
    const r00 = cy, r01 = 0, r02 = sy;
    const r10 = sy * sp, r11 = cp, r12 = -cy * sp;
    const r20 = -sy * cp, r21 = sp, r22 = cy * cp;
    out[0] = r00; out[1] = r10; out[2] = r20; out[3] = 0;
    out[4] = r01; out[5] = r11; out[6] = r21; out[7] = 0;
    out[8] = r02; out[9] = r12; out[10] = r22; out[11] = 0;
    out[12] = -(r00 * eye[0] + r01 * eye[1] + r02 * eye[2]);
    out[13] = -(r10 * eye[0] + r11 * eye[1] + r12 * eye[2]);
    out[14] = -(r20 * eye[0] + r21 * eye[1] + r22 * eye[2]);
    out[15] = 1;
    return out;
  },
  multiply(out, a, b) {
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      for (let r = 0; r < 4; r++) out[c * 4 + r] = a[r] * b0 + a[4 + r] * b1 + a[8 + r] * b2 + a[12 + r] * b3;
    }
    return out;
  },
  invert(out, m) {
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    const d = 1 / det;
    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d; out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d; out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d; out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d; out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d; out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d; out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d; out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d; out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
    return out;
  },
};
