// GLSL shared by every pass. Lighting is computed in linear radiance and
// tone-mapped once per pixel, so the sky, its reflection and the fog always agree.

export const COMMON = /* glsl */`
const float PI = 3.14159265359;

uniform sampler2D uSkyLut;
uniform vec3 uLightDir;      // towards the sun (or the moon at night)
uniform vec3 uLightColor;    // light reaching sea level, already filtered by air
uniform vec3 uAmbient;       // sky radiance straight overhead
uniform float uExposure;
uniform float uOvercast;     // 0 clear … 1 fully overcast
uniform vec3 uOvercastColor;
uniform float uFogDensity;
uniform float uFlash;        // lightning, 0 … 1
uniform vec3 uSkyTint;       // moonlit skies read blue to dark-adapted eyes
uniform vec3 uWaterDeep;     // scattering colour of the water body
uniform float uTime;
uniform float uAurora;       // rare night-sky aurora easter egg, 0 … 1
uniform vec3 uGradeShadow;
uniform vec3 uGradeHighlight;
uniform float uGradeSat;
uniform float uGradeContrast;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 skyLutUv(vec3 dir) {
  float elevation = asin(clamp(dir.y, 0.0, 1.0));
  vec2 a = normalize(dir.xz + vec2(1e-5, 0.0)), b = normalize(uLightDir.xz + vec2(1e-5, 0.0));
  float u = acos(clamp(dot(a, b), -1.0, 1.0)) / PI;
  float v = sqrt(elevation / (PI * .5));
  return vec2(u, v) * (63.0 / 64.0) + .5 / 64.0;
}

vec3 skyRadiance(vec3 dir) {
  vec3 c = texture(uSkyLut, skyLutUv(dir)).rgb;
  #ifdef LUT_ENCODED
  c = c / max(1.0 - c, vec3(1.0 / 255.0)) * 4.0;
  #endif
  // Single scattering leaves a high-sun horizon sallow; light scattered more
  // than once whitens it towards a pale blue haze.
  float daySun = smoothstep(.08, .5, uLightDir.y);
  float lowSky = (1.0 - smoothstep(0.0, .24, dir.y)) * daySun;
  c = mix(c, dot(c, vec3(.2126, .7152, .0722)) * vec3(.86, .96, 1.14), lowSky * .5);
  // A high sun leaves the open sky a clearer blue above the horizon haze.
  c *= mix(vec3(1.0), vec3(.9, .97, 1.12), daySun * smoothstep(.04, .3, dir.y));
  // Under moonlight the eye sees in rods: hues fade before the blue shift,
  // so the reddened horizon reads slate rather than olive.
  float scotopic = clamp((uSkyTint.b - 1.0) / .35, 0.0, 1.0);
  c = mix(c, vec3(dot(c, vec3(.2126, .7152, .0722))), scotopic * .8);
  c *= uSkyTint;
  // Overcast skies keep their brightness gradient but lose hue and direction.
  float lum = dot(c, vec3(.2126, .7152, .0722));
  vec3 grey = uOvercastColor * (lum * .55 + dot(uAmbient, vec3(.2126, .7152, .0722)) * .65) * (.75 + .35 * clamp(dir.y * 2.0, 0.0, 1.0));
  return mix(c, grey, uOvercast) + uFlash * vec3(.55, .6, .8) * (.4 + .6 * clamp(dir.y * 3.0, 0.0, 1.0));
}

// Light inside the water: hue from the water body, brightness from the sky above.
vec3 waterVolume(vec3 dir, float depth) {
  vec3 hue = uWaterDeep / max(max(uWaterDeep.r, uWaterDeep.g), max(uWaterDeep.b, 1e-4));
  // Brightness follows how bright the sky looks on screen, dimmer at night.
  vec3 zenith = texture(uSkyLut, skyLutUv(vec3(0.0, 1.0, 0.0))).rgb;
  #ifdef LUT_ENCODED
  zenith = zenith / max(1.0 - zenith, vec3(1.0 / 255.0)) * 4.0;
  #endif
  float sky = clamp(dot(zenith * uSkyTint, vec3(.2126, .7152, .0722)) * uExposure, .1, .9) / uExposure * 1.6;
  float up = clamp(dir.y * .5 + .5, 0.0, 1.0);
  vec3 color = hue * sky * mix(.035, .55, pow(up, 2.2)) * exp(-depth * .07);
  // Caustic shafts hang from the surface and sway.
  vec2 s = vec2(dir.x / max(abs(dir.z) + .35, .2), 0.0) * 6.0;
  float n1 = fract(sin(dot(floor(s.x * 3.0 + uTime * .25), 12.9898)) * 43758.5);
  float rays = .5 + .5 * sin(s.x * 7.0 + uTime * .5 + sin(s.x * 2.3 - uTime * .3) * 2.0);
  rays *= .5 + .5 * sin(s.x * 13.0 - uTime * .7 + n1);
  color += (uLightColor * .02 + hue * sky * .2) * pow(rays, 3.0) * smoothstep(-.2, .8, dir.y) * exp(-depth * .05);
  return color;
}

// Distant air glows with the horizon colour of that azimuth.
vec3 hazeColor(vec3 dir) {
  return skyRadiance(normalize(vec3(dir.x, .015, dir.z)));
}

vec3 applyFog(vec3 color, vec3 dir, float distance) {
  float transmittance = exp(-distance * uFogDensity);
  return mix(hazeColor(dir), color, transmittance);
}

vec3 tonemap(vec3 c) {
  c *= uExposure;
  c = clamp((c * (2.51 * c + .03)) / (c * (2.43 * c + .59) + .14), 0.0, 1.0);
  // Cinematic grade: split-tone shadows and highlights, then saturation and a gentle S-curve.
  float l = dot(c, vec3(.2126, .7152, .0722));
  c *= mix(uGradeShadow, uGradeHighlight, smoothstep(0.0, .65, l));
  c = mix(vec3(l), c, uGradeSat);
  vec3 g = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
  return mix(g, g * g * (3.0 - 2.0 * g), uGradeContrast);
}

vec3 dither(vec3 c) {
  return c + (hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.yx + 17.0) - 1.0) / 255.0;
}
`;

