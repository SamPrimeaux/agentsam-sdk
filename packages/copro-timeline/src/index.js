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


export function collectSnapPointsUs(project, {
  excludeClipId,
  includeGrid = true,
  gridUs = 500_000,
  playheadUs,
} = {}) {
  const points = new Set([0]);
  for (const track of project?.tracks ?? []) {
    for (const clip of track.clips ?? []) {
      if (clip.id === excludeClipId) continue;
      points.add(clip.startUs);
      points.add(clip.startUs + clip.durationUs);
    }
  }

  if (Number.isInteger(playheadUs) && playheadUs >= 0) points.add(playheadUs);

  if (includeGrid && Number.isInteger(gridUs) && gridUs > 0) {
    const duration = projectDurationUs(project);
    for (let point = 0; point <= duration + gridUs; point += gridUs) points.add(point);
  }

  return [...points].sort((a, b) => a - b);
}

export function snapTimeUs(timeUs, snapPointsUs, thresholdUs = 120_000) {
  let best = timeUs;
  let bestDistance = thresholdUs + 1;

  for (const point of snapPointsUs ?? []) {
    const distance = Math.abs(point - timeUs);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }

  return bestDistance <= thresholdUs ? best : timeUs;
}
