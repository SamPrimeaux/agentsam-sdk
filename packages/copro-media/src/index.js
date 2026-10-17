export const COPRO_MEDIA_ASSET_SCHEMA = "copro.media.asset.v1";

function clone(value) {
  return structuredClone(value);
}

export function createMediaAsset({
  id,
  kind,
  name,
  mimeType,
  durationUs,
  width,
  height,
  provenance = {},
  sources = [],
  metadata = {},
} = {}) {
  if (!id) throw new Error("copro_media_asset_id_required");
  if (!["video", "audio", "image", "caption", "document", "generated"].includes(kind)) {
    throw new Error("copro_media_asset_kind_invalid");
  }
  if (!name) throw new Error("copro_media_asset_name_required");

  return {
    schema: COPRO_MEDIA_ASSET_SCHEMA,
    id: String(id),
    kind,
    name: String(name),
    mimeType: mimeType ? String(mimeType) : undefined,
    durationUs: durationUs ?? undefined,
    width: width ?? undefined,
    height: height ?? undefined,
    provenance: clone(provenance),
    sources: clone(sources),
    metadata: clone(metadata),
  };
}

export function addMediaSource(asset, source) {
  if (!source?.provider || !source?.locator) throw new Error("copro_media_source_invalid");
  const next = clone(asset);
  next.sources.push({
    provider: String(source.provider),
    locator: clone(source.locator),
    status: source.status ?? "available",
    observedAt: source.observedAt ?? null,
  });
  return next;
}

export class MemoryMediaRepository {
  #assets = new Map();

  put(asset) {
    if (asset?.schema !== COPRO_MEDIA_ASSET_SCHEMA) throw new Error("copro_media_asset_invalid");
    this.#assets.set(asset.id, clone(asset));
    return clone(asset);
  }

  get(id) {
    const asset = this.#assets.get(id);
    return asset ? clone(asset) : null;
  }

  list() {
    return [...this.#assets.values()].map(clone);
  }

  delete(id) {
    return this.#assets.delete(id);
  }
}


export function computeWaveformEnvelope(channelData, sampleCount = 96) {
  if (!channelData || typeof channelData.length !== "number" || channelData.length === 0) {
    return [];
  }
  const count = Math.max(8, Math.min(512, Math.round(sampleCount)));
  const blockSize = Math.max(1, Math.floor(channelData.length / count));
  const envelope = [];

  for (let index = 0; index < count; index += 1) {
    const start = index * blockSize;
    const end = index === count - 1 ? channelData.length : Math.min(channelData.length, start + blockSize);
    let peak = 0;
    for (let cursor = start; cursor < end; cursor += 1) {
      peak = Math.max(peak, Math.abs(channelData[cursor] ?? 0));
    }
    envelope.push(Number(peak.toFixed(4)));
  }

  const max = Math.max(...envelope, 0);
  if (max <= 0) return envelope;
  return envelope.map((value) => Number((value / max).toFixed(4)));
}

export async function extractBrowserAudioWaveform(blob, sampleCount = 96) {
  const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextCtor) {
    return { ok: false, reason: "audio_context_unavailable", samples: [] };
  }

  const context = new AudioContextCtor();
  try {
    const buffer = await blob.arrayBuffer();
    const decoded = await context.decodeAudioData(buffer.slice(0));
    const channel = decoded.getChannelData(0);
    return {
      ok: true,
      durationUs: Math.round(decoded.duration * 1_000_000),
      samples: computeWaveformEnvelope(channel, sampleCount),
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "audio_decode_failed",
      samples: [],
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

/**
 * Create real visual preview derivatives by seeking imported browser-playable video.
 * These images are optional cache data; original bytes remain the authoritative file.
 * Decode failures are returned as reasons rather than invented screenshot thumbnails.
 */
export async function createBrowserVideoThumbnails(url, {count=8, width=176, height=100} = {}) {
  if (typeof document === 'undefined') return {ok:false,reason:'browser_unavailable',frames:[]};
  const video=document.createElement('video');
  video.muted=true; video.playsInline=true; video.preload='auto';
  const wait=(event, timeout=6500)=>new Promise((resolve,reject)=>{
    let done=false;
    const clean=()=>{if(done)return;done=true;clearTimeout(timer);video.removeEventListener(event,success);video.removeEventListener('error',failed)};
    const success=()=>{clean();resolve(undefined)};
    const failed=()=>{clean();reject(new Error('media_decode_failed'))};
    const timer=setTimeout(()=>{clean();reject(new Error('media_seek_timeout'))},timeout);
    video.addEventListener(event,success,{once:true});video.addEventListener('error',failed,{once:true});
  });
  try {
    const loaded=wait('loadedmetadata');
    video.src=url;
    video.load();
    await loaded;
    if(!video.videoWidth||!video.videoHeight)return {ok:false,reason:'unsupported_video_codec',frames:[]};
    const canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');
    if(!ctx)return {ok:false,reason:'canvas_unavailable',frames:[]};
    const duration=Number.isFinite(video.duration)?video.duration:0;
    const samples=Math.max(1,Math.min(12,Math.round(count)));
    const frames=[];
    for(let i=0;i<samples;i++) {
      const seek=wait('seeked',4500);
      video.currentTime=Math.max(0,Math.min(duration-.01, (i+.5)*duration/samples));
      await seek;
      ctx.fillStyle='#17191b';ctx.fillRect(0,0,width,height);
      const naturalRatio=video.videoWidth/video.videoHeight;
      const targetRatio=width/height;
      const drawWidth=naturalRatio>targetRatio?height*naturalRatio:width;
      const drawHeight=naturalRatio>targetRatio?height:width/naturalRatio;
      ctx.drawImage(video,(width-drawWidth)/2,(height-drawHeight)/2,drawWidth,drawHeight);
      frames.push(canvas.toDataURL('image/jpeg',.7));
    }
    return {ok:true,frames};
  }catch(error) {return {ok:false,reason:error instanceof Error?error.message:'thumbnail_failed',frames:[]};}
  finally {video.pause();video.removeAttribute('src');video.load();}
}
