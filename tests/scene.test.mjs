import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../assets/js/scene/world.js';
import { Corridor } from '../assets/js/scene/corridor.js';
import { Governor } from '../assets/js/scene/pacing.js';
import { TIERS, QualityController, atlasSizeFor, detectInitialTier, parseQualityOverride, shouldUseAntialias } from '../assets/js/scene/quality.js';
import { easeInOut, mat4 } from '../assets/js/core/math.js';

// Camera and picking geometry can be exercised without a WebGL context.
function cameraCorridor() {
  const corridor = Object.create(Corridor.prototype);
  corridor.state = { look: new Float32Array(2), tan: new Float32Array(2), angles: new Float32Array(2), lightNdc: new Float32Array(2) };
  return corridor;
}

function corridorRay(s, x, y) {
  let dx = x * s.tan[0], dy = (y - s.offsetY) * s.tan[1], dz = -1;
  const [pitch, yaw] = s.angles, cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  [dy, dz] = [cp * dy - sp * dz, sp * dy + cp * dz];
  [dx, dz] = [cy * dx + sy * dz, -sy * dx + cy * dz];
  const length = Math.hypot(dx, dy, dz);
  return [dx / length, dy / length, dz / length];
}

test('pausing an active ripple stops drawing without discarding it', () => {
  const world = new World();
  world.addRipple(2, -8, 1);
  world.update(1 / 60);
  world.paused = true;
  const time = world.time, waveTime = world.waveTime;
  for (let i = 0; i < 120; i++) assert.equal(world.update(1 / 60), false);
  assert.equal(world.time, time);
  assert.equal(world.waveTime, waveTime);
  assert.equal(world.ripples.length, 1);

  world.paused = false;
  assert.equal(world.update(1 / 60), true);
  assert.ok(world.time > time);
  for (let i = 0; i < 600; i++) world.update(1 / 60);
  assert.equal(world.ripples.length, 0);
});

test('reduced motion applies cloud changes in one frame', () => {
  const world = new World();
  world.paused = true;
  world.cloudsTarget = 0;
  assert.equal(world.update(1 / 60, { reducedMotion: true }), false);
  assert.equal(world.frame.clouds.enabled, 0);
  world.cloudsTarget = 1;
  assert.equal(world.update(1 / 60, { reducedMotion: true }), false);
  assert.equal(world.frame.clouds.enabled, 1);
});

test('reduced motion settles existing pointer parallax without further frames', () => {
  const world = new World();
  world.paused = true;
  world.pointer.sx = .4;
  world.pointer.sy = -.3;
  assert.equal(world.update(1 / 60, { reducedMotion: true }), false);
  assert.equal(world.pointer.sx, 0);
  assert.equal(world.pointer.sy, 0);
});

test('daylight can finish changing while reading holds the sea clock still', () => {
  const world = new World({ theme: 'noon' });
  world.update(.5);
  world.addRipple(2, -8, 1);
  const time = world.time, waveTime = world.waveTime, offset = [...world.cloudOffset];
  world.setTheme('night');
  for (let i = 0; i < 180; i++) {
    world.updateTheme(1 / 60);
    world.updateAtmosphere();
  }
  assert.equal(world.presetBlend, 1);
  assert.equal(world.preset.moonMix, 1);
  assert.equal(world.frame.atmosphere.moon, 1);
  assert.equal(world.updateTheme(1 / 60), false, 'settled lighting must not schedule more frames');
  assert.equal(world.time, time);
  assert.equal(world.frame.time, time);
  assert.equal(world.waveTime, waveTime);
  assert.deepEqual(world.cloudOffset, offset);
  assert.equal(world.ripples.length, 1);
});

test('reversing a daylight change keeps its current moon blend and honors reduced motion', () => {
  const world = new World({ theme: 'noon' });
  world.setTheme('night');
  world.updateTheme(.9);
  const moon = world.preset.moonMix, elevation = world.preset.elevation;
  assert.ok(moon > 0 && moon < 1);
  world.setTheme('noon');
  world.updateTheme(0);
  assert.equal(world.preset.moonMix, moon, 'reversal must start from the visible lighting');
  assert.equal(world.preset.elevation, elevation);
  assert.equal(world.updateTheme(0, { reducedMotion: true }), false);
  assert.equal(world.presetBlend, 1);
  assert.equal(world.preset.moonMix, 0);
});

