export function projectDurationUs(project) {
  let endUs = 0;
  for (const track of project?.tracks ?? []) {
    for (const clip of track.clips ?? []) {
      endUs = Math.max(endUs, clip.startUs + clip.durationUs);
    }
  }
  return endUs;
}

export function sortedTimelineClips(project) {
  const rows = [];
  for (const [trackIndex, track] of (project?.tracks ?? []).entries()) {
    for (const clip of track.clips ?? []) {
      rows.push({
        trackId: track.id,
        trackKind: track.kind,
        trackIndex,
        clip,
      });
    }
  }

  return rows.sort((a, b) =>
    a.clip.startUs - b.clip.startUs ||
    (a.clip.layer ?? 0) - (b.clip.layer ?? 0) ||
    a.trackIndex - b.trackIndex ||
    String(a.clip.id).localeCompare(String(b.clip.id))
  );
}

export function timeUsToPixels(timeUs, { pixelsPerSecond = 100 } = {}) {
  if (!Number.isFinite(timeUs) || timeUs < 0) throw new Error("copro_timeline_time_invalid");
  if (!(pixelsPerSecond > 0)) throw new Error("copro_timeline_scale_invalid");
  return (timeUs / 1_000_000) * pixelsPerSecond;
}

export function pixelsToTimeUs(pixels, { pixelsPerSecond = 100 } = {}) {
  if (!Number.isFinite(pixels) || pixels < 0) throw new Error("copro_timeline_pixels_invalid");
  if (!(pixelsPerSecond > 0)) throw new Error("copro_timeline_scale_invalid");
  return Math.round((pixels / pixelsPerSecond) * 1_000_000);
}

export function clampPlayheadUs(project, timeUs) {
  const durationUs = projectDurationUs(project);
  return Math.max(0, Math.min(Math.round(timeUs), durationUs));
}
