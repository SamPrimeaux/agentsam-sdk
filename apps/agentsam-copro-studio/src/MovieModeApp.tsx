import '../../../packages/agentsam-nav/src/shell.css';
import React, { useEffect, useMemo, useRef, useState } from "react";
import { coproAppManifest } from "./app-manifest";
import { MOVIEMODE_SYSTEM_ICONS } from "./system-icons";
import creativeCatalog from "@inneranimalmedia/copro-templates/catalog";
import { listProjectTemplates, renderCreativeProjectFrame } from "@inneranimalmedia/copro-templates/creative";
import { importEvidencePackage } from "./evidence-import";
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
  type CoProCreativeAsset,
  type CoProMotionSampler,
  type CoProGraphicSampler,
  type LocalSceneSource,
} from "@inneranimalmedia/copro-ui";
import { evaluateWorld3DFrame } from '@inneranimalmedia/copro-render/world3d';
import { CoProWorldScene } from './CoProWorldScene';
import { SAMSCENE_SKY_DEFAULTS } from './SamSceneSkyBridge';
import { useRegistrySkies } from './skyRegistry';
import "@inneranimalmedia/copro-ui/styles.css";

export type MovieModeScreen = "projects" | "editor";
type Screen = MovieModeScreen;

export type MovieModeAppProps = { initialScreen?: Screen; screen?: Screen; onScreenChange?: (screen: Screen,projectId?:string) => void; standalone?: boolean };

type SessionMediaItem = CoProMediaShelfItem & {
  file: File;
  waveform?: number[];
  width?: number;
  height?: number;
};


/* Batch 1: gallery cards synthesize lightweight SVG covers from tone/title — no live decode in the grid. */

/** Discover from catalog previews + authoritative CREATIVE_TEMPLATES metadata (no UI-owned ID list). */
const PROJECT_TEMPLATE_INDEX = new Map(listProjectTemplates().map((template) => [template.id, template]));
const CREATIVE_ASSET_SEED: CoProCreativeAsset[] = (creativeCatalog as any).items.map((entry: any) => {
  const template = PROJECT_TEMPLATE_INDEX.get(entry.id);
  return {
    id: entry.id,
    category: entry.category as CoProCreativeAsset["category"],
    name: template?.name ?? entry.name,
    description: template?.description ?? entry.description,
    durationUs: template?.durationUs ?? entry.durationUs,
    previewUrl: "",
    previewFile: entry.preview,
    source: entry.source,
    aspectRatio: template?.aspectRatio ?? entry.aspectRatio ?? "16:9",
    group: template?.category ?? entry.group,
    featured: Boolean(template?.featured ?? entry.featured),
    resourceKind: template ? "project_template" as const : undefined,
  };
});