test('diving keeps looking into the water and moving until the corridor takes over', () => {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const world = new World();
    world.setViewport(width, height);
    world.pointer.sx = .4;
    world.pointer.sy = -.4;
    world.updateCamera();
    let previous = [...world.frame.camera.eye];
    for (let step = 1; step <= 100; step++) {
      world.dive = step / 100;
      world.updateCamera();
      const { eye, pitch } = world.frame.camera;
      assert.ok(pitch >= 0, `the camera must not look back up at dive ${world.dive}`);
      assert.ok(eye[1] < previous[1], `descent must not pause at dive ${world.dive}`);
      assert.ok(eye[2] < previous[2], `forward motion must not pause at dive ${world.dive}`);
      previous = [...eye];
    }
  }
});

test('sea and corridor rays agree throughout their visible overlap', () => {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const world = new World(), corridor = cameraCorridor();
    world.setViewport(width, height);
    world.pointer.sx = .6; world.pointer.sy = -.4;
    corridor.state.look.set([.6, -.4]);
    for (const progress of [.36, .45, .55, .62, .64]) {
      world.dive = progress; world.updateCamera();
      const camera = world.frame.camera;
      corridor.updateCamera(camera, progress, width / height);
      assert.equal(corridor.state.eyeX, camera.eye[0]);
      for (const x of [-.8, 0, .8]) for (const y of [-.8, 0, .8]) {
        const m = camera.invViewProj, point = [0, 0, 0, 0];
        for (let r = 0; r < 4; r++) point[r] = m[r] * x + m[4 + r] * y + m[8 + r] + m[12 + r];
        const expected = point.slice(0, 3).map((v, i) => v / point[3] - camera.eye[i]);
        const length = Math.hypot(...expected), actual = corridorRay(corridor.state, x, y);
        actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i] / length) < 2e-5, `ray mismatch at ${progress}, ${x}, ${y}`));
      }
    }
  }
});

test('corridor view settles smoothly, reverses exactly and keeps its light in the world', () => {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const world = new World(), corridor = cameraCorridor(), poses = [];
    world.setViewport(width, height);
    for (let step = 0; step <= 200; step++) {
      const progress = easeInOut(step / 200);
      world.dive = progress; world.updateCamera();
      corridor.updateCamera(world.frame.camera, progress, width / height);
      const s = corridor.state, ray = corridorRay(s, 0, 0);
      if (step) {
        const dot = ray.reduce((sum, v, i) => sum + v * poses[step - 1].ray[i], 0);
        assert.ok(Math.acos(Math.min(1, dot)) < Math.PI / 180, 'view must turn less than one degree in a 16ms frame');
      }
      const light = corridorRay(s, ...s.lightNdc), elevation = .12 + Math.atan(.17 / 1.62);
      assert.ok(Math.abs(light[0]) < 1e-6);
      assert.ok(Math.abs(light[1] - Math.sin(elevation)) < 1e-6);
      poses.push({ ray, tan: [...s.tan], offset: s.offsetY });
    }
    assert.ok(Math.abs(corridor.state.angles[0] - .12) < 1e-6);
    assert.ok(Math.abs(corridor.state.tan[1] - 1 / 1.62) < 1e-6);
    assert.ok(Math.abs(corridor.state.lightNdc[1] - .27) < 1e-6);
    for (let step = 200; step >= 0; step--) {
      const progress = easeInOut(step / 200);
      world.dive = progress; world.updateCamera();
      corridor.updateCamera(world.frame.camera, progress, width / height);
      assert.deepEqual(corridorRay(corridor.state, 0, 0), poses[step].ray);
      assert.deepEqual([...corridor.state.tan], poses[step].tan);
      assert.equal(corridor.state.offsetY, poses[step].offset);
    }
  }
});

test('picking follows the projected wall point as camera angles and lens change', () => {
  const world = new World(), corridor = cameraCorridor(), width = 1440, height = 900;
  world.setViewport(width, height);
  world.pointer.sx = .4; world.pointer.sy = -.3;
  corridor.state.look.set([.4, -.3]);
  corridor.ready = true; corridor.tile = 100;
  corridor.columns = [{ id: 7, left: 25, width: 25, start: 0, period: 100, run: 40 }];
  for (const progress of [.4, .75, 1]) {
    world.dive = progress; world.updateCamera();
    corridor.updateCamera(world.frame.camera, progress, width / height);
    const s = corridor.state;
    s.reveal = 1; s.descent = 0; s.travel = 0;
    const view = new Float32Array(16), proj = new Float32Array(16), matrix = new Float32Array(16);
    mat4.view(view, [s.eyeX, 0, 0], -s.angles[0], -s.angles[1]);
    mat4.perspective(proj, 2 * Math.atan(s.tan[1]), width / height, .3, 2400);
    mat4.multiply(matrix, proj, view);
    // The right wall at z=-40, y=0 maps to atlas u=.317, v=.193: quotation 7.
    const point = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) point[r] = matrix[r] * 4.2 - matrix[8 + r] * 40 + matrix[12 + r];
    const x = (point[0] / point[3] + 1) * width / 2;
    const y = (1 - point[1] / point[3] - s.offsetY) * height / 2;
    assert.equal(corridor.pick(x, y, width, height), 7);
  }
});

