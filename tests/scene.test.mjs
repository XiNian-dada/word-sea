import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../assets/js/scene/world.js';

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
