
// The reading corridor: two infinite walls of quotations, traced analytically
// per pixel. Letters are carved into the stone, so they catch the warm light
// that waits at the far end of the corridor.

export const CORRIDOR_FRAGMENT = /* glsl */`
in vec2 vNdc;
out vec4 outColor;
uniform sampler2D uQuotes;
uniform sampler2D uQuoteIds;
uniform sampler2D uPicked;
uniform vec2 uTan;           // tan of half field of view (x, y)
uniform vec2 uLook;          // pointer parallax
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
  return vec2(mix(hit.z, -hit.z, side) / 20.0 + side * .317, -hit.y / 10.5 + side * .193);
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
  vec3 dir = normalize(vec3(vNdc.x * uTan.x, (vNdc.y - .1) * uTan.y, -1.0));
  float pitch = .12 + uLook.y * .02, cp = cos(pitch), sp = sin(pitch);
  dir.yz = mat2(cp, sp, -sp, cp) * dir.yz;
  float yaw = uLook.x * .035, cy = cos(yaw), sy = sin(yaw);
  dir.xz = mat2(cy, -sy, sy, cy) * dir.xz;
  float side = step(0.0, dir.x);
  vec3 eye = vec3(uLook.x * .25, uDescent, -uTravel);
  float t = ((side * 2.0 - 1.0) * WALL - eye.x) / dir.x;
  vec3 hit = eye + dir * t;
  vec2 uv = wallUv(hit, side);

  // Keep the first quotations sparse, then fill the walls as the dive deepens.
  float packing = uReveal * uReveal;
  float ink = carve(uv, packing);
  if (uBlur > 0.0) ink = ink * .5 + (carve(uv + vec2(0.0, uBlur), packing) + carve(uv - vec2(0.0, uBlur), packing)) * .25;

  // Relief: the slope of the distance field tilts the carved surface.
  vec2 texel = vec2(1.0 / uTile);
  float slopeX = texture(uQuotes, uv + vec2(texel.x * 1.5, 0.0)).r - texture(uQuotes, uv - vec2(texel.x * 1.5, 0.0)).r;
  float slopeY = texture(uQuotes, uv + vec2(0.0, texel.y * 1.5)).r - texture(uQuotes, uv - vec2(0.0, texel.y * 1.5)).r;
  float distance = t;
  // Light pours down the corridor from the far end, grazing the walls.
  vec3 toLight = normalize(vec3(-hit.x * .25, .6 - hit.y * .02, -1.0));
  vec3 normal = normalize(vec3(-(side * 2.0 - 1.0), 0.0, 0.0) + vec3(0.0, slopeY, mix(-slopeX, slopeX, side)) * 3.0 * ink);
  float grazing = max(dot(normal, toLight), 0.0);
  float column = .74 + .16 * sin(hit.z * .71 + side * 4.0) + .1 * sin(hit.z * 2.19 + 1.3);
  float stone = .88 + .12 * hash12(floor(uv * vec2(640.0, 320.0)));

  vec3 wall = vec3(.010, .013, .02) * stone;
  vec3 letter = mix(vec3(.105, .15, .2), vec3(.13, .175, .225), side) * column;
  letter += uGlow * grazing * .42;

  float picked = 0.0;
  if (uPickedStrength > 0.0) {
    float id = texture(uQuoteIds, vec2(uv.x, .5)).r * 255.0;
    picked = texture(uPicked, vec2((id + .5) / 256.0, .5)).r;
    letter = mix(letter, vec3(1.0, .78, .38) * (1.25 + .25 * column) + uGlow * grazing, picked);
  }
  vec3 color = mix(wall, letter * mix(1.0, 1.55, picked), ink);

  // Mist thickens with distance and takes the colour of the far light.
  float fog = 1.0 - exp(-pow(distance / 30.0, 1.2));
  vec3 mist = mix(vec3(.045, .06, .08), uGlow * .2, smoothstep(.3, 1.0, fog) * exp(-abs(vNdc.y - .27) * 1.6)) * (1.05 - vNdc.y * .15);
  color = mix(color, mist, fog * smoothstep(.3, .95, uReveal));

  // The light itself: a small source and a long soft shaft down the corridor.
  vec2 lp = vec2(vNdc.x * uTan.x / uTan.y, vNdc.y - .27 + uLook.y * .02);
  float r = length(lp);
  color += uGlow * (exp(-r * r / .00035) * 1.6 + exp(-r * r / .004) * .25 + exp(-r * r / .05) * .06) * smoothstep(.6, .98, uReveal);
  float shaft = exp(-abs(lp.x) * 14.0) * smoothstep(.3, -.6, lp.y) * .008;
  color += uGlow * shaft * smoothstep(.6, .98, uReveal);
  // Dust drifting through the light.
  vec2 dustCell = floor(vNdc * vec2(90.0, 56.0) + vec2(0.0, uTime * .6));
  float dust = step(.997, hash12(dustCell)) * (.5 + .5 * sin(uTime * 2.0 + hash12(dustCell + 3.0) * 20.0));
  color += uGlow * dust * .12 * exp(-r * 2.5);

  float vignette = 1.0 - .28 * smoothstep(.4, 1.5, length(vNdc * vec2(.7, .55)));
  color *= vignette;
  vec3 mapped = tonemap(color);
  mapped += (hash12(gl_FragCoord.xy) - .5) / 255.0;
  outColor = vec4(mapped, smoothstep(.0, .35, uReveal));
}
`;
