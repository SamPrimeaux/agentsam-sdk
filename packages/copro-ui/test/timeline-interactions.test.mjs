import test from 'node:test';
import assert from 'node:assert/strict';
import { bindTimelinePointerTransaction } from '../dist/timeline.js';

function pointer(type, pointerId, clientX) {
  const event = new Event(type);
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientX: { value: clientX },
  });
  return event;
}

test('timeline drag previews continuously but commits one edit on pointer release', () => {
  const target = new EventTarget();
  const previews = [];
  const commits = [];
  let reverts = 0;
  bindTimelinePointerTransaction(target, 7, 10, event => event.clientX,
    value => previews.push(value), value => commits.push(value),
    () => { reverts += 1; }, value => value !== 10);

  target.dispatchEvent(pointer('pointermove', 7, 24));
  target.dispatchEvent(pointer('pointermove', 7, 39));
  assert.deepEqual(previews, [24, 39]);
  assert.deepEqual(commits, []);

  target.dispatchEvent(pointer('pointerup', 7, 42));
  assert.deepEqual(previews, [24, 39, 42]);
  assert.deepEqual(commits, [42]);
  assert.equal(reverts, 0);
  target.dispatchEvent(pointer('pointermove', 7, 80));
  assert.deepEqual(commits, [42]);
});

test('timeline pointer cancellation restores the original geometry without committing', () => {
  const target = new EventTarget();
  const previews = [];
  const commits = [];
  let reverts = 0;
  bindTimelinePointerTransaction(target, 3, 100, event => event.clientX,
    value => previews.push(value), value => commits.push(value),
    () => { reverts += 1; }, value => value !== 100);

  target.dispatchEvent(pointer('pointermove', 3, 155));
  target.dispatchEvent(pointer('pointercancel', 3, 155));
  assert.deepEqual(previews, [155]);
  assert.deepEqual(commits, []);
  assert.equal(reverts, 1);
});

test('timeline pointer edits ignore other pointers and avoid no-op undo entries', () => {
  const target = new EventTarget();
  const commits = [];
  let reverts = 0;
  bindTimelinePointerTransaction(target, 9, 25, event => event.clientX,
    () => {}, value => commits.push(value),
    () => { reverts += 1; }, value => value !== 25);

  target.dispatchEvent(pointer('pointermove', 2, 80));
  target.dispatchEvent(pointer('pointerup', 2, 80));
  target.dispatchEvent(pointer('pointerup', 9, 25));
  assert.deepEqual(commits, []);
  assert.equal(reverts, 1);
});
