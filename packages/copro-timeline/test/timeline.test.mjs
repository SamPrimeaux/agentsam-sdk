import test from "node:test";
import assert from "node:assert/strict";
import { createCoProProject, createTrack, createClip } from "../../copro-project/src/index.js";
import {
  projectDurationUs,
  sortedTimelineClips,
  timeUsToPixels,
  pixelsToTimeUs,
  clampPlayheadUs,
} from "../src/index.js";

function fixture() {
  const project = createCoProProject({ id: "project:timeline" });
  const video = createTrack({ id: "track:video", kind: "video" });
  video.clips.push(
    createClip({ id: "clip:b", assetId: "asset:b", startUs: 4_000_000, durationUs: 2_000_000 }),
    createClip({ id: "clip:a", assetId: "asset:a", startUs: 0, durationUs: 3_000_000 }),
  );
  project.tracks.push(video);
  return project;
}

test("timeline duration and clip ordering are deterministic", () => {
  const project = fixture();
  assert.equal(projectDurationUs(project), 6_000_000);
  assert.deepEqual(sortedTimelineClips(project).map((row) => row.clip.id), ["clip:a", "clip:b"]);
});

test("timeline projection uses the canonical microsecond timebase", () => {
  assert.equal(timeUsToPixels(2_000_000, { pixelsPerSecond: 120 }), 240);
  assert.equal(pixelsToTimeUs(240, { pixelsPerSecond: 120 }), 2_000_000);
});

test("playhead clamps to project duration", () => {
  const project = fixture();
  assert.equal(clampPlayheadUs(project, -1), 0);
  assert.equal(clampPlayheadUs(project, 9_000_000), 6_000_000);
});


test("snap helper prefers nearby clip edges and leaves distant times alone", async () => {
  const { collectSnapPointsUs, snapTimeUs } = await import("../src/index.js");
  const project = fixture();
  const points = collectSnapPointsUs(project, {
    excludeClipId: "clip:b",
    includeGrid: false,
    playheadUs: 3_500_000,
  });
  assert.equal(snapTimeUs(3_060_000, points, 100_000), 3_000_000);
  assert.equal(snapTimeUs(3_220_000, points, 100_000), 3_220_000);
});