test('both inward wall faces read atlas columns from left to right', () => {
  const corridor = cameraCorridor(), width = 800, height = 600;
  corridor.ready = true; corridor.tile = 100;
  Object.assign(corridor.state, { reveal: 1, eyeX: 0, offsetY: 0, descent: 0, travel: 0 });
  corridor.state.tan.set([1, .75]);
  corridor.columns = [44, 69, 61, 86].map((left, id) => ({ id, left, width: 2, start: 0, period: 100, run: 100 }));
  // Viewed from inside, the left wall runs near → far across the screen;
  // the right wall runs far → near. The atlas must run forward on both.
  for (const [wall, depths, ids] of [[-4.2, [9, 14], [0, 1]], [4.2, [14, 9], [2, 3]]]) {
    const screenX = depths.map(depth => (wall / depth + 1) * width / 2);
    assert.ok(screenX[0] < screenX[1]);
    assert.deepEqual(screenX.map(x => corridor.pick(x, height / 2, width, height)), ids);
  }
});

test('weather maps cloud cover, heaviness, overcast and exposure smoothly', () => {
  const applyWeather = (patch = {}) => {
    const world = new World({ theme: 'noon' });
    Object.assign(world.weatherTarget, { active: 0, cloud: 0, rain: 0, snow: 0, fog: 0, storm: 0, angle: 0 }, patch);
    world.update(1 / 60, { reducedMotion: true });
    return world.frame;
  };

  const off = applyWeather();
  assert.ok(Math.abs(off.clouds.cover - .30) < 1e-6);
  assert.equal(off.clouds.heaviness, 0);
  assert.equal(off.atmosphere.overcast, 0);

  const clear = applyWeather({ active: 1, cloud: .03 });
  assert.ok(clear.clouds.cover < .05);
  assert.equal(clear.atmosphere.overcast, 0);

  const cloudy = applyWeather({ active: 1, cloud: .65 });
  assert.ok(Math.abs(cloudy.clouds.cover - .65) < 1e-6);
  assert.ok(cloudy.atmosphere.overcast < .2);
  assert.ok(cloudy.atmosphere.discColor[0] > .2);

  const fog = applyWeather({ active: 1, cloud: .94, fog: .88 });
  assert.ok(fog.clouds.cover > .9);

  const overcast = applyWeather({ active: 1, cloud: 1 });
  const storm = applyWeather({ active: 1, cloud: 1, rain: .92, storm: 1 });
  assert.ok(storm.clouds.heaviness > overcast.clouds.heaviness);
  assert.ok(storm.atmosphere.exposure < overcast.atmosphere.exposure);
});