function installCoProBrandIcons() {
  if (typeof document === "undefined") return;
  // First-party local identity ships with this application, not CDN fallbacks.
  const localIcon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (localIcon?.getAttribute("href") === "/favicon.ico") return;
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

type ProbedMediaMetadata = { durationUs:number; width?:number; height?:number };

async function probeMediaMetadata(file: File): Promise<ProbedMediaMetadata> {
  if (file.type.startsWith("image/")) {
    try {
      const bitmap = await createImageBitmap(file);
      const result = {durationUs:3_000_000,width:bitmap.width,height:bitmap.height};
      bitmap.close();
      return result;
    } catch { return {durationUs:3_000_000}; }
  }
  if (!file.type.startsWith("video/") && !file.type.startsWith("audio/")) return {durationUs:3_000_000};
  const url = URL.createObjectURL(file);
  try {
    const isVideo = file.type.startsWith("video/");
    const media = document.createElement(isVideo ? "video" : "audio");
    media.preload = "metadata";
    media.src = url;
    return await new Promise<ProbedMediaMetadata>((resolve) => {
      const done = () => resolve({
        durationUs:Math.max(100_000,Math.round((Number.isFinite(media.duration)&&media.duration>0?media.duration:8)*1_000_000)),
        ...(media instanceof HTMLVideoElement && media.videoWidth>0 && media.videoHeight>0 ? {width:media.videoWidth,height:media.videoHeight} : {}),
      });
      media.addEventListener("loadedmetadata",done,{once:true});
      media.addEventListener("error",()=>resolve({durationUs:8_000_000}),{once:true});
      window.setTimeout(()=>resolve({durationUs:8_000_000}),2500);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function mediaIdForFile(file: File) {
  return "asset:" + file.name + ":" + file.lastModified + ":" + file.size;
}

function makeImportedProject(file: File, media: Pick<SessionMediaItem,"durationUs"|"width"|"height">) {
  const kind = file.type.startsWith("audio/") ? "audio" : file.type.startsWith("image/") ? "overlay" : "video";
  const project = createCoProProject({
    id:"project:import:" + file.name + ":" + Date.now(),
    title:file.name.replace(/\\.[^.]+$/, ""),
    width:media.width ?? 1920,
    height:media.height ?? 1080,
    now:new Date(),
  });
  const track = createTrack({ id:"track:" + kind, kind, name:kind === "audio" ? "Audio" : kind === "overlay" ? "Image" : "Video" });
  track.clips.push(createClip({
    id:"clip:imported",
    assetId:mediaIdForFile(file),
    startUs:0,
    durationUs:media.durationUs ?? 8_000_000,
          metadata:{fileName:file.name,mimeType:file.type,sourceWidth:media.width,sourceHeight:media.height,
        ...(/\.glb$/i.test(file.name)?{sourceKind:'samscene-timeline-cue',sceneCue:{kind:'scene-object',objectId:mediaIdForFile(file)},world3d:{visible:true}}:{})},
  }));
  project.tracks.push(track);
  return project;
}

// React StrictMode runs effects twice in development; an evidence link must import once.
let evidenceImportStarted = false;

export function MovieModeApp({ initialScreen = "projects", screen: requestedScreen, onScreenChange, standalone = false }: MovieModeAppProps) {
  /** `.as-nav-scope` re-declares every --nav-* token with the neutral/violet defaults. Embedded in a host shell that already
   *  carries the active theme, a nested scope would reset the theme for the whole editor, so only a standalone app owns one. */
  const navScope = standalone ? "as-nav-scope " : "";
  const registrySkies = useRegistrySkies();
  // CoPro derives its palette from the host theme via scoped CSS tokens.

  const initialProjectId=useRef(new URLSearchParams(window.location.search).get("project"));
  const [screen, setScreen] = useState<Screen>(requestedScreen ?? (initialProjectId.current?"editor":initialScreen));
  useEffect(() => { if (requestedScreen) setScreen(requestedScreen); }, [requestedScreen]);
  function showScreen(next: Screen) {
    setScreen(next);
    const url=new URL(window.location.href);
    if(next==="editor")url.searchParams.set("project",sessionRef.current.project.id);
    else url.searchParams.delete("project");
    window.history.replaceState(window.history.state,"",url);
    onScreenChange?.(next,next==="editor"?sessionRef.current.project.id:undefined);
  }
  const homeFileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const projectOpenGeneration=useRef(0);
  const autosaveProjectId=useRef<string|null>(null);
  const [projectSeed, setProjectSeed] = useState(0);
  const sessionRef = useRef(new CoProEditorSession(createCoProProject({id:"project:new:" + Date.now(),title:"Untitled project"})));
  const [project, setProject] = useState(sessionRef.current.project);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [playheadUs, setPlayheadUs] = useState(0);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<"video" | "image" | null>(null);
  const [restored, setRestored] = useState(false);
  const [mediaItems, setMediaItems] = useState<SessionMediaItem[]>([]);
  const mediaUrlsRef = useRef(new Map<string,string>());
  const thumbnailPreparationRef = useRef(new Set<string>());
  const scenePosterRef=useRef(new Set<string>());
  const [mediaPersistenceError, setMediaPersistenceError] = useState<string | null>(null);
  const [localSceneSources,setLocalSceneSources]=useState<LocalSceneSource[]>([]);
  const [localSceneSourceBusyId,setLocalSceneSourceBusyId]=useState<string|null>(null);
  useEffect(()=>{
    let cancelled=false;
    // Dev-server middleware only (vite.config.ts); deployed hosts have no such route.
    if (!standalone) return () => { cancelled=true; };
    fetch('/api/local-samscene/sources').then(response=>response.ok?response.json():{items:[]})
      .then(data=>{if(!cancelled&&Array.isArray(data.items))setLocalSceneSources(data.items);})
      .catch(()=>{});
    return ()=>{cancelled=true;};
  },[]);

  const [savedProjects, setSavedProjects] = useState<CoProProjectSummary[]>([]);
  const [homeSection, setHomeSection] = useState<"home" | "templates">("home");
  const [creativeAssets, setCreativeAssets] = useState<CoProCreativeAsset[]>(CREATIVE_ASSET_SEED);
  const [creativeRenderer, setCreativeRenderer] = useState<((project: any, timeUs: number) => string | null) | null>(null);
  const [creativePreviewRenderer,setCreativePreviewRenderer]=useState<((id:string,timeUs:number)=>string|null)|undefined>();
  const [motionSampler, setMotionSampler] = useState<CoProMotionSampler | null>(null);
  const [graphicSampler, setGraphicSampler] = useState<CoProGraphicSampler | null>(null);
  const [transitionFactory,setTransitionFactory]=useState<any>();
  const [initialTool, setInitialTool] = useState<"text" | "captions" | null>(null);
  const [studioEntryMode,setStudioEntryMode]=useState<"scene"|"design"|"generate"|"video">("video");

  async function refreshSavedProjects() {
    const [saved,mediaRecords,thumbnailModule] = await Promise.all([
      store.list(),
      sourceStore ? sourceStore.list().catch(()=>[]) : Promise.resolve([]),
      import("@inneranimalmedia/copro-templates/preview-thumbnails").catch(()=>({CREATIVE_THUMBNAILS:{}})),
    ]);
    const mediaById = new Map(mediaRecords.map((record:any)=>[record.id,record]));
    const summaries: CoProProjectSummary[] = saved.map((entry:any) => {
      const clips = entry.tracks.flatMap((track:any)=>track.clips ?? []);
      const durationUs = Math.max(0,...clips.map((clip:any)=>clip.startUs+clip.durationUs));
      const fromTemplate = entry.metadata?.provenance?.kind === "project_template";
      const clipCount = clips.length;
      const templateId = entry.metadata?.provenance?.templateId
        ?? entry.metadata?.creative?.scene
        ?? clips.find((clip:any)=>clip.metadata?.creative?.scene)?.metadata?.creative?.scene;
      const templateAsset = CREATIVE_ASSET_SEED.find(asset=>asset.id===templateId);
      let thumbnailUrl:string|undefined = entry.metadata?.cover?.url;
      if (!thumbnailUrl && clips.some((clip:any)=>clip.metadata?.creative)) {
        const svg=renderCreativeProjectFrame(entry,Math.min(1200000,Math.max(0,durationUs-1)));
        if(svg)thumbnailUrl="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg);
      }
      if (!thumbnailUrl && templateAsset?.previewFile) {
        const key=templateAsset.previewFile.split("/").pop() ?? "";
        thumbnailUrl=(thumbnailModule.CREATIVE_THUMBNAILS as Record<string,string>)[key] || undefined;
      }
      const visualRecord = clips.map((clip:any)=>mediaById.get(clip.assetId) as any).find((record:any)=>record && (record.kind==="video"||record.kind==="image"||record.kind==="scene"||record.type?.startsWith("video/")||record.type?.startsWith("image/")));
      if (!thumbnailUrl && visualRecord) {
        const kind=visualRecord.kind || (visualRecord.type?.startsWith("image/")?"image":"video");
        if ((kind==="video" || kind==="scene") && visualRecord.thumbnails?.[0]) thumbnailUrl=visualRecord.thumbnails[0];
        if (kind==="image" && visualRecord.file instanceof Blob) {
          const existing=mediaUrlsRef.current.get(visualRecord.id);
          const file=visualRecord.file instanceof File?visualRecord.file:new File([visualRecord.file],visualRecord.name||visualRecord.id,{type:visualRecord.type||"image/png",lastModified:visualRecord.lastModified||Date.now()});
          const url=existing??URL.createObjectURL(file);
          if(!existing)mediaUrlsRef.current.set(visualRecord.id,url);
          thumbnailUrl=url;
        }
        if (kind==="video" && !visualRecord.thumbnails?.length && visualRecord.file instanceof Blob && !thumbnailPreparationRef.current.has(visualRecord.id)) {
          thumbnailPreparationRef.current.add(visualRecord.id);
          const file=visualRecord.file instanceof File?visualRecord.file:new File([visualRecord.file],visualRecord.name||visualRecord.id,{type:visualRecord.type||"video/mp4",lastModified:visualRecord.lastModified||Date.now()});
          const existing=mediaUrlsRef.current.get(visualRecord.id);
          const url=existing??URL.createObjectURL(file);
          if(!existing)mediaUrlsRef.current.set(visualRecord.id,url);
          void createBrowserVideoThumbnails(url,{count:8}).then(async result=>{
            if(!result.ok||!result.frames.length)return;
            await sourceStore?.put({...visualRecord,file,thumbnails:result.frames});
            setMediaItems(current=>current.map(item=>item.id===visualRecord.id?{...item,thumbnails:result.frames}:item));
            await refreshSavedProjects();
          }).catch(error=>console.warn("Gallery thumbnail preparation unavailable",error)).finally(()=>thumbnailPreparationRef.current.delete(visualRecord.id));
        }
      }
      const hasUnresolvedVisual = clips.some((clip:any)=>String(clip.assetId).startsWith("asset:")||String(clip.assetId).startsWith("sample:unavailable:"));
      return {
        id:entry.id, title:entry.title, kind:"video" as const, status:(entry.metadata?.status ?? "draft") as CoProProjectSummary["status"],
        resolution:entry.canvas?.width && entry.canvas?.height ? entry.canvas.width+" × "+entry.canvas.height : undefined,
        format:entry.canvas?.frameRate ? entry.canvas.frameRate+" fps" : undefined,
        subtitle: fromTemplate
          ? "Composition · " + clipCount + " clips"
          : clipCount + " clips",
        durationMs:Math.round(durationUs/1000),
        aspectRatio: entry.canvas?.width && entry.canvas?.height
          ? (Math.abs(entry.canvas.width/entry.canvas.height-16/9)<.03?"16:9":Math.abs(entry.canvas.width/entry.canvas.height-9/16)<.03?"9:16":Math.abs(entry.canvas.width/entry.canvas.height-1)<.03?"1:1":entry.canvas.width+":"+entry.canvas.height)
          : "Project",
        updatedAt:String(entry.updatedAt || entry.createdAt || new Date().toISOString()),
        thumbnailTone: fromTemplate ? "violet" as const : "cyan" as const,
        thumbnailUrl,
        thumbnailState: thumbnailUrl ? undefined : hasUnresolvedVisual ? "missing" as const : "empty" as const,
      };
    });
    setSavedProjects(summaries.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)));
  }

  const projects = useMemo(() => savedProjects, [savedProjects]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      import("@inneranimalmedia/copro-templates/creative"),
      import("@inneranimalmedia/copro-templates/preview-thumbnails"),
    ]).then(([creative, thumbnails]) => {
      if (cancelled) return;
      void import("@inneranimalmedia/copro-render/transitions").then(module=>setTransitionFactory(()=>module.createCoProTransitionRenderer));
      void import("@inneranimalmedia/copro-templates/motion").then(module=>setMotionSampler(()=>module.sampleAnimation));
      const previewProjects=new Map(creative.CREATIVE_TEMPLATES.map((template:any)=>[template.id,creative.createCreativeProject(template.id,{projectId:"preview:"+template.id})]));
      setCreativePreviewRenderer(()=>(id:string,timeUs:number)=>{
        const template=previewProjects.get(id);
        return template?creative.renderCreativeProjectFrame(template,Math.floor(timeUs)):null;
      });
      const byId = new Map(creative.CREATIVE_TEMPLATES.map((template) => [template.id,template]));
      setCreativeAssets(current => current.map(asset => {
        const template = byId.get(asset.id);
        const thumbName = asset.previewFile?.split("/").pop() ?? "";
        return {
          ...asset,
          previewUrl: thumbnails.CREATIVE_THUMBNAILS[thumbName] ?? "",
          ...(template ? {
            group: template.metadata.creative.category,
            aspectRatio: template.canvas.width > template.canvas.height ? "16:9" : "9:16",
            description: template.description,
          } : {}),
        };
      }));
    }).catch((error) => console.warn("CoPro creative catalog assets could not load",error));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const hasMotion = project.tracks.some((track:any) => track.clips.some((clip:any) => Boolean(clip.metadata?.motion?.id)));
    const hasGraphic = project.tracks.some((track:any) => track.clips.some((clip:any) => Boolean(clip.metadata?.graphic?.id)));
    if ((!hasMotion || motionSampler) && (!hasGraphic || graphicSampler)) return;
    let cancelled = false;
    void import("@inneranimalmedia/copro-templates/motion").then((motion) => {
      if (cancelled) return;
      if (hasMotion && !motionSampler) setMotionSampler(() => motion.sampleAnimation);
      if (hasGraphic && !graphicSampler) setGraphicSampler(() => (graphic: Parameters<CoProGraphicSampler>[0],timeUs: number) => {
        if (graphic.id === "typewriter" && graphic.sequence) return motion.sampleTypewriter(graphic.sequence as any,timeUs);
        if (graphic.id === "counter" && graphic.values) return {text:motion.sampleCounter(graphic.values,timeUs,{durationUs:graphic.durationUs,decimals:graphic.decimals}).text};
        return null;
      });
    }).catch((error) => console.warn("CoPro motion/graphic samplers could not load",error));
    return () => { cancelled = true; };
  }, [project,motionSampler,graphicSampler]);

  useEffect(()=>{
    if(creativeRenderer || !project.tracks.some((track:any)=>track.clips.some((clip:any)=>clip.metadata?.creative)))return;
    let cancelled=false;
    void import("@inneranimalmedia/copro-templates/creative").then(module=>{if(!cancelled)setCreativeRenderer(()=>module.renderCreativeProjectFrame);});
    return()=>{cancelled=true;};
  },[project.id,creativeRenderer]);
  useEffect(() => {
    if (!creativeRenderer) return;
    const hasCreative = project.tracks.some((track:any) => track.clips.some((clip:any) => Boolean(clip.metadata?.creative)));
    if (!hasCreative) return;
    const duration=Math.max(1,...project.tracks.flatMap((track:any)=>track.clips.map((clip:any)=>clip.startUs+clip.durationUs)));
    const svg = creativeRenderer(project,Math.min(duration-1,Math.max(0,playheadUs)));
    if (!svg) { setPreviewSrc(null); setPreviewKind(null); return; }
    setPreviewSrc("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
    setPreviewKind("image");
  }, [project,playheadUs,creativeRenderer]);

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
          id:record.id, name:record.name || file.name,
          kind:/\.glb$/i.test(file.name)?'scene':kind, url,
          durationUs:record.durationUs, file, waveform:record.waveform, thumbnails:record.thumbnails,
          width:record.width, height:record.height,
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
    // Only wire a media URL when the selected clip actually references that asset.
    // Never fall back to "any imported image" — that leaked house photos into empty
    // / template projects and lied about timeline state.
    if (previewSrc || !restored || mediaItems.length === 0 || !selectedClipId) return;
    const selected = project.tracks.flatMap((track) => track.clips).find((clip) => clip.id === selectedClipId);
    if (!selected?.assetId) return;
    const matching = mediaItems.find((item) => item.id === selected.assetId);
    if (matching && (matching.kind === "video" || matching.kind === "image")) {
      setPreviewSrc(matching.url);
      setPreviewKind(matching.kind);
    }
  }, [project, selectedClipId, mediaItems, previewSrc, restored]);

  useEffect(() => {
    if (standalone) installCoProBrandIcons();
    void refreshSavedProjects();
    let cancelled = false;
    void (initialProjectId.current?store.load(initialProjectId.current):store.loadRecent()).then((recent) => {
      if (cancelled) return;
      if (!recent) {
        // A generated deep link may be opened in a fresh browser without any
        // saved record. Create that project instead of silently editing an
        // unsavable throwaway session whose URL cannot be reopened.
        if (initialProjectId.current?.startsWith('project:new:')) {
          const next=createCoProProject({id:initialProjectId.current,title:'Untitled project'});
          autosaveProjectId.current=next.id;
          sessionRef.current=new CoProEditorSession(next);
          setProject(sessionRef.current.project);
          void store.save(next).then(()=>refreshSavedProjects()).catch(error=>{
            setMediaPersistenceError('The new project could not be saved locally. Check browser storage.');
            console.error('MovieMode project creation failed',error);
          });
        }
        setRestored(true);
        return;
      }
      autosaveProjectId.current=recent.id;
      sessionRef.current = new CoProEditorSession(recent);
      setProject(sessionRef.current.project);
      setSelectedClipId(recent.tracks.flatMap((track:any) => track.clips)[0]?.id ?? null);
      setPlayheadUs(0);
      setRestored(true);
    }).catch(()=>{
      if(cancelled)return;
      setMediaPersistenceError("Could not open the saved project. Return to Projects and try another edit.");
      setRestored(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!restored || autosaveProjectId.current!==project.id) return;
    const timer = window.setTimeout(() => {
      if(autosaveProjectId.current!==project.id)return;
      void store.save(project).then(() => refreshSavedProjects()).catch((error) => {
        console.error("CoPro local save failed", error);
        setMediaPersistenceError("Your latest changes could not be saved. Free storage and try again.");
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [project, restored]);

  function installProject(next: any, selectedId: string | null = null) {
    autosaveProjectId.current=next.id;
    setPreviewSrc(null);
    setPreviewKind(null);
    setCreativeRenderer(null);
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
    const generation=++projectOpenGeneration.current;
    if(autosaveProjectId.current===sessionRef.current.project.id)await store.save(sessionRef.current.project);
    const summary = projects.find((item) => item.id === id);
    const saved = summary?.example ? null : await store.load(id);
    if (generation!==projectOpenGeneration.current || (!summary?.example && !saved)) return;
    if (saved?.tracks.some((track:any)=>track.clips.some((clip:any)=>clip.metadata?.creative))) {
      const creative=await import("@inneranimalmedia/copro-templates/creative");
      installProject(saved);
      setCreativeRenderer(()=>creative.renderCreativeProjectFrame);
      setInitialTool(null);showScreen("editor");return;
    }
    const next = saved ?? makeDemoProject("project:example-copy:" + Date.now(), (summary?.title ?? "CoPro") + " (example)");
    await store.save(next);
    installProject(next);
    setInitialTool(null);
    setPreviewSrc(null);
    setPreviewKind(null);
    showScreen("editor");
  }

  async function openCreativeTemplate(id: string) {
    const creative = await import("@inneranimalmedia/copro-templates/creative");
    // Discover → Select → Instantiate → Persist → Open. Never overwrite the open project.
    const next = creative.createCreativeProject(id, {
      projectId: "project:from-template:" + id.replace(/^creative:/, "") + ":" + Date.now(),
      now: new Date(),
    });
    if (next.metadata?.provenance && typeof next.metadata.provenance === "object") {
      next.metadata.provenance = {
        ...next.metadata.provenance,
        createdFrom: "moviemode.templates.create_project",
      };
    }
    // Clear any previous session preview before installing so foreign media cannot leak in.
    setPreviewSrc(null);
    setPreviewKind(null);
    await store.save(next);
    await refreshSavedProjects();
    const creativeClip = next.tracks.flatMap((track: any) => track.clips).find((clip: any) => clip.metadata?.creative);
    const previewTimeUs = Math.min(1_200_000, Math.max(0, (creativeClip?.durationUs ?? 1) - 1));
    const svg = creative.renderCreativeProjectFrame(next, previewTimeUs);
    installProject(next, creativeClip?.id ?? null);
    setCreativeRenderer(() => creative.renderCreativeProjectFrame);
    setPlayheadUs(previewTimeUs);
    setPreviewSrc(svg ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg) : null);
    setPreviewKind(svg ? "image" : null);
    setInitialTool(null);
    setHomeSection("home");
    showScreen("editor");
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

  async function createBlank(tool: "text" | "captions" | null = null) {
    ++projectOpenGeneration.current;
    if(autosaveProjectId.current===sessionRef.current.project.id)await store.save(sessionRef.current.project);
    setCreativeRenderer(null);
    const next = createCoProProject({ id:"project:new:" + Date.now(), title:"Untitled project" });
    next.tracks.push(createTrack({ id:"track:video", kind:"video", name:"Video" }));
    setPreviewSrc(null);
    setPreviewKind(null);
    setPlayheadUs(0);
    installProject(next, null);
    setInitialTool(tool);
    await store.save(next);
    showScreen("editor");
  }

  const onboardingStudioOpened = useRef(false);
  useEffect(() => {
    if (!standalone || !restored || onboardingStudioOpened.current) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('studio') !== 'new') return;
    onboardingStudioOpened.current = true;
    url.searchParams.delete('studio');
    window.history.replaceState(window.history.state, '', url);
    void createBlank().catch(error => console.error('PrimeTech onboarding studio handoff failed', error));
  }, [restored, standalone]);

  function cacheScenePoster(id:string,dataUrl:string) {
    if(scenePosterRef.current.has(id)||!dataUrl.startsWith('data:image/'))return;
    const item=mediaItems.find(media=>media.id===id);
    if(!item||item.kind!=='scene')return;
    scenePosterRef.current.add(id);
    const updated={...item,thumbnails:[dataUrl]};
    setMediaItems(current=>current.map(media=>media.id===id?updated:media));
    if(sourceStore)void sourceStore.put({id:item.id,name:item.name,kind:item.kind,file:item.file,
      durationUs:item.durationUs,width:item.width,height:item.height,thumbnails:updated.thumbnails})
      .catch(error=>console.warn('3D cover persistence unavailable',error));
  }

  async function importLocalSamSceneSource(source:LocalSceneSource) {
    if(localSceneSourceBusyId)return;
    setLocalSceneSourceBusyId(source.id);
    try {
      const response=await fetch(source.url);
      if(!response.ok)throw new Error(`Local SamScene source could not load (${response.status})`);
      const blob=await response.blob();
      const type=source.kind==='scene'?'model/gltf-binary':source.name.toLowerCase().endsWith('.mov')?'video/quicktime':'video/mp4';
      const file=new File([blob],source.name,{type,lastModified:Date.now()});
      const item=await registerSessionMedia(file);
      addSessionMediaToTimeline(item,playheadUs);
      setMediaPersistenceError(null);
    }catch(error){setMediaPersistenceError(error instanceof Error?error.message:String(error));}
    finally{setLocalSceneSourceBusyId(null);}
  }

  async function importFile(file: File) {
    setCreativeRenderer(null);
    const item = await registerSessionMedia(file);
    const old = previewSrc;
    // Source URLs are owned by the media cache and remain valid for other projects.
    const next = makeImportedProject(file,item);
    installProject(next, "clip:imported");
    await store.save(next);
    setPreviewSrc(item.url);
    setPreviewKind(item.kind === "image" ? "image" : item.kind === "video" ? "video" : null);
    setInitialTool(null);
    showScreen("editor");
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
        void importFile(file);
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
    const target = await store.load(id);
    const allProjects = await store.list();
    const targetAssetIds = new Set((target?.tracks ?? []).flatMap((track:any)=>(track.clips ?? []).map((clip:any)=>clip.assetId)));
    const sharedAssetIds = new Set(allProjects.filter((entry:any)=>entry.id!==id).flatMap((entry:any)=>(entry.tracks ?? []).flatMap((track:any)=>(track.clips ?? []).map((clip:any)=>clip.assetId))));
    await store.remove(id);
    if(sessionRef.current.project.id===id) {
      autosaveProjectId.current=null;
      const next=createCoProProject({id:"project:new:"+Date.now(),title:"Untitled project"});
      sessionRef.current=new CoProEditorSession(next);
      setPreviewSrc(null);setPreviewKind(null);setCreativeRenderer(null);setSelectedClipId(null);setPlayheadUs(0);
      // Do not autosave a replacement until a user creates or opens a project.
    }
    const exclusiveAssetIds = [...targetAssetIds].filter(assetId=>!sharedAssetIds.has(assetId));
    for (const assetId of exclusiveAssetIds) {
      await sourceStore?.remove(assetId);
      const url=mediaUrlsRef.current.get(assetId);
      if(url){URL.revokeObjectURL(url);mediaUrlsRef.current.delete(assetId);}
    }
    if(exclusiveAssetIds.length)setMediaItems(current=>current.filter(item=>!exclusiveAssetIds.includes(item.id)));
    await refreshSavedProjects();
  }

  async function duplicateSavedProject(id: string) {
    const original = await store.load(id);
    if (!original) return;
    await store.save({ ...original, id:`project:copy:${Date.now()}:${Math.random().toString(36).slice(2,6)}`, title:`${original.title} (copy)`, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() });
    await refreshSavedProjects();
  }

  async function registerSessionMedia(file: File): Promise<SessionMediaItem> {
    if (!file.type.startsWith('audio/') && !file.type.startsWith('image/') &&
        !file.type.startsWith('video/') && !/\.glb$/i.test(file.name)) {
      throw new Error('Unsupported media type. Import a GLB scene, video, audio, or image.');
    }
    const kind: SessionMediaItem["kind"] =
      /\.glb$/i.test(file.name) ? "scene" :
      file.type.startsWith("audio/") ? "audio" :
      file.type.startsWith("image/") ? "image" :
      "video";

    const id = mediaIdForFile(file);
    const existing = mediaItems.find((item) => item.id === id);
    if (existing) {
      const probed = existing.kind !== "audio" && (!existing.width || !existing.height)
        ? await probeMediaMetadata(file) : null;
      const refreshed = probed ? {...existing,...probed} : existing;
      if (refreshed !== existing) setMediaItems(current=>current.map(item=>item.id===id?refreshed:item));
      if (sourceStore) void sourceStore.put({
        id:refreshed.id, name:refreshed.name, kind:refreshed.kind, file:refreshed.file,
        durationUs:refreshed.durationUs, waveform:refreshed.waveform, thumbnails:refreshed.thumbnails,
        width:refreshed.width, height:refreshed.height,
      }).then(() => setMediaPersistenceError(null)).catch(() => setMediaPersistenceError("Source media could not be saved. Check available device storage."));
      return refreshed;
    }

    const probed = kind==='scene' ? {durationUs:8_000_000} : await probeMediaMetadata(file);
    let durationUs = probed.durationUs;
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
      width:'width' in probed?probed.width:undefined,
      height:'height' in probed?probed.height:undefined,
      file,
      waveform,
    };
    mediaUrlsRef.current.set(id,item.url);
    setMediaItems((current) => current.some((candidate) => candidate.id === id) ? current : [...current, item]);
    if (sourceStore) {
      try {
        await sourceStore.put({ id, name:item.name, kind, file, durationUs, waveform, width:item.width, height:item.height });
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
          try { await sourceStore.put({id,name:item.name,kind,file,durationUs,waveform,width:item.width,height:item.height,thumbnails:frames}); }
          catch(error){console.warn("CoPro thumbnail cache could not persist",error);}
        }
        void refreshSavedProjects();
      }).catch(error=>console.warn("Video thumbnail preparation unavailable",error));
    }
    return item;
  }

  function addSessionMediaToTimeline(item: SessionMediaItem, atUs: number) {
    const session = sessionRef.current;
    const kind = item.kind === "audio" ? "audio" : item.kind === "image" ? "overlay" : "video";

    let currentProject = session.project;
    const hasVisualSource = currentProject.tracks.some((entry:any)=>entry.clips.some((clip:any)=>clip.metadata?.mimeType?.startsWith("video/")||clip.metadata?.mimeType?.startsWith("image/")));
    if ((item.kind==="video"||item.kind==="image") && item.width && item.height && !hasVisualSource) {
      currentProject=session.execute({type:"project.set_canvas",payload:{width:item.width,height:item.height,frameRate:currentProject.canvas?.frameRate??30}});
    }
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
      startUs:currentProject.tracks.every((entry:any)=>entry.clips.length===0)?0:atUs,
      durationUs:item.durationUs ?? 3_000_000,
      metadata:{
        fileName:item.name,
        mimeType:item.file.type,
        ...(item.kind==='scene'?{sourceKind:'samscene-timeline-cue',sceneCue:{kind:'scene-object',objectId:item.id},world3d:{visible:true}}:{}),
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
    if ("clipId" in action && session.project.tracks.some((track:any)=>track.locked && track.clips.some((clip:any)=>clip.id===action.clipId))) return;

    if (action.type === "back") { if(autosaveProjectId.current===session.project.id)await store.save(session.project); await refreshSavedProjects(); setHomeSection("home"); showScreen("projects"); return; }
    if (action.type === "apply-template") {
      const creative = await import("@inneranimalmedia/copro-templates/creative");
      if (session !== sessionRef.current) return;
      const template = creative.createCreativeProject(action.id, {projectId:"template:"+Date.now(),now:new Date()});
      const prefix = "applied:"+Date.now()+":";
      const tracks = template.tracks.map((track:any)=>({...track,id:prefix+track.id,clips:track.clips.map((clip:any)=>({...clip,id:prefix+clip.id,startUs:clip.startUs+playheadUs}))}));
      const next = session.execute({type:"project.apply_template",payload:{tracks,canvas:template.canvas}});
      setProject(next);
      setSelectedClipId(tracks.flatMap((track:any)=>track.clips).find((clip:any)=>clip.metadata?.creative)?.id ?? null);
      setCreativeRenderer(()=>creative.renderCreativeProjectFrame);
      return;
    }
    if (action.type === "set-cover") {
      setProject(session.execute({type:"project.set_cover",payload:{cover:action.cover}}));
      return;
    }
    if (action.type === "rename-media" || action.type === "delete-media") {
      const item = mediaItems.find(item=>item.id===action.id);
      if (!item || !sourceStore) return;
      try {
        if (action.type === "delete-media") {
          await sourceStore.remove(item.id);
          setMediaItems(items=>items.filter(value=>value.id!==item.id));
          mediaUrlsRef.current.delete(item.id);
        } else {
          await sourceStore.put({...item,name:action.name});
          setMediaItems(items=>items.map(value=>value.id===item.id?{...value,name:action.name}:value));
        }
        await refreshSavedProjects();
      } catch {setMediaPersistenceError("Could not update this file. Try again.");}
      return;
    }
    if (action.type === "browse-templates") return;
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
    if (action.type === "set-canvas") {
      setProject(session.execute({type:"project.set_canvas",payload:action.canvas}));
      return;
    }
    if (action.type === "move") { setProject(session.execute({ type:"clip.move", payload:{ clipId:action.clipId, startUs:action.startUs } })); return; }
    if (action.type === "trim") { setProject(session.execute({ type:"clip.trim", payload:{ clipId:action.clipId, ...action.patch } })); return; }
    if (action.type === "speed") { setProject(session.execute({ type:"clip.set_speed", payload:{ clipId:action.clipId, playbackRate:action.playbackRate } })); return; }
    if (action.type === "volume") { setProject(session.execute({ type:"clip.set_volume", payload:{ clipId:action.clipId, volume:action.volume } })); return; }
    if (action.type === "transform") { setProject(session.execute({ type:"clip.set_transform", payload:{ clipId:action.clipId, ...action.patch } })); return; }
    if (action.type === "world3d") { setProject(session.execute({ type:"clip.set_world3d", payload:{clipId:action.clipId,patch:action.patch} })); return; }
    if (action.type === "adjustments") { setProject(session.execute({ type:"clip.set_adjustments", payload:{ clipId:action.clipId, patch:action.patch } })); return; }
    if (action.type === "mask") { setProject(session.execute({ type:"clip.set_mask", payload:{ clipId:action.clipId, mask:action.mask } })); return; }
    if (action.type === "environment") { setProject(session.execute({ type:"project.set_environment", payload:{patch:action.patch} })); return; }
    if (action.type === "text") { setProject(session.execute({ type:"clip.set_text", payload:{ clipId:action.clipId, text:action.text } })); return; }
    if (action.type === "effect") { setProject(session.execute({ type:"clip.set_effect", payload:{ clipId:action.clipId, effect:action.effect } })); return; }
    if (action.type === "transition") { setProject(session.execute({ type:"clip.set_transition", payload:{ clipId:action.clipId, transition:action.transition, durationUs:action.durationUs, direction:action.direction, easing:action.easing } })); return; }
    if (action.type === "motion") {
      if (action.motion === "none") {
        setProject(session.execute({type:"clip.set_motion",payload:{clipId:action.clipId,motion:"none"}}));
        return;
      }
      const motion = await import("@inneranimalmedia/copro-templates/motion");
      const definition = motion.ANIMATIONS.find((item) => item.id === action.motion);
      if (!definition) return;
      setMotionSampler(() => motion.sampleAnimation);
      setProject(session.execute({type:"clip.set_motion",payload:{clipId:action.clipId,motion:action.motion,durationUs:action.durationUs ?? definition.durationUs,delayUs:action.delayUs,amplitude:action.amplitude}}));
      return;
    }
    if (action.type === "graphic") {
      if (action.graphic === "none") {
        setProject(session.execute({type:"clip.set_graphic",payload:{clipId:action.clipId,graphic:null}}));
        return;
      }
      const motion = await import("@inneranimalmedia/copro-templates/motion");
      const clip = session.project.tracks.flatMap((track:any) => track.clips).find((item:any) => item.id === action.clipId);
      let graphic: Record<string,unknown>;
      if (action.graphic === "typewriter") {
        const text = String(action.text ?? clip?.metadata?.graphic?.text ?? clip?.metadata?.text ?? "Make something worth remembering.");
        const sequence = motion.createTypewriterEvents([text]);
        graphic = {id:"typewriter",text,durationUs:sequence.durationUs,sequence};
      } else if (action.graphic === "counter") {
        graphic = {id:"counter",durationUs:2_000_000,values:[0,25,50,75,100],decimals:0};
      } else return;
      setGraphicSampler(() => (value: Parameters<CoProGraphicSampler>[0],timeUs: number) => {
        if (value.id === "typewriter" && value.sequence) return motion.sampleTypewriter(value.sequence as any,timeUs);
        if (value.id === "counter" && value.values) return {text:motion.sampleCounter(value.values,timeUs,{durationUs:value.durationUs,decimals:value.decimals}).text};
        return null;
      });
      setProject(session.execute({type:"clip.set_graphic",payload:{clipId:action.clipId,graphic}}));
      return;
    }
    if (action.type === "creative-parameters") {
      setProject(session.execute({type:"clip.set_creative_parameters",payload:{clipId:action.clipId,patch:action.patch}}));
      return;
    }
    if (action.type === "track-state") { setProject(session.execute({ type:"track.set_state", payload:{ trackId:action.trackId, ...action.patch } })); return; }
    if (action.type === "track-reorder") { setProject(session.execute({ type:"track.reorder", payload:{ trackId:action.trackId, index:action.index } })); return; }

    if (action.type === "import-media-batch") {
      let nextAtUs = session.project.tracks.every((track:any)=>!track.clips.length)?0:action.atUs;
      for (const file of action.files) {
        const item = await registerSessionMedia(file);
        if (session !== sessionRef.current) return;
        addSessionMediaToTimeline(item, nextAtUs);
        nextAtUs += item.durationUs ?? 3_000_000;
      }
      return;
    }

    if (action.type === "import-media") {
      const item = await registerSessionMedia(action.file);
      if (session !== sessionRef.current) return;
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
    return <div  className={navScope+"copro-boot"}><span>PrimeTech</span><small>Restoring your projects…</small></div>;
  }

  if (screen === "projects") {
    return <div  className={navScope+"copro-app-root"} data-standalone={standalone?"true":undefined}>
      <CoProProjectsScreen
        projects={projects}
        creativeAssets={creativeAssets}
        onOpenCreativeTemplate={(id) => void openCreativeTemplate(id)}
        initialSection={homeSection}
        onOpenProject={openProject}
        onCreate={() => {setStudioEntryMode("video"); void createBlank();}}
        onOpenStudioMode={(mode) => {setStudioEntryMode(mode); void createBlank();}}
        onImport={() => homeFileRef.current?.click()}
        recording={recording}
        onRecord={() => void startScreenRecording()}
        onStopRecording={stopScreenRecording}
        onOpenTool={(tool) => void createBlank(tool)}
        onRenameProject={renameProject}
        onDeleteProject={deleteSavedProject}
        onDuplicateProject={(id) => void duplicateSavedProject(id)}
        appIconUrl={standalone ? "/brand/p-prime-spectrum-128.avif" : coproAppManifest.iconBaseUrl ? coproAppManifest.iconBaseUrl + "/small" : undefined}
        systemIcons={MOVIEMODE_SYSTEM_ICONS}
      />
      <input ref={homeFileRef} type="file" accept="video/*,image/*,audio/*,.glb,model/gltf-binary" className="copro-hidden-source-input" aria-label="Select a video, 3D GLB scene, image or audio file" onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        if (file) void importFile(file);
        event.currentTarget.value = "";
      }}/>
      {captureError && <div role="alert" className="mm-capture-error">{captureError}<button onClick={() => setCaptureError(null)} aria-label="Dismiss error">×</button></div>}
    </div>;
  }

  return <div  className={navScope+"copro-app-root"} data-standalone={standalone?"true":undefined}>
    {mediaPersistenceError && <div role="alert" className="copro-source-storage-warning">
      <strong>Source storage needs attention. </strong>{mediaPersistenceError}
      <button type="button" onClick={() => setMediaPersistenceError(null)} aria-label="Dismiss storage warning" className="copro-storage-warning-dismiss">Dismiss</button>
    </div>}
    <CoProStudio
    key={projectSeed}
    initialTool={initialTool}
    initialStudioMode={studioEntryMode}
    samSceneSkyDefaults={SAMSCENE_SKY_DEFAULTS}
    stageSkies={registrySkies}
    project={project as any}
    projectTitle={project.title}
    playheadUs={playheadUs}
    selectedClipId={selectedClipId}
    canUndo={sessionRef.current.canUndo}
    canRedo={sessionRef.current.canRedo}
    previewSrc={previewSrc}
    previewKind={previewKind}
    mediaItems={mediaItems}
    localSceneSources={localSceneSources}
    localSceneSourceBusyId={localSceneSourceBusyId}
    onImportLocalSceneSource={source=>void importLocalSamSceneSource(source)}
    render3DScene={({url,name,assetId,timeUs,playing,environment,transform})=>{
      // The same CoPro world3d evaluator that drives world export resolves which
      // scene object is active and its source-animation time at this playhead.
      const frame=evaluateWorld3DFrame(project,playheadUs);
      const active=frame.objects.find(object=>mediaItems.some(media=>media.id===object.assetId&&media.url===url));
      return <CoProWorldScene src={url} title={name} timeUs={active?.sourceTimeUs??timeUs}
        playing={playing} skyVideoSrc={mediaItems.find(item=>item.kind==='video'&&item.id===environment?.skyVideoAssetId)?.url}
        environment={environment} transform={transform}
        world3dTransform={(project.tracks.flatMap(track=>track.clips).find(clip=>clip.id===active?.clipId)?.metadata?.world3d as {transform?:{x?:number;y?:number;z?:number;rotationYDeg?:number;scale?:number;opacity?:number}}|undefined)?.transform}
        world3dVisible={active?.visible!==false}
        onThumbnail={dataUrl=>cacheScenePoster(assetId,dataUrl)} />;
    }}
    creativeAssets={creativeAssets}
    systemIcons={MOVIEMODE_SYSTEM_ICONS}
    onOpenCreativeTemplate={(id) => void commit({type:"apply-template",id})}
    createTransitionPreview={transitionFactory}
    renderCreativePreview={creativePreviewRenderer}
    sampleMotion={motionSampler ?? undefined}
    sampleGraphic={graphicSampler ?? undefined}
    onMediaAdd={(id, atUs) => {
      const item = mediaItems.find((entry) => entry.id === id);
      if (item) addSessionMediaToTimeline(item, atUs);
    }}
    onSeek={setPlayheadUs}
    onSelectClip={setSelectedClipId}
    onAction={commit}
  />
  </div>;
}
