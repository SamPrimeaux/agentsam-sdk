import { Muxer, ArrayBufferTarget } from 'webm-muxer';
/**
 * Browser-safe CoPro world compositor. One CoPro project owns time, layers, clip
 * transforms and source animations. The host GPU runtime supplies frame
 * application and the canvas. No Three.js dependency or duplicate reducer.
 */
export const COPRO_WORLD3D_FRAME_SCHEMA = 'copro.world3d-frame.v1';

const finite = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const interpolate = (a,b,amount) => a + (b-a) * amount;

export function interpolateWorld3DKeyframes(keyframes, timeUs) {
  if (!Array.isArray(keyframes) || !keyframes.length) return {};
  const frames = [...keyframes].sort((a,b)=>a.timeUs-b.timeUs);
  if (timeUs <= frames[0].timeUs) return { ...frames[0] };
  if (timeUs >= frames[frames.length - 1].timeUs) return { ...frames[frames.length - 1] };
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].timeUs < timeUs) continue;
    const left = frames[i - 1]; const right = frames[i];
    const p = (timeUs - left.timeUs) / (right.timeUs - left.timeUs || 1);
    const result = { timeUs };
    for (const key of ['x','y','z','rotationYDeg','scale','opacity']) {
      if (Number.isFinite(left[key]) && Number.isFinite(right[key])) result[key] = interpolate(left[key],right[key],p);
      else result[key] = Number.isFinite(left[key]) ? left[key] : right[key];
    }
    return result;
  }
  return { ...frames[frames.length - 1] };
}

/** Pure deterministic timeline evaluation at any timestamp; can drive GPU or offline backends. */
export function evaluateWorld3DFrame(project, timeUs) {
  if (project?.schema !== 'copro.project.v1') throw new Error('copro_world3d_project_invalid');
  if (!Number.isSafeInteger(timeUs) || timeUs < 0) throw new Error('copro_world3d_time_invalid');
  const objects = [];
  const media = [];
  const scenes = [];
  for (const [trackIndex, track] of project.tracks.entries()) {
    if (track.visible === false || track.muted) continue;
    for (const clip of track.clips) {
      if (clip.muted || timeUs < clip.startUs || timeUs >= clip.startUs + clip.durationUs) continue;
      const sourceTimeUs = Math.max(0, clip.inUs + Math.round((timeUs - clip.startUs) * (clip.playbackRate || 1)));
      const meta = clip.metadata || {};
      if (meta.sourceKind === 'samscene-storyboard') {
        scenes.push({clipId:clip.id,trackIndex,beat:meta.samsceneBeat,sourceTimeUs});
        continue;
      }
      if (meta.sourceKind !== 'samscene-timeline-cue') continue;
      const cue = meta.sceneCue;
      if (!cue?.kind) continue;
      const keyframes = meta.world3d?.keyframes;
      const tween = interpolateWorld3DKeyframes(keyframes, sourceTimeUs);
      const transform = {...(meta.transform || {}),...(meta.world3d?.transform || {}),...tween};
      const item = {clipId:clip.id,assetId:clip.assetId,trackId:track.id,trackIndex,
        sourceTimeUs,sourceSeconds:sourceTimeUs/1_000_000,volume:clip.volume,
        animationIndex:meta.world3d?.animationIndex ?? cue.animationIndex,animationName:cue.animationName,
        objectId:cue.objectId,kind:cue.kind,transform,visible:meta.world3d?.visible !== false};
      if (cue.kind === 'scene-object') objects.push(item);
      else media.push(item);
    }
  }
  return {schema:COPRO_WORLD3D_FRAME_SCHEMA,projectId:project.id,timeUs,
    objects,media,scenes,
    durationUs:Math.max(0,...project.tracks.flatMap(t=>t.clips.map(c=>c.startUs+c.durationUs)))};
}

/** Runtime owns the GPU, CoPro owns composition/evaluation/export clock. */
async function encodeWorld3DWebM(project, {canvas,applyFrame,onFrame,frameRate,signal,onProgress}) {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined')
    throw new Error('copro_world3d_webcodecs_unavailable');
  const width=canvas.width, height=canvas.height;
  const supportedCodec=await Promise.all([
    ['vp8','V_VP8'],['vp09.00.10.08','V_VP9']
  ].map(async ([codec,webmCodec])=>({codec,webmCodec,supported:(await VideoEncoder.isConfigSupported({codec,width,height,bitrate:2_000_000,framerate:frameRate})).supported})));
  const choice=supportedCodec.find(item=>item.supported);
  if(!choice) throw new Error('copro_world3d_webcodecs_codec_unavailable');
  const outputCanvas=document.createElement('canvas');outputCanvas.width=width;outputCanvas.height=height;
  const ctx=outputCanvas.getContext('2d',{alpha:false});
  if(!ctx)throw new Error('copro_world3d_capture_context_unavailable');
  const target=new ArrayBufferTarget();
  const muxer=new Muxer({target,video:{codec:choice.webmCodec,width,height,frameRate}});
  let encodingError=null;
  const encoder=new VideoEncoder({
    output:(chunk,metadata)=>{try{muxer.addVideoChunk(chunk,metadata);}catch(e){encodingError=e;}},
    error:e=>{encodingError=e;},
  });
  encoder.configure({codec:choice.codec,width,height,bitrate:2_000_000,framerate:frameRate,latencyMode:'quality'});
  const durationUs=Math.max(0,...project.tracks.flatMap(t=>t.clips.map(c=>c.startUs+c.durationUs)));
  const frames=Math.max(2,Math.ceil(durationUs/1_000_000*frameRate));
  try {
    for(let index=0;index<frames;index++) {
      if(signal?.aborted)throw new Error('copro_world3d_recording_cancelled');
      if(encodingError)throw encodingError;
      const timeUs=Math.min(durationUs-1,Math.round(index*1_000_000/frameRate));
      const frame=evaluateWorld3DFrame(project,timeUs);
      await applyFrame(frame);await onFrame?.(frame);
      ctx.drawImage(canvas,0,0,width,height);
      // Encoded timestamps come from the CoPro timeline—not GPU frame delivery.
      const source=new VideoFrame(outputCanvas,{timestamp:Math.round(index*1_000_000/frameRate),duration:Math.round(1_000_000/frameRate)});
      try{encoder.encode(source,{keyFrame:index%Math.round(frameRate*2)===0});}finally{source.close();}
      if(encoder.encodeQueueSize>6)await encoder.flush();
      onProgress?.((index+1)/frames);
    }
    await encoder.flush();
    if(encodingError)throw encodingError;
    muxer.finalize();
    const blob=new Blob([target.buffer],{type:'video/webm'});
    if(!blob.size)throw new Error('copro_world3d_empty_export');
    return {blob,mimeType:'video/webm',width,height,frameRate,durationUs,frameCount:frames,renderBackend:'webcodecs'};
  } finally {encoder.close();}
}

