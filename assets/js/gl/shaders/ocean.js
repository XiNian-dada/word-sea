import { COMMON } from './sky.js';

// The sea: Gerstner swells move the mesh; detail normals, Fresnel reflection,
// sun glitter and subsurface light are evaluated per pixel. Words are a layer of
// the water itself, so they bend, catch light and dissolve with distance.

export const WAVE_COUNT = 8;

export const OCEAN_VERTEX = /* glsl */`
in vec2 aGrid;
uniform mat4 uViewProj;
uniform vec2 uGridOrigin;
uniform float uWaveTime;
uniform float uAmplitude;
uniform vec4 uWaveA[${WAVE_COUNT}];   // direction.xy, wavenumber, amplitude
uniform vec4 uWaveB[${WAVE_COUNT}];   // phase, steepness
uniform vec2 uWindDir;
uniform float uWindAlign;
uniform vec4 uRipples[4];             // x, z, start time, strength
uniform float uTime;
out vec3 vWorld;
out vec3 vNormal;
out float vCrest;

void main() {
  vec2 p = aGrid + uGridOrigin;
  vec3 position = vec3(p.x, 0.0, p.y);
  vec3 dx = vec3(1.0, 0.0, 0.0), dz = vec3(0.0, 0.0, 1.0);
  float height = 0.0;
  for (int i = 0; i < ${WAVE_COUNT}; i++) {
    vec2 d = uWaveA[i].xy;
    float k = uWaveA[i].z;
    // Wind feeds swells that travel with it; it never rotates the whole field.
    float along = dot(d, uWindDir);
    float a = uWaveA[i].w * uAmplitude * mix(1.0, .55 + .45 * along * along + .25 * max(along, 0.0), uWindAlign);
    float q = uWaveB[i].y;
    float theta = k * dot(d, p) - sqrt(9.81 * k) * uWaveTime + uWaveB[i].x;
    float s = sin(theta), c = cos(theta);
    position += vec3(d.x * q * a * c, a * s, d.y * q * a * c);
    height += a * s;
    float wa = k * a;
    dx += vec3(-q * d.x * d.x * wa * s, d.x * wa * c, -q * d.x * d.y * wa * s);
    dz += vec3(-q * d.x * d.y * wa * s, d.y * wa * c, -q * d.y * d.y * wa * s);
  }
  // Tapped rings travel outwards and decay; a soft dent marks the touch point.
  for (int i = 0; i < 4; i++) {
    float age = uTime - uRipples[i].z;
    if (uRipples[i].w <= 0.0 || age <= 0.0 || age > 9.0) continue;
    vec2 delta = p - uRipples[i].xy;
    float radius = length(delta) + 1e-4;
    float front = radius - age * 3.4;
    float envelope = exp(-front * front / 18.0) * exp(-age * .32) * smoothstep(0.0, .4, age) * uRipples[i].w;
    float ring = sin(front * .9) * envelope * .55;
    float dent = -.45 * exp(-radius * radius / 6.0 - age * 2.2) * uRipples[i].w;
    position.y += ring + dent;
    float slope = (.9 * cos(front * .9) - sin(front * .9) * front / 9.0) * envelope * .55 + dent * (-radius / 3.0);
    vec2 g = slope * delta / radius;
    dx.y += g.x; dz.y += g.y;
  }
  vWorld = position;
  vNormal = normalize(cross(dz, dx));
  vCrest = height / max(uAmplitude * 2.6, .2);
  gl_Position = uViewProj * vec4(position, 1.0);
}
`;

