import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COPRO_MEDIA_DRAG_TYPE,
  isCoProMediaDragForTrack,
  readCoProMediaDragId,
  writeCoProMediaDragData,
} from '../dist/media-dnd.js';

class FakeDataTransfer {
  data = new Map();
  types = [];
  effectAllowed = 'uninitialized';
  setData(type, value) {
    if (!this.data.has(type)) this.types.push(type);
    this.data.set(type, value);
  }
  getData(type) { return this.data.get(type) ?? ''; }
}

test('media drag payload carries the source identity and compatible timeline track kind', () => {
  const transfer = new FakeDataTransfer();
  writeCoProMediaDragData(transfer, 'media:hero', 'hero.glb', 'scene');
  assert.equal(transfer.effectAllowed, 'copy');
  assert.equal(readCoProMediaDragId(transfer), 'media:hero');
  assert.equal(transfer.getData('text/plain'), 'hero.glb');
  assert.equal(isCoProMediaDragForTrack(transfer, 'video'), true);
  assert.equal(isCoProMediaDragForTrack(transfer, 'audio'), false);
  assert.equal(transfer.types.includes(COPRO_MEDIA_DRAG_TYPE), true);
});

test('media drag payload routes audio and still images to their matching tracks', () => {
  const audio = new FakeDataTransfer();
  writeCoProMediaDragData(audio, 'media:music', 'music.wav', 'audio');
  assert.equal(isCoProMediaDragForTrack(audio, 'audio'), true);

  const image = new FakeDataTransfer();
  writeCoProMediaDragData(image, 'media:still', 'still.png', 'image');
  assert.equal(isCoProMediaDragForTrack(image, 'overlay'), true);
});
