import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CoProEditorSession } from "@inneranimalmedia/copro-editor";
import { createCoProProject, createTrack, createClip } from "@inneranimalmedia/copro-project";
import { BrowserLocalStorageProjectStore } from "@inneranimalmedia/copro-storage";
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

const store = new BrowserLocalStorageProjectStore({ prefix:"agentsam.copro.project:" });

function makeDemoProject(id = "project:demo", title = "Weekend cut") {
  const project = createCoProProject({ id, title, now:"2026-10-04T00:00:00.000Z" });

  const video = createTrack({ id:"track:video", kind:"video", name:"Video" });
  video.clips.push(
    createClip({ id:"clip:1", assetId:"asset:mountain", startUs:0, durationUs:4_500_000 }),
    createClip({ id:"clip:2", assetId:"asset:street", startUs:4_500_000, durationUs:3_200_000 }),
    createClip({ id:"clip:3", assetId:"asset:portrait", startUs:7_700_000, durationUs:4_200_000 })
  );

  const audio = createTrack({ id:"track:audio", kind:"audio", name:"Audio" });
  audio.clips.push(createClip({
    id:"audio:music",
    assetId:"asset:music-bed",
    startUs:0,
    durationUs:11_900_000,
    volume:.72,
  }));

  const captions = createTrack({ id:"track:captions", kind:"captions", name:"Captions" });
  captions.clips.push(
    createClip({
      id:"caption:1",
      assetId:"caption:1",
      startUs:350_000,
      durationUs:2_600_000,
      metadata:{ text:"Okay chat, today’s goal…" },
    }),
    createClip({
      id:"caption:2",
      assetId:"caption:2",
      startUs:3_100_000,
      durationUs:2_800_000,
      metadata:{ text:"Make one cut worth watching." },
    })
  );

  const overlay = createTrack({ id:"track:overlay", kind:"overlay", name:"Text" });
  overlay.clips.push(createClip({
    id:"overlay:title",
    assetId:"text:title",
    startUs:800_000,
    durationUs:2_800_000,
    metadata:{ text:"CO-PRODUCED WITH AGENTSAM" },
  }));

  project.tracks.push(video, audio, captions, overlay);
  return project;
}