export const FULLSCREEN_VERTEX = /* glsl */`
out vec2 vNdc;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, FULLSCREEN_DEPTH, 1.0);
}
`;

// Single-scattering atmosphere (Rayleigh + Mie), baked into a small table
// whenever the light moves. u: azimuth from the light, v: sqrt(elevation).
export const SKY_LUT_FRAGMENT = /* glsl */`
in vec2 vNdc;
out vec4 outColor;
uniform vec3 uLightDir;
uniform float uLightPower;
uniform float uRayleigh;
uniform float uMie;
uniform float uMieG;
const float PI = 3.14159265359;
const float R0 = 6360e3, R1 = 6420e3, HR = 7994.0, HM = 1200.0;
const vec3 BR = vec3(5.8e-6, 13.5e-6, 33.1e-6);
const float BM = 21e-6;
// Ozone absorbs orange and green without scattering; it keeps twilight
// zeniths blue. Its column rides along with the air's (see atmosphere.js).
const vec3 BO = vec3(.65e-6, 1.881e-6, .085e-6) * 2.8;

vec2 sphere(vec3 o, vec3 d, float r) {
  float b = dot(o, d), c = dot(o, o) - r * r, h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  vec2 uv = (vNdc * .5 + .5 - .5 / 64.0) * (64.0 / 63.0);
  float azimuth = uv.x * PI, elevation = uv.y * uv.y * PI * .5;
  vec2 l = normalize(uLightDir.xz + vec2(1e-5, 0.0));
  float a = atan(l.x, -l.y) + azimuth;
  vec3 dir = vec3(sin(a) * cos(elevation), sin(elevation), -cos(a) * cos(elevation));
  vec3 origin = vec3(0.0, R0 + 20.0, 0.0);
  float distance = sphere(origin, dir, R1).y;
  float segment = distance / 20.0;
  float mu = dot(dir, uLightDir), g = uMieG;
  float phaseR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float phaseM = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  float depthR = 0.0, depthM = 0.0;
  for (int i = 0; i < 20; i++) {
    vec3 p = origin + dir * segment * (float(i) + .5);
    float h = length(p) - R0;
    float hr = exp(-h / HR) * segment, hm = exp(-h / HM) * segment;
    depthR += hr; depthM += hm;
    vec3 up = p / length(p);
    // The planet's shadow: a light below this sample's horizon contributes nothing.
    if (sphere(p, uLightDir, R0 - 200.0).x > 0.0) continue;
    float lightDistance = sphere(p, uLightDir, R1).y, lightSegment = lightDistance / 8.0;
    float lightR = 0.0, lightM = 0.0;
    for (int j = 0; j < 8; j++) {
      vec3 q = p + uLightDir * lightSegment * (float(j) + .5);
      float hq = max(length(q) - R0, 0.0);
      lightR += exp(-hq / HR) * lightSegment; lightM += exp(-hq / HM) * lightSegment;
    }
    vec3 tau = (BR * uRayleigh + BO) * (depthR + lightR) + BM * uMie * 1.1 * (depthM + lightM);
    vec3 attenuation = exp(-tau);
    sumR += attenuation * hr; sumM += attenuation * hm;
  }
  vec3 color = uLightPower * (sumR * BR * uRayleigh * phaseR + sumM * BM * uMie * phaseM);
  #ifdef LUT_ENCODED
  color *= .25;
  color = color / (1.0 + color);
  #endif
  outColor = vec4(color, 1.0);
}
`;

