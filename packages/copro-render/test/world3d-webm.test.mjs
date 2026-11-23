import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCoProProject,createTrack,createClip} from '../../copro-project/src/index.js';
import {createWorld3DRenderer} from '../src/world3d.js';

const vp8Keyframe=Uint8Array.from(Buffer.from('8AIAnQEqEAAQAABHCIWFiIWEiAICAnWqA/gD+gINTRgA/v1u8//jmTcwxP+Obf/xYTwOKMj/8VEA','base64'));

function installGlobal(name,value) {
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,name);
  Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
  return ()=>descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name];
}

test('CoPro WebCodecs export muxes encoded VP8 frames into a WebM with Mediabunny',async t=>{
  const restores=[];
  t.after(()=>{for(const restore of restores.reverse())restore();});
  class FakeEncodedVideoChunk {
    constructor({type,timestamp,duration,data}) { this.type=type;this.timestamp=timestamp;this.duration=duration;this.byteLength=data.byteLength;this.bytes=data; }
    copyTo(destination) { destination.set(this.bytes); }
  }
  class FakeVideoFrame {
    constructor(_source,{timestamp,duration}) { this.timestamp=timestamp;this.duration=duration; }
    close() {}
  }
  class FakeVideoEncoder {
    constructor({output,error}) { this.onOutput=output;this.onError=error;this.encodeQueueSize=0; }
    static async isConfigSupported({codec}) { return {supported:codec==='vp8'}; }
    configure(config) { this.config=config; }
    encode(frame) {
      this.onOutput(new FakeEncodedVideoChunk({type:'key',timestamp:frame.timestamp,duration:frame.duration,data:vp8Keyframe}),{decoderConfig:{codec:'vp8',codedWidth:16,codedHeight:16}});
    }
    async flush() {}
    close() {}
  }
  const outputCanvas={width:16,height:16,getContext:()=>({drawImage(){}})};
  restores.push(installGlobal('EncodedVideoChunk',FakeEncodedVideoChunk));
  restores.push(installGlobal('VideoFrame',FakeVideoFrame));
  restores.push(installGlobal('VideoEncoder',FakeVideoEncoder));
  restores.push(installGlobal('MediaRecorder',class FakeMediaRecorder {}));
  restores.push(installGlobal('document',{createElement:()=>outputCanvas}));

  const project=createCoProProject({id:'world3d-webm'});
  const track=createTrack({id:'scene',kind:'overlay'});
  track.clips.push(createClip({id:'scene-clip',assetId:'scene.glb',startUs:0,durationUs:100_000}));
  project.tracks.push(track);
  const canvas={width:16,height:16,captureStream(){return {};}};
  const renderer=createWorld3DRenderer({canvas,applyFrame(){}});
  const result=await renderer.record(project,{frameRate:30});

  assert.equal(result.renderBackend,'webcodecs');
  assert.equal(result.frameCount,3);
  assert.match(result.mimeType,/^video\/webm/);
  assert.ok(result.blob.size>0);
});