export function createWorld3DRenderer({applyFrame, canvas, onFrame, mediaRecorderFactory} = {}) {
  if (typeof applyFrame !== 'function') throw new Error('copro_world3d_apply_frame_required');
  return {
    async renderFrame(project,timeUs) {
      const frame=evaluateWorld3DFrame(project,timeUs);
      await applyFrame(frame);
      await onFrame?.(frame);
      return frame;
    },
    async captureFrame(project,timeUs,format='image/png') {
      if (!canvas || typeof canvas.toBlob !== 'function') throw new Error('copro_world3d_capture_unsupported');
      const frame=evaluateWorld3DFrame(project,timeUs);
      await applyFrame(frame); await onFrame?.(frame);
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error('copro_world3d_snapshot_failed')),format));
      return {frame,blob};
    },
    /** Real-time browser WebM from the composed scene canvas, not a timeline JSON export. */
    async record(project,{frameRate=30,mimeType, onProgress,signal}={}) {
      if (!canvas || typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined')
        throw new Error('copro_world3d_recording_unsupported');
      if (signal?.aborted) throw new Error('copro_world3d_recording_cancelled');
      const durationUs=Math.max(0,...project.tracks.flatMap(t=>t.clips.map(c=>c.startUs+c.durationUs)));
      if (!durationUs) throw new Error('copro_world3d_empty_timeline');
      if(typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined') {
        return encodeWorld3DWebM(project,{canvas,applyFrame,onFrame,frameRate,signal,onProgress});
      }
      const type=mimeType || ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']
        .find(t=>MediaRecorder.isTypeSupported(t));
      if (!type) throw new Error('copro_world3d_webm_unavailable');
      // WebGL/WebGPU swapchain canvases may only deliver one frame to
      // captureStream even while rendering. Copy every composed GPU frame to a
      // 2D capture surface, which reliably publishes manual video frames.
      const captureCanvas=document.createElement('canvas');
      captureCanvas.width=canvas.width;
      captureCanvas.height=canvas.height;
      const context=captureCanvas.getContext('2d',{alpha:false});
      if (!context) throw new Error('copro_world3d_capture_context_unavailable');
      const stream=captureCanvas.captureStream(0);
      const videoTrack=stream.getVideoTracks()[0];
      if (!videoTrack || typeof videoTrack.requestFrame !== 'function') throw new Error('copro_world3d_manual_frame_capture_unavailable');
      const recorder=mediaRecorderFactory?.(stream,{mimeType:type}) || new MediaRecorder(stream,{mimeType:type});
      const chunks=[];
      const done=new Promise((resolve,reject)=>{
        recorder.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data);};
        recorder.onerror=event=>reject(event.error || new Error('copro_world3d_record_failed'));
        recorder.onstop=()=>resolve(new Blob(chunks,{type}));
      });
      const totalFrames=Math.max(2,Math.ceil((durationUs/1_000_000)*frameRate));
      const nominalFrameMs=1000/frameRate;
      try {
        recorder.start();
        for(let frameIndex=0;frameIndex<totalFrames;frameIndex++) {
          if (signal?.aborted) throw new Error('copro_world3d_recording_cancelled');
          // Absolute CoPro timestamps, independent of CPU/GPU scheduling delays.
          const timeUs=Math.min(durationUs-1,Math.round(frameIndex*1_000_000/frameRate));
          const frame=evaluateWorld3DFrame(project,timeUs);
          await applyFrame(frame); await onFrame?.(frame);
          context.drawImage(canvas,0,0,captureCanvas.width,captureCanvas.height);
          videoTrack.requestFrame();
          onProgress?.((frameIndex+1)/totalFrames);
          // Let MediaRecorder encode each distinct frame before the next raster.
          if(frameIndex<totalFrames-1) await new Promise(resolve=>setTimeout(resolve,nominalFrameMs));
        }
        // Flush final encoded frames before closing the recorder.
        await new Promise(resolve=>setTimeout(resolve,120));
        recorder.requestData();
        recorder.stop();
        const blob=await done;
        if(blob.size===0) throw new Error('copro_world3d_empty_export');
        return {blob,mimeType:type,width:canvas.width,height:canvas.height,frameRate,durationUs};
      } finally { if(recorder.state==='recording')recorder.stop();stream.getTracks().forEach(t=>t.stop()); }
    },
  };
}
