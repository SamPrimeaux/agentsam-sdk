import test from 'node:test';
import assert from 'node:assert/strict';
import {syncVideoPlayback} from '../dist/video-playback.js';

class FakeVideo {
  constructor(readyState=0){this.readyState=readyState;this.paused=true;this.playCalls=0;this.pauseCalls=0;this.listeners=new Map();}
  play(){this.playCalls++;this.paused=false;return Promise.resolve();}
  pause(){this.pauseCalls++;this.paused=true;}
  addEventListener(name,listener){const set=this.listeners.get(name)??new Set();set.add(listener);this.listeners.set(name,set);}
  removeEventListener(name,listener){this.listeners.get(name)?.delete(listener);}
  emit(name){for(const listener of [...(this.listeners.get(name)??[])]){listener();this.listeners.get(name)?.delete(listener);}}
}

test('playing transport starts a newly mounted video once it can decode frames',()=>{
  const video=new FakeVideo(0);
  const cleanup=syncVideoPlayback(video,true);
  assert.equal(video.playCalls,0);
  video.readyState=3;video.emit('canplay');
  assert.equal(video.playCalls,1);
  cleanup();
});

test('paused transport pauses the preview and never schedules a deferred play',()=>{
  const video=new FakeVideo(3);video.paused=false;
  const cleanup=syncVideoPlayback(video,false);
  assert.equal(video.pauseCalls,1);
  cleanup();
  assert.equal(video.playCalls,0);
});

test('source transition cleanup removes a pending canplay listener',()=>{
  const video=new FakeVideo(0);
  const cleanup=syncVideoPlayback(video,true);
  cleanup();video.readyState=3;video.emit('canplay');
  assert.equal(video.playCalls,0);
});

test('already-playing video is not restarted when timeline state is re-synchronized',()=>{
  const video=new FakeVideo(3);video.paused=false;
  const cleanup=syncVideoPlayback(video,true);
  assert.equal(video.playCalls,0);
  cleanup();
});

test('play rejection is surfaced only while the synchronization effect remains active',async()=>{
  const video=new FakeVideo(3);const errors=[];
  video.play=()=>Promise.reject(new Error('autoplay blocked'));
  const cleanup=syncVideoPlayback(video,true,error=>errors.push(error));
  await Promise.resolve();
  assert.equal(errors.length,1);
  cleanup();
});
