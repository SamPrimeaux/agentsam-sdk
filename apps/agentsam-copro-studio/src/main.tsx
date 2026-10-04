import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CoProEditorSession } from "@inneranimalmedia/copro-editor";
import { createCoProProject, createTrack, createClip } from "@inneranimalmedia/copro-project";
import {
  CoProProjectsScreen,
  CoProSheet,
  CoProStudio,
  type CoProProjectSummary,
  type CoProStudioAction,
} from "@inneranimalmedia/copro-ui";
import "@inneranimalmedia/copro-ui/styles.css";

type Screen = "projects" | "editor";

const FIXTURE_PROJECTS: CoProProjectSummary[] = [
  { id:"demo:weekend", title:"Weekend cut", subtitle:"Short-form video", kind:"video", status:"draft", durationMs:11_900, aspectRatio:"9:16", updatedAt:"2026-10-04T17:10:00Z", thumbnailTone:"cyan" },
  { id:"demo:launch", title:"Launch teaser", subtitle:"Ready to export", kind:"video", status:"ready", durationMs:18_400, aspectRatio:"16:9", updatedAt:"2026-10-04T16:24:00Z", thumbnailTone:"violet" },
  { id:"demo:caption", title:"Talking-head captions", subtitle:"Caption pass", kind:"video", status:"active", durationMs:64_000, aspectRatio:"9:16", updatedAt:"2026-10-03T22:20:00Z", thumbnailTone:"slate" },
  { id:"demo:render", title:"Fall campaign cut", subtitle:"Rendering 68%", kind:"video", status:"rendering", progress:68, durationMs:31_000, aspectRatio:"4:5", updatedAt:"2026-10-03T19:15:00Z", thumbnailTone:"amber" },
  { id:"demo:template", title:"Fast hook template", subtitle:"Reusable structure", kind:"template", status:"ready", aspectRatio:"9:16", updatedAt:"2026-10-02T14:00:00Z", thumbnailTone:"violet" },
  { id:"demo:archive", title:"Product reel v1", subtitle:"Archived", kind:"video", status:"archived", durationMs:22_000, aspectRatio:"1:1", updatedAt:"2026-09-28T14:00:00Z", thumbnailTone:"slate" },
];

function makeDemoProject(id = "project:demo", title = "Weekend cut") {
  const project = createCoProProject({ id, title, now:"2026-10-04T00:00:00.000Z" });
  const video = createTrack({ id:"track:video", kind:"video" });
  video.clips.push(
    createClip({ id:"clip:1", assetId:"asset:mountain", startUs:0, durationUs:4_500_000 }),
    createClip({ id:"clip:2", assetId:"asset:street", startUs:4_500_000, durationUs:3_200_000 }),
    createClip({ id:"clip:3", assetId:"asset:portrait", startUs:7_700_000, durationUs:4_200_000 })
  );
  project.tracks.push(video);
  return project;
}

function makeImportedProject(file: File) {
  const project = createCoProProject({
    id:"project:import:" + file.name,
    title:file.name.replace(/\.[^.]+$/, ""),
    now:new Date(),
  });
  const track = createTrack({ id:"track:video", kind:"video" });
  track.clips.push(createClip({
    id:"clip:imported",
    assetId:"asset:" + file.name,
    startUs:0,
    durationUs:8_000_000,
  }));
  project.tracks.push(track);
  return project;
}

