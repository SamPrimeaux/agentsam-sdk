import React, { useEffect, useMemo, useRef, useState } from "react";
import { coproAppManifest } from "./app-manifest";
import { importEvidencePackage } from "./evidence-import";
import { createRoot } from "react-dom/client";
import { CoProEditorSession } from "@inneranimalmedia/copro-editor";
import { createCoProProject, createTrack, createClip, serializeCoProProject } from "@inneranimalmedia/copro-project";
import { BrowserLocalStorageProjectStore, BrowserIndexedDbMediaStore } from "@inneranimalmedia/copro-storage";
import { extractBrowserAudioWaveform, createBrowserVideoThumbnails } from "@inneranimalmedia/copro-media";
import {
  CoProProjectsScreen,
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
// Browser-level source authority: project JSON stores IDs, original File bytes live in IndexedDB.
const sourceStore = typeof globalThis.indexedDB === "undefined" ? null :
  new BrowserIndexedDbMediaStore({ name:"agentsam.copro.media.v1" });

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

function mediaIdForFile(file: File) {
  return "asset:" + file.name + ":" + file.lastModified + ":" + file.size;
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
    assetId:mediaIdForFile(file),
    startUs:0,
    durationUs:8_000_000,
  }));
  project.tracks.push(track);
  return project;
}

// React StrictMode runs effects twice in development; an evidence link must import once.
let evidenceImportStarted = false;

