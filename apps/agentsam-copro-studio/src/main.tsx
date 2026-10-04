import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { CoProEditorSession } from "@inneranimalmedia/copro-editor";
import { createCoProProject, createTrack, createClip } from "@inneranimalmedia/copro-project";
import { CoProStudio, type CoProStudioAction } from "@inneranimalmedia/copro-ui";
import "@inneranimalmedia/copro-ui/styles.css";

function initialProject() {
  const project = createCoProProject({ id:"project:demo", title:"Weekend cut", now:"2026-10-04T00:00:00.000Z" });
  const video = createTrack({ id:"track:video", kind:"video" });
  video.clips.push(
    createClip({ id:"clip:1", assetId:"asset:mountain", startUs:0, durationUs:4_500_000 }),
    createClip({ id:"clip:2", assetId:"asset:street", startUs:4_500_000, durationUs:3_200_000 }),
    createClip({ id:"clip:3", assetId:"asset:portrait", startUs:7_700_000, durationUs:4_200_000 })
  );
  project.tracks.push(video);
  return project;
}

function App() {
  const session = useMemo(() => new CoProEditorSession(initialProject()), []);
  const [project, setProject] = useState(session.project);
  const [selectedClipId, setSelectedClipId] = useState<string | null>("clip:2");
  const [playheadUs, setPlayheadUs] = useState(5_800_000);

  function commit(action: CoProStudioAction) {
    if (action.type === "undo") { setProject(session.undo()); return; }
    if (action.type === "redo") { setProject(session.redo()); return; }
    if (action.type === "move") { setProject(session.execute({ type:"clip.move", payload:{ clipId:action.clipId, startUs:action.startUs } })); return; }
    if (action.type === "trim") { setProject(session.execute({ type:"clip.trim", payload:{ clipId:action.clipId, ...action.patch } })); return; }
    if (action.type === "split") {
      const clip = project.tracks.flatMap((track:any) => track.clips).find((item:any) => item.id === action.clipId);
      if (!clip || action.atUs <= clip.startUs || action.atUs >= clip.startUs + clip.durationUs) return;
      const rightId = action.clipId + ":split:" + action.atUs;
      setProject(session.execute({ type:"clip.split", payload:{ clipId:action.clipId, atUs:action.atUs, rightClipId:rightId } }));
      setSelectedClipId(rightId);
      return;
    }
    if (action.type === "duplicate") {
      const newId = action.clipId + ":copy";
      setProject(session.execute({ type:"clip.duplicate", payload:{ clipId:action.clipId, newClipId:newId } }));
      setSelectedClipId(newId);
      return;
    }
    if (action.type === "delete") {
      setProject(session.execute({ type:"clip.delete", payload:{ clipId:action.clipId } }));
      setSelectedClipId(null);
      return;
    }
    if (action.type === "export") {
      window.alert("Export will create a RenderPlan and choose the best available renderer automatically.");
      return;
    }
    if (action.type === "tool") window.alert(action.tool + " tool surface is queued for the next CoPro UI slice.");
  }

  return <CoProStudio
    project={project as any}
    projectTitle={project.title}
    playheadUs={playheadUs}
    selectedClipId={selectedClipId}
    canUndo={session.canUndo}
    canRedo={session.canRedo}
    onSeek={setPlayheadUs}
    onSelectClip={setSelectedClipId}
    onAction={commit}
  />;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
