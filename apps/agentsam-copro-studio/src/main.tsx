import React, { useEffect, useMemo, useRef, useState } from "react";
import { coproAppManifest } from "./app-manifest";
import { createRoot } from "react-dom/client";
import { CoProEditorSession } from "@inneranimalmedia/copro-editor";
import { createCoProProject, createTrack, createClip, serializeCoProProject } from "@inneranimalmedia/copro-project";
import { BrowserLocalStorageProjectStore, BrowserIndexedDbMediaStore } from "@inneranimalmedia/copro-storage";
import { extractBrowserAudioWaveform } from "@inneranimalmedia/copro-media";
import {
  CoProProjectsScreen,
  CoProSheet,
  CoProStudio,
  type CoProProjectSummary,
  type CoProStudioAction,
  type CoProMediaShelfItem,
} from "@inneranimalmedia/copro-ui";
import "@inneranimalmedia/copro-ui/styles.css";

type Screen = "projects" | "editor";

type SessionMediaItem = CoProMediaShelfItem & {
  file: File;
  waveform?: number[];
};

const FIXTURE_PROJECTS: CoProProjectSummary[] = [
  { id:"demo:weekend", title:"Weekend cut", subtitle:"Sample timeline · no video supplied", kind:"video", status:"draft", durationMs:11_900, aspectRatio:"9:16", updatedAt:"2026-10-04T17:10:00Z", thumbnailTone:"cyan", example:true },
  { id:"demo:caption", title:"Caption layout", subtitle:"Sample tracks & captions", kind:"video", status:"draft", durationMs:11_900, aspectRatio:"9:16", updatedAt:"2026-10-04T17:10:00Z", thumbnailTone:"violet", example:true },
];

function installCoProBrandIcons() {
  if (typeof document === "undefined") return;
  const base = coproAppManifest.iconBaseUrl;
  if (!base) return;
  const setLink = (rel: string, size: string) => {
    let node = document.querySelector<HTMLLinkElement>('link[rel="' + rel + '"]');
    if (!node) { node = document.createElement("link"); node.rel = rel; document.head.appendChild(node); }
    node.href = base + "/" + size;
  };
  setLink("icon", "thumbnail");
  setLink("apple-touch-icon", "medium");
}

const store = new BrowserLocalStorageProjectStore({ prefix:"agentsam.copro.project:" });
const mediaStore = new BrowserIndexedDbMediaStore({ databaseName:"agentsam.copro.media.v1" });

