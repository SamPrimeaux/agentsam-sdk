import { createCoProProject, createTrack, createClip } from "@inneranimalmedia/copro-project";
import { CoProEditorSession } from "@inneranimalmedia/copro-editor";
import { createMediaAsset, MemoryMediaRepository } from "@inneranimalmedia/copro-media";
import { createRenderPlan, selectRenderBackend } from "@inneranimalmedia/copro-render";
import { projectDurationUs } from "@inneranimalmedia/copro-timeline";

export function runCoProVerticalProof() {
  const media = new MemoryMediaRepository();
  media.put(createMediaAsset({
    id: "asset:source",
    kind: "video",
    name: "Source clip",
    durationUs: 12_000_000,
  }));

  const project = createCoProProject({
    id: "project:proof",
    title: "CoPro vertical proof",
    now: "2026-10-04T00:00:00.000Z",
  });
  const track = createTrack({ id: "track:video", kind: "video" });
  track.clips.push(createClip({
    id: "clip:source",
    assetId: "asset:source",
    startUs: 0,
    durationUs: 12_000_000,
  }));
  project.tracks.push(track);

  const editor = new CoProEditorSession(project);
  editor.execute({
    type: "clip.split",
    payload: {
      clipId: "clip:source",
      atUs: 5_000_000,
      rightClipId: "clip:source:b",
    },
  });
  editor.execute({
    type: "clip.move",
    payload: { clipId: "clip:source:b", startUs: 6_000_000 },
  });

  const finalProject = editor.project;
  const renderPlan = createRenderPlan(finalProject, {
    width: 1080,
    height: 1920,
    quality: "high",
  });

  const backend = selectRenderBackend(renderPlan, [
    {
      id: "proof-renderer",
      capabilities: ["render.video"],
      priority: 1,
      costScore: 0,
    },
  ]);

  return {
    ok: true,
    project: finalProject,
    durationUs: projectDurationUs(finalProject),
    mediaCount: media.list().length,
    renderPlan,
    backendId: backend.id,
  };
}