async function probeMediaDurationUs(file: File): Promise<number> {
  if (!file.type.startsWith("video/") && !file.type.startsWith("audio/")) {
    return 3_000_000;
  }

  const url = URL.createObjectURL(file);
  try {
    const media = document.createElement(file.type.startsWith("audio/") ? "audio" : "video");
    media.preload = "metadata";
    media.src = url;

    const duration = await new Promise<number>((resolve) => {
      const done = () => {
        const seconds = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : 8;
        resolve(seconds);
      };
      media.addEventListener("loadedmetadata", done, { once:true });
      media.addEventListener("error", () => resolve(8), { once:true });
      window.setTimeout(() => resolve(8), 2500);
    });

    return Math.max(100_000, Math.round(duration * 1_000_000));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function makeImportedProject(file: File) {
  const project = createCoProProject({
    id:"project:import:" + file.name + ":" + Date.now(),
    title:file.name.replace(/\.[^.]+$/, ""),
    now:new Date(),
  });

  const kind = file.type.startsWith("audio/") ? "audio" : "video";
  const track = createTrack({ id:"track:" + kind, kind, name:kind === "audio" ? "Audio" : "Video" });
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
  const [restored, setRestored] = useState(false);

  const projects = useMemo(() => FIXTURE_PROJECTS, []);

  useEffect(() => {
    let cancelled = false;
    void store.loadRecent().then((recent) => {
      if (cancelled || !recent) {
        setRestored(true);
        return;
      }
      sessionRef.current = new CoProEditorSession(recent);
      setProject(sessionRef.current.project);
      setSelectedClipId(recent.tracks.flatMap((track:any) => track.clips)[0]?.id ?? null);
      setRestored(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!restored) return;
    const timer = window.setTimeout(() => {
      void store.save(project);
    }, 140);
    return () => window.clearTimeout(timer);
  }, [project, restored]);

  function installProject(next: any, selectedId: string | null = null) {
    sessionRef.current = new CoProEditorSession(next);
    setProject(sessionRef.current.project);
    setSelectedClipId(selectedId ?? next.tracks.flatMap((track:any) => track.clips)[0]?.id ?? null);
    setPlayheadUs(0);
    setProjectSeed((value) => value + 1);
    void store.save(next);
  }

  function openProject(id: string) {
    const summary = projects.find((item) => item.id === id);
    installProject(makeDemoProject("project:" + id, summary?.title ?? "CoPro project"));
    setPreviewSrc(null);
    setPreviewKind(null);
    setScreen("editor");
  }

  function createBlank() {
    const next = createCoProProject({ id:"project:new:" + Date.now(), title:"Untitled project" });
    next.tracks.push(createTrack({ id:"track:video", kind:"video", name:"Video" }));
    installProject(next, null);
    setPreviewSrc(null);
    setPreviewKind(null);
    setCreateOpen(false);
    setScreen("editor");
  }

  function importFile(file: File) {
    const old = previewSrc;
    if (old) URL.revokeObjectURL(old);
    const url = URL.createObjectURL(file);
    const next = makeImportedProject(file);
    installProject(next, "clip:imported");
    setPreviewSrc(url);
    setPreviewKind(file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : null);
    setCreateOpen(false);
    setScreen("editor");
  }

  async function commit(action: CoProStudioAction) {
    const session = sessionRef.current;

    if (action.type === "back") { setScreen("projects"); return; }
    if (action.type === "undo") { setProject(session.undo()); return; }
    if (action.type === "redo") { setProject(session.redo()); return; }
    if (action.type === "move") { setProject(session.execute({ type:"clip.move", payload:{ clipId:action.clipId, startUs:action.startUs } })); return; }
    if (action.type === "trim") { setProject(session.execute({ type:"clip.trim", payload:{ clipId:action.clipId, ...action.patch } })); return; }
    if (action.type === "speed") { setProject(session.execute({ type:"clip.set_speed", payload:{ clipId:action.clipId, playbackRate:action.playbackRate } })); return; }
    if (action.type === "volume") { setProject(session.execute({ type:"clip.set_volume", payload:{ clipId:action.clipId, volume:action.volume } })); return; }
    if (action.type === "text") { setProject(session.execute({ type:"clip.set_text", payload:{ clipId:action.clipId, text:action.text } })); return; }
    if (action.type === "track-state") { setProject(session.execute({ type:"track.set_state", payload:{ trackId:action.trackId, ...action.patch } })); return; }
    if (action.type === "track-reorder") { setProject(session.execute({ type:"track.reorder", payload:{ trackId:action.trackId, index:action.index } })); return; }

    if (action.type === "import-media") {
      const file = action.file;
      const durationUs = await probeMediaDurationUs(file);
      const mime = file.type;
      const kind = mime.startsWith("audio/") ? "audio" : mime.startsWith("image/") ? "overlay" : "video";

      let track = project.tracks.find((item:any) => item.kind === kind && !item.locked);
      if (!track) {
        const trackId = "track:" + kind + ":" + Date.now();
        const created = createTrack({
          id:trackId,
          kind,
          name:kind === "overlay" ? "Overlay" : kind.charAt(0).toUpperCase() + kind.slice(1),
        });
        const afterTrack = session.execute({ type:"track.insert", payload:{ track:created } });
        setProject(afterTrack);
        track = afterTrack.tracks.find((item:any) => item.id === trackId);
      }

      if (!track) return;

      const clipId = "clip:media:" + Date.now();
      const clip = createClip({
        id:clipId,
        assetId:"asset:" + file.name + ":" + file.lastModified,
        startUs:action.atUs,
        durationUs,
        metadata:{
          fileName:file.name,
          mimeType:file.type,
          localSessionOnly:true,
        },
      });

      const next = session.execute({
        type:"clip.insert",
        payload:{ trackId:track.id, clip },
      });
      setProject(next);
      setSelectedClipId(clipId);

      if (previewSrc) URL.revokeObjectURL(previewSrc);
      const url = URL.createObjectURL(file);
      if (file.type.startsWith("video/")) {
        setPreviewSrc(url);
        setPreviewKind("video");
      } else if (file.type.startsWith("image/")) {
        setPreviewSrc(url);
        setPreviewKind("image");
      } else {
        URL.revokeObjectURL(url);
      }
      return;
    }

    if (action.type === "create-text") {
      let track = project.tracks.find((item:any) => item.kind === action.kind && !item.locked);
      if (!track) {
        const trackId = "track:" + action.kind + ":" + Date.now();
        const created = createTrack({
          id:trackId,
          kind:action.kind,
          name:action.kind === "captions" ? "Captions" : "Text",
        });
        const afterTrack = session.execute({ type:"track.insert", payload:{ track:created } });
        setProject(afterTrack);
        track = afterTrack.tracks.find((item:any) => item.id === trackId);
      }

      if (!track) return;
      const clipId = action.kind + ":" + Date.now();
      const clip = createClip({
        id:clipId,
        assetId:(action.kind === "captions" ? "caption:" : "text:") + clipId,
        startUs:action.atUs,
        durationUs:2_500_000,
        metadata:{ text:action.text },
      });
      const next = session.execute({ type:"clip.insert", payload:{ trackId:track.id, clip } });
      setProject(next);
      setSelectedClipId(clipId);
      return;
    }

    if (action.type === "add-track") {
      const kinds = ["video","audio","captions","overlay"] as const;
      const counts = new Map<string,number>();
      for (const track of project.tracks) counts.set(track.kind, (counts.get(track.kind) ?? 0) + 1);
      const kind = kinds.reduce((best, candidate) => (counts.get(candidate) ?? 0) < (counts.get(best) ?? 0) ? candidate : best, kinds[0]);
      const index = (counts.get(kind) ?? 0) + 1;
      const id = "track:" + kind + ":" + Date.now();
      const track = createTrack({ id, kind, name:(kind === "overlay" ? "Text" : kind.charAt(0).toUpperCase() + kind.slice(1)) + " " + index });
      setProject(session.execute({ type:"track.insert", payload:{ track } }));
      return;
    }

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

  if (!restored) {
    return <div className="copro-boot"><span>CoPro</span><small>Restoring project…</small></div>;
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
          <button disabled title="Template library lands in the next UI slice"><i>▦</i><span><strong>From template</strong><small>Requires template browser</small></span></button>
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
