import test from "node:test";
import assert from "node:assert/strict";
import { createCoProProject, createTrack, createClip } from "../../copro-project/src/index.js";
import { applyCoProCommand, CoProEditorSession } from "../src/index.js";

function fixture() {
  const project = createCoProProject({ id: "project:1", now: "2026-10-04T00:00:00.000Z" });
  const track = createTrack({ id: "track:1" });
  track.clips.push(createClip({
    id: "clip:1",
    assetId: "asset:1",
    startUs: 0,
    durationUs: 10_000_000,
  }));
  project.tracks.push(track);
  return project;
}

test("split requires caller-provided deterministic right clip id", () => {
  assert.throws(() => applyCoProCommand(fixture(), {
    type: "clip.split",
    payload: { clipId: "clip:1", atUs: 4_000_000 },
  }), /copro_split_right_clip_id_required/);

  const next = applyCoProCommand(fixture(), {
    type: "clip.split",
    payload: { clipId: "clip:1", atUs: 4_000_000, rightClipId: "clip:2" },
  });

  assert.deepEqual(next.tracks[0].clips.map((clip) => ({
    id: clip.id,
    startUs: clip.startUs,
    inUs: clip.inUs,
    durationUs: clip.durationUs,
  })), [
    { id: "clip:1", startUs: 0, inUs: 0, durationUs: 4_000_000 },
    { id: "clip:2", startUs: 4_000_000, inUs: 4_000_000, durationUs: 6_000_000 },
  ]);
});

test("commands do not mutate the input project", () => {
  const original = fixture();
  const next = applyCoProCommand(original, {
    type: "clip.move",
    payload: { clipId: "clip:1", startUs: 2_000_000 },
  });
  assert.equal(original.tracks[0].clips[0].startUs, 0);
  assert.equal(next.tracks[0].clips[0].startUs, 2_000_000);
});

test("session supports deterministic undo and redo", () => {
  const session = new CoProEditorSession(fixture());
  session.execute({
    type: "clip.move",
    payload: { clipId: "clip:1", startUs: 2_000_000 },
  });
  assert.equal(session.project.tracks[0].clips[0].startUs, 2_000_000);
  session.undo();
  assert.equal(session.project.tracks[0].clips[0].startUs, 0);
  session.redo();
  assert.equal(session.project.tracks[0].clips[0].startUs, 2_000_000);
});


test("speed, volume and track state are canonical commands", () => {
  let project = fixture();
  project = applyCoProCommand(project, {
    type: "clip.set_speed",
    payload: { clipId: "clip:1", playbackRate: 1.5 },
  });
  project = applyCoProCommand(project, {
    type: "clip.set_volume",
    payload: { clipId: "clip:1", volume: 0.65 },
  });
  project = applyCoProCommand(project, {
    type: "track.set_state",
    payload: { trackId: "track:1", muted: true, locked: true },
  });

  assert.equal(project.tracks[0].clips[0].playbackRate, 1.5);
  assert.equal(project.tracks[0].clips[0].volume, 0.65);
  assert.equal(project.tracks[0].muted, true);
  assert.equal(project.tracks[0].locked, true);
});
