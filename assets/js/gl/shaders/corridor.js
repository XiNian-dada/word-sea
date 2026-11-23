
// The reading corridor: two infinite walls of quotations, traced analytically
// per pixel. Letters are carved into the stone, so they catch the daylight
// or moonlight filtering through the far end of the corridor.

export const CORRIDOR_FRAGMENT = /* glsl */`
in vec2 vNdc;
out vec4 outColor;
uniform sampler2D uQuotes;
uniform sampler2D uQuoteIds;
uniform sampler2D uPicked;
uniform vec2 uTan;           // tan of half field of view (x, y)
uniform vec2 uAngles;        // pitch and yaw of the shared camera transition
uniform float uEyeX;
uniform float uOffsetY;
uniform vec2 uLightNdc;
uniform float uTravel;
uniform float uDescent;
uniform float uReveal;       // 0 … 1, opacity and how many quotes are written
uniform float uPickedStrength;
uniform float uTime;
uniform float uExposure;
uniform float uBlur;
uniform vec3 uGlow;
uniform float uTile;

const float WALL = 4.2;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 wallUv(vec3 hit, float side) {
  // The inward faces have opposite horizontal axes; both must read left to right.
  return vec2(mix(-hit.z, hit.z, side) / 20.0 + side * .317, -hit.y / 10.5 + side * .193);
}

float carve(vec2 uv, float packing) {
  vec2 g = texture(uQuotes, uv).rg;
  float edge = clamp(fwidth(g.r) * .8, .01, .5);
  float ink = smoothstep(.5 - edge, .5 + edge, g.r);
  // Quotations are written in order of a per-repetition priority as the walls appear.
  return ink * smoothstep(g.g - .06, g.g + .06, packing);
}

vec3 tonemap(vec3 c) {
  c *= uExposure;
  c = (c * (2.51 * c + .03)) / (c * (2.43 * c + .59) + .14);
  return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
}

void main() {
  vec3 dir = normalize(vec3(vNdc.x * uTan.x, (vNdc.y - uOffsetY) * uTan.y, -1.0));
  float pitch = uAngles.x, cp = cos(pitch), sp = sin(pitch);
  dir.yz = mat2(cp, sp, -sp, cp) * dir.yz;
  float yaw = uAngles.y, cy = cos(yaw), sy = sin(yaw);
  dir.xz = mat2(cy, -sy, sy, cy) * dir.xz;
  float side = step(0.0, dir.x);
  vec3 eye = vec3(uEyeX, uDescent, -uTravel);
  float denom = abs(dir.x) < 1e-4 ? (side > .5 ? 1e-4 : -1e-4) : dir.x;
  float t = ((side * 2.0 - 1.0) * WALL - eye.x) / denom;
  vec3 hit = eye + dir * t;
  vec2 uv = wallUv(hit, side);

  // Keep the first quotations sparse, then fill the walls as the dive deepens.
  float packing = uReveal * uReveal;
  float ink = carve(uv, packing);
  if (uBlur > 0.0) ink = ink * .5 + (carve(uv + vec2(0.0, uBlur), packing) + carve(uv - vec2(0.0, uBlur), packing)) * .25;

  float distance = t;
  // Relief: the slope of the distance field tilts the carved surface.
  // Skip the four extra texture lookups on empty stone and distant mist where ink is zero.
  float slopeX = 0.0, slopeY = 0.0;
  if (ink > 0.005 && distance < 75.0) {
    vec2 texel = vec2(1.0 / uTile);
    slopeX = texture(uQuotes, uv + vec2(texel.x * 1.5, 0.0)).r - texture(uQuotes, uv - vec2(texel.x * 1.5, 0.0)).r;
    slopeY = texture(uQuotes, uv + vec2(0.0, texel.y * 1.5)).r - texture(uQuotes, uv - vec2(0.0, texel.y * 1.5)).r;
  }
  // Light pours down the corridor from the far end, grazing the walls.
  vec3 toLight = normalize(vec3(-hit.x * .25, .6 - hit.y * .02, -1.0));
  vec3 normal = normalize(vec3(-(side * 2.0 - 1.0), 0.0, 0.0) + vec3(0.0, slopeY, mix(slopeX, -slopeX, side)) * 3.0 * ink);
  float grazing = max(dot(normal, toLight), 0.0);
  float column = .74 + .16 * sin(hit.z * .71 + side * 4.0) + .1 * sin(hit.z * 2.19 + 1.3);
  float stone = .88 + .12 * hash12(floor(uv * vec2(640.0, 320.0)));

  vec3 wall = vec3(.012, .016, .025) * stone;
  vec3 letter = mix(vec3(.135, .19, .255), vec3(.165, .22, .285), side) * column;
  letter += uGlow * grazing * .52;

  float picked = 0.0;
  if (uPickedStrength > 0.0) {
    float id = texture(uQuoteIds, vec2(uv.x, .5)).r * 255.0;
    picked = texture(uPicked, vec2((id + .5) / 256.0, .5)).r;
    vec3 gold = vec3(1.0, .82, .36) * (3.2 + .7 * column + grazing * 1.4) + uGlow * grazing * .8;
    letter = mix(letter, gold, picked);
  }
  vec3 pickedWall = wall + vec3(.12, .08, .02) * picked * (.25 + .75 * ink);
  vec3 color = mix(pickedWall, letter * mix(1.0, 2.25, picked), ink);

  // Mist thickens with distance: deep and quiet down the reading channel, softly echoing the sky's time of day.
  float fog = 1.0 - exp(-pow(distance / 24.0, 1.3));
  vec3 mist = mix(vec3(.007, .010, .016) + uGlow * .008, uGlow * .085, smoothstep(.32, 1.0, fog) * exp(-abs(vNdc.y - uLightNdc.y) * 1.65)) * (1.02 - vNdc.y * .12);
  color = mix(color, mist, fog * smoothstep(.3, .95, uReveal) * mix(1.0, .5, picked * ink));

  // Soft volumetric glow at the far end of the corridor, avoiding a harsh pinpoint behind the text.
  vec2 lp = vec2((vNdc.x - uLightNdc.x) * uTan.x / uTan.y, vNdc.y - uLightNdc.y);
  float r = length(lp);
  float revealGlow = smoothstep(.6, .98, uReveal);
  color += uGlow * (exp(-r * r / .022) * .12 + exp(-r * r / .095) * .045) * revealGlow;
  float shaft = exp(-abs(lp.x) * 8.5) * smoothstep(.38, -.65, lp.y) * .0045;
  color += uGlow * shaft * revealGlow;

  // Soft circular bokeh dust motes drifting across two depth layers in the corridor light.
  float dust = 0.0;
  vec2 aspectNdc = vec2(vNdc.x * uTan.x / uTan.y, vNdc.y);
  for (int layer = 0; layer < 2; layer++) {
    float fl = float(layer);
    vec2 p = aspectNdc * (13.0 + fl * 9.0) + vec2(sin(uTime * .08 + fl * 2.1) * .4, -uTime * (.14 - fl * .05));
    vec2 id = floor(p), f = fract(p) - .5;
    float h = hash12(id + fl * 31.7);
    if (h > .90) {
      vec2 offset = (vec2(hash12(id + 7.1 + fl * 5.0), hash12(id + 19.3 + fl * 9.0)) - .5) * .56;
      offset += vec2(sin(uTime * .6 + h * 40.0), cos(uTime * .45 + h * 29.0)) * .07;
      float d = length(f - offset);
      float rad = mix(.045, .095, hash12(id + 41.0)) * (1.0 - fl * .28);
      float pulse = .55 + .45 * sin(uTime * (1.1 + h * 1.4) + h * 25.0);
      dust += smoothstep(rad, rad * .12, d) * pulse * (1.0 - fl * .35);
    }
  }
  color += uGlow * dust * .15 * exp(-r * 1.9) * revealGlow;

  float vignette = 1.0 - .28 * smoothstep(.4, 1.5, length(vNdc * vec2(.7, .55)));
  color *= vignette;
  vec3 mapped = tonemap(color);
  mapped += (hash12(gl_FragCoord.xy) - .5) / 255.0;
  outColor = vec4(mapped, smoothstep(.0, .35, uReveal));
}
`;