function makeDemoProject(id = "project:demo", title = "Weekend cut") {
  const project = createCoProProject({ id, title, now:"2026-10-04T00:00:00.000Z" });

  const video = createTrack({ id:"track:video", kind:"video", name:"Video" });
  video.clips.push(
    createClip({ id:"clip:1", assetId:"sample:unavailable:mountain", startUs:0, durationUs:4_500_000 }),
    createClip({ id:"clip:2", assetId:"sample:unavailable:street", startUs:4_500_000, durationUs:3_200_000 }),
    createClip({ id:"clip:3", assetId:"sample:unavailable:portrait", startUs:7_700_000, durationUs:4_200_000 })
  );

  const audio = createTrack({ id:"track:audio", kind:"audio", name:"Audio" });
  audio.clips.push(createClip({
    id:"audio:music",
    assetId:"sample:unavailable:music-bed",
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

    await new Promise<void>((resolve,reject)=>{
      const timeout=window.setTimeout(()=>reject(new Error("copro_media_metadata_timeout")),4000);
      const complete=()=>{window.clearTimeout(timeout);resolve();};
      media.addEventListener("loadedmetadata",complete,{once:true});
      media.addEventListener("error",()=>{
        window.clearTimeout(timeout);
        reject(new Error("copro_media_unsupported_or_corrupt"));
      },{once:true});
    });

    // Browser-produced WebM often has Infinity/NaN in its container metadata.
    // Seek to its actual end rather than inventing an 8-second duration.
    let seconds=media.duration;
    if (!Number.isFinite(seconds) || seconds<=0) {
      const reachedEnd=new Promise<number>((resolve,reject)=>{
        const timeout=window.setTimeout(()=>reject(new Error("copro_media_duration_unavailable")),4000);
        media.addEventListener("seeked",()=>{
          window.clearTimeout(timeout);
          resolve(media.currentTime);
        },{once:true});
      });
      media.currentTime=10_000_000;
      seconds=await reachedEnd;
    }
    if(!Number.isFinite(seconds)||seconds<=0)throw new Error("copro_media_duration_unavailable");
    return Math.max(100_000, Math.round(seconds * 1_000_000));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function mediaIdForFile(file: File) {
  return "asset:" + file.name + ":" + file.lastModified + ":" + file.size;
}

function makeImportedProject(file: File, durationUs: number) {
  const project = createCoProProject({
    id:"project:import:" + file.name + ":" + Date.now(),
    title:file.name.replace(/\.[^.]+$/, ""),
    now:new Date(),
  });

  const kind = file.type.startsWith("audio/") ? "audio" : file.type.startsWith("image/") ? "overlay" : "video";
  const track = createTrack({ id:"track:" + kind, kind, name:kind === "audio" ? "Audio" : "Video" });
  track.clips.push(createClip({
    id:"clip:imported",
    assetId:mediaIdForFile(file),
    startUs:0,
    durationUs,
    metadata:{fileName:file.name,mimeType:file.type,persistedAsset:true},
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
  const [mediaItems, setMediaItems] = useState<SessionMediaItem[]>([]);
  const [mediaError,setMediaError] = useState<string|null>(null);

  const [savedProjects, setSavedProjects] = useState<CoProProjectSummary[]>([]);
  const [initialTool, setInitialTool] = useState<"text" | "captions" | null>(null);

  async function refreshSavedProjects() {
    const saved = await store.list();
    const summaries: CoProProjectSummary[] = saved.map((entry:any) => {
      const durationUs = Math.max(0, ...entry.tracks.flatMap((track:any) =>
        track.clips.map((clip:any) => clip.startUs + clip.durationUs)));
      return {
        id:entry.id, title:entry.title, kind:"video" as const, status:"draft" as const,
        subtitle:"Saved in this browser", durationMs:Math.round(durationUs/1000),
        aspectRatio:"9:16", updatedAt:String(entry.updatedAt || entry.createdAt || new Date().toISOString()),
        thumbnailTone:"cyan" as const,
      };
    });
    setSavedProjects(summaries.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)));
  }

  const projects = useMemo(() => [...savedProjects, ...FIXTURE_PROJECTS], [savedProjects]);

  useEffect(() => {
    installCoProBrandIcons();
    void refreshSavedProjects();
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
      void store.save(project).then(() => refreshSavedProjects()).catch((error) => {
        console.error("CoPro local save failed", error);
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [project, restored]);

  async function restoreProjectMedia(next: any) {
    const ids:string[] = [...new Set<string>(next.tracks.flatMap((track:any) =>
      track.clips.map((clip:any) => String(clip.assetId)).filter((id:string)=>id.startsWith("asset:"))))];
    if(!ids.length) {
      setMediaItems([]);setPreviewSrc(null);setPreviewKind(null);setMediaError(null);
      return;
    }
    try {
      const records=await mediaStore.loadMany(ids);
      const items:SessionMediaItem[]=await Promise.all(records.map(async (record)=>{
        const file=record.file instanceof File ? record.file
          : new File([record.file],record.name,{type:record.type,lastModified:record.lastModified});
        const kind:SessionMediaItem["kind"]=file.type.startsWith("audio/")?"audio":
          file.type.startsWith("image/")?"image":"video";
        return {id:record.id,name:record.name,file,kind,
          url:URL.createObjectURL(file),durationUs:await probeMediaDurationUs(file)};
      }));
      setMediaItems(items);
      const firstVisual=items.find(item=>item.kind==="video"||item.kind==="image");
      setPreviewSrc(firstVisual?.url??null);
      setPreviewKind(firstVisual?.kind==="image"?"image":firstVisual?.kind==="video"?"video":null);
      const missing=ids.filter(id=>!records.some(record=>record.id===id));
      setMediaError(missing.length ? missing.length+" original media file(s) missing from this browser. Reimport or relink them." : null);
    }catch(error){
      setMediaError("Could not restore source media: "+String(error));
      setMediaItems([]);setPreviewSrc(null);setPreviewKind(null);
    }
  }

  function installProject(next: any, selectedId: string | null = null) {
    sessionRef.current = new CoProEditorSession(next);
    setProject(sessionRef.current.project);
    setSelectedClipId(selectedId ?? next.tracks.flatMap((track:any) => track.clips)[0]?.id ?? null);
    setPlayheadUs(0);
    setProjectSeed((value) => value + 1);
    void store.save(next).then(() => refreshSavedProjects());
  }

  async function openProject(id: string) {
    const summary = projects.find((item) => item.id === id);
    const saved = summary?.example ? null : await store.load(id);
    if (!summary?.example && !saved) return;
    const next = saved ?? makeDemoProject("project:example-copy:" + Date.now(), (summary?.title ?? "CoPro") + " (example)");
    installProject(next);
    setInitialTool(null);
    setScreen("editor");
    await restoreProjectMedia(next);
  }

  async function renameProject(id: string, title: string) {
    const saved = await store.load(id);
    if (!saved) return;
    await store.save({ ...saved, title });
    if (project.id === id) {
      sessionRef.current = new CoProEditorSession({ ...saved, title });
      setProject(sessionRef.current.project);
    }
    await refreshSavedProjects();
  }

  function createBlank(tool: "text" | "captions" | null = null) {
    const next = createCoProProject({ id:"project:new:" + Date.now(), title:"Untitled project" });
    next.tracks.push(createTrack({ id:"track:video", kind:"video", name:"Video" }));
    installProject(next, null);
    setMediaItems([]);
    setMediaError(null);
    setPreviewSrc(null);
    setPreviewKind(null);
    setCreateOpen(false);
    setInitialTool(tool);
    setScreen("editor");
  }

  async function importFile(file: File) {
    try {
      const item=await registerSessionMedia(file);
      const next=makeImportedProject(file,item.durationUs??3_000_000);
      installProject(next,"clip:imported");
      setMediaItems([item]);
      setPreviewSrc(item.kind==="video"||item.kind==="image"?item.url:null);
      setPreviewKind(item.kind==="image"?"image":item.kind==="video"?"video":null);
      setMediaError(null);
      setCreateOpen(false);
      setInitialTool(null);
      setScreen("editor");
    }catch(error){setMediaError("Media import failed: "+String(error));}
  }

  async function registerSessionMedia(file: File): Promise<SessionMediaItem> {
    const kind: SessionMediaItem["kind"] =
      file.type.startsWith("audio/") ? "audio" :
      file.type.startsWith("image/") ? "image" :
      "video";

    const id = mediaIdForFile(file);
    const existing = mediaItems.find((item) => item.id === id);
    if (existing) return existing;

    let durationUs = await probeMediaDurationUs(file);
    let waveform: number[] | undefined;

    if (kind === "audio") {
      const decoded = await extractBrowserAudioWaveform(file, 120);
      if (decoded.ok) {
        durationUs = decoded.durationUs;
        waveform = decoded.samples;
      }
    }

    const item: SessionMediaItem = {
      id,
      name:file.name,
      kind,
      url:URL.createObjectURL(file),
      durationUs,
      file,
      waveform,
    };

    try {
      await mediaStore.save(id,file);
    }catch(error){
      URL.revokeObjectURL(item.url);
      setMediaError("Source file could not be saved in browser storage. Import not completed: "+String(error));
      throw error;
    }
    setMediaItems((current) => current.some((entry)=>entry.id===item.id)?current:[...current,item]);
    setMediaError(null);
    return item;
  }

  function addSessionMediaToTimeline(item: SessionMediaItem, atUs: number) {
    const session = sessionRef.current;
    const kind = item.kind === "audio" ? "audio" : item.kind === "image" ? "overlay" : "video";

    let currentProject = session.project;
    let track = currentProject.tracks.find((entry:any) => entry.kind === kind && !entry.locked);

    if (!track) {
      const trackId = "track:" + kind + ":" + Date.now();
      const created = createTrack({
        id:trackId,
        kind,
        name:kind === "overlay" ? "Overlay" : kind.charAt(0).toUpperCase() + kind.slice(1),
      });
      currentProject = session.execute({ type:"track.insert", payload:{ track:created } });
      track = currentProject.tracks.find((entry:any) => entry.id === trackId);
    }

    if (!track) return;

    const clipId = "clip:media:" + Date.now() + ":" + Math.random().toString(36).slice(2,6);
    const clip = createClip({
      id:clipId,
      assetId:item.id,
      startUs:atUs,
      durationUs:item.durationUs ?? 3_000_000,
      metadata:{
        fileName:item.name,
        mimeType:item.file.type,
        persistedAsset:true,
        ...(item.waveform ? { waveform:item.waveform } : {}),
      },
    });

    const next = session.execute({
      type:"clip.insert",
      payload:{ trackId:track.id, clip },
    });
    setProject(next);
    setSelectedClipId(clipId);

    if (item.kind === "video" || item.kind === "image") {
      setPreviewSrc(item.url);
      setPreviewKind(item.kind);
    }
  }

  async function commit(action: CoProStudioAction) {
    const session = sessionRef.current;

    if (action.type === "back") { setScreen("projects"); return; }
    if (action.type === "export-project") {
      const json = serializeCoProProject(session.project);
      const blob = new Blob([json], { type:"application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = (session.project.title || "copro-project").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-|-$/g,"").slice(0,80) + ".copro.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    if (action.type === "undo") { setProject(session.undo()); return; }
    if (action.type === "redo") { setProject(session.redo()); return; }
    if (action.type === "move") { setProject(session.execute({ type:"clip.move", payload:{ clipId:action.clipId, startUs:action.startUs } })); return; }
    if (action.type === "trim") { setProject(session.execute({ type:"clip.trim", payload:{ clipId:action.clipId, ...action.patch } })); return; }
    if (action.type === "speed") { setProject(session.execute({ type:"clip.set_speed", payload:{ clipId:action.clipId, playbackRate:action.playbackRate } })); return; }
    if (action.type === "volume") { setProject(session.execute({ type:"clip.set_volume", payload:{ clipId:action.clipId, volume:action.volume } })); return; }
    if (action.type === "text") { setProject(session.execute({ type:"clip.set_text", payload:{ clipId:action.clipId, text:action.text } })); return; }
    if (action.type === "effect") { setProject(session.execute({ type:"clip.set_effect", payload:{ clipId:action.clipId, effect:action.effect } })); return; }
    if (action.type === "transition") { setProject(session.execute({ type:"clip.set_transition", payload:{ clipId:action.clipId, transition:action.transition, durationUs:action.durationUs } })); return; }
    if (action.type === "track-state") { setProject(session.execute({ type:"track.set_state", payload:{ trackId:action.trackId, ...action.patch } })); return; }
    if (action.type === "track-reorder") { setProject(session.execute({ type:"track.reorder", payload:{ trackId:action.trackId, index:action.index } })); return; }

    if (action.type === "import-media") {
      try {
        const item=await registerSessionMedia(action.file);
        addSessionMediaToTimeline(item,action.atUs);
      }catch(error){
        setMediaError("Source media import failed: "+String(error));
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
      {mediaError && <div role="alert" className="copro-media-error">{mediaError}</div>}
      <CoProProjectsScreen
        projects={projects}
        onOpenProject={openProject}
        onCreate={() => setCreateOpen(true)}
        onImport={() => setCreateOpen(true)}
        onOpenTool={(tool) => createBlank(tool)}
        onRenameProject={(id,title) => void renameProject(id,title)}
        appIconUrl={coproAppManifest.iconBaseUrl ? coproAppManifest.iconBaseUrl + "/small" : undefined}
      />
      <CoProSheet open={createOpen} title="Create" detent="half" onClose={() => setCreateOpen(false)}>
        <div className="copro-create-options">
          <button onClick={() => createBlank()}><i>＋</i><span><strong>New video</strong><small>Blank timeline</small></span></button>
          <label className="copro-create-option-file">
            <input
              type="file"
              accept="video/*,image/*,audio/*"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void importFile(file);
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
    initialTool={initialTool}
    mediaError={mediaError}
    project={project as any}
    projectTitle={project.title}
    playheadUs={playheadUs}
    selectedClipId={selectedClipId}
    canUndo={sessionRef.current.canUndo}
    canRedo={sessionRef.current.canRedo}
    previewSrc={previewSrc}
    previewKind={previewKind}
    mediaItems={mediaItems}
    onMediaAdd={(id, atUs) => {
      const item = mediaItems.find((entry) => entry.id === id);
      if (item) addSessionMediaToTimeline(item, atUs);
    }}
    onSeek={setPlayheadUs}
    onSelectClip={setSelectedClipId}
    onAction={commit}
  />;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
