export const COPRO_PROJECT_SCHEMA = "copro.project.v1";
export const COPRO_TIMEBASE = Object.freeze({
  unit: "microsecond",
  ticksPerSecond: 1_000_000,
});

function clone(value) {
  return structuredClone(value);
}

function nowIso(now) {
  return (now instanceof Date ? now : new Date(now ?? Date.now())).toISOString();
}

export function createCoProProject({
  id,
  title = "Untitled project",
  width = 1920,
  height = 1080,
  frameRate = 30,
  now,
} = {}) {
  if (!id) throw new Error("copro_project_id_required");
  if (!Number.isInteger(width) || width <= 0) throw new Error("copro_canvas_width_invalid");
  if (!Number.isInteger(height) || height <= 0) throw new Error("copro_canvas_height_invalid");
  if (!(Number(frameRate) > 0)) throw new Error("copro_frame_rate_invalid");

  const createdAt = nowIso(now);
  return {
    schema: COPRO_PROJECT_SCHEMA,
    id: String(id),
    title: String(title),
    createdAt,
    updatedAt: createdAt,
    timebase: { ...COPRO_TIMEBASE },
    canvas: { width, height, frameRate: Number(frameRate) },
    tracks: [],
    metadata: {},
  };
}

export function createTrack({ id, kind = "video", name } = {}) {
  if (!id) throw new Error("copro_track_id_required");
  if (!["video", "audio", "overlay", "captions"].includes(kind)) {
    throw new Error("copro_track_kind_invalid");
  }
  return {
    id: String(id),
    kind,
    ...(name ? { name: String(name) } : {}),
    visible: true,
    muted: false,
    locked: false,
    clips: [],
  };
}

export function createClip({
  id,
  assetId,
  startUs,
  durationUs,
  inUs = 0,
  layer = 0,
  muted = false,
  metadata = {},
  playbackRate = 1,
  volume = 1,
} = {}) {
  if (!id) throw new Error("copro_clip_id_required");
  if (!assetId) throw new Error("copro_clip_asset_id_required");
  for (const [key, value] of Object.entries({ startUs, durationUs, inUs })) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error("copro_clip_" + key + "_invalid");
    }
  }
  if (durationUs <= 0) throw new Error("copro_clip_duration_required");
  if (!(Number(playbackRate) > 0)) throw new Error("copro_clip_playback_rate_invalid");
  if (!(Number(volume) >= 0)) throw new Error("copro_clip_volume_invalid");
  return {
    id: String(id),
    assetId: String(assetId),
    startUs,
    durationUs,
    inUs,
    layer,
    muted: Boolean(muted),
    playbackRate: Number(playbackRate),
    volume: Number(volume),
    metadata: clone(metadata),
  };
}

function forbiddenProjectFields(project) {
  const forbidden = [];
  if ("renderer" in project) forbidden.push("$.renderer");

  function walk(value, path = "$") {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, path + "[" + index + "]"));
      return;
    }
    for (const [key, entry] of Object.entries(value)) {
      const next = path + "." + key;
      if (["r2", "bucket", "streamUid", "cloudflareAccountId", "renderer"].includes(key)) {
        forbidden.push(next);
      }
      walk(entry, next);
    }
  }

  walk(project.tracks);
  return forbidden;
}

export function validateCoProProject(project) {
  const errors = [];
  if (!project || project.schema !== COPRO_PROJECT_SCHEMA) errors.push("schema");
  if (!project?.id) errors.push("id");
  if (project?.timebase?.unit !== "microsecond") errors.push("timebase.unit");
  if (project?.timebase?.ticksPerSecond !== 1_000_000) errors.push("timebase.ticksPerSecond");
  if (!Array.isArray(project?.tracks)) errors.push("tracks");

  for (const [trackIndex, track] of (project?.tracks ?? []).entries()) {
    if (!track?.id) errors.push("tracks[" + trackIndex + "].id");
    if (!Array.isArray(track?.clips)) errors.push("tracks[" + trackIndex + "].clips");
    for (const [clipIndex, clip] of (track?.clips ?? []).entries()) {
      const base = "tracks[" + trackIndex + "].clips[" + clipIndex + "]";
      if (!clip?.id) errors.push(base + ".id");
      if (!clip?.assetId) errors.push(base + ".assetId");
      if (!Number.isInteger(clip?.startUs) || clip.startUs < 0) errors.push(base + ".startUs");
      if (!Number.isInteger(clip?.durationUs) || clip.durationUs <= 0) errors.push(base + ".durationUs");
      if (!Number.isInteger(clip?.inUs) || clip.inUs < 0) errors.push(base + ".inUs");
    }
  }

  for (const field of forbiddenProjectFields(project ?? {})) errors.push("forbidden:" + field);
  return { ok: errors.length === 0, errors };
}

export function serializeCoProProject(project) {
  const result = validateCoProProject(project);
  if (!result.ok) {
    const error = new Error("copro_project_invalid");
    error.details = result.errors;
    throw error;
  }
  return JSON.stringify(project);
}

export function parseCoProProject(serialized) {
  const project = typeof serialized === "string" ? JSON.parse(serialized) : clone(serialized);
  const result = validateCoProProject(project);
  if (!result.ok) {
    const error = new Error("copro_project_invalid");
    error.details = result.errors;
    throw error;
  }
  return project;
}

export function cloneCoProProject(project) {
  return parseCoProProject(project);
}
