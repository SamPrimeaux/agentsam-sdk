import test from "node:test";
import assert from "node:assert/strict";
import {
  COPRO_PROJECT_SCHEMA,
  createCoProProject,
  createTrack,
  createClip,
  serializeCoProProject,
  parseCoProProject,
  validateCoProProject,
} from "../src/index.js";

test("creates a provider-neutral project with one canonical timebase", () => {
  const project = createCoProProject({
    id: "project:1",
    now: "2026-10-04T00:00:00.000Z",
  });
  assert.equal(project.schema, COPRO_PROJECT_SCHEMA);
  assert.equal(project.timebase.unit, "microsecond");
  assert.equal(project.renderer, undefined);
});

test("clips reference assets, not storage providers", () => {
  const clip = createClip({
    id: "clip:1",
    assetId: "asset:1",
    startUs: 0,
    durationUs: 5_000_000,
  });
  assert.equal(clip.assetId, "asset:1");
  assert.equal(clip.r2, undefined);
});

test("serialization rejects renderer and R2 leakage", () => {
  const project = createCoProProject({ id: "project:1" });
  project.renderer = "remotion";
  assert.equal(validateCoProProject(project).ok, false);

  delete project.renderer;
  const track = createTrack({ id: "track:1" });
  track.clips.push({
    ...createClip({
      id: "clip:1",
      assetId: "asset:1",
      startUs: 0,
      durationUs: 1_000_000,
    }),
    r2: { bucket: "bad", key: "bad" },
  });
  project.tracks.push(track);
  assert.throws(() => serializeCoProProject(project), /copro_project_invalid/);
});

test("valid project round-trips deterministically", () => {
  const project = createCoProProject({
    id: "project:1",
    now: "2026-10-04T00:00:00.000Z",
  });
  const track = createTrack({ id: "track:video", kind: "video" });
  track.clips.push(createClip({
    id: "clip:1",
    assetId: "asset:1",
    startUs: 0,
    durationUs: 2_000_000,
  }));
  project.tracks.push(track);
  assert.deepEqual(parseCoProProject(serializeCoProProject(project)), project);
});