export const OCEAN_FRAGMENT = /* glsl */`
${COMMON}
in vec3 vWorld;
in vec3 vNormal;
in float vCrest;
out vec4 outColor;
uniform vec3 uCamera;
uniform float uWaveTime;
uniform sampler2D uGlyphs;
uniform sampler2D uDetail;
uniform float uTextScale;
uniform float uDensity;
uniform float uWind;
uniform vec2 uWindDir;
uniform vec3 uInk;
uniform float uRain;
uniform float uUnderwater;
uniform vec3 uLanterns[6];
uniform vec3 uLanternColors[6];
uniform float uHarbor;

vec2 rainRipples(vec2 p) {
  // Cells of expanding rings; two offset layers hide the grid.
  vec2 sum = vec2(0.0);
  for (int layer = 0; layer < 2; layer++) {
    vec2 q = p * (1.6 + float(layer) * .7) + float(layer) * 13.7;
    vec2 cell = floor(q), f = fract(q) - .5;
    float h = hash12(cell + float(layer) * 7.0);
    vec2 center = vec2(hash12(cell + 3.1), hash12(cell + 5.3)) - .5;
    float age = fract(uTime * (.9 + h * .6) + h);
    vec2 delta = f - center * .5;
    float r = length(delta) + 1e-4;
    float ring = sin((r - age * .5) * 48.0) * smoothstep(.12, 0.0, abs(r - age * .5)) * (1.0 - age);
    sum += delta / r * ring * step(1.0 - uRain * .85, h);
  }
  return sum * .35;
}

void main() {
  vec3 toCamera = uCamera - vWorld;
  float distance = length(toCamera);
  vec3 V = toCamera / distance;
  // Fine detail would alias in the distance; it hands over to rougher glitter.
  float near = exp(-distance * .018);
  vec2 drift = uWindDir * uWaveTime;
  vec2 d0 = texture(uDetail, vWorld.xz * .061 + drift * .021).xy * 2.0 - 1.0;
  vec2 d1 = distance < 260.0
    ? texture(uDetail, vWorld.xz * .157 - vec2(drift.y, -drift.x) * .037).xy * 2.0 - 1.0
    : vec2(0.0);
  vec2 detail = d0 * .62 + d1 * .38;
  float chop = clamp(length(d0 * .55 + d1 * .95) * .85, 0.0, 1.0);
  detail *= (.18 + uWind * .55) * (.25 + .75 * near);
  if (uRain > .001) detail += rainRipples(vWorld.xz) * uRain * near;
  vec3 N = normalize(vNormal + vec3(detail.x, 0.0, detail.y));

  // R holds a distance field (0.5 on the outline), G the word's tone.
  vec2 glyph = texture(uGlyphs, vWorld.xz / uTextScale).rg;
  float edge = clamp(fwidth(glyph.r) * .75, .012, .5);
  float ink = smoothstep(.5 - edge, .5 + edge, glyph.r) * smoothstep(glyph.g - .02, glyph.g + .02, uDensity);
  // Far away the outline blurs into texture; keep its average, not its contrast.
  ink *= mix(1.0, .55, smoothstep(.08, .3, edge));

  vec3 color;
  if (uUnderwater > .5) {
    // From below, the surface is a mirror except for the bright window above.
    N = -N;
    // Snell's window: light from the sky inside it, the water's own glow outside.
    // A softened index keeps the window inside the frame as the eye looks up.
    vec3 T = refract(-V, N, 1.0 / 1.18);
    float depth = max(-uCamera.y, 0.0);
    vec3 inside = dot(T, T) > 0.0 ? skyRadiance(normalize(vec3(T.x, abs(T.y) + .02, T.z))) * (1.0 - pow(1.0 - abs(dot(T, N)), 5.0)) * 1.4 : vec3(0.0);
    vec3 mirror = waterVolume(reflect(-V, N), depth + 4.0);
    color = inside + mirror;
    // Letters seen from below are shadows on the bright surface.
    color *= 1.0 - ink * .55;
    color = mix(color, waterVolume(-V, depth), 1.0 - exp(-distance * .09));
    outColor = vec4(dither(tonemap(color)), 1.0);
    return;
  }

  float NdV = max(dot(N, V), 1e-3);
  float fresnel = .02 + .98 * pow(1.0 - NdV, 5.0);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) + .002;
  vec3 reflected = skyRadiance(normalize(R));
  if (uAurora > .001) {
    vec3 rn = normalize(R);
    float aurBand = smoothstep(.04, .24, rn.y) * (1.0 - smoothstep(.26, .58, rn.y));
    float aurWave = .38 + .62 * pow(.5 + .5 * sin(rn.x * 4.4 + uTime * .22 + sin(rn.z * 2.2 - uTime * .12)), 1.6);
    vec3 aurTint = mix(vec3(.006, .036, .022), vec3(.018, .010, .030), smoothstep(.18, .44, rn.y));
    reflected += aurTint * aurBand * aurWave * uAurora * (1.0 - uOvercast * .85);
  }

  // Sun (or moon) glitter: a GGX lobe broken up by the detail normals.
  vec3 H = normalize(V + uLightDir);
  float NdH = max(dot(N, H), 0.0), NdL = max(dot(N, uLightDir), 0.0);
  float rough = mix(.16 + uWind * .1, .05 + uWind * .05, near);
  float a2 = rough * rough * rough * rough;
  float D = a2 / (PI * pow(NdH * NdH * (a2 - 1.0) + 1.0, 2.0));
  vec3 glitter = uLightColor * D * fresnel * smoothstep(0.0, .1, NdL) * .22 * (1.0 - uOvercast * .9);

  // Light scattered back out of the water body: richer subsurface glow through thin sunlit crests.
  float crest = clamp(vCrest, 0.0, 1.0);
  vec3 body = uWaterDeep * (uAmbient * .58 + uLightColor * max(uLightDir.y, .0) * .2);
  vec2 sunward = normalize(uLightDir.xz + vec2(1e-4));
  float forwardScatter = pow(max(dot(normalize(-V.xz + vec2(1e-4)), sunward), 0.0), 2.6);
  vec3 sssTint = mix(uWaterDeep, vec3(.018, .085, .105), .45);
  float thinCrest = pow(crest, 2.0) * (1.0 - NdV * .45);
  body += sssTint * uLightColor * (forwardScatter * 1.45 + .22) * thinCrest * max(uLightDir.y + .22, .02);
  body += sssTint * uAmbient * thinCrest * .55;

  vec3 water = mix(body, reflected, fresnel);
  // Textured lacy whitecaps concentrated along breaking windward crests, fading smoothly with distance.
  float foamMask = smoothstep(.58, .98, crest + chop * .26 - (1.0 - uWind) * .16) * (.18 + uWind * .82) * (.25 + .75 * near);
  float lace = smoothstep(.28, .78, chop + crest * .32);
  float seaFoam = foamMask * lace * .52;
  vec3 foamColor = (uAmbient * .92 + uLightColor * (.16 + NdL * .22)) * vec3(.92, .96, 1.0);
  water = mix(water, foamColor, seaFoam * (1.0 - uHarbor * .5));

  // Letters are a matte film that lifts out of the water and mirrors the sky softly.
  float catchLight = clamp(fresnel * 1.6 + .24, 0.0, 1.0);
  vec3 letter = mix(body * 1.5 + uInk * (uAmbient * .26 + uLightColor * NdL * .04), reflected * 1.05, catchLight);
  float foam = smoothstep(.55, 1.0, crest) * (.14 + uWind * .48);
  letter += (uAmbient * .32 + uLightColor * .07) * foam;
  letter = mix(letter, foamColor, seaFoam * .65);
  float wordInk = ink * mix(1.0, .32, uHarbor);
  vec3 gap = water * mix(.62, .9, uHarbor);
  color = mix(gap, letter, wordInk) + glitter * (.26 + wordInk * .58) * mix(1.0, .45, uHarbor);

  // Friends' lanterns: point lights whose reflections are torn into streaks and warm pools by the waves.
  if (uHarbor > .001) {
    for (int i = 0; i < 6; i++) {
      vec3 L = uLanterns[i] - vWorld;
      float d2 = dot(L, L);
      vec3 Ld = L * inversesqrt(d2);
      float spec = pow(max(dot(N, normalize(Ld + V)), 0.0), 220.0) * (.25 + fresnel * 2.6);
      float pool = exp(-d2 * .022) * (.028 + ink * .055);
      float diffuse = max(dot(N, Ld), 0.0) * .02;
      color += uLanternColors[i] * ((spec * 2.2 + diffuse) * (.3 + ink * .7) / (1.0 + d2 * .035) + pool) * uHarbor;
    }
  }
  color += uFlash * vec3(.5, .55, .7) * (fresnel + ink * .3);
  color = applyFog(color, -V, distance);
  outColor = vec4(dither(tonemap(color)), 1.0);
}
`;
