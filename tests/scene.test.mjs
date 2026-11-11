import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../assets/js/scene/world.js';
import { Corridor } from '../assets/js/scene/corridor.js';
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
