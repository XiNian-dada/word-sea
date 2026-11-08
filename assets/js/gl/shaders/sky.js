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
  c = (c * (2.51 * c + .03)) / (c * (2.43 * c + .59) + .14);
  return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
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
    vec3 tau = BR * uRayleigh * (depthR + lightR) + BM * uMie * 1.1 * (depthM + lightM);
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
uniform float uCloudInk;
uniform float uClouds;
uniform float uUnderwater;

float noise(vec2 p) { return texture(uNoise, p / 256.0).r; }
float fbm(vec2 p) {
  float v = 0.0, a = .5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.1, 5.7); a *= .5; }
  return v;
}

vec3 stars(vec3 dir) {
  // One candidate star per cell of a direction grid; most cells stay dark.
  vec2 sph = vec2(atan(dir.x, -dir.z), asin(dir.y)) * 260.0;
  vec2 cell = floor(sph), f = fract(sph) - .5;
  float h = hash12(cell);
  if (h < .955) return vec3(0.0);
  vec2 offset = vec2(hash12(cell + 7.3), hash12(cell + 3.1)) - .5;
  float d = length(f - offset * .6);
  float size = mix(.06, .16, pow(hash12(cell + 1.7), 6.0));
  float twinkle = .65 + .35 * sin(uTime * (1.3 + h * 3.0) + h * 40.0);
  vec3 tint = mix(vec3(.75, .85, 1.0), vec3(1.0, .88, .72), hash12(cell + 9.1));
  return tint * smoothstep(size, 0.0, d) * twinkle * (h - .955) * 22.0;
}

vec3 disc(vec3 dir) {
  float c = dot(dir, uSunDir);
  float angle = acos(clamp(c, -1.0, 1.0));
  vec3 color = vec3(0.0);
  if (uMoon < .5) {
    // Limb-darkened photosphere plus a compact aureole; no screen-sized bloom.
    float r = angle / uDiscSize;
    float limb = r < 1.0 ? pow(max(1.0 - r * r, 0.0), .35) : 0.0;
    float edge = smoothstep(1.0, .92, r);
    color += uDiscColor * (limb * edge * 60.0);
    color += uDiscColor * (exp(-angle * 55.0) * 1.6 + exp(-angle * 14.0) * .22) * (1.0 - uOvercast * .85);
  } else {
    float r = angle / uDiscSize;
    if (r < 1.0) {
      // Orthographic view of a lit sphere: the terminator follows the phase.
      vec3 up = abs(uSunDir.y) > .99 ? vec3(1, 0, 0) : vec3(0, 1, 0);
      vec3 right = normalize(cross(up, uSunDir)), top = cross(uSunDir, right);
      vec2 q = vec2(dot(dir - uSunDir * c, right), dot(dir - uSunDir * c, top)) / uDiscSize;
      vec3 n = vec3(q, sqrt(max(1.0 - dot(q, q), 0.0)));
      float phase = uMoonPhase * 2.0 * PI;
      vec3 l = normalize(vec3(sin(phase), .12, -cos(phase)));
      float lit = smoothstep(-.06, .12, dot(n, l));
      float maria = smoothstep(.45, .7, texture(uNoise, q * 9.0 + 40.0).g) * .35 + texture(uNoise, q * 30.0).b * .12;
      color += uDiscColor * (lit * (1.0 - maria) * 9.0 + .05) * smoothstep(1.0, .9, r);
    }
    color += uDiscColor * (exp(-angle * 40.0) * .35 + exp(-angle * 9.0) * .05) * (1.0 - uOvercast * .7);
  }
  return color;
}

vec4 clouds(vec3 dir) {
  if (dir.y <= .002 || uClouds < .001) return vec4(0.0);
  // A cloud deck 900 m above the sea; words are the texture of its vapour.
  float t = (900.0 - uCamera.y) / dir.y;
  vec2 p = uCamera.xz + dir.xz * t;
  vec2 q = p / 520.0 + uCloudOffset;
  float shape = fbm(q * 3.0);
  float cover = mix(.66, .30, uCloudCover);
  float density = smoothstep(cover, cover + .28, shape);
  float horizon = smoothstep(.0, .14, dir.y);
  density *= horizon;
  if (density < .002) return vec4(0.0);
  // Words are written in the deck itself; distant ones dissolve into texture.
  vec2 glyphUv = p / 210.0 + uCloudOffset * 2.4;
  float sdf = texture(uCloudGlyphs, glyphUv).b;
  float edge = clamp(fwidth(sdf) * .75, .015, .5);
  float ink = smoothstep(.5 - edge, .5 + edge, sdf);
  // Light that reaches us through the cloud: brighter edges towards the sun.
  vec2 toLight = normalize(uLightDir.xz + vec2(1e-4)) * .045;
  float shadow = fbm(q * 3.0 + toLight * 3.0);
  float thickness = smoothstep(cover, cover + .5, shadow);
  float forward = pow(max(dot(dir, uLightDir), 0.0), 6.0);
  vec3 lit = uLightColor * (1.15 - thickness * .75) * (.9 + forward * 3.0) * max(uLightDir.y + .18, .06) * 2.4;
  vec3 ambient = uAmbient * (1.25 - thickness * .4);
  vec3 color = (lit + ambient) * .6 + uFlash * vec3(1.3, 1.4, 1.8) * density;
  float alpha = density * mix(.34 + uCloudCover * .5, 1.0, ink * uCloudInk);
  // Distant decks melt into the horizon haze.
  float fog = exp(-t * uFogDensity * .22);
  color = mix(hazeColor(dir), color, fog);
  return vec4(color, clamp(alpha, 0.0, 1.0) * uClouds);
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
    float clear = (1.0 - uOvercast) * smoothstep(0.0, .08, dir.y);
    color += stars(dir) * uStars * night * clear;
    color += disc(dir) * smoothstep(-.01, .01, dir.y);
    vec4 cloud = clouds(dir);
    color = mix(color, cloud.rgb, cloud.a);
  }
  outColor = vec4(dither(tonemap(color)), 1.0);
}
`;