test('quality detection selects low, medium and high tiers accurately', () => {
  assert.equal(parseQualityOverride('HIGH'), 2);
  assert.equal(parseQualityOverride('med'), 1);
  assert.equal(parseQualityOverride('0'), 0);
  assert.equal(parseQualityOverride('ultra'), null);

  assert.deepEqual(detectInitialTier({ width: 1440, height: 900, cores: 8, memory: 16, renderer: 'Apple M1 Pro' }), { tier: 2, maxTier: 2, locked: false });
  assert.deepEqual(detectInitialTier({ coarse: true, width: 390, height: 844, cores: 6, memory: 6 }), { tier: 1, maxTier: 1, locked: false });
  assert.deepEqual(detectInitialTier({ width: 1280, height: 720, renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)' }), { tier: 1, maxTier: 1, locked: false });
  assert.deepEqual(detectInitialTier({ width: 1440, height: 900, cores: 2, memory: 4 }), { tier: 0, maxTier: 0, locked: false });
  assert.deepEqual(detectInitialTier({ width: 1440, height: 900, renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))' }), { tier: 0, maxTier: 0, locked: false });
  assert.deepEqual(detectInitialTier({ coarse: true, software: true, override: 2 }), { tier: 2, maxTier: 2, locked: true });

  assert.equal(shouldUseAntialias({ coarse: false, cores: 8, memory: 16 }), true);
  assert.equal(shouldUseAntialias({ coarse: true, cores: 8, memory: 8 }), false);
  assert.equal(shouldUseAntialias({ coarse: false, cores: 4, memory: 4 }), false);
  assert.equal(shouldUseAntialias({ coarse: true, override: 2 }), true);
  assert.equal(shouldUseAntialias({ coarse: false, cores: 16, override: 0 }), false);

  assert.equal(atlasSizeFor(TIERS[1], { maxTexture: 4096, memory: 4 }), 1024);
  assert.equal(atlasSizeFor(TIERS[1], { maxTexture: 4096, memory: 8 }), 2048);
  assert.equal(atlasSizeFor(TIERS[0], { maxTexture: 4096, memory: 16 }), 1024);
});

test('quality controller and governor downgrade and recover cleanly without bounce', () => {
  const qc = new QualityController({ tier: 2, maxTier: 2, locked: false });
  assert.equal(qc.observe('slow-low'), false);
  assert.equal(qc.tier, 2);
  assert.equal(qc.observe('slow-low'), true);
  assert.equal(qc.tier, 1);

  for (let i = 0; i < 5; i++) assert.equal(qc.observe('calm-max'), false);
  assert.equal(qc.observe('calm-max'), true);
  assert.equal(qc.tier, 2);

  assert.equal(qc.observe('slow-floor'), true);
  assert.equal(qc.tier, 1);
  // Only one climb allowed per session to prevent tier oscillation.
  for (let i = 0; i < 12; i++) assert.equal(qc.observe('calm-max'), false);
  assert.equal(qc.tier, 1);

  const locked = new QualityController({ tier: 2, maxTier: 2, locked: true });
  assert.equal(locked.observe('slow-floor'), false);
  assert.equal(locked.tier, 2);

  const gov = new Governor({ min: .55 });
  gov.setMax(1);
  gov.judge(1000 / 60);
  assert.equal(gov.consumeEvent(), 'calm-max');
  assert.equal(gov.consumeEvent(), null);

  gov.judge(26);
  gov.judge(26);
  assert.equal(gov.scale, .84);
  assert.equal(gov.consumeEvent(), null);
  gov.judge(26);
  assert.ok(gov.scale < .78);
  assert.equal(gov.consumeEvent(), 'slow-low');

  // Next step reaches the 0.60 descent floor, and one more slow window emits slow-floor.
  gov.judge(26);
  assert.equal(gov.scale, .6);
  assert.equal(gov.consumeEvent(), 'slow-low');
  gov.judge(26);
  assert.equal(gov.consumeEvent(), 'slow-floor');
});

test('detail ripples, clouds and precipitation drift coherently along windDir', () => {
  const dot = (ax, az, bx, bz) => {
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    assert.ok(la > 0 && lb > 0);
    return (ax * bx + az * bz) / (la * lb);
  };
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 235 * Math.PI / 180]) {
    const world = new World({ wind: .6, theme: 'noon' });
    Object.assign(world.weatherTarget, { active: 1, cloud: .6, rain: .5, angle });
    world.update(1 / 60, { reducedMotion: true });
    const prevDetail = [...world.frame.sea.detailDrift];
    const prevCloud = [...world.frame.clouds.offset];
    const prevWeather = [...world.frame.weather.drift];
    world.update(1 / 60);
    const [wx, wz] = world.frame.sea.windDir;
    assert.ok(Math.abs(Math.hypot(wx, wz) - 1) < 1e-5);
    assert.ok(dot(world.frame.sea.detailDrift[0] - prevDetail[0], world.frame.sea.detailDrift[1] - prevDetail[1], wx, wz) > .99);
    assert.ok(dot(world.frame.clouds.offset[0] - prevCloud[0], world.frame.clouds.offset[1] - prevCloud[1], wx, wz) > .99);
    assert.ok(dot(world.frame.weather.drift[0] - prevWeather[0], world.frame.weather.drift[1] - prevWeather[1], wx, wz) > .99);
  }
});

test('wind wanders slowly and freezes completely when paused', () => {
  for (const active of [0, 1]) {
    const world = new World({ wind: .45, theme: 'noon' });
    if (active) world.weatherTarget.active = 1;
    world.update(1 / 60, { reducedMotion: true });
    let prev = [...world.frame.sea.windDir];
    let minDot = 1, maxStepAngle = 0;
    for (let i = 0; i < 1800; i++) {
      world.update(1 / 60);
      const cur = world.frame.sea.windDir;
      const stepDot = Math.max(-1, Math.min(1, cur[0] * prev[0] + cur[1] * prev[1]));
      maxStepAngle = Math.max(maxStepAngle, Math.acos(stepDot) * 180 / Math.PI);
      prev = [...cur];
      if (i === 0) continue;
      minDot = Math.min(minDot, cur[0] * Math.sin(active ? world.weather.angle : 2.15) - cur[1] * Math.cos(active ? world.weather.angle : 2.15));
    }
    assert.ok(Math.acos(Math.max(-1, Math.min(1, minDot))) * 180 / Math.PI > 5, 'wind should wander gently over 30s');
    assert.ok(maxStepAngle < .5, 'wind turn per frame must stay gradual');

    const frozen = [...world.frame.sea.windDir], frozenDetail = [...world.frame.sea.detailDrift];
    world.paused = true;
    for (let i = 0; i < 120; i++) world.update(1 / 60);
    assert.deepEqual([...world.frame.sea.windDir], frozen);
    assert.deepEqual([...world.frame.sea.detailDrift], frozenDetail);
  }
});

test('360-degree wind keeps ocean swell energy balanced across orthogonal angles', () => {
  const rmsHeights = [];
  for (const angle of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
    const world = new World({ wind: .6, theme: 'noon' });
    world.weatherTarget.active = 1;
    world.weatherTarget.angle = angle;
    world.update(1 / 60, { reducedMotion: true });
    let sumSq = 0, count = 0;
    for (let t = 0; t < 20; t += 2) {
      world.waveTime = t;
      for (let x = -18; x <= 18; x += 6) for (let z = -36; z <= 0; z += 6) {
        const h = world.waterHeight(x, z);
        sumSq += h * h;
        count++;
      }
    }
    rmsHeights.push(Math.sqrt(sumSq / count));
  }
  const ratio = Math.max(...rmsHeights) / Math.min(...rmsHeights);
  assert.ok(ratio < 1.35, `expected balanced 360-degree swell energy, got ratio ${ratio.toFixed(3)}`);
});

test('weather transitions turn wind smoothly without branch-cut jumps and preserve theme blend vectors', () => {
  const stepAngle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))) * 180 / Math.PI;
  const angles = Array.from({ length: 12 }, (_, i) => (i * 30) * Math.PI / 180);
  angles.push(200 * Math.PI / 180);

  for (const angle of angles) {
    const world = new World({ wind: .45, theme: 'noon' });
    for (let i = 0; i < 120; i++) world.update(1 / 60);

    let prevDir = [...world.frame.sea.windDir];
    let prevDrift = [...world.frame.sea.detailDrift];
    Object.assign(world.weatherTarget, { active: 1, cloud: .6, rain: .4, angle });
    world.wind = .25;

    for (let i = 0; i < 360; i++) {
      world.update(1 / 60);
      const curDir = world.frame.sea.windDir;
      const curDrift = world.frame.sea.detailDrift;
      const deg = stepAngle(prevDir, curDir);
      const dStep = Math.hypot(curDrift[0] - prevDrift[0], curDrift[1] - prevDrift[1]);
      assert.ok(deg < .25, `wind turn jumped ${deg.toFixed(3)} deg/frame while activating angle=${angle}`);
      assert.ok(dStep < .03, `detailDrift jumped ${dStep.toFixed(4)}/frame while activating`);
      prevDir = [...curDir];
      prevDrift = [...curDrift];
    }

    Object.assign(world.weatherTarget, { active: 0, cloud: 0, rain: 0, snow: 0, fog: 0, storm: 0 });
    world.wind = .45;
    for (let i = 0; i < 180; i++) {
      world.update(1 / 60);
      const curDir = world.frame.sea.windDir;
      const curDrift = world.frame.sea.detailDrift;
      const deg = stepAngle(prevDir, curDir);
      const dStep = Math.hypot(curDrift[0] - prevDrift[0], curDrift[1] - prevDrift[1]);
      assert.ok(deg < .25, `wind turn jumped ${deg.toFixed(3)} deg/frame while deactivating`);
      assert.ok(dStep < .03, `detailDrift jumped ${dStep.toFixed(4)}/frame while deactivating`);
      prevDir = [...curDir];
      prevDrift = [...curDrift];
    }
  }

  const world = new World({ theme: 'daybreak' });
  world.setTheme('sunset');
  const shadowBefore = [...world.presetFrom.gradeShadow];
  const highlightBefore = [...world.presetFrom.gradeHighlight];
  world.updateTheme(.6);
  world.updateTheme(.6);
  assert.deepEqual(world.presetFrom.gradeShadow, shadowBefore);
  assert.deepEqual(world.presetFrom.gradeHighlight, highlightBefore);
});