// The sky pass covers every pixel the sea left untouched (depth == far plane).
export const SKY_FRAGMENT = /* glsl */`
${COMMON}
in vec2 vNdc;
out vec4 outColor;
uniform mat4 uInvViewProj;
uniform vec3 uCamera;
uniform vec3 uSunDir;        // the visible disc (sun by day, moon by night)
uniform vec3 uDiscColor;
uniform float uDiscSize;
uniform float uMoon;         // 0 sun disc, 1 moon disc
uniform float uMoonPhase;    // 0 new … .5 full … 1 new
uniform float uStars;
uniform sampler2D uNoise;
uniform sampler2D uCloudGlyphs;
uniform vec2 uCloudOffset;
uniform float uCloudCover;
uniform float uCloudHeaviness;
uniform float uCloudInk;
uniform float uClouds;
uniform float uUnderwater;

float noise(vec2 p) { return texture(uNoise, p / 256.0).r; }
float fbm(vec2 p) {
  float v = 0.0, a = .5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.1, 5.7); a *= .5; }
  return v;
}
float fbmShadow(vec2 p) {
  float v = 0.0, a = .5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.1, 5.7); a *= .5; }
  return v + .047;
}

// Ultra-slow celestial rotation around a tilted coastal pole (pauses with uTime).
vec3 skySpin(vec3 d) {
  float a = uTime * .0022;
  float c = cos(a), s = sin(a);
  vec3 p = vec3(d.x, d.y * .85 - d.z * .52, d.y * .52 + d.z * .85);
  p.xz = mat2(c, -s, s, c) * p.xz;
  return vec3(p.x, p.y * .85 + p.z * .52, -p.y * .52 + p.z * .85);
}

// Blackbody-inspired star tint: blue-white, crisp white, warm gold, soft amber.
vec3 starTint(float h) {
  if (h < .28) return mix(vec3(.68, .82, 1.0), vec3(.86, .92, 1.0), h / .28);
  if (h < .68) return mix(vec3(.92, .95, 1.0), vec3(1.0, .96, .88), (h - .28) / .40);
  return mix(vec3(1.0, .92, .76), vec3(1.0, .74, .52), (h - .68) / .32);
}

// Tilted Milky Way band with interstellar dark dust rift; fades naturally under moonlight.
vec4 milkyWay(vec3 sdir, float moonFade) {
  vec3 galUp = normalize(vec3(.34, .89, .30));
  vec3 galRight = normalize(cross(vec3(0.0, 1.0, 0.0), galUp));
  vec3 galFwd = cross(galUp, galRight);
  float lat = dot(sdir, galUp);
  float bandMask = exp(-lat * lat * 15.0);
  if (bandMask < .008) return vec4(0.0);
  float lon = atan(dot(sdir, galRight), dot(sdir, galFwd));
  vec2 gUv = vec2(lon * 2.4, lat * 4.2);
  float cloud1 = fbm(gUv * 2.0 + vec2(3.1, 7.4));
  float cloud2 = fbmShadow(gUv * 5.6 + vec2(9.3, 4.1));
  float dust = fbm(gUv * 4.4 + vec2(14.2, 2.8));
  float riftLat = lat + (dust - .5) * .11;
  float rift = smoothstep(.32, .64, dust) * exp(-riftLat * riftLat * 105.0);
  float band = bandMask * smoothstep(.24, .76, cloud1 * .72 + cloud2 * .28);
  float bulge = exp(-lat * lat * 26.0) * smoothstep(.02, .44, sdir.x) * smoothstep(.32, .05, sdir.y) * smoothstep(.26, .74, cloud1);
  vec3 col = vec3(.28, .40, .68) * band * (1.0 - rift * .86)
           + vec3(.68, .55, .46) * bulge * (1.0 - rift * .70);
  float galactic = clamp(band * (1.0 - rift * .60), 0.0, 1.0);
  return vec4(col * .115 * moonFade, galactic);
}

vec3 starLayer(vec2 sph, float scale, float threshold, float minSize, float maxSize, float gain, float elev, float seedShift) {
  vec2 p = sph * scale + seedShift;
  vec2 cell = floor(p), f = fract(p) - .5;
  float h = hash12(cell + seedShift);
  if (h < threshold) return vec3(0.0);
  vec2 offset = (vec2(hash12(cell + 7.3 + seedShift), hash12(cell + 3.1 + seedShift)) - .5) * .62;
  vec2 dv = f - offset;
  float d = length(dv);
  float mag = (h - threshold) / (1.0 - threshold);
  float size = mix(minSize, maxSize, pow(mag, 2.2));
  // Lower stars scintillate more noticeably through thicker coastal air.
  float scint = mix(.55, .14, smoothstep(.05, .42, elev));
  float tw = (1.0 - scint) + scint * (.5 + .5 * sin(uTime * (1.4 + mag * 3.2) + h * 90.0));
  vec3 tint = starTint(hash12(cell + 19.7 + seedShift));
  float core = smoothstep(size, size * .12, d);
  return tint * core * tw * (0.35 + mag * 1.65) * gain;
}

vec3 stars(vec3 dir, vec3 sdir, float galactic, float moonGlare) {
  vec2 sph = vec2(atan(sdir.x, -sdir.z), asin(clamp(sdir.y, 0.0, 1.0)));
  float elev = dir.y;
  // 1. Dense faint background star dust (enriched inside the Milky Way).
  float dustThresh = mix(.938, .845, galactic);
  vec3 faint = starLayer(sph, 370.0, dustThresh, .065, .115, .17, elev, 1.7) * (1.0 - moonGlare * .86);
  // 2. Mid-magnitude stars with realistic blackbody colors & scintillation.
  vec3 mid = starLayer(sph, 185.0, .952, .055, .12, .38, elev, 13.4) * (1.0 - moonGlare * .70);
  // 3. Rare 1st-magnitude anchor stars (~8–11 across the sky) with delicate glow.
  vec2 p = sph * 42.0 + 37.2;
  vec2 cell = floor(p), f = fract(p) - .5;
  float h = hash12(cell + 37.2);
  vec3 bright = vec3(0.0);
  if (h > .9915) {
    vec2 offset = (vec2(hash12(cell + 41.3), hash12(cell + 53.9)) - .5) * .56;
    vec2 dv = f - offset;
    float d = length(dv);
    float mag = (h - .9915) / .0085;
    float scint = mix(.36, .10, smoothstep(.06, .45, elev));
    float tw = (1.0 - scint) + scint * (.5 + .5 * sin(uTime * (1.6 + mag * 2.2) + h * 75.0));
    float core = smoothstep(.052, .008, d);
    float halo = exp(-d * d / .0026) * .15;
    float glint = (exp(-abs(dv.x) * 44.0) * exp(-abs(dv.y) * 11.0) + exp(-abs(dv.y) * 44.0) * exp(-abs(dv.x) * 11.0)) * .16 * pow(mag, 1.8);
    bright = starTint(hash12(cell + 61.1)) * (core + halo + glint) * tw * (.48 + mag * .72) * (1.0 - moonGlare * .45);
  }
  return faint + mid + bright;
}

// Occasional crisp shooting star arcing across the visible night sky (~every 10–14 seconds).
vec3 meteor(vec3 dir) {
  if (uTime < .5 || dir.y < .05) return vec3(0.0);
  float period = 9.5;
  float slot = floor(uTime / period);
  float st = fract(uTime / period) * period;
  if (hash12(vec2(slot + 2.0, 1.37)) > .78) return vec3(0.0);
  float t0 = 1.4 + hash12(vec2(slot + 2.0, 4.91)) * 5.6;
  float dur = .62 + hash12(vec2(slot + 2.0, 8.23)) * .34;
  float p = (st - t0) / dur;
  if (p <= 0.0 || p >= 1.0) return vec3(0.0);

  vec2 ang = vec2(atan(dir.x, -dir.z), asin(clamp(dir.y, 0.0, 1.0)));
  vec2 start = vec2(-.44 + hash12(vec2(slot + 2.0, 11.4)) * .80, .20 + hash12(vec2(slot + 2.0, 15.7)) * .15);
  float sx = start.x > 0.0 ? -1.0 : 1.0;
  vec2 dir2 = normalize(vec2(sx * (.62 + hash12(vec2(slot + 2.0, 22.3)) * .42), -(.36 + hash12(vec2(slot + 2.0, 26.8)) * .28)));
  float travel = .18 + hash12(vec2(slot + 2.0, 31.2)) * .14;
  vec2 head = start + dir2 * (p * travel);
  float tailLen = .085 + .075 * sin(p * PI);
  vec2 rel = ang - head;
  float along = dot(rel, -dir2);
  if (along < -.025 || along > tailLen) return vec3(0.0);
  float perp = abs(dot(rel, vec2(-dir2.y, dir2.x)));
  float tNorm = clamp(along / tailLen, 0.0, 1.0);
  float w = mix(.00095, .00024, tNorm);
  float streak = exp(-perp * perp / (w * w)) * pow(1.0 - tNorm, 2.1) * smoothstep(-.0012, .0045, along);
  float headGlow = exp(-dot(rel, rel) / .0000032);
  float env = smoothstep(0.0, .14, p) * (1.0 - smoothstep(.52, 1.0, p));
  vec3 tint = mix(vec3(.98, .99, 1.0), vec3(.58, .88, .98), tNorm);
  return tint * (streak * .92 + headGlow * 1.15) * env;
}

// Rare session easter egg: volumetric aurora curtains with vertical magnetic-field-line rays.
vec3 aurora(vec3 dir, float moonGlare) {
  if (uAurora <= .001 || dir.y < .03) return vec3(0.0);
  float horizonMask = smoothstep(.03, .11, dir.y) * (1.0 - smoothstep(.42, .74, dir.y));
  if (horizonMask <= .001) return vec3(0.0);
  vec3 sum = vec3(0.0);
  float invY = 1.0 / max(dir.y, .035);
  for (int i = 0; i < 18; i++) {
    float frac = float(i) / 17.0;
    float H = mix(.38, 1.06, frac);
    vec2 p = dir.xz * (H * invY);
    // Primary sinuous curtain sweeping across the open sky + secondary distant arc behind it.
    float w1 = sin(p.x * .68 + uTime * .11) * .68 + sin(p.x * 1.52 - uTime * .08 + 1.2) * .28;
    float d1 = abs(p.y + 2.75 + w1);
    float w2 = sin(p.x * .52 - uTime * .09 + 2.5) * .88 + cos(p.x * 1.18 + uTime * .07) * .30;
    float d2 = abs(p.y + 4.35 + w2);
    float ribbon1 = exp(-d1 * d1 * 11.5) + .28 * exp(-d1 * d1 * 2.4);
    float ribbon2 = (exp(-d2 * d2 * 8.5) + .25 * exp(-d2 * d2 * 1.9)) * .58;
    float ribbon = ribbon1 + ribbon2;
    // Fine vertical striations aligned along horizontal ionosphere coordinates (perspective pillars).
    float fineRays = noise(vec2(p.x * 11.5 + uTime * .07, p.y * 2.4 - uTime * .025));
    float midRays = fbmShadow(vec2(p.x * 3.4 - uTime * .04, p.y * 1.3 + uTime * .02));
    float striations = (.22 + .78 * smoothstep(.20, .82, midRays)) * (.35 + .65 * smoothstep(.18, .82, fineRays));
    float shimmer = .76 + .24 * sin(p.x * 8.5 - uTime * .52 + sin(p.y * 2.6) * 1.8);
    // Crisp luminous lower oxygen edge fading upward into delicate violet-magenta tips.
    float vProfile = smoothstep(0.0, .10, frac) * exp(-frac * 2.15);
    vec3 lowCol = vec3(.12, 1.0, .58);    // 557.7 nm oxygen emerald lower border
    vec3 midCol = vec3(.10, .74, .90);   // jade-aquamarine mid curtain
    vec3 highCol = vec3(.66, .22, .92);  // high-altitude violet-rose crown
    vec3 col = frac < .34 ? mix(lowCol, midCol, frac / .34) : mix(midCol, highCol, (frac - .34) / .66);
    sum += col * ribbon * striations * shimmer * vProfile;
  }
  return sum * .036 * horizonMask * (1.0 - moonGlare * .40) * uAurora;
}

vec3 disc(vec3 dir) {
  float c = dot(dir, uSunDir);
  float angle = acos(clamp(c, -1.0, 1.0));
  vec3 color = vec3(0.0);
  if (uMoon < .5) {
    // Limb-darkened photosphere + tight atmospheric corona behind clouds.
    float r = angle / uDiscSize;
    float limb = r < 1.0 ? pow(max(1.0 - r * r, 0.0), .35) : 0.0;
    float edge = smoothstep(1.0, .92, r);
    float low = 1.0 - smoothstep(.0, .24, uSunDir.y);
    float clearSky = 1.0 - uOvercast * .85;
    color += uDiscColor * (limb * edge * (85.0 + 420.0 * low));
    float glowBoost = 1.0 + low * 2.4;
    float innerCorona = exp(-max(r - .92, 0.0) * 3.1) * 16.0;
    float aureole = exp(-angle * 30.0) * 2.2 + exp(-angle * 9.0) * .18;
    float mistSheen = exp(-abs(dir.y - uSunDir.y) * 28.0 - angle * 5.8) * low * .6;
    vec3 warmGlow = mix(uDiscColor, uDiscColor * vec3(1.12, .94, .74), low * .45);
    color += warmGlow * glowBoost * (innerCorona + aureole + mistSheen) * clearSky;
  } else {
    float r = angle / uDiscSize;
    vec3 up = abs(uSunDir.y) > .99 ? vec3(1, 0, 0) : vec3(0, 1, 0);
    vec3 right = normalize(cross(up, uSunDir)), top = cross(uSunDir, right);
    vec2 q = vec2(dot(dir - uSunDir * c, right), dot(dir - uSunDir * c, top)) / uDiscSize;
    float phase = uMoonPhase * 2.0 * PI;
    // Keep a delicate crescent rim even right around astronomical new moon so night is never moonless.
    if (abs(sin(phase)) < .22 && cos(phase) > 0.0) phase = (sin(phase) < 0.0 ? -.22 : .22);
    float illum = .5 - .5 * cos(phase);
    vec3 l = normalize(vec3(sin(phase), .08 * sin(phase), -cos(phase)));
    if (r < 1.0) {
      vec3 n = vec3(q, sqrt(max(1.0 - dot(q, q), 0.0)));
      // Spherical surface coordinates curve naturally towards the limb.
      vec2 mUv = n.xy / (.72 + n.z * .38);
      float basin = fbm(mUv * 2.1 + vec2(4.2, 9.7));
      float detail = fbm(mUv * 6.2 + vec2(19.4, 31.8));
      float micro = noise(mUv * 18.0 + vec2(53.0, 11.0));
      float maria = smoothstep(.42, .62, basin + (detail - .5) * .28);
      float craters = smoothstep(.58, .80, detail) * (1.0 - maria * .45) * .28 + (micro - .5) * .14;
      // Relief normal perturbation so craters and basin ridges catch grazing light near the terminator.
      float hx = fbm((mUv + vec2(.055, 0.0)) * 6.2 + vec2(19.4, 31.8)) - detail;
      float hy = fbm((mUv + vec2(0.0, .055)) * 6.2 + vec2(19.4, 31.8)) - detail;
      vec3 bumpN = normalize(n + vec3(-hx, -hy, 0.0) * 1.4);
      float ndl = dot(bumpN, l);
      float lit = smoothstep(-.035, .055, ndl) * (.52 + .48 * pow(clamp(ndl, 0.0, 1.0), .55));
      float limb = pow(max(n.z, 0.0), .26);
      vec3 highlandTint = vec3(1.04, 1.01, .96);
      vec3 mariaTint = vec3(.52, .57, .68);
      vec3 albedo = mix(highlandTint, mariaTint, maria) * (.82 + craters) * (.72 + .28 * limb);
      vec3 surface = lit * albedo * 1.28 + (1.0 - lit) * vec3(.007, .009, .013) * limb;
      color += uDiscColor * surface * smoothstep(1.0, .93, r);
    } else {
      float limbSide = clamp(dot(normalize(q + vec2(1e-5)), l.xy) * .5 + .5, .15, 1.0);
      float halo = (exp(-(r - 1.0) * 2.8) * .15 * limbSide + exp(-angle * 11.0) * .034) * (.28 + .72 * illum);
      color += uDiscColor * halo * (1.0 - uOvercast * .7);
    }
  }
  return color;
}

// Forward optical bloom & subtle diffraction corona that veil thin clouds in front of the sun.
vec3 sunGlare(vec3 dir, float cloudAlpha) {
  if (uMoon >= .5 || uSunDir.y < -.02) return vec3(0.0);
  float c = dot(dir, uSunDir);
  if (c < .5) return vec3(0.0);
  float angle = acos(clamp(c, -1.0, 1.0));
  float r = angle / uDiscSize;
  float low = 1.0 - smoothstep(.0, .24, uSunDir.y);
  float glowBoost = 1.0 + low * 2.2;
  float clearSky = (1.0 - uOvercast * .88) * (1.0 - cloudAlpha * .78);
  vec3 up = abs(uSunDir.y) > .99 ? vec3(1, 0, 0) : vec3(0, 1, 0);
  vec3 right = normalize(cross(up, uSunDir)), top = cross(uSunDir, right);
  vec2 q = vec2(dot(dir - uSunDir * c, right), dot(dir - uSunDir * c, top));
  float phi = atan(q.y, q.x);
  float rayPattern = pow(.5 + .5 * cos(phi * 6.0 + .35), 8.0) * .55
                   + pow(.5 + .5 * cos(phi * 10.0 - .8), 10.0) * .35;
  float rays = rayPattern * exp(-angle * 22.0) * smoothstep(.85, 1.4, r) * 2.2;
  float bloom = exp(-max(r - .85, 0.0) * 2.4) * 6.0 + exp(-angle * 20.0) * .9;
  vec3 tint = mix(uDiscColor, uDiscColor * vec3(1.12, .95, .76), low * .4);
  return tint * glowBoost * (bloom + rays) * clearSky * smoothstep(-.01, .015, dir.y);
}

// 1-tap smooth 3D value noise using R and shifted G slices in uNoise.
float noise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  vec2 uv = (i.xy + vec2(37.0, 17.0) * i.z) + f.xy;
  vec2 rg = textureLod(uNoise, (uv + .5) / 256.0, 0.0).rg;
  return mix(rg.x, rg.y, f.z);
}

// Distance from camera to a concentric spherical cloud layer at altitude h above sea level.
float cloudShellDist(float dy, float camY, float Rc, float h) {
  float dh = max(h - camY, 0.0);
  float b = (Rc + camY) * max(dy, 0.0);
  float k = dh * (2.0 * Rc + h + camY);
  return k / (sqrt(b * b + k) + b);
}

float hgPhase(float mu, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-3), 1.5));
}

vec4 clouds(vec3 dir) {
  if (dir.y <= .010 || uClouds < .001) return vec4(0.0);

  const float Rc = 2400000.0;
  const float tMax = 34000.0;
  const mat2 macroRot = mat2(.92, -.39, .39, .92);
  const mat2 detRot = mat2(.80, -.60, .60, .80);
  vec2 windOffset = uCloudOffset * 8500.0;

  float cov = clamp((uCloudCover - .04) / .96, 0.0, 1.0);
  float stratus = smoothstep(.62, .96, cov);
  float H0 = mix(1050.0, 740.0, uCloudHeaviness * .65 + smoothstep(.70, 1.0, uCloudCover) * .35);
  float H_THICK = mix(760.0, 1080.0, smoothstep(.25, .85, uCloudCover) * .60 + uCloudHeaviness * .40);
  float H1 = H0 + H_THICK;
  float thresh = mix(.75, .08, cov * .42 + pow(cov, 2.15) * .58);

  vec3 lDir = normalize(vec3(uLightDir.x, max(uLightDir.y, .14), uLightDir.z));
  float mu = dot(dir, lDir);
  float hg = mix(hgPhase(mu, .58), hgPhase(mu, -.22), .30);
  float phase = mix(.72, clamp(4.0 * PI * hg, .40, 2.6), .82);
  vec3 sunHaze = hazeColor(vec3(uLightDir.x, .02, uLightDir.z));
  vec3 horHaze = hazeColor(dir);
  float twilight = (1.0 - smoothstep(.02, .22, uLightDir.y)) * (1.0 - uMoon) * (1.0 - uOvercast * .78);

  float T = 1.0;
  vec3 accum = vec3(0.0);
  vec3 hitPos = vec3(0.0);
  float hitDist = 0.0, hitW = 0.0;

  if (cov > .005) {
    float t0 = cloudShellDist(dir.y, uCamera.y, Rc, H0);
    // Keep oblique raymarch spans compact so scattered cumulus steps never exceed ~155 m.
    float maxSpan = mix(2450.0, 3200.0, stratus);
    float t1 = min(cloudShellDist(dir.y, uCamera.y, Rc, H1), min(tMax, t0 + maxSpan));
    if (t0 < t1) {
      int steps = int(mix(16.0, 10.0, stratus) + .5);
      float stepLen = (t1 - t0) / float(steps);
      // Nyquist-matched texture LOD filters sub-step noise at oblique angles to eliminate horizontal slices.
      float macLod = clamp(log2(max(stepLen / 105.0, 1.0)), 0.0, 2.2);
      float detLod = clamp(log2(max(stepLen / 55.0, 1.0)), 0.0, 2.8);
      float d3Weight = clamp(150.0 / max(stepLen, 150.0), .18, 1.0);
      float jitter = .5 + (hash12(gl_FragCoord.xy) - .5) * .28;
      float t = t0 + jitter * stepLen;
      float effStep = stepLen / (1.0 + stepLen * .0016);
      float sigmaExt = mix(.0046, .0062, stratus);
      float sigmaLight = .0078;
      float hor2 = 1.0 - dir.y * dir.y;
      vec2 windShear = normalize(uLightDir.xz + vec2(1e-4)) * 140.0;
      float domeScale = mix(.22, .05, stratus);
      float botEdge = mix(.30, .15, stratus);
      float topEdge = mix(.26, .58, stratus);
      float erodeAmt = mix(.48, .25, stratus);
      float densGain = mix(1.0, 1.40, stratus * .5 + uCloudHeaviness * .5);

      float heavyDark = 1.0 - uCloudHeaviness * .54;
      vec3 skyTopCol = mix(uAmbient * 1.45, vec3(dot(uAmbient, vec3(.2126, .7152, .0722))) * vec3(1.08, 1.12, 1.18), uOvercast * .60);
      vec3 skyBaseCol = skyTopCol * mix(.38, .24, uCloudHeaviness) + sunHaze * (.08 * twilight);
      float sunElevBoost = clamp(uLightDir.y + .22, .10, 1.0);
      vec3 warmCrest = mix(uLightColor, uLightColor + sunHaze * .65, twilight);
      float directScale = sunElevBoost * mix(.74, .24, uCloudHeaviness * .72 + uOvercast * .28);
      float twiMask = twilight * (.38 + .62 * smoothstep(.0, .6, mu)) * (1.0 - uCloudHeaviness * .75);

      for (int i = 0; i < 16; i++) {
        if (i >= steps) break;
        vec3 pos = uCamera + dir * t;
        float alt = pos.y + (t * t * hor2) / (2.0 * Rc);
        float h = clamp((alt - H0) / H_THICK, 0.0, 1.0);

        vec2 pMac = macroRot * ((pos.xz + windOffset + windShear * h) / 10500.0);
        float macro = textureLod(uNoise, pMac, macLod).b;
        float domeBias = domeScale * smoothstep(.18, 1.0, h);
        float effThresh = thresh + domeBias;
        if (macro >= effThresh - .02) {
          float bottom = smoothstep(0.0, botEdge, h);
          float top = smoothstep(1.0, topEdge, h);
          float base = clamp((macro - effThresh) / max(1.0 - effThresh, .28), 0.0, 1.0) * bottom * top;
          if (base > .004) {
            vec2 pDet = detRot * ((pos.xz + windOffset + windShear * (h * .85)) / 5200.0);
            vec2 ba = textureLod(uNoise, pDet, detLod).ba;
            float d3 = noise3(vec3((pos.xz + windOffset * 1.15) * .0055, h * 4.5 + uTime * .04));
            float billow = mix(ba.y * .72 + ba.x * .28, ba.y * .60 + ba.x * .20 + d3 * .20, d3Weight);
            float dens = max(base - (1.0 - billow) * erodeAmt * (1.0 - base * .62), 0.0);
            dens = mix(dens, base * (.42 + billow * .92), stratus * .62) * densGain;

            if (dens > .003) {
              vec3 pL1 = pos + lDir * 200.0;
              vec2 r1 = pL1.xz - uCamera.xz;
              float hL1 = clamp((pL1.y + dot(r1, r1) / (2.0 * Rc) - H0) / H_THICK, 0.0, 1.0);
              float mL1 = textureLod(uNoise, macroRot * ((pL1.xz + windOffset + windShear * hL1) / 10500.0), macLod).b;
              float dL1 = max(mL1 - thresh - domeScale * smoothstep(.18, 1.0, hL1), 0.0) * smoothstep(0.0, .12, hL1) * smoothstep(1.0, .25, hL1);

              vec3 pL2 = pos + lDir * 600.0;
              vec2 r2 = pL2.xz - uCamera.xz;
              float hL2 = clamp((pL2.y + dot(r2, r2) / (2.0 * Rc) - H0) / H_THICK, 0.0, 1.0);
              float mL2 = textureLod(uNoise, macroRot * ((pL2.xz + windOffset + windShear * hL2) / 10500.0), macLod).b;
              float dL2 = max(mL2 - thresh - domeScale * smoothstep(.18, 1.0, hL2), 0.0) * smoothstep(0.0, .12, hL2) * smoothstep(1.0, .25, hL2);

              float optLight = (dL1 * 220.0 + dL2 * 440.0 + stratus * (.35 + (1.0 - billow) * .35) * (1.0 - h) * 180.0) * sigmaLight * mix(.85, 1.45, uCloudHeaviness);
              float beer = max(exp(-optLight), .30 * exp(-optLight * .32)) * mix(.42, 1.0, smoothstep(.05, .72, h));
              float powder = mix(.58, 1.12, 1.0 - exp(-dens * 3.0));
              float lightEnergy = mix(beer * powder, beer, max(mu, 0.0) * .50);
              float phaseEff = mix(.78, phase, exp(-optLight * .65) * (1.0 - stratus * .72));

              vec3 directCol = warmCrest * (lightEnergy * phaseEff * directScale);
              vec3 ambientCol = mix(skyBaseCol, skyTopCol, smoothstep(.05, .85, h)) * heavyDark * mix(1.0, .62, clamp(dens * 1.15, 0.0, 1.0));
              // Low sun / dawn catches warm underbellies and horizon-facing edges.
              vec3 twilightRim = sunHaze * (twiMask * exp(-optLight * .65) * mix(1.0, .42, h));
              vec3 stepLight = directCol + ambientCol + twilightRim + uFlash * vec3(1.5, 1.65, 2.1) * (1.1 - h * .65);

              float stepT = exp(-dens * effStep * sigmaExt);
              float wVis = T * (1.0 - stepT);
              accum += wVis * stepLight;
              hitPos += wVis * pos;
              hitDist += wVis * t;
              hitW += wVis;
              T *= stepT;
              if (T < .025) break;
            }
          }
        }
        t += stepLen;
      }
    }
  }

  float cumAlpha = clamp(1.0 - T, 0.0, 1.0);
  vec3 cumRgb = accum / max(cumAlpha, 1e-4);
  if (hitW > .02) {
    float avgDist = hitDist / hitW;
    if (avgDist < 11000.0 && uCloudInk > .01) {
      vec3 pHit = hitPos / hitW;
      vec2 glyphUv = pHit.xz / 340.0 + uCloudOffset * 2.4;
      float lod = clamp(log2(max(avgDist / 1600.0, 1.0)), 0.0, 3.5);
      float sdf = textureLod(uCloudGlyphs, glyphUv, lod).b;
      float edge = clamp(.035 + avgDist * .000025, .035, .32);
      float ink = smoothstep(.5 - edge, .5 + edge, sdf) * smoothstep(11000.0, 5200.0, avgDist) * uCloudInk;
      cumRgb *= mix(1.0, 1.16, ink);
      cumAlpha = mix(cumAlpha, min(cumAlpha * 1.20 + .05, 1.0), ink * .50);
    }
    float fog = exp(-avgDist * (.000018 + uFogDensity * .005));
    cumRgb = mix(horHaze, cumRgb, fog);
  }
  cumAlpha *= smoothstep(.012, .065, dir.y);

  // Delicate high-altitude cirrus streaks visible in clear/partly-cloudy skies.
  vec3 cirRgb = vec3(0.0);
  float cirAlpha = 0.0;
  if (dir.y > .028 && T > .04 && uCloudCover < .95) {
    float cirrusVis = mix(.26, .52, smoothstep(0.0, .35, uCloudCover))
                    * (1.0 - smoothstep(.68, .95, uCloudCover))
                    * mix(1.0, .42, uMoon);
    if (cirrusVis > .005) {
      float tC = cloudShellDist(dir.y, uCamera.y, Rc, 5800.0);
      const mat2 cirRot = mat2(.94, -.34, .34, .94);
      vec2 pC = cirRot * (uCamera.xz + dir.xz * tC + windOffset * .42);
      float cBase = textureLod(uNoise, pC * vec2(1.0, .28) / 26000.0, 0.0).b;
      float cFil = textureLod(uNoise, pC * vec2(1.0, .35) / 9500.0 + vec2(cBase * .12, -.06), 0.0).a;
      float cirrus = smoothstep(.56, .88, cBase * .72 + cFil * .28)
                   * smoothstep(.24, .78, cFil)
                   * smoothstep(.03, .16, dir.y);
      cirAlpha = clamp(cirrus * cirrusVis, 0.0, .50);
      if (cirAlpha > .003) {
        vec3 cirLit = (uLightColor * (.55 + phase * .30) * clamp(uLightDir.y + .28, .12, 1.0) + uAmbient * 1.35 + sunHaze * (.45 * twilight)) * .70;
        cirRgb = mix(horHaze, cirLit, exp(-tC * (.000014 + uFogDensity * .005)));
      }
    }
  }

  float outA = cumAlpha + cirAlpha * (1.0 - cumAlpha);
  vec3 outRgb = outA > 1e-4 ? (cumRgb * cumAlpha + cirRgb * cirAlpha * (1.0 - cumAlpha)) / outA : vec3(0.0);
  return vec4(outRgb, clamp(outA, 0.0, 1.0) * uClouds);
}

void main() {
  vec4 world = uInvViewProj * vec4(vNdc, 1.0, 1.0);
  vec3 dir = normalize(world.xyz / world.w - uCamera);
  vec3 color;
  if (uUnderwater > .5) {
    color = waterVolume(dir, max(-uCamera.y, 0.0));
  } else if (dir.y < 0.0) {
    // Between the last row of the sea and the true horizon: open water in haze.
    color = hazeColor(dir) * .92;
  } else {
    color = skyRadiance(dir);
    float night = 1.0 - smoothstep(.02, .25, dot(skyRadiance(vec3(0.0, 1.0, 0.0)), vec3(.333)) * uExposure);
    float clear = (1.0 - uOvercast) * smoothstep(0.0, .06, dir.y);
    float localDark = 1.0 - smoothstep(.08, .32, dot(color, vec3(.299, .587, .114)) * uExposure);
    float skyFade = uStars * night * clear * localDark;
    if (skyFade > .002) {
      float moonAngle = acos(clamp(dot(dir, uSunDir), -1.0, 1.0));
      float moonMask = uMoon > .5 ? smoothstep(uDiscSize * .96, uDiscSize * 1.02, moonAngle) : 1.0;
      float moonIllum = uMoon > .5 ? (.5 - .5 * cos(uMoonPhase * 2.0 * PI)) : 0.0;
      float moonGlare = uMoon > .5 ? exp(-moonAngle * 4.2) * (.32 + .68 * moonIllum) : 0.0;
      float mwFade = mix(1.0, .18, moonIllum) * (1.0 - moonGlare * .88) * smoothstep(.04, .20, dir.y);
      vec3 sdir = skySpin(dir);
      vec4 mw = milkyWay(sdir, mwFade);
      color += (mw.rgb + stars(dir, sdir, mw.a, moonGlare) + meteor(dir)) * skyFade * moonMask;
      color += aurora(dir, moonGlare) * night * (1.0 - uOvercast * .85) * moonMask;
    }
    color += disc(dir) * smoothstep(-.01, .01, dir.y);
    vec4 cloud = clouds(dir);
    color = mix(color, cloud.rgb, cloud.a);
    color += sunGlare(dir, cloud.a);
  }
  outColor = vec4(dither(tonemap(color)), 1.0);
}
`;
