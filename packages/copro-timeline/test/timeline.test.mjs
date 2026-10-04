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