function App() {
  const [screen, setScreen] = useState<Screen>("projects");
  const [createOpen, setCreateOpen] = useState(false);
  const [projectSeed, setProjectSeed] = useState(0);
  const sessionRef = useRef(new CoProEditorSession(makeDemoProject()));
  const [project, setProject] = useState(sessionRef.current.project);
  const [selectedClipId, setSelectedClipId] = useState<string | null>("clip:2");
  const [playheadUs, setPlayheadUs] = useState(5_800_000);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<"video" | "image" | null>(null);

  const projects = useMemo(() => FIXTURE_PROJECTS, []);

  function openProject(id: string) {
    const summary = projects.find((item) => item.id === id);
    const next = makeDemoProject("project:" + id, summary?.title ?? "CoPro project");
    sessionRef.current = new CoProEditorSession(next);
    setProject(sessionRef.current.project);
    setSelectedClipId(next.tracks[0]?.clips[0]?.id ?? null);
    setPlayheadUs(0);
    setPreviewSrc(null);
    setPreviewKind(null);
    setProjectSeed((value) => value + 1);
    setScreen("editor");
  }

  function createBlank() {
    const next = createCoProProject({ id:"project:new:" + Date.now(), title:"Untitled project" });
    next.tracks.push(createTrack({ id:"track:video", kind:"video" }));
    sessionRef.current = new CoProEditorSession(next);
    setProject(sessionRef.current.project);
    setSelectedClipId(null);
    setPlayheadUs(0);
    setPreviewSrc(null);
    setPreviewKind(null);
    setCreateOpen(false);
    setProjectSeed((value) => value + 1);
    setScreen("editor");
  }

  function importFile(file: File) {
    const old = previewSrc;
    if (old) URL.revokeObjectURL(old);
    const url = URL.createObjectURL(file);
    const next = makeImportedProject(file);
    sessionRef.current = new CoProEditorSession(next);
    setProject(sessionRef.current.project);
    setSelectedClipId("clip:imported");
    setPlayheadUs(0);
    setPreviewSrc(url);
    setPreviewKind(file.type.startsWith("image/") ? "image" : "video");
    setCreateOpen(false);
    setProjectSeed((value) => value + 1);
    setScreen("editor");
  }

  function commit(action: CoProStudioAction) {
    const session = sessionRef.current;

    if (action.type === "back") { setScreen("projects"); return; }
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
      let newId = action.clipId + ":copy";
      while (project.tracks.some((track:any) => track.clips.some((clip:any) => clip.id === newId))) newId += ":copy";
      setProject(session.execute({ type:"clip.duplicate", payload:{ clipId:action.clipId, newClipId:newId } }));
      setSelectedClipId(newId);
      return;
    }
    if (action.type === "delete") {
      setProject(session.execute({ type:"clip.delete", payload:{ clipId:action.clipId } }));
      setSelectedClipId(null);
    }
  }

  if (screen === "projects") {
    return <>
      <CoProProjectsScreen
        projects={projects}
        onOpenProject={openProject}
        onCreate={() => setCreateOpen(true)}
        onImport={() => setCreateOpen(true)}
      />
      <CoProSheet open={createOpen} title="Create" detent="half" onClose={() => setCreateOpen(false)}>
        <div className="copro-create-options">
          <button onClick={createBlank}><i>＋</i><span><strong>New video</strong><small>Blank timeline</small></span></button>
          <label className="copro-create-option-file">
            <input
              type="file"
              accept="video/*,image/*,audio/*"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) importFile(file);
              }}
            />
            <i>⇧</i><span><strong>Import media</strong><small>From this device</small></span>
          </label>
          <button disabled title="Template library lands in the next UI slice"><i>▦</i><span><strong>From template</strong><small>Coming in next slice</small></span></button>
          <button disabled title="Recording requires camera capability"><i>●</i><span><strong>Record</strong><small>Requires camera capability</small></span></button>
        </div>
      </CoProSheet>
    </>;
  }

  return <CoProStudio
    key={projectSeed}
    project={project as any}
    projectTitle={project.title}
    playheadUs={playheadUs}
    selectedClipId={selectedClipId}
    canUndo={sessionRef.current.canUndo}
    canRedo={sessionRef.current.canRedo}
    previewSrc={previewSrc}
    previewKind={previewKind}
    onSeek={setPlayheadUs}
    onSelectClip={setSelectedClipId}
    onAction={commit}
  />;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