function App() {
  const [screen, setScreen] = useState<Screen>("projects");
  const homeFileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [projectSeed, setProjectSeed] = useState(0);
  const sessionRef = useRef(new CoProEditorSession(makeDemoProject()));
  const [project, setProject] = useState(sessionRef.current.project);
  const [selectedClipId, setSelectedClipId] = useState<string | null>("clip:2");
  const [playheadUs, setPlayheadUs] = useState(5_800_000);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<"video" | "image" | null>(null);
  const [restored, setRestored] = useState(false);
  const [mediaItems, setMediaItems] = useState<SessionMediaItem[]>([]);
  const mediaUrlsRef = useRef(new Map<string,string>());
  const [mediaPersistenceError, setMediaPersistenceError] = useState<string | null>(null);

  const [savedProjects, setSavedProjects] = useState<CoProProjectSummary[]>([]);
  const [homeSection, setHomeSection] = useState<"home" | "templates">("home");
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
    let cancelled = false;
    if (!sourceStore) {
      setMediaPersistenceError("Durable media storage isn't available in this browser. Imported files may need to be relinked after reopening.");
      return;
    }
    // Hydrate original File bytes before media references are needed by the player.
    void sourceStore.list().then((records) => {
      if (cancelled) return;
      const recovered: SessionMediaItem[] = records.map((record) => {
        // Older CoPro sources may be saved as Blob rather than File. Rewrap without
        // transcoding, so both source-store generations reopen the exact bytes.
        const file = record.file instanceof File ? record.file :
          new File([record.file], record.name || record.id, {
            type: record.file.type || "application/octet-stream",
            lastModified: record.lastModified || Date.now(),
          });
        const kind = record.kind || (file.type.startsWith("audio/") ? "audio" :
          file.type.startsWith("image/") ? "image" : "video");
        const existingUrl = mediaUrlsRef.current.get(record.id);
        const url = existingUrl ?? URL.createObjectURL(file);
        if (!existingUrl) mediaUrlsRef.current.set(record.id, url);
        return {
          id:record.id, name:record.name || file.name, kind, url,
          durationUs:record.durationUs, file, waveform:record.waveform, thumbnails:record.thumbnails,
        };
      });
      setMediaItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...recovered.filter((item) => !known.has(item.id))];
      });
      setMediaPersistenceError(null);
    }).catch((error) => {
      if (!cancelled) {
        console.error("CoPro source recovery failed", error);
        setMediaPersistenceError("Saved source media could not be loaded. Check browser storage permissions and relink unavailable files.");
      }
    });
    return () => { cancelled = true; };
  }, []);

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

  function installProject(next: any, selectedId: string | null = null) {
    sessionRef.current = new CoProEditorSession(next);
    setProject(sessionRef.current.project);
    setSelectedClipId(selectedId ?? next.tracks.flatMap((track:any) => track.clips)[0]?.id ?? null);
    setPlayheadUs(0);
    setProjectSeed((value) => value + 1);
    void store.save(next).then(() => refreshSavedProjects());
  }

  useEffect(() => {
    // Open a delivered evidence package: /?evidence=<manifest-url> (loopback only; see evidence-import.ts).
    const manifestUrl = new URLSearchParams(window.location.search).get("evidence");
    if (!manifestUrl || evidenceImportStarted) return;
    evidenceImportStarted = true;
    void (async () => {
      try {
        const result = await importEvidencePackage({ manifestUrl, projectStore: store, mediaStore: sourceStore });
        const cleaned = new URL(window.location.href);
        cleaned.searchParams.delete("evidence");
        window.history.replaceState(null, "", cleaned.toString());
        const imported = result.media.map((record) => {
          const existing = mediaUrlsRef.current.get(record.id);
          const url = existing ?? URL.createObjectURL(record.file);
          if (!existing) mediaUrlsRef.current.set(record.id, url);
          return { id: record.id, name: record.name, kind: record.kind, url, durationUs: record.durationUs, file: record.file } as SessionMediaItem;
        });
        setMediaItems((current) => {
          const known = new Set(current.map((item) => item.id));
          return [...current, ...imported.filter((item) => !known.has(item.id))];
        });
        await refreshSavedProjects();
        await openProject(result.projectId);
      } catch (error) {
        setMediaPersistenceError("Evidence package could not be opened: " + (error instanceof Error ? error.message : "unknown error"));
      }
    })();
  }, []);

  async function openProject(id: string) {
    const summary = projects.find((item) => item.id === id);
    const saved = summary?.example ? null : await store.load(id);
    if (!summary?.example && !saved) return;
    const next = saved ?? makeDemoProject("project:example-copy:" + Date.now(), (summary?.title ?? "CoPro") + " (example)");
    installProject(next);
    setInitialTool(null);
    setPreviewSrc(null);
    setPreviewKind(null);
    setScreen("editor");
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
    setPreviewSrc(null);
    setPreviewKind(null);
    setInitialTool(tool);
    setScreen("editor");
  }

  function importFile(file: File) {
    const old = previewSrc;
    if (old) URL.revokeObjectURL(old);
    const url = URL.createObjectURL(file);
    const next = makeImportedProject(file);
    installProject(next, "clip:imported");
    void registerSessionMedia(file);
    setPreviewSrc(url);
    setPreviewKind(file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : null);
    setInitialTool(null);
    setScreen("editor");
  }


  function stopScreenRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    captureStreamRef.current?.getTracks().forEach(track => track.stop());
    captureStreamRef.current = null;
    setRecording(false);
  }

  async function startScreenRecording() {
    if (recording) { stopScreenRecording(); return; }
    try {
      if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
        setCaptureError("Screen recording is not supported in this browser. Import a recording made on your device instead.");
        return;
      }
      // Permission prompt must run as a direct user action, never on page load.
      const stream = await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});
      captureStreamRef.current = stream;
      const preferredTypes = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
      const mimeType = preferredTypes.find(type => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream,{mimeType}) : new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => setCaptureError("Screen capture failed. Try again or import an existing recording.");
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        captureStreamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        if (!chunks.length) { setCaptureError("Recording ended without a file. Capture at least one second before stopping."); return; }
        const type = recorder.mimeType || "video/webm";
        const ext = type.includes("mp4") ? "mp4" : "webm";
        const file = new File(chunks,`moviemode-screen-${new Date().toISOString().replace(/[:.]/g,"-")}.${ext}`,{type,lastModified:Date.now()});
        importFile(file);
      };
      stream.getVideoTracks().forEach(track => track.addEventListener("ended",() => {
        if (recorder.state !== "inactive") recorder.stop();
      },{once:true}));
      recorder.start(500);
      setRecording(true);
      setCaptureError(null);
    } catch (error) {
      const reason = error instanceof Error ? error.name : "capture_failed";
      setCaptureError(reason === "NotAllowedError" ? "Screen sharing was cancelled or denied. Allow capture to record or import an existing file." : "Could not start screen capture. Verify the screen sharing permission and try again.");
      setRecording(false);
      captureStreamRef.current?.getTracks().forEach(track => track.stop());
      captureStreamRef.current = null;
    }
  }

  async function deleteSavedProject(id: string) {
    await store.remove(id);
    await refreshSavedProjects();
  }

  async function duplicateSavedProject(id: string) {
    const original = await store.load(id);
    if (!original) return;
    await store.save({ ...original, id:`project:copy:${Date.now()}:${Math.random().toString(36).slice(2,6)}`, title:`${original.title} (copy)`, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() });
    await refreshSavedProjects();
  }

  async function registerSessionMedia(file: File): Promise<SessionMediaItem> {
    const kind: SessionMediaItem["kind"] =
      file.type.startsWith("audio/") ? "audio" :
      file.type.startsWith("image/") ? "image" :
      "video";

    const id = mediaIdForFile(file);
    const existing = mediaItems.find((item) => item.id === id);
    if (existing) {
      if (sourceStore) void sourceStore.put({
        id:existing.id, name:existing.name, kind:existing.kind, file:existing.file,
        durationUs:existing.durationUs, waveform:existing.waveform, thumbnails:existing.thumbnails,
      }).then(() => setMediaPersistenceError(null)).catch(() => setMediaPersistenceError("Source media could not be saved. Check available device storage."));
      return existing;
    }

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
      url:mediaUrlsRef.current.get(id) ?? URL.createObjectURL(file),
      durationUs,
      file,
      waveform,
    };
    mediaUrlsRef.current.set(id,item.url);
    setMediaItems((current) => current.some((candidate) => candidate.id === id) ? current : [...current, item]);
    if (sourceStore) {
      try {
        await sourceStore.put({ id, name:item.name, kind, file, durationUs, waveform });
        setMediaPersistenceError(null);
      } catch (error) {
        console.error("CoPro media source save failed", error);
        setMediaPersistenceError("Imported media is available for this session, but its original bytes were not saved. Free device storage or reimport before closing.");
      }
    } else {
      setMediaPersistenceError("Original media bytes could not be persisted. This browser has no IndexedDB storage.");
    }
    // Build real visual derivatives in the background; no invented timeline frames.
    // Raw original bytes are already in IndexedDB before this asynchronous pass.
    if (kind === "video") {
      void createBrowserVideoThumbnails(item.url,{count:8}).then(async result => {
        if (!result.ok || !result.frames.length) return;
        const frames=result.frames;
        setMediaItems(current=>current.map(media=>media.id===id?{...media,thumbnails:frames}:media));
        if (sourceStore) {
          try { await sourceStore.put({id,name:item.name,kind,file,durationUs,waveform,thumbnails:frames}); }
          catch(error){console.warn("CoPro thumbnail cache could not persist",error);}
        }
      }).catch(error=>console.warn("Video thumbnail preparation unavailable",error));
    }
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
        localSessionOnly:true,
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

    if (action.type === "back") { setHomeSection("home"); setScreen("projects"); return; }
    if (action.type === "browse-templates") { setHomeSection("templates"); setScreen("projects"); return; }
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
    if (action.type === "transform") { setProject(session.execute({ type:"clip.set_transform", payload:{ clipId:action.clipId, ...action.patch } })); return; }
    if (action.type === "text") { setProject(session.execute({ type:"clip.set_text", payload:{ clipId:action.clipId, text:action.text } })); return; }
    if (action.type === "effect") { setProject(session.execute({ type:"clip.set_effect", payload:{ clipId:action.clipId, effect:action.effect } })); return; }
    if (action.type === "transition") { setProject(session.execute({ type:"clip.set_transition", payload:{ clipId:action.clipId, transition:action.transition, durationUs:action.durationUs } })); return; }
    if (action.type === "track-state") { setProject(session.execute({ type:"track.set_state", payload:{ trackId:action.trackId, ...action.patch } })); return; }
    if (action.type === "track-reorder") { setProject(session.execute({ type:"track.reorder", payload:{ trackId:action.trackId, index:action.index } })); return; }

    if (action.type === "import-media") {
      const item = await registerSessionMedia(action.file);
      addSessionMediaToTimeline(item, action.atUs);
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
    return <div className="copro-boot"><span>MovieMode</span><small>Restoring your projects…</small></div>;
  }

  if (screen === "projects") {
    return <>
      <CoProProjectsScreen
        projects={projects}
        initialSection={homeSection}
        onOpenProject={openProject}
        onCreate={() => createBlank()}
        onImport={() => homeFileRef.current?.click()}
        recording={recording}
        onRecord={() => void startScreenRecording()}
        onStopRecording={stopScreenRecording}
        onOpenTool={(tool) => createBlank(tool)}
        onRenameProject={(id,title) => void renameProject(id,title)}
        onDeleteProject={(id) => void deleteSavedProject(id)}
        onDuplicateProject={(id) => void duplicateSavedProject(id)}
        appIconUrl={coproAppManifest.iconBaseUrl ? coproAppManifest.iconBaseUrl + "/small" : undefined}
      />
      <input ref={homeFileRef} type="file" accept="video/*,image/*,audio/*" style={{display:"none"}} aria-label="Select a video, image or audio file" onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        if (file) importFile(file);
        event.currentTarget.value = "";
      }}/>
      {captureError && <div role="alert" className="mm-capture-error">{captureError}<button onClick={() => setCaptureError(null)} aria-label="Dismiss error">×</button></div>}
    </>;
  }

  return <>
    {mediaPersistenceError && <div role="alert" className="copro-source-storage-warning" style={{position:"fixed",zIndex:30,bottom:78,left:12,right:12,maxWidth:720,margin:"0 auto",padding:"13px 16px",background:"#442a24",color:"#fff5e9",border:"1px solid #bd816d",borderRadius:12,boxShadow:"0 12px 36px #0006",fontSize:13}}>
      <strong>Source storage needs attention. </strong>{mediaPersistenceError}
      <button type="button" onClick={() => setMediaPersistenceError(null)} aria-label="Dismiss storage warning" style={{marginLeft:12,color:"inherit",background:"transparent",border:"1px solid #cba08c",padding:"4px 8px",borderRadius:7,cursor:"pointer"}}>Dismiss</button>
    </div>}
    <CoProStudio
    key={projectSeed}
    initialTool={initialTool}
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
  />
  </>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
