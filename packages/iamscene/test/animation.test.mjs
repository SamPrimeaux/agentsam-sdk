import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnimationTime, sampleAnimation, sampleAnimationTrack } from '../dist/src/index.js';

const track = { id: 'move', targetId: 'node', property: 'position', keyframes: [
  { time: 0, value: [0, 0, 0] },
  { time: 2, value: [2, 4, 6], easing: 'linear' },
] };
const animation = { id: 'loop', name: 'Loop', duration: 2, loop: true, tracks: [track] };

test('samples scalar and vector keyframes deterministically', () => {
  assert.deepEqual(sampleAnimationTrack(track, 1), [1, 2, 3]);
  assert.deepEqual(sampleAnimationTrack(track, -1), [0, 0, 0]);
  assert.deepEqual(sampleAnimationTrack(track, 3), [2, 4, 6]);
});

test('normalizes loop time and samples complete animation tracks', () => {
  assert.equal(normalizeAnimationTime(animation, 2.5), 0.5);
  assert.deepEqual(sampleAnimation(animation, 1), [{ targetId: 'node', property: 'position', value: [1, 2, 3] }]);
});

test('scroll scrubbing can hold the terminal frame of a looping animation', () => {
  assert.deepEqual(sampleAnimation(animation, 2, { wrap: false }), [
    { targetId: 'node', property: 'position', value: [2, 4, 6] },
  ]);
  assert.deepEqual(sampleAnimation(animation, 2.5, { wrap: false }), [
    { targetId: 'node', property: 'position', value: [2, 4, 6] },
  ]);
  assert.deepEqual(sampleAnimation(animation, 2), [
    { targetId: 'node', property: 'position', value: [0, 0, 0] },
  ]);
});

test('supports step interpolation and smooth easing', () => {
  const step = { ...track, interpolation: 'step' };
  assert.deepEqual(sampleAnimationTrack(step, 1), [0, 0, 0]);
  const smooth = { ...track, keyframes: [{ time: 0, value: 0 }, { time: 1, value: 1, easing: 'sineInOut' }] };
  assert.ok(Math.abs(sampleAnimationTrack(smooth, 0.5) - 0.5) < 1e-12);
});
