import { IconAction } from "./icon-action.js";
import type { CoProCreativeAsset, CoProMotionSampler, CoProGraphicSampler, CoProTransitionPreviewFactory } from "./creative-types.js";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, AudioLines, Captions, ChevronRight, Copy, Film, Move3D,
  Layers, Play, Pause, Redo2, Scissors, SlidersHorizontal, Sparkles,
  Trash2, Type, Undo2, X, Gauge, Volume2, Replace, Clapperboard, PanelLeftClose, PanelRightClose, PanelsTopLeft, RotateCcw,
  Sticker, Palette, Sun, SlidersVertical, Folder, Download, Film as FilmIcon, GripVertical, PanelsTopLeft as DockIcon, ExternalLink, Box, ZoomIn, Maximize2, Ratio, ChevronDown,
} from "lucide-react";
import { CoProTimeline, type CoProProjectView } from "./timeline.js";
import { CoProToolPanel, type CoProMediaShelfItem, type CoProClipMask } from "./tool-sheet.js";
import { colorAdjustmentPreviewFilter, type CoProColorAdjustments } from "./color-adjustments.js";
import { CoProMediaBrowser, type CoProMediaBrowserSection, type LocalSceneSource } from "./media-browser.js";
import { CoProSystemIcon, type CoProSystemIconMap } from "./system-icon.js";
import { ResizeHandle, useWorkspaceLayout, clampWorkspaceSize } from "./workspace-layout-moviemode.js";

import { STAGE_ENVIRONMENT_DEFAULTS, STAGE_SKIES, stageLookBackground, type CoProStageEnvironment, type StageSky } from "./stage-environment.js";
import { CoProStageLookPanel } from "./stage-look-panel.js";
import { syncVideoPlayback } from "./video-playback.js";
import {SidePanel} from "@inneranimalmedia/agentsam-workbench/shell";


export type CoProStudioAction =
  | { type: "back" }
  | { type: "export-project" }
  | { type: "browse-templates" }
  | { type: "apply-template"; id: string }
  | { type: "set-cover"; cover: {kind:"frame"|"upload";url:string;timeUs?:number}|null }
  | { type: "rename-media"; id:string; name:string }
  | { type: "delete-media"; id:string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "split"; clipId: string; atUs: number }
  | { type: "duplicate"; clipId: string }
  | { type: "delete"; clipId: string }
  | { type: "move"; clipId: string; startUs: number }
  | { type: "trim"; clipId: string; patch: { startUs?: number; inUs?: number; durationUs?: number } }
  | { type: "speed"; clipId: string; playbackRate: number }
  | { type: "volume"; clipId: string; volume: number }
  | { type: "transform"; clipId: string; patch: { scale?: number; x?: number; y?: number; rotation?: number; opacity?: number } }
  | { type: "world3d"; clipId:string; patch:{transform?:{x?:number;y?:number;z?:number;rotationYDeg?:number;scale?:number;opacity?:number};visible?:boolean} }
  | { type: "text"; clipId: string; text: string }
  | { type: "effect"; clipId: string; effect: string }
  | { type: "transition"; clipId: string; transition: string; durationUs?: number; direction?:string; easing?:string }
  | { type: "motion"; clipId: string; motion: string; durationUs?: number; delayUs?:number; amplitude?:number }
  | { type: "graphic"; clipId: string; graphic: string; text?: string }
  | { type: "creative-parameters"; clipId: string; patch: Record<string, unknown> }
  | { type: "adjustments"; clipId: string; patch: CoProColorAdjustments }
  | { type: "mask"; clipId:string; mask:CoProClipMask|null }
  | { type: "environment"; patch:CoProStageEnvironment|null }
  | { type: "create-text"; kind: "overlay" | "captions"; text: string; atUs: number }
  | { type: "import-media"; file: File; atUs: number }
  | { type: "import-media-batch"; files: File[]; atUs: number }
  | { type: "add-track" }
  | { type: "track-state"; trackId: string; patch: { visible?: boolean; muted?: boolean; locked?: boolean } }
  | { type: "track-reorder"; trackId: string; index: number }
  | { type: "set-canvas"; canvas: { width: number; height: number; frameRate?: number } };

export type CoProStudioProps = {
  /** Where the PrimeTech onboarding/tour is mounted for this host (standalone dev root vs embedded /moviemode/). */
  onboardingUrl?: string;
  project: CoProProjectView;
  initialTool?: "text" | "captions" | null;
  initialStudioMode?: "scene" | "design" | "generate" | "video";
  stageSkies?:readonly StageSky[];
  samSceneSkyDefaults?:Record<string,Pick<CoProStageEnvironment,'skyProgression'|'cloudDensity'|'starIntensity'|'galaxyIntensity'|'auroraIntensity'|'stars'>>;
  playheadUs: number;
  selectedClipId?: string | null;
  canUndo?: boolean;
  canRedo?: boolean;
  projectTitle?: string;
  previewSrc?: string | null;
  previewKind?: "video" | "image" | null;
  /** Transparent SVG composition layer rendered above active footage or a 3D scene. */
  creativeOverlaySrc?: string | null;
  mediaItems?: CoProMediaShelfItem[];
  localSceneSources?:LocalSceneSource[];
  localSceneSourceBusyId?:string|null;
  onImportLocalSceneSource?: (source:LocalSceneSource)=>void;
  render3DScene?: (args:{url:string;name:string;assetId:string;timeUs:number;playing:boolean;environment?:CoProStageEnvironment;adjustments?:CoProColorAdjustments;transform:{scale?:number;x?:number;y?:number;rotation?:number;opacity?:number}})=>React.ReactNode;
  creativeAssets?: CoProCreativeAsset[];
  systemIcons?: CoProSystemIconMap;
  createTransitionPreview?:CoProTransitionPreviewFactory;
  renderCreativePreview?: (id:string,timeUs:number)=>string|null;
  sampleMotion?: CoProMotionSampler;
  sampleGraphic?: CoProGraphicSampler;
  onSeek?: (timeUs: number) => void;
  onSelectClip?: (clipId: string | null) => void;
  onMediaAdd?: (id: string, atUs: number) => void;
  onOpenCreativeTemplate?: (id: string) => void;
  onAction?: (action: CoProStudioAction) => void;
};

const PRIMARY_TOOLS = [
  ["media", "Media", "+"],
  ["stage", "Scene", "☀"],
  ["audio", "Audio", "♫"],
  ["text", "Text", "T"],
  ["captions", "Captions", "CC"],
  ["effects", "Effects", "✦"],
  ["transitions", "Transitions", "◇"],
  ["templates", "Templates", "▦"],
  ["3d", "3D Tools", "◇"],
  ["scenes", "Beats", "▤"],
  ["models", "Models", "◈"],
] as const;

const SECONDARY_TOOLS = [
  ["stickers", "Stickers"], ["filters", "Filters"], ["adjustments", "Adjustments"],
] as const;

const CLIP_TOOLS = [
  ["split", "Split", "⌁"],
  ["trim", "Trim", "↔"],
  ["speed", "Speed", "1×"],
  ["volume", "Volume", "◖"],
  ["effects", "Effects", "✦"],
  ["transitions", "Transitions", "◇"],
  ["duplicate", "Duplicate", "▣"],
  ["delete", "Delete", "⌫"],
] as const;

const HANDSET_PRIMARY_TOOLS = [
  ["media", "Media"],
  ["audio", "Audio"],
  ["text", "Text"],
  ["effects", "Effects"],
  ["more", "More"],
] as const;

const CANVAS_RATIOS = [
  { label:"16:9", width:1920, height:1080 },
  { label:"4:3", width:1440, height:1080 },
  { label:"2.35:1", width:1920, height:817 },
  { label:"2:1", width:1920, height:960 },
  { label:"1.85:1", width:1920, height:1038 },
  { label:"9:16", width:1080, height:1920 },
  { label:"3:4", width:1080, height:1440 },
  { label:"1:1", width:1080, height:1080 },
  { label:"Phone · 19.5:9", width:1170, height:2532 },
] as const;

const HANDSET_MORE_TOOLS = [
  ["captions", "Captions", "Timed subtitles and dialogue"],
  ["stickers", "Stickers", "Shapes, arrows and callouts"],
  ["transitions", "Transitions", "Motion between clips"],
  ["filters", "Filters", "Looks and color presets"],
  ["stage", "Scene", "Environment, lighting and scene materials"],
  ["adjustments", "Adjustments", "Color and geometry controls"],
  ["templates", "Templates", "Editable starting compositions"],
  ["3d", "3D Tools", "Object and scene creation tools"],
  ["scenes", "Beats", "Imported models and timeline scene cues"],
  ["models", "Models", "Browse available editable GLB model sources"],
] as const;

function renderToolIcon(id: string, systemIcons?: CoProSystemIconMap) {
  const size = 21;
  const systemName: Record<string, string> = {
    media: "media",
    audio: "audio",
    text: "document",
    captions: "message",
    stickers: "favorite",
    filters: "filter",
    stage: "adjust",
    adjustments: "adjust",
    effects: "aperture",
    transitions: "layers",
    templates: "film",
    "3d": "layers",
    scenes: "layers",
    models: "layers",
    split: "cut",
    trim: "select",
    speed: "time",
    volume: "audio",
    duplicate: "duplicate",
    delete: "delete",
  };
  const canonical = systemName[id];
  if (canonical && systemIcons?.[canonical]) {
    return <CoProSystemIcon name={canonical} icons={systemIcons} size={size} />;
  }
  switch (id) {
    case "media": return <Film size={size}/>;
    case "more": return <Folder size={size}/>;
    case "audio": return <AudioLines size={size}/>;
    case "text": return <Type size={size}/>;
    case "captions": return <Captions size={size}/>;
    case "stickers": return <Sticker size={size}/>;
    case "filters": return <Palette size={size}/>;
    case "stage": return <Sun size={size}/>;
    case "adjustments": return <SlidersVertical size={size}/>;
    case "effects": return <Sparkles size={size}/>;
    case "transitions": return <Layers size={size}/>;
    case "templates": return <Clapperboard size={size}/>;
    case "3d": return <Box size={size}/>;
    case "models": return <Box size={size}/>;
    case "split": return <Scissors size={size}/>;
    case "trim": return <Replace size={size}/>;
    case "speed": return <Gauge size={size}/>;
    case "volume": return <Volume2 size={size}/>;
    case "duplicate": return <Copy size={size}/>;
    case "delete": return <Trash2 size={size}/>;
    default: return <SlidersHorizontal size={size}/>;
  }
}

export function CoProStudio({
  project,
  initialTool = null,
  initialStudioMode = "video",
  samSceneSkyDefaults,
  stageSkies,
  playheadUs,
  selectedClipId,
  canUndo = false,
  canRedo = false,
  projectTitle = "Untitled project",
  previewSrc,
  previewKind,
  creativeOverlaySrc,
  mediaItems = [],
  localSceneSources=[],
  localSceneSourceBusyId,
  onImportLocalSceneSource,
  render3DScene,
  creativeAssets = [],
  systemIcons,
  sampleMotion,
  renderCreativePreview,
  createTransitionPreview,
  sampleGraphic,
  onSeek,
  onSelectClip,
  onMediaAdd,
  onOpenCreativeTemplate,
  onAction,
}: CoProStudioProps) {
  const [playing, setPlaying] = useState(false);
  const [previewDecodeWarning, setPreviewDecodeWarning] = useState<string|null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(initialTool);
  const [categoryTool, setCategoryTool] = useState<string>(initialTool ?? "media");
  // One project, one editing runtime. These modes select existing capabilities
  // instead of routing to separate Design/Generate/3D applications.
  const [studioMode,setStudioMode] = useState<"scene"|"design"|"generate"|"video">(() => {
    try {
      const saved=window.localStorage.getItem("primetech.studio.mode:"+project.id);
      return saved==="scene"||saved==="design"||saved==="generate"||saved==="video" ? saved : initialStudioMode;
    } catch { return initialStudioMode; }
  });
  useEffect(()=>{
    try { window.localStorage.setItem("primetech.studio.mode:"+project.id,studioMode); } catch { /* Optional view preference. */ }
  },[project.id,studioMode]);

  const [showMoreTools,setShowMoreTools]=useState(false);
  const moreToolsRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!showMoreTools)return;
    const dismiss=(event:PointerEvent)=>{
      if(!moreToolsRef.current?.contains(event.target as Node))setShowMoreTools(false);
    };
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape')setShowMoreTools(false);
    };
    document.addEventListener('pointerdown',dismiss);
    document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape);};
  },[showMoreTools]);
  const [browserSection, setBrowserSection] = useState<CoProMediaBrowserSection>("import");
  const [panePreference, setPanePreference] = useState<"browser" | "inspector">("browser");
  const [handsetPanel, setHandsetPanel] = useState<"browser" | "inspector" | null>(null);
  const { layout, setLayout, resetLayout } = useWorkspaceLayout();
  const workspaceRef = useRef<HTMLElement>(null);
  const [workspaceWidth, setWorkspaceWidth] = useState(1440);
  const [workspaceBox, setWorkspaceBox] = useState({left:0,top:0,right:Number.POSITIVE_INFINITY,bottom:Number.POSITIVE_INFINITY});
  const [workspaceHeight, setWorkspaceHeight] = useState(800);
  const [playbackQuality, setPlaybackQuality] = useState<"Full"|"High"|"Medium"|"Low">("High");
  const [previewZoom, setPreviewZoom] = useState(100);
  const [previewControlMenu, setPreviewControlMenu] = useState<"quality"|"zoom"|"ratio"|null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewportFullscreen,setViewportFullscreen]=useState(false);
  const [fullscreenHudVisible, setFullscreenHudVisible] = useState(true);
  const playerPaneRef = useRef<HTMLElement>(null);
  const previewStageRef = useRef<HTMLElement>(null);
  const [stageSize,setStageSize] = useState({width:640,height:360});
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverError,setCoverError] = useState<string|null>(null);
  useEffect(()=>{
    const node=previewStageRef.current;
    if(!node||typeof ResizeObserver==="undefined")return;
    const observer=new ResizeObserver(([entry])=>setStageSize({width:Math.max(1,entry.contentRect.width-24),height:Math.max(1,entry.contentRect.height-16)}));
    observer.observe(node);return()=>observer.disconnect();
  },[]);
  const canvasRatio=(project.canvas?.width??1920)/(project.canvas?.height??1080);
  const previewWidth=Math.min(stageSize.width,stageSize.height*canvasRatio);
  function saveCover(source:CanvasImageSource) {
    try {
      const canvas=document.createElement("canvas");canvas.width=640;canvas.height=Math.round(640/canvasRatio);
      canvas.getContext("2d")!.drawImage(source,0,0,canvas.width,canvas.height);
      onAction?.({type:"set-cover",cover:{kind:"frame",url:canvas.toDataURL("image/jpeg",.85),timeUs:playheadUs}});
      setCoverError(null);
    } catch {setCoverError("Could not capture this frame. Upload a cover instead.");}
  }
  async function uploadCover(file:File) {
    if(!file.type.startsWith("image/")){setCoverError("Choose an image for your cover.");return;}
    try {
      const image=await createImageBitmap(file);
      const canvas=document.createElement("canvas");const scale=Math.min(640/image.width,640/image.height,1);canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
      canvas.getContext("2d")!.drawImage(image,0,0,canvas.width,canvas.height);image.close();
      onAction?.({type:"set-cover",cover:{kind:"upload",url:canvas.toDataURL("image/jpeg",.85)}});
      setCoverError(null);
    } catch {setCoverError("Could not open this image. Choose another cover.");}
  }

  useLayoutEffect(() => {
    const node=workspaceRef.current;
    if (!node) return;
    // Match the embedded container before first paint, not a 1440px desktop guess.
    const measureBox=()=>{const r=node.getBoundingClientRect();if(r.width>0&&r.height>0)setWorkspaceBox({left:r.left,top:r.top,right:r.right,bottom:r.bottom});};
    const rect=node.getBoundingClientRect();
    if(rect.width>0) setWorkspaceWidth(rect.width);
    if(rect.height>0) setWorkspaceHeight(rect.height);
    measureBox();
    window.addEventListener("resize",measureBox);
    if (typeof ResizeObserver === "undefined") return () => window.removeEventListener("resize",measureBox);
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setWorkspaceWidth(entry.contentRect.width);
      setWorkspaceHeight(entry.contentRect.height);
      measureBox();
    });
    observer.observe(node);
    return () => { observer.disconnect(); window.removeEventListener("resize",measureBox); };
  }, []);

  useEffect(() => {
    if (selectedClipId) {
      setPanePreference("inspector");
      // The selected object becomes the inspector context. Do not leave an
      // unrelated scene/project panel active from a previous selection.
      setActiveTool(null);
    }
  }, [selectedClipId]);

  const stageEnvironment = project.metadata?.environment as CoProStageEnvironment|undefined;
  const stageSky=(stageSkies?.length?stageSkies:STAGE_SKIES).find(entry=>entry.id===(stageEnvironment?.skyPreset??STAGE_ENVIRONMENT_DEFAULTS.skyPreset))??STAGE_SKIES[0];
  const stageFogColor=stageEnvironment?.fogColor??stageSky?.bottom??STAGE_ENVIRONMENT_DEFAULTS.fogColor;
  const projectDurationUs = Math.max(0,...project.tracks.flatMap(track=>track.clips.map(clip=>clip.startUs+clip.durationUs)));
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [scopeHistogram,setScopeHistogram] = useState<{red:number[];green:number[];blue:number[]}|null>(null);
  const [scopeError,setScopeError] = useState<string|null>(null);
  useEffect(() => {setScopeHistogram(null);setScopeError(null);},[selectedClipId,playheadUs]);
  function sampleCurrentFrameScopes() {
    const media = videoRef.current && videoRef.current.readyState >= 2 ? videoRef.current : imageRef.current;
    if (!media || (media instanceof HTMLImageElement && !media.complete)) {
      setScopeError("No decoded frame is available at this playhead position.");
      setScopeHistogram(null);return;
    }
    try {
      const canvas=document.createElement("canvas");
      canvas.width=160;canvas.height=90;
      const ctx=canvas.getContext("2d",{willReadFrequently:true});
      if(!ctx) throw new Error("Canvas readback unavailable");
      ctx.drawImage(media,0,0,canvas.width,canvas.height);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      const red=Array<number>(32).fill(0),green=Array<number>(32).fill(0),blue=Array<number>(32).fill(0);
      for(let i=0;i<pixels.length;i+=4){
        if(pixels[i+3]===0)continue;
        red[Math.min(31,pixels[i]>>3)]++;
        green[Math.min(31,pixels[i+1]>>3)]++;
        blue[Math.min(31,pixels[i+2]>>3)]++;
      }
      setScopeHistogram({red,green,blue});setScopeError(null);
    } catch {
      setScopeError("Frame pixels could not be read (source permissions or unsupported format).");
      setScopeHistogram(null);
    }
  }
  const playbackPosition=useRef(playheadUs);playbackPosition.current=playheadUs;
  const audioPlayers=useRef(new Map<string,HTMLAudioElement>());
  useEffect(()=>{
    if(!playing)return;
    let frame=0,previous=performance.now();
    const tick=(now:number)=>{
      const next=Math.min(projectDurationUs,playbackPosition.current+Math.round((now-previous)*1000));
      previous=now;onSeek?.(next);
      if(next>=projectDurationUs){setPlaying(false);videoRef.current?.pause();return;}
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[playing,projectDurationUs,onSeek]);
  useEffect(()=>{
    for(const track of project.tracks)for(const clip of track.clips){
      const audio=audioPlayers.current.get(clip.id);if(!audio)continue;
      const active=playheadUs>=clip.startUs&&playheadUs<clip.startUs+clip.durationUs&&!track.muted;
      audio.muted=Boolean(track.muted);
      audio.volume=Math.max(0,Math.min(1,clip.volume??1));
      audio.playbackRate=clip.playbackRate??1;
      const time=((playheadUs-clip.startUs)*(clip.playbackRate??1)+(clip.inUs??0))/1e6;
      if(active&&Math.abs(audio.currentTime-time)>.15)audio.currentTime=Math.max(0,time);
      if(active&&playing){if(audio.paused)void audio.play().catch(()=>setPreviewDecodeWarning("Audio playback could not start. Press Play to retry."));}
      else audio.pause();
    }
  },[project,playheadUs,playing]);

  const currentRatioLabel = CANVAS_RATIOS.find(ratio=>ratio.width===project.canvas?.width&&ratio.height===project.canvas?.height)?.label
    ?? (project.canvas?.width&&project.canvas?.height?`${project.canvas.width}:${project.canvas.height}`:"Original");

  useEffect(()=>{
    const syncFullscreen=()=>{
      const active=document.fullscreenElement===playerPaneRef.current;
      setIsFullscreen(active);
      if(active)setFullscreenHudVisible(true);
      setPreviewControlMenu(null);
    };
    document.addEventListener("fullscreenchange",syncFullscreen);
    return()=>document.removeEventListener("fullscreenchange",syncFullscreen);
  },[]);

  useEffect(()=>{
    if(!isFullscreen||!fullscreenHudVisible)return;
    const timer=window.setTimeout(()=>setFullscreenHudVisible(false),4000);
    return()=>window.clearTimeout(timer);
  },[isFullscreen,fullscreenHudVisible,playing]);

  async function toggleFullscreen(){
    const pane=playerPaneRef.current;
    if(!pane)return;
    try{
      if(viewportFullscreen){setViewportFullscreen(false);setIsFullscreen(false);return;}
      if(document.fullscreenElement===pane)await document.exitFullscreen();
      else if(!document.fullscreenElement)await pane.requestFullscreen();
    }catch{setViewportFullscreen(true);setIsFullscreen(true);setFullscreenHudVisible(true);}
  }

  function chooseCanvasRatio(width:number,height:number){
    onAction?.({type:"set-canvas",canvas:{width,height,frameRate:project.canvas?.frameRate??30}});
    setPreviewControlMenu(null);
  }
  const dragStartRef = useRef<{startX:number;startY:number;x:number;y:number;clipId:string;nextX:number;nextY:number}|null>(null);

  const selectedEntry = useMemo(() => {
    for (const track of project.tracks) {
      const found = track.clips.find((clip) => clip.id === selectedClipId);
      if (found) return { clip: found, track };
    }
    return null;
  }, [project, selectedClipId]);

  useEffect(()=>{if(selectedClipId&&!selectedEntry)onSelectClip?.(null);},[selectedClipId,selectedEntry,onSelectClip]);
  const selectedClip = selectedEntry?.clip ?? null;
  const selectedTrack = selectedEntry?.track ?? null;
  const selectedIs3DObject=Boolean(selectedClip && (
    selectedClip.metadata?.sourceKind === "samscene-timeline-cue" ||
    mediaItems.some(item=>item.id===selectedClip.assetId && item.kind==="scene")
  ));
  const projectMediaIds = useMemo(
    () => new Set(project.tracks.flatMap((track) => track.clips.map((clip) => clip.assetId))),
    [project],
  );
  const isNarrow = workspaceWidth < 1160;
  const isCompact = workspaceWidth < 600;
  const isHandset = workspaceWidth < 600;
  const clipSpecificTools = ["trim", "speed", "volume", "effects", "transitions", "text", "captions", "transform", "filters", "adjustments", "video", "animation", "tracking", "adjust", "ai-stylize"];
  const canonicalTool = (tool: string | null) => tool === "filters" ? "effects" : tool === "adjustments" ? "adjust" : tool === "transform" ? "video" : tool;
  const inspectorTool = activeTool === "export" ? "export"
    : activeTool === "stage" ? "stage"
    : !selectedClip && studioMode === "scene" ? "stage" : selectedClip
    ? selectedIs3DObject
      ? (activeTool && ["animation","speed"].includes(activeTool) ? activeTool : "world3d")
      : (activeTool && clipSpecificTools.includes(activeTool) ? canonicalTool(activeTool) : selectedTrack?.kind === "audio" ? "volume" : selectedTrack?.kind === "captions" ? "captions" : selectedTrack?.kind === "overlay" && !mediaItems.some(item => item.id === selectedClip.assetId && item.kind === "image") ? "text" : "video")
    : "project";
  const inspectorAvailable = Boolean(inspectorTool);
  const showInspector = isHandset ? handsetPanel === "inspector" && inspectorAvailable : inspectorAvailable && layout.inspectorOpen && (!isNarrow || panePreference === "inspector" || !layout.browserOpen);
  const showBrowser = isHandset ? handsetPanel === "browser" : layout.browserOpen && (!isNarrow || !showInspector);
  const browserFloating = !isNarrow && showBrowser && layout.browserFloating;
  const inspectorFloating = !isNarrow && showInspector && layout.inspectorFloating;
  const dockBrowser = showBrowser && !browserFloating;
  const dockInspector = showInspector && !inspectorFloating;
  const browserWidth = clampWorkspaceSize(layout.browserWidth, 260, Math.min(640, Math.max(260, workspaceWidth * .42), Math.max(260, workspaceWidth - (dockInspector ? layout.inspectorWidth : 0) - 380)));
  const inspectorWidth = clampWorkspaceSize(layout.inspectorWidth, 260, Math.min(360, Math.max(260, workspaceWidth - (dockBrowser ? browserWidth : 0) - 380)));
  const timelineHeight = clampWorkspaceSize(layout.timelineHeight || Math.round(workspaceHeight * .25), isCompact ? 115 : 150, Math.max(isCompact ? 170 : 180, workspaceHeight - (isCompact ? 300 : 225)));
  /** Floating panels are viewport-positioned; keep them inside the editor so an embedded host's navigation is never covered. */
  const floatAt=(x:number,y:number,width:number)=>({
    x:Math.max(workspaceBox.left,Math.min(x,Math.max(workspaceBox.left,workspaceBox.right-Math.min(width,workspaceBox.right-workspaceBox.left)))),
    y:Math.max(workspaceBox.top,Math.min(y,Math.max(workspaceBox.top,workspaceBox.bottom-90))),
  });
  const gridStyle = {
    "--copro-browser-width": dockBrowser ? `${browserWidth}px` : "0px",
    "--copro-browser-handle": dockBrowser ? "8px" : "0px",
    "--copro-inspector-width": dockInspector ? `${inspectorWidth}px` : "0px",
    "--copro-inspector-handle": dockInspector ? "8px" : "0px",
    "--copro-timeline-height": `${timelineHeight}px`,
  } as React.CSSProperties;

  const activeVisualClip = useMemo(() => {
    for (const track of project.tracks) {
      if (track.visible === false || (track.kind !== "video" && track.kind !== "overlay")) continue;
      for (const clip of track.clips) {
        if (Math.min(playheadUs,Math.max(0,projectDurationUs-1)) >= clip.startUs && Math.min(playheadUs,Math.max(0,projectDurationUs-1)) < clip.startUs + clip.durationUs) {
          if (track.kind === "video" || clip.metadata?.creative || mediaItems.some((media) => media.id === clip.assetId && media.kind === "image")) {
            return clip;
          }
        }
      }
    }
    return null;
  }, [project, playheadUs, mediaItems]);

  const activeMedia = activeVisualClip && !activeVisualClip.metadata?.creative
    ? mediaItems.find((item) => item.id === activeVisualClip.assetId) ?? null
    : null;
  const activeTransform = (activeVisualClip?.metadata?.transform ?? {}) as { scale?:number; x?:number; y?:number; rotation?:number; opacity?:number };
  const motionSample = useMemo(() => {
    const motion = activeVisualClip?.metadata?.motion as {id?:string;durationUs?:number;delayUs?:number;amplitude?:number}|undefined;
    if (!motion?.id || !sampleMotion || !activeVisualClip) return null;
    const localUs = Math.max(0,Math.round((playheadUs-activeVisualClip.startUs)*(activeVisualClip.playbackRate??1)+(activeVisualClip.inUs??0)));
    try { return sampleMotion(motion.id,localUs,{durationUs:motion.durationUs,delayUs:motion.delayUs,amplitude:motion.amplitude}); }
    catch { return null; }
  },[activeVisualClip,playheadUs,sampleMotion]);
  const activeGraphic = activeVisualClip?.metadata?.graphic as {id:string;durationUs?:number;sequence?:unknown;values?:number[];decimals?:number}|undefined;
  const graphicSample = useMemo(() => {
    if (!activeGraphic?.id || !sampleGraphic || !activeVisualClip) return null;
    const localUs = Math.max(0,Math.round((playheadUs-activeVisualClip.startUs)*(activeVisualClip.playbackRate??1)+(activeVisualClip.inUs??0)));
    try { return sampleGraphic(activeGraphic,localUs); }
    catch { return null; }
  },[activeGraphic,activeVisualClip,playheadUs,sampleGraphic]);
  const motionTransform = motionSample
    ? ` translate(${motionSample.x}px, ${motionSample.y}px) scale(${motionSample.scale}) scaleX(${motionSample.scaleX}) rotate(${motionSample.rotation}deg)`
    : "";
  const previewColorFilter = colorAdjustmentPreviewFilter(activeVisualClip?.metadata?.adjustments as CoProColorAdjustments|undefined);
  const activeMask = activeVisualClip?.metadata?.mask as CoProClipMask|undefined;
  const radius = Math.max(20,Math.min(100,activeMask?.size??80));
  const feather = Math.max(0,Math.min(30,activeMask?.feather??0));
  const maskGradient = activeMask?.shape === "circle"
    ? "radial-gradient(circle closest-side at center, " + (activeMask.invert?"transparent":"black") +
      " " + Math.max(0,radius-feather) + "%, " + (activeMask.invert?"black":"transparent") + " " + radius + "%)"
    : "none";
  const mediaTransformStyle: React.CSSProperties = {
    transform: `translate(${activeTransform.x ?? 0}%, ${activeTransform.y ?? 0}%) scale(${activeTransform.scale ?? 1}) rotate(${activeTransform.rotation ?? 0}deg)${motionTransform}`,
    opacity: (activeTransform.opacity ?? 1) * (motionSample?.opacity ?? 1),
    filter: [stageEnvironment?.ambient !== undefined ? "brightness(" + stageEnvironment.ambient + ")" : "", motionSample?.blur ? `blur(${motionSample.blur}px)` : "", previewColorFilter].filter(Boolean).join(" ") || "none",
    clipPath: motionSample?.clipInset ? "inset(0 " + (motionSample.clipInset * 100) + "% 0 0)" :
      activeMask?.shape === "rectangle" ? "inset(" + ((100-radius)/2) + "% round 8%)" : "none",
    maskImage: maskGradient,
    cursor: activeVisualClip ? "grab" : undefined,
    touchAction: "none",
  };
  const activeEffect = String(activeVisualClip?.metadata?.effect ?? "none");
  const activeOverlay = activeEffect.startsWith("overlay:") ? activeEffect.slice("overlay:".length) : "none";
  function startVisualDrag(event: React.PointerEvent<HTMLVideoElement | HTMLImageElement>) {
    if (!activeVisualClip || event.button !== 0) return;
    onSelectClip?.(activeVisualClip.id);
    dragStartRef.current = {startX:event.clientX,startY:event.clientY,x:activeTransform.x ?? 0,y:activeTransform.y ?? 0,clipId:activeVisualClip.id,nextX:activeTransform.x ?? 0,nextY:activeTransform.y ?? 0};
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function moveVisualDrag(event: React.PointerEvent<HTMLVideoElement | HTMLImageElement>) {
    const drag = dragStartRef.current;
    if (!drag) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = 100*(event.clientX-drag.startX)/rect.width;
    const dy = 100*(event.clientY-drag.startY)/rect.height;
    drag.nextX = Math.max(-1000,Math.min(1000,Math.round((drag.x+dx)*10)/10));
    drag.nextY = Math.max(-1000,Math.min(1000,Math.round((drag.y+dy)*10)/10));
    event.currentTarget.style.transform = `translate(${drag.nextX}%, ${drag.nextY}%) scale(${activeTransform.scale ?? 1}) rotate(${activeTransform.rotation ?? 0}deg)`;
  }
  function endVisualDrag(event: React.PointerEvent<HTMLVideoElement | HTMLImageElement>) {
    const drag = dragStartRef.current;
    dragStartRef.current = null;
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.nextX !== drag.x || drag.nextY !== drag.y) onAction?.({type:"transform",clipId:drag.clipId,patch:{x:drag.nextX,y:drag.nextY}});
  }
  const effectivePreviewSrc = activeMedia?.url ?? (activeVisualClip?.metadata?.creative ? (creativeOverlaySrc ?? previewSrc) : null);
  useEffect(()=>setPreviewDecodeWarning(null),[effectivePreviewSrc]);
  const effectivePreviewKind = activeMedia?.kind === "image" ? "image"
    : activeMedia?.kind === "video" ? "video"
    : activeVisualClip?.metadata?.creative ? previewKind : null;
  const hasUnavailableFootage = project.tracks.some((track) =>
    (track.kind === "video" || track.kind === "audio") && track.clips.some((clip) =>
      !mediaItems.some((item) => item.id === clip.assetId)
    )
  );

  const activeCanvasText = useMemo(() => {
    const overlays: Array<{ id: string; kind: string; text: string }> = [];
    for (const track of project.tracks) {
      if (track.visible === false || (track.kind !== "overlay" && track.kind !== "captions")) continue;
      for (const clip of track.clips) {
        if (playheadUs < clip.startUs || playheadUs >= clip.startUs + clip.durationUs) continue;
        const text = typeof clip.metadata?.text === "string" ? clip.metadata.text : "";
        if (!text) continue;
        overlays.push({ id: clip.id, kind: track.kind, text });
      }
    }
    return overlays;
  }, [project, playheadUs]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || effectivePreviewKind !== "video" || !effectivePreviewSrc) return;
    return syncVideoPlayback(video, playing, () => {
      setPreviewDecodeWarning("Playback could not start after switching clips. Try again or relink this source.");
    });
  }, [effectivePreviewSrc, effectivePreviewKind, activeVisualClip?.id, playing]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const seekSeconds = activeVisualClip
      ? ((playheadUs - activeVisualClip.startUs) * (activeVisualClip.playbackRate ?? 1) + (activeVisualClip.inUs ?? 0)) / 1_000_000
      : 0;
    if (Math.abs(video.currentTime - seekSeconds) > .25 && Number.isFinite(video.duration)) {
      video.currentTime = Math.min(seekSeconds, video.duration || seekSeconds);
    }
    video.playbackRate = Math.max(.25, Math.min(4, activeVisualClip?.playbackRate ?? 1));
    video.volume = Math.max(0, Math.min(1, activeVisualClip?.volume ?? 1));
    video.muted = project.tracks.some(track=>track.muted && track.clips.some(clip=>clip.id===activeVisualClip?.id));
  }, [playheadUs, activeVisualClip?.startUs, activeVisualClip?.inUs, activeVisualClip?.playbackRate, activeVisualClip?.volume, project]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;

      if(event.key==="Escape"&&viewportFullscreen){setViewportFullscreen(false);setIsFullscreen(false);return;}
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        onAction?.({ type: event.shiftKey ? "redo" : "undo" });
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedClip) {
        event.preventDefault();
        onAction?.({ type: "delete", clipId: selectedClip.id });
        return;
      }

      if (((meta && event.key.toLowerCase() === "b") || (!meta && event.key.toLowerCase() === "s")) && selectedClip) {
        event.preventDefault();
        onAction?.({ type: "split", clipId: selectedClip.id, atUs: playheadUs });
        return;
      }

      if (event.key === " " && !event.repeat) {
        event.preventDefault();
        void togglePlayback();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) {
      if(playheadUs>=projectDurationUs)onSeek?.(0);
      setPlaying((value) => !value);
      return;
    }
    if (!playing) {
      if(playheadUs>=projectDurationUs)onSeek?.(0);
      try {await video.play();setPlaying(true);}
      catch {setPreviewDecodeWarning("Playback could not start. Try again or relink this source.");}
    } else {video.pause();setPlaying(false);}
  }

  function runTool(id: string) {
    if (id === "templates" || id === "transitions" || id === "animation") { selectCategory(id); return; }
    if (id === "more" && isHandset) {
      setCategoryTool("more");
      setHandsetPanel("browser");
      setLayout(value => ({...value,browserOpen:true}));
      setPanePreference("browser");
      return;
    }
    if (!selectedClip) {
      setActiveTool(id);
      if (isHandset) { setCategoryTool(id); setHandsetPanel("browser"); }
      return;
    }
    if (id === "split") {
      onAction?.({ type: "split", clipId: selectedClip.id, atUs: playheadUs });
      return;
    }
    if (id === "duplicate") {
      onAction?.({ type: "duplicate", clipId: selectedClip.id });
      return;
    }
    if (id === "delete") {
      onAction?.({ type: "delete", clipId: selectedClip.id });
      setActiveTool(null);
      return;
    }
    setActiveTool(id);
    setPanePreference("inspector");
    if (isHandset) setHandsetPanel("inspector");
    setLayout(current => ({ ...current, inspectorOpen: true }));
  }

  function moveFloating(event: React.PointerEvent<HTMLElement>, panel: "browser" | "inspector" | "player") {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    const xKey = panel === "browser" ? "browserX" : panel === "inspector" ? "inspectorX" : "playerX";
    const yKey = panel === "browser" ? "browserY" : panel === "inspector" ? "inspectorY" : "playerY";
    const startX = event.clientX, startY = event.clientY;
    const originalX = layout[xKey], originalY = layout[yKey];
    const previous = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    function drag(e: PointerEvent) {
      setLayout(old => ({...old,[xKey]:Math.max(0,Math.min(window.innerWidth-150,originalX+e.clientX-startX)),[yKey]:Math.max(0,Math.min(window.innerHeight-90,originalY+e.clientY-startY))}));
    }
    function end() {window.removeEventListener("pointermove",drag);window.removeEventListener("pointerup",end);window.removeEventListener("pointercancel",end);document.body.style.userSelect=previous;}
    window.addEventListener("pointermove",drag);window.addEventListener("pointerup",end);window.addEventListener("pointercancel",end);
  }
  function saveFloatingSize(event: React.PointerEvent<HTMLElement>, panel: "browser" | "inspector" | "player") {
    if (event.target !== event.currentTarget) return;
    const element = event.currentTarget;
    const widthKey = panel === "browser" ? "browserWidth" : panel === "inspector" ? "inspectorWidth" : "playerFloatWidth";
    const heightKey = panel === "browser" ? "browserFloatHeight" : panel === "inspector" ? "inspectorFloatHeight" : "playerFloatHeight";
    const size = element.getBoundingClientRect();
    setLayout(old=>({...old,[widthKey]:clampWorkspaceSize(size.width,panel === "player" ? 360 : 260,panel === "player" ? 2000 : 800),[heightKey]:clampWorkspaceSize(size.height,250,1500)}));
  }

  function selectCategory(id: string) {
    setShowMoreTools(false);
    // Color/geometry adjustment is a contextual clip inspector, not a second,
    // competing full-size control panel in the media browser.
    if (id === "stage") {
      // Scene/environment lives in the one contextual inspector, never a second
      // full inspector in the left asset browser.
      setActiveTool("stage");
      setLayout(value=>({...value,inspectorOpen:true}));
      setPanePreference("inspector");
      if (isHandset) setHandsetPanel("inspector");
      return;
    }
    if (id === "adjustments" && selectedClip) {
      setActiveTool("adjust");
      setPanePreference("inspector");
      if (isHandset) setHandsetPanel("inspector");
      setLayout(value=>({...value,browserOpen:false,inspectorOpen:true}));
      return;
    }
    setCategoryTool(id);
    if (isHandset) setHandsetPanel("browser");
    setLayout(value => ({...value,browserOpen:true}));
    setPanePreference("browser");
    if (selectedClip && ["effects","transitions","animation","filters","adjustments"].includes(id)) setActiveTool(id);
  }

  function activateStudioMode(mode:"scene"|"design"|"generate"|"video") {
    setStudioMode(mode);
    const destinations={scene:"scenes",design:"stickers",generate:"models",video:"media"} as const;
    selectCategory(destinations[mode]);
    if (mode==="scene") setActiveTool("stage");
  }

  function useCreativeAsset(asset: CoProCreativeAsset) {
    if (asset.category === "template") {
      onOpenCreativeTemplate?.(asset.id);
      return;
    }
    if (!selectedClip) return;
    if (asset.category === "animation") {
      setActiveTool("animation");
      onAction?.({type:"motion",clipId:selectedClip.id,motion:asset.id});
    } else if (asset.category === "transition") {
      setActiveTool("transitions");
      onAction?.({type:"transition",clipId:selectedClip.id,transition:asset.id,durationUs:300_000});
    } else if (asset.category === "overlay") {
      onAction?.({type:"effect",clipId:selectedClip.id,effect:"overlay:" + asset.id});
    } else if (asset.category === "treatment") {
      onAction?.({type:"effect",clipId:selectedClip.id,effect:asset.id});
    } else if (asset.category === "graphic") {
      onAction?.({type:"graphic",clipId:selectedClip.id,graphic:asset.id});
    }
  }

  return (
    <section className="copro-studio" data-inspector-open={Boolean(activeTool)} data-handset={isHandset} data-studio-mode={studioMode}>
      <header className="copro-topbar">
        <IconAction className="copro-icon-button" aria-label="Back to projects" onClick={() => onAction?.({ type: "back" })}><CoProSystemIcon name="back" icons={systemIcons} size={22} fallback={<ArrowLeft size={22}/>} /></IconAction>
        <div className="copro-title-block">
          <strong>{projectTitle}</strong>
          <span>PrimeTech Studio</span>
        </div>
        <div className="copro-topbar-actions">
          <IconAction className="copro-icon-button copro-history-button" aria-label="Undo" disabled={!canUndo} onClick={() => onAction?.({ type: "undo" })}><Undo2 size={20}/></IconAction>
          <IconAction className="copro-icon-button copro-history-button" aria-label="Redo" disabled={!canRedo} onClick={() => onAction?.({ type: "redo" })}><Redo2 size={20}/></IconAction>
          <IconAction className="copro-icon-button" type="button" title={layout.browserOpen ? "Collapse media browser" : "Show media browser"} aria-label={layout.browserOpen ? "Collapse media browser" : "Show media browser"} aria-pressed={isHandset ? handsetPanel === "browser" : layout.browserOpen} onClick={() => { if (isHandset) setHandsetPanel(value => value === "browser" ? null : "browser"); else setLayout(value => ({ ...value, browserOpen: !value.browserOpen })); setPanePreference("browser"); }}><CoProSystemIcon name="panels" icons={systemIcons} size={18} fallback={<PanelLeftClose size={18}/>} /></IconAction>
          <IconAction className="copro-icon-button" type="button" title={layout.inspectorOpen ? "Collapse inspector" : "Show inspector"} aria-label={layout.inspectorOpen ? "Collapse inspector" : "Show inspector"} aria-pressed={isHandset ? handsetPanel === "inspector" : layout.inspectorOpen} onClick={() => { if (isHandset) setHandsetPanel(value => value === "inspector" ? null : "inspector"); else setLayout(value => ({ ...value, inspectorOpen: !value.inspectorOpen })); setPanePreference("inspector"); }}><CoProSystemIcon name="panels" icons={systemIcons} size={18} fallback={<PanelRightClose size={18}/>} /></IconAction>
          <IconAction className="copro-icon-button copro-wide-layout-control" type="button" title="Swap dock positions of browser and inspector" aria-label="Swap browser and inspector" onClick={() => setLayout(value => ({ ...value, reversed: !value.reversed }))}><CoProSystemIcon name="panels" icons={systemIcons} size={18} fallback={<PanelsTopLeft size={18}/>} /></IconAction>
          <label className="mm-workspace-preset" title="Choose a saved-panel layout preset"><span>Layout</span><select aria-label="Workspace layout preset" defaultValue="custom" onChange={event=>{
            const choice=event.currentTarget.value;
            if (choice === "balanced") resetLayout();
            if (choice === "media") setLayout(old=>({...old,browserWidth:590,inspectorWidth:300,timelineHeight:Math.round(workspaceHeight*.36),browserOpen:true,inspectorOpen:true,browserFloating:false,inspectorFloating:false}));
            if (choice === "timeline") setLayout(old=>({...old,browserWidth:390,inspectorWidth:300,timelineHeight:Math.round(workspaceHeight*.55),browserOpen:true,inspectorOpen:true,browserFloating:false,inspectorFloating:false}));
          }}><option value="custom">Custom</option><option value="balanced">Balanced</option><option value="media">Media focus</option><option value="timeline">Timeline focus</option></select></label>
          <IconAction className="copro-icon-button copro-wide-layout-control" type="button" title="Restore default panel widths, docking and timeline height" aria-label="Reset workspace layout" onClick={() => { resetLayout(); setPanePreference("browser"); }}><CoProSystemIcon name="refresh" icons={systemIcons} size={18} fallback={<RotateCcw size={18}/>} /></IconAction>
          <details className="mm-cover-menu"><summary>Cover</summary><div>
            <button type="button" onClick={()=>{const source=videoRef.current??previewStageRef.current?.querySelector("img");if(source)saveCover(source);else setCoverError("Add visual media or choose an image.");}}>Use current frame</button>
            <button type="button" onClick={()=>coverInputRef.current?.click()}>Upload cover</button>
            <button type="button" onClick={()=>onAction?.({type:"set-cover",cover:null})}>Use automatic cover</button>
            {coverError&&<span role="alert">{coverError}</span>}
          </div></details>
          <input ref={coverInputRef} className="copro-hidden-source-input" type="file" accept="image/*" aria-label="Upload project cover" onChange={event=>{const file=event.currentTarget.files?.[0];if(file)void uploadCover(file);event.currentTarget.value="";}}/>
          <button className="copro-export-button" aria-expanded={activeTool === "export"} aria-controls="copro-tool-inspector" onClick={() => { setActiveTool("export"); if (isHandset) setHandsetPanel("inspector"); setLayout(value => ({ ...value, inspectorOpen: true })); setPanePreference("inspector"); }}>Export</button>
        </div>
      </header>

      {project.tracks.flatMap(track=>track.clips.filter(clip=>mediaItems.some(item=>item.id===clip.assetId&&item.kind==="audio")).map(clip=><audio key={clip.id} ref={element=>{if(element)audioPlayers.current.set(clip.id,element);else audioPlayers.current.delete(clip.id);}} src={mediaItems.find(item=>item.id===clip.assetId)?.url} preload="metadata"/>))}
      <div className="mm-studio-commandbar" aria-label="PrimeTech unified editing workspace">
        <nav className="mm-studio-modes" aria-label="PrimeTech studio modes">
          {([
            ["scene","3D Scene",<Box size={17}/>],
            ["design","Design",<Palette size={17}/>],
            ["generate","Generate",<Sparkles size={17}/>],
            ["video","Video",<Film size={17}/>],
          ] as const).map(([mode,label,icon])=>
            <button key={mode} type="button" className={studioMode===mode?"is-active":""}
              aria-current={studioMode===mode?"page":undefined} aria-pressed={studioMode===mode}
              onClick={()=>activateStudioMode(mode)}>{icon}<span>{label}</span></button>
          )}
        </nav>
        <nav className="mm-editor-categories" aria-label="PrimeTech editing categories">
        <div className="mm-tools-scroll">
        {PRIMARY_TOOLS.map(([id,label]) => <button key={id} type="button" className={(id==="stage"?inspectorTool==="stage":categoryTool===id)?"is-active":""}
          aria-pressed={id==="stage"?inspectorTool==="stage":categoryTool===id}
          title={id==="stage"?"Edit sky, lighting and model finishes in the inspector":id==="templates"?"Browse editable composition templates":`${label}: open the creation browser`} onClick={()=>selectCategory(id)}>
          {renderToolIcon(id,systemIcons)}<span>{label}</span>
        </button>)}
        </div>
        <div ref={moreToolsRef} className="mm-tools-more-wrap">
          <button type="button" className={SECONDARY_TOOLS.some(([id])=>categoryTool===id)?'is-active':''}
            aria-expanded={showMoreTools} aria-haspopup="menu" onClick={()=>setShowMoreTools(open=>!open)}
            title="More editing tools"><SlidersHorizontal size={18}/><span>More</span></button>
          {showMoreTools&&<div className="mm-tools-more-menu" role="menu" aria-label="Additional editing tools">
            {SECONDARY_TOOLS.map(([id,label])=><button type="button" role="menuitem" key={id}
              onClick={()=>selectCategory(id)}>{renderToolIcon(id,systemIcons)}<span>{label}</span></button>)}
          </div>}
        </div>
        </nav>
      </div>
      <main className="copro-workspace" ref={workspaceRef}>
        <div className={["copro-editing-grid", showBrowser ? "has-browser" : "", showInspector ? "has-inspector" : "", isNarrow ? "is-narrow" : "", isCompact ? "is-compact" : "", layout.reversed ? "is-reversed" : ""].filter(Boolean).join(" ")} style={{
          "--copro-browser-width": dockBrowser ? browserWidth + "px" : "0px",
          "--copro-browser-handle": dockBrowser ? "8px" : "0px",
          "--copro-inspector-width": dockInspector ? inspectorWidth + "px" : "0px",
          "--copro-inspector-handle": dockInspector ? "8px" : "0px",
          "--copro-timeline-height": timelineHeight + "px",
        } as React.CSSProperties} data-layout-mode={isCompact ? "mobile" : isNarrow ? "single-pane" : "wide"} data-active-pane={isHandset ? (handsetPanel ?? "closed") : undefined}>
          {showBrowser && <SidePanel id="copro-tool-browser" className={`copro-browser-slot mm-browser${browserFloating ? " is-floating" : ""}`} ariaLabel={`${categoryTool} browser`}
            floatingBounds={{left:floatAt(layout.browserX,layout.browserY,browserWidth).x,top:floatAt(layout.browserX,layout.browserY,browserWidth).y,width:browserWidth,height:layout.browserFloatHeight}}
            onPointerUp={browserFloating ? (event) => saveFloatingSize(event,"browser") : undefined}>

            <div className="mm-browser-top" onPointerDown={browserFloating ? event => moveFloating(event,"browser") : undefined}><span>{browserFloating && <GripVertical size={14} aria-hidden="true"/>}<strong>{categoryTool.charAt(0).toUpperCase()+categoryTool.slice(1)}</strong></span><div className="mm-panel-window-buttons"><button type="button" aria-label={browserFloating ? "Dock Media browser" : "Undock Media browser"} title={browserFloating ? "Dock Media browser back into workspace" : "Float and drag Media browser"} onPointerDown={event=>event.stopPropagation()} onClick={()=>setLayout(value=>({...value,browserFloating:!value.browserFloating}))}>{browserFloating?<DockIcon size={16}/>:<ExternalLink size={16}/>}</button><button type="button" aria-label="Collapse media browser" title="Collapse panel" onPointerDown={event=>event.stopPropagation()} onClick={()=>{if(isHandset)setHandsetPanel(null);else setLayout(value=>({...value,browserOpen:false}));}}>×</button></div></div>
            {categoryTool === "media" && <nav className="mm-media-subnav" aria-label="Media collections">
              {([ ["import","Import"], ["media","In project"], ["yours","My assets"], ["library","Templates"] ] as const).map(([id,label]) => <button type="button" key={id} className={browserSection===id?"is-active":""} aria-pressed={browserSection===id} onClick={()=>setBrowserSection(id)}>{label}</button>)}
            </nav>}
            {categoryTool === "models" ? (
              <section className="mm-model-gallery" aria-label="PrimeTech 3D model gallery">
                <header>
                  <span>GENERATE / MODEL LIBRARY</span>
                  <h2>3D Models</h2>
                  <p>Choose an existing GLB source and add it to this project's timeline. The model remains editable as a linked 3D clip.</p>
                </header>
                {mediaItems.some(item=>item.kind==="scene")&&<>
                  <div className="mm-model-gallery-heading">In this project</div>
                  <div className="mm-model-gallery-grid">
                    {mediaItems.filter(item=>item.kind==="scene").map(item=>
                      <article className="mm-model-gallery-card" key={item.id}>
                        <div className="mm-model-gallery-art">{item.thumbnails?.[0]
                          ? <img src={item.thumbnails[0]} alt={item.name+" scene preview"}/>
                          : <Box size={30} aria-hidden="true"/>}<span>GLB</span></div>
                        <strong title={item.name}>{item.name}</strong>
                        <small>Project asset</small>
                        <button type="button" onClick={()=>onMediaAdd?.(item.id,playheadUs)}>Add to timeline</button>
                      </article>)}
                  </div>
                </>}
                <div className="mm-model-gallery-heading">Local PrimeTech sources <small>{localSceneSources.filter(item=>item.kind==="scene").length} available</small></div>
                {localSceneSources.some(item=>item.kind==="scene")
                  ? <div className="mm-model-gallery-grid">
                    {localSceneSources.filter(item=>item.kind==="scene").map(item=>
                      <article className="mm-model-gallery-card" key={item.id}>
                        <div className="mm-model-gallery-art" aria-hidden="true"><Box size={30}/><span>GLB</span></div>
                        <strong title={item.name}>{item.name}</strong>
                        <small>{item.sizeBytes > 0 ? (item.sizeBytes/1024).toFixed(0)+" KB" : "Local 3D source"}</small>
                        <button type="button" disabled={Boolean(localSceneSourceBusyId)}
                          onClick={()=>onImportLocalSceneSource?.(item)}>
                          {localSceneSourceBusyId===item.id?"Importing…":"Import into project"}
                        </button>
                      </article>)}
                  </div>
                  : <div className="mm-model-gallery-empty"><Box size={24}/>
                      <strong>No local model sources connected</strong>
                      <p>Import a GLB from your device or connect the SamScene source library. Nothing is generated or uploaded automatically.</p>
                    </div>}
                <button className="mm-model-gallery-add" type="button" onClick={()=>{setBrowserSection("import");selectCategory("media");}}>
                  <Box size={16}/> Import a GLB file
                </button>
              </section>
            ) : categoryTool === "3d" ? (
              <section className="mm-scene-command-browser" aria-label="Connected 3D authoring tools">
                <header><strong>3D authoring</strong><small>One project · SamScene sky · CoPro object commands</small></header>
                <div className="mm-scene-command-list">
                  <button type="button" onClick={()=>selectCategory("models")}><Box size={20}/>
                    <span><strong>3D models</strong><small>Import GLB geometry into the current project</small></span><ChevronRight size={16}/></button>
                  <button type="button" onClick={()=>selectCategory("scenes")}><Layers size={20}/>
                    <span><strong>Scene objects &amp; beats</strong><small>Navigate linked 3D objects and timeline beats</small></span><ChevronRight size={16}/></button>
                  <button type="button" onClick={()=>selectCategory("stage")}><Sun size={20}/>
                    <span><strong>Sky, lighting &amp; materials</strong><small>Use the SamScene engine in the contextual inspector</small></span><ChevronRight size={16}/></button>
                  <button type="button" disabled={!selectedIs3DObject}
                    onClick={()=>{setActiveTool("world3d");setPanePreference("inspector");setLayout(value=>({...value,inspectorOpen:true}));if(isHandset)setHandsetPanel("inspector");}}>
                    <Move3D size={20}/><span><strong>Spatial transform</strong><small>{selectedIs3DObject?"Edit X, Y, Z, yaw, scale and visibility":"Select a 3D object from the timeline"}</small></span><ChevronRight size={16}/></button>
                </div>
                <p className="mm-scene-command-note">Sculpt brushes, mesh editing and camera authoring remain owned by SamScene. They are not shown here as nonfunctional controls.</p>
              </section>
            ) : categoryTool === "scenes" ? (
              <section className="mm-scene-browser" aria-label="Timeline scenes and model sources">
                <header><strong>Scenes &amp; beats</strong><small>Select a timeline beat to navigate or edit it</small></header>
                <div className="mm-scene-browser-heading">Timeline beats</div>
                {project.tracks.flatMap(track=>track.clips).filter(clip=>mediaItems.some(item=>item.id===clip.assetId&&['scene','video','image'].includes(item.kind))||Boolean(clip.metadata?.sceneCue)).length===0
                  ? <p className="mm-scene-browser-empty">No visual clips yet. Add footage or a 3D scene to start a beat.</p>
                  : project.tracks.flatMap(track=>track.clips).filter(clip=>mediaItems.some(item=>item.id===clip.assetId&&['scene','video','image'].includes(item.kind))||Boolean(clip.metadata?.sceneCue)).map(clip=><button type="button" key={clip.id}
                      className={'mm-scene-browser-row'+(selectedClipId===clip.id?' is-selected':'')}
                      onClick={()=>{onSelectClip?.(clip.id);onSeek?.(clip.startUs);}}>
                      <Layers size={16}/><span><strong>{mediaItems.find(item=>item.id===clip.assetId)?.name??'Scene cue'}</strong>
                      <small>{formatTime(clip.startUs)} · {(clip.durationUs/1_000_000).toFixed(1)}s</small></span><ChevronRight size={14}/></button>)}
                <div className="mm-scene-browser-heading">Project 3D assets</div>
                {mediaItems.filter(item=>item.kind==='scene').length===0
                  ? <p className="mm-scene-browser-empty">Import a GLB in Media to make it available here.</p>
                  : mediaItems.filter(item=>item.kind==='scene').map(item=><div className="mm-scene-browser-row" key={item.id}>
                      <Layers size={16}/><span><strong>{item.name}</strong><small>3D scene · imported</small></span>
                      <button type="button" onClick={()=>onMediaAdd?.(item.id,playheadUs)}>Add</button></div>)}
                {localSceneSources.filter(item=>item.kind==='scene').length>0&&<>
                  <div className="mm-scene-browser-heading">Local SamScene sources</div>
                  {localSceneSources.filter(item=>item.kind==='scene').map(item=><div className="mm-scene-browser-row" key={item.id}>
                    <Layers size={16}/><span><strong>{item.name}</strong><small>Source GLB · local</small></span>
                    <button type="button" disabled={Boolean(localSceneSourceBusyId)} onClick={()=>onImportLocalSceneSource?.(item)}>
                      {localSceneSourceBusyId===item.id?'Importing…':'Import'}</button></div>)}
                </>}
                <button type="button" className="mm-scene-browser-import" onClick={()=>{setBrowserSection('import');selectCategory('media');}}>Import scene or footage</button>
              </section>
            ) : categoryTool === "more" ? (
              <section className="mm-more-tools" aria-label="More editing tools">
                <div className="mm-more-tools-heading"><span>MORE TOOLS</span><strong>Choose a workspace</strong><p>All editing categories stay available here.</p></div>
                <div className="mm-more-tools-grid">
                  {HANDSET_MORE_TOOLS.map(([id,label,description]) => <button type="button" key={id} onClick={() => selectCategory(id)}>
                    <i>{renderToolIcon(id,systemIcons)}</i><span><strong>{label}</strong><small>{description}</small></span><ChevronRight size={16}/>
                  </button>)}
                </div>
              </section>
            ) : ["templates","transitions","animation"].includes(categoryTool) ? (
              <CoProMediaBrowser key={categoryTool} section="library"
                initialCategory={categoryTool==="templates"?"template":categoryTool==="transitions"?"transition":"animation"}
                mediaItems={mediaItems} projectMediaIds={projectMediaIds}
                creativeAssets={creativeAssets} selectedClipId={selectedClipId}
                currentAssetId={categoryTool==="transitions"?String((selectedClip?.metadata?.transitionOut as any)?.type??""):String((selectedClip?.metadata?.motion as any)?.id??"")}
                renderCreativePreview={renderCreativePreview} sampleMotion={sampleMotion} createTransitionPreview={createTransitionPreview}
                previewMediaPair={{before:mediaItems.find(item=>item.id===selectedClip?.assetId)?.thumbnails?.[0]??mediaItems.find(item=>item.kind==="image")?.url,after:mediaItems.find(item=>item.id!==selectedClip?.assetId && item.thumbnails?.length)?.thumbnails?.[0]}}
                onImportFiles={files=>onAction?.({type:"import-media-batch",files,atUs:playheadUs})}
                onAddMedia={id=>onMediaAdd?.(id,playheadUs)} onUseCreativeAsset={useCreativeAsset}
                onOpenCreativeTemplate={onOpenCreativeTemplate} systemIcons={systemIcons}/>
            ) : categoryTool === "media" ? (
              <CoProMediaBrowser
                section={browserSection}
                mediaItems={mediaItems}
                localSceneSources={localSceneSources}
                localSceneSourceBusyId={localSceneSourceBusyId}
                onImportLocalSceneSource={onImportLocalSceneSource}
                projectMediaIds={projectMediaIds}
                creativeAssets={creativeAssets}
                selectedClipId={selectedClipId}
                onImportFiles={(files) => onAction?.({type:"import-media-batch",files,atUs:playheadUs})}
                onAddMedia={(id) => onMediaAdd?.(id,playheadUs)}
                onUseCreativeAsset={useCreativeAsset}
                onOpenCreativeTemplate={onOpenCreativeTemplate}
                onRenameMedia={(id,name)=>onAction?.({type:"rename-media",id,name})}
                onDeleteMedia={id=>onAction?.({type:"delete-media",id})}
                renderCreativePreview={renderCreativePreview} sampleMotion={sampleMotion} createTransitionPreview={createTransitionPreview}
                onNavigate={setBrowserSection}
                systemIcons={systemIcons}
              />
            ) : (
              <CoProToolPanel tool={categoryTool==="filters"?"effects":categoryTool==="adjustments"?"transform":categoryTool==="stickers"?"stickers":categoryTool} onClose={() => { if (isHandset) setHandsetPanel(null); else setLayout(value => ({ ...value, browserOpen: false })); }}
                mediaItems={mediaItems} onMediaAdd={(id) => onMediaAdd?.(id,playheadUs)}
                onMediaPicked={(file) => onAction?.({type:"import-media",file,atUs:playheadUs})}
                onTextCommit={(text,kind) => onAction?.({type:"create-text",kind,text,atUs:playheadUs})}
                onEffectChange={(effect) => selectedClip && onAction?.({type:"effect",clipId:selectedClip.id,effect})}
                onTransitionChange={(transition) => selectedClip && onAction?.({type:"transition",clipId:selectedClip.id,transition,durationUs:300_000})}
                onMotionChange={(motion) => selectedClip && onAction?.({type:"motion",clipId:selectedClip.id,motion})}
                onGraphicChange={(graphic,text) => selectedClip && onAction?.({type:"graphic",clipId:selectedClip.id,graphic,text})}
                currentEffect={String(selectedClip?.metadata?.effect ?? "none")}
                currentTransition={String((selectedClip?.metadata?.transitionOut as any)?.type ?? "none")}
                currentMotion={String((selectedClip?.metadata?.motion as any)?.id ?? "")}
                currentGraphic={String((selectedClip?.metadata?.graphic as any)?.id ?? "")}
                currentGraphicText={String((selectedClip?.metadata?.graphic as any)?.text ?? "")}
                onTransformChange={(patch) => selectedClip && onAction?.({type:"transform",clipId:selectedClip.id,patch})}
                transform={selectedClip?.metadata?.transform as {scale?:number;x?:number;y?:number;rotation?:number;opacity?:number}|undefined}
                hasSelectedClip={Boolean(selectedClip && ["effects","transitions","filters","adjustments"].includes(categoryTool))}
                selectedClipId={selectedClipId}
                onProjectExport={() => onAction?.({type:"export-project"})}
              />
            )}
          </SidePanel>}
          {dockBrowser && !isNarrow && <ResizeHandle axis="x" className="copro-browser-divider" label="Resize tool browser" value={browserWidth} min={240} max={Math.max(260,workspaceWidth - (showInspector ? inspectorWidth : 0) - 410)} direction={layout.reversed ? -1 : 1} onChange={width => setLayout(value => ({ ...value, browserWidth: width }))}/>}

          <section ref={playerPaneRef} className={`mm-player-pane${layout.playerFloating && !isNarrow?" is-floating":""}${viewportFullscreen?" is-viewport-fullscreen":""}`} aria-label="PrimeTech preview player"
            style={{
              "--copro-floating-left": floatAt(layout.playerX,layout.playerY,layout.playerFloatWidth).x + "px",
              "--copro-floating-top": floatAt(layout.playerX,layout.playerY,layout.playerFloatWidth).y + "px",
              "--copro-floating-width": layout.playerFloatWidth + "px",
              "--copro-floating-height": layout.playerFloatHeight + "px",
            } as React.CSSProperties}
            onPointerUp={layout.playerFloating && !isNarrow?event=>saveFloatingSize(event,"player"):undefined}
            onPointerMove={()=>{if(isFullscreen)setFullscreenHudVisible(true);}}>
            <div className="mm-player-pane-header" onPointerDown={layout.playerFloating && !isNarrow?event=>moveFloating(event,"player"):undefined}>
              <span>{layout.playerFloating && !isNarrow && <GripVertical size={14}/>}Preview · Timeline</span>
              <button type="button" aria-label={layout.playerFloating ? "Dock player" : "Undock player"} title={layout.playerFloating ? "Dock player" : "Float and drag player"} onPointerDown={event=>event.stopPropagation()} onClick={()=>setLayout(old=>({...old,playerFloating:!old.playerFloating}))}>{layout.playerFloating?<DockIcon size={16}/>:<ExternalLink size={16}/>}</button>
            </div>
            <section ref={previewStageRef} className="copro-preview-stage">
            <div
              className={`copro-preview-device${effectivePreviewSrc?"":" is-empty"}`}
              data-overlay={activeOverlay}
              data-stage-bg={stageEnvironment?.background?"":undefined}
              data-look={stageLookBackground(stageEnvironment,stageSkies)?"":undefined}
              data-grid={stageEnvironment?.showGrid?"":undefined}
              data-shadow={stageEnvironment?.shadowSoftness!==undefined?"":undefined}
              style={{"--mm-stage-bg":stageEnvironment?.background,"--mm-look-bg":stageLookBackground(stageEnvironment,stageSkies),
                "--copro-stage-fog-color":stageFogColor,
                "--copro-stage-fog-opacity":stageEnvironment?.fogOpacity??0,
                "--copro-stage-softness":`${stageEnvironment?.shadowSoftness??2.5}px`,
                "--mm-stage-shadow":stageEnvironment?.shadowSoftness!==undefined ? `0 18px ${20+stageEnvironment.shadowSoftness*5}px rgba(0,0,0,.48)` : undefined,
                "--mm-monitor-width":previewWidth+"px","--mm-monitor-height":previewWidth/canvasRatio+"px","--mm-monitor-ratio":canvasRatio,"--mm-monitor-zoom":`scale(${previewZoom/100})`} as React.CSSProperties}
            >
              {activeMedia?.kind === "scene" && activeVisualClip && render3DScene ? (
                render3DScene({url:activeMedia.url,name:activeMedia.name,assetId:activeMedia.id,playing,
                  timeUs:Math.max(0,(playheadUs-activeVisualClip.startUs)*(activeVisualClip.playbackRate??1)+(activeVisualClip.inUs??0)),
                  environment:stageEnvironment,adjustments:activeVisualClip.metadata?.adjustments as CoProColorAdjustments|undefined,transform:activeTransform})
              ) : effectivePreviewSrc && effectivePreviewKind === "video" ? (
                <video
                  ref={videoRef}
                  className={"copro-preview-media copro-preview-effect-" + activeEffect.replace(/^overlay:/,"")}
                  src={effectivePreviewSrc}
                  playsInline
                  style={{
                    "--copro-media-transform": mediaTransformStyle.transform ?? "none",
                    "--copro-media-opacity": mediaTransformStyle.opacity ?? 1,
                    "--copro-media-cursor": mediaTransformStyle.cursor ?? "auto",
                    "--copro-media-filter": mediaTransformStyle.filter ?? "none",
                    "--copro-media-clip-path": mediaTransformStyle.clipPath ?? "none",
                    "--copro-media-mask-image": mediaTransformStyle.maskImage ?? "none",
                  } as React.CSSProperties}
                  onPointerDown={startVisualDrag} onPointerMove={moveVisualDrag} onPointerUp={endVisualDrag} onPointerCancel={endVisualDrag}
                  onLoadedData={event => {
                    const player=event.currentTarget;
                    setPreviewDecodeWarning(player.videoWidth && player.videoHeight ? null : "This file imported, but the browser cannot decode its video track. Try H.264 MP4 or browser-compatible WebM. Your original is preserved.");
                  }}
                  onError={() => setPreviewDecodeWarning("The browser could not decode this video. Relink a supported H.264 or WebM source; the original is preserved.")}
                  onPlay={() => setPlaying(true)}
                  onPause={() => {if(playbackPosition.current>=projectDurationUs)setPlaying(false);}}

                />
              ) : effectivePreviewSrc && effectivePreviewKind === "image" ? (
                <img
                  ref={imageRef}
                  className={"copro-preview-media copro-preview-effect-" + activeEffect.replace(/^overlay:/,"")}
                  src={effectivePreviewSrc}
                  alt="Project footage"
                  style={{
                    "--copro-media-transform": mediaTransformStyle.transform ?? "none",
                    "--copro-media-opacity": mediaTransformStyle.opacity ?? 1,
                    "--copro-media-cursor": mediaTransformStyle.cursor ?? "auto",
                    "--copro-media-filter": mediaTransformStyle.filter ?? "none",
                    "--copro-media-clip-path": mediaTransformStyle.clipPath ?? "none",
                    "--copro-media-mask-image": mediaTransformStyle.maskImage ?? "none",
                  } as React.CSSProperties}
                  onPointerDown={startVisualDrag} onPointerMove={moveVisualDrag} onPointerUp={endVisualDrag} onPointerCancel={endVisualDrag}
                />
              ) : (
                <div className="copro-preview-placeholder" data-state={hasUnavailableFootage ? "missing" : "empty"}
                  data-look={stageLookBackground(stageEnvironment,stageSkies)?"":undefined}
                  data-grid={stageEnvironment?.showGrid?"":undefined}
                  style={{"--mm-look-bg":stageLookBackground(stageEnvironment,stageSkies)} as React.CSSProperties}>
                  <div className="copro-preview-empty-content">
                    <span className="copro-preview-empty-kicker">{hasUnavailableFootage ? "SOURCE MEDIA" : "NEW SEQUENCE"}</span>
                    <div className="copro-preview-mark">{hasUnavailableFootage ? "Source media needed" : "Your canvas is ready"}</div>
                    <p className="copro-preview-empty-description">
                      {hasUnavailableFootage
                        ? "This edit still exists, but some original files are not loaded in this session. Import the source files again to continue."
                        : "Bring in footage, start from an editable composition, or add a title layer. Your timeline is ready."}
                    </p>
                    <div className="copro-preview-empty-actions" role="group" aria-label="Start editing">
                      <button type="button" className="is-primary" onClick={() => { setBrowserSection("import"); selectCategory("media"); }}>
                        <i>{renderToolIcon("media", systemIcons)}</i><span>Import media</span>
                      </button>
                      <button type="button" onClick={() => selectCategory("templates")}>
                        <i>{renderToolIcon("templates", systemIcons)}</i><span>Browse templates</span>
                      </button>
                      <button type="button" onClick={() => selectCategory("text")}>
                        <i>{renderToolIcon("text", systemIcons)}</i><span>Add title</span>
                      </button>
                    </div>
                    <span className="copro-preview-empty-note">{hasUnavailableFootage ? "Project structure and edits are preserved; source media must be supplied again." : "Start with a file, a composition, or a title. Nothing is uploaded until you choose."}</span>
                  </div>
                </div>
              )}

              <div className="copro-preview-overlay" aria-hidden="true" />
              {activeMedia && creativeOverlaySrc && <img className="copro-preview-composition-overlay" src={creativeOverlaySrc} alt="" aria-hidden="true" draggable={false}/>}
              {effectivePreviewSrc && <>
                <div className="mm-playback-guides" aria-hidden="true">
                  <span className="mm-safe-frame"/>
                  <span className="mm-center-cross"/>
                </div>
                <div className="mm-playback-hud" aria-hidden="true">
                  <span className="mm-playback-hud-chip is-timecode">{formatTime(playheadUs)}</span>
                  <span className={`mm-playback-hud-chip${playing ? " is-live" : ""}`}>{playing ? "REC PREVIEW" : "MONITOR"}</span>
                </div>
              </>}
              {graphicSample?.text && <div className={`copro-preview-graphic copro-preview-graphic-${activeGraphic?.id ?? "default"}`} aria-hidden="true"><span>{graphicSample.text}</span>{graphicSample.cursor && <i/>}</div>}
              {previewDecodeWarning && activeMedia?.kind === "video" && <div className="mm-video-decoding-alert" role="alert">{previewDecodeWarning}</div>}
              <div className="copro-canvas-overlays" aria-live="polite">
                {activeCanvasText.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={"copro-canvas-text copro-canvas-text-" + item.kind + (selectedClipId === item.id ? " is-selected" : "")}
                    onClick={() => onSelectClip?.(item.id)}
                  >
                    {item.text}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="copro-transport" aria-label="Playback transport">
            <button className="copro-play-button" aria-label={playing ? "Pause" : "Play"} onClick={() => void togglePlayback()}>
              {playing ? <Pause size={16} fill="currentColor"/> : <Play size={16} fill="currentColor"/>}
            </button>
            <span className="mm-transport-timecode" aria-live="polite">{formatTime(playheadUs)}</span>
            <div className="copro-transport-line" role="presentation" />
            <span className="mm-transport-duration" title="Sequence duration">{formatTime(Math.max(0,...project.tracks.flatMap(track=>track.clips.map(clip=>clip.startUs+clip.durationUs))))}</span>
            <span className={`mm-transport-state${playing ? " is-playing" : ""}`}>{playing ? "Playing" : "Paused"}</span>
            <div className="mm-preview-controls" role="group" aria-label="Preview monitor controls">
              <div className="mm-preview-control-wrap">
                <button type="button" aria-label="Playback quality" aria-expanded={previewControlMenu==="quality"} title="Playback quality" onClick={()=>setPreviewControlMenu(value=>value==="quality"?null:"quality")}><Gauge size={16}/><span>{playbackQuality}</span><ChevronDown size={11}/></button>
                {previewControlMenu==="quality"&&<div className="mm-preview-popover"><strong>Playback quality</strong>{(["Full","High","Medium","Low"] as const).map(value=><button type="button" key={value} className={playbackQuality===value?"is-active":""} onClick={()=>{setPlaybackQuality(value);setPreviewControlMenu(null);}}>{value}{playbackQuality===value&&<span>✓</span>}</button>)}<small>Monitor preview setting. Export quality is controlled by render settings.</small></div>}
              </div>
              <div className="mm-preview-control-wrap">
                <button type="button" aria-label="Preview zoom" aria-expanded={previewControlMenu==="zoom"} title="Preview zoom" onClick={()=>setPreviewControlMenu(value=>value==="zoom"?null:"zoom")}><ZoomIn size={16}/><span>{previewZoom}%</span></button>
                {previewControlMenu==="zoom"&&<div className="mm-preview-popover mm-preview-zoom-popover"><strong>Preview zoom</strong><label><span>{previewZoom}%</span><input type="range" min="50" max="200" step="5" value={previewZoom} onChange={event=>setPreviewZoom(Number(event.currentTarget.value))}/></label><button type="button" onClick={()=>{setPreviewZoom(100);setPreviewControlMenu(null);}}>Fit to view</button></div>}
              </div>
              <div className="mm-preview-control-wrap">
                <button type="button" aria-label="Canvas aspect ratio" aria-expanded={previewControlMenu==="ratio"} title="Canvas ratio" onClick={()=>setPreviewControlMenu(value=>value==="ratio"?null:"ratio")}><Ratio size={16}/><span>{currentRatioLabel}</span><ChevronDown size={11}/></button>
                {previewControlMenu==="ratio"&&<div className="mm-preview-popover mm-preview-ratio-popover"><strong>Canvas ratio</strong><button type="button" onClick={()=>chooseCanvasRatio(project.canvas?.width??1920,project.canvas?.height??1080)}>Original / Current</button>{CANVAS_RATIOS.map(ratio=><button type="button" key={ratio.label} className={currentRatioLabel===ratio.label?"is-active":""} onClick={()=>chooseCanvasRatio(ratio.width,ratio.height)}>{ratio.label}<small>{ratio.width} × {ratio.height}</small></button>)}</div>}
              </div>
              <IconAction type="button" className="mm-preview-fullscreen-button" aria-label={isFullscreen?"Exit fullscreen":"Full screen preview"} title={isFullscreen?"Exit fullscreen":"Full screen preview"} onClick={()=>void toggleFullscreen()}><Maximize2 size={16}/></IconAction>
            </div>
          </section>

          {isFullscreen&&<div className={`mm-fullscreen-control-dock${fullscreenHudVisible?" is-visible":" is-hidden"}`} onPointerMove={()=>setFullscreenHudVisible(true)}>
            <button type="button" className="mm-fullscreen-play" aria-label={playing?"Pause":"Play"} onClick={()=>void togglePlayback()}>{playing?<Pause size={17}/>:<Play size={17}/>}</button>
            <span>{formatTime(playheadUs)}</span>
            <input aria-label="Scrub preview timeline" type="range" min="0" max={Math.max(1,projectDurationUs)} value={Math.min(playheadUs,Math.max(1,projectDurationUs))} onChange={event=>onSeek?.(Number(event.currentTarget.value))}/>
            <select aria-label="Playback quality" value={playbackQuality} onChange={event=>setPlaybackQuality(event.currentTarget.value as typeof playbackQuality)}><option>Full</option><option>High</option><option>Medium</option><option>Low</option></select>
            <label className="mm-fullscreen-zoom"><ZoomIn size={15}/><input aria-label="Preview zoom" type="range" min="50" max="200" step="5" value={previewZoom} onChange={event=>setPreviewZoom(Number(event.currentTarget.value))}/>{previewZoom}%</label>
            <select aria-label="Canvas ratio" value={currentRatioLabel} onChange={event=>{const ratio=CANVAS_RATIOS.find(item=>item.label===event.currentTarget.value);if(ratio)chooseCanvasRatio(ratio.width,ratio.height);}}>{CANVAS_RATIOS.map(ratio=><option key={ratio.label} value={ratio.label}>{ratio.label}</option>)}</select>
            <IconAction type="button" aria-label="Exit fullscreen" onClick={()=>void toggleFullscreen()}><Maximize2 size={17}/></IconAction>
          </div>}

          </section>{/* Player and transport remain one resizable, movable unit. */}

          {showInspector && inspectorTool && (
            <SidePanel id="copro-tool-inspector" className={`copro-inspector-slot${inspectorFloating?" is-floating":""}`} dataAttributes={{"data-inspector-tool":inspectorTool}} ariaLabel={`${inspectorTool} inspector`}
              floatingBounds={{left:floatAt(layout.inspectorX,layout.inspectorY,inspectorWidth).x,top:floatAt(layout.inspectorX,layout.inspectorY,inspectorWidth).y,width:inspectorWidth,height:layout.inspectorFloatHeight}}
              onPointerUp={inspectorFloating ? event => saveFloatingSize(event,"inspector") : undefined}>
              <div className="mm-inspector-dock-header" onPointerDown={inspectorFloating ? event=>moveFloating(event,"inspector") : undefined}>
                <span>{inspectorFloating && <GripVertical size={14}/>}<strong>{inspectorTool==="stage"?"Scene environment":selectedIs3DObject?"3D object":selectedTrack?.kind === "audio"?"Audio":selectedClip?"Clip properties":"Project Details"}</strong></span>
                <div className="mm-inspector-window-actions">
                  <button type="button" aria-label={inspectorFloating?"Dock inspector":"Undock inspector"} title={inspectorFloating?"Dock inspector":"Float and drag inspector"} onPointerDown={event=>event.stopPropagation()} onClick={()=>setLayout(value=>({...value,inspectorFloating:!value.inspectorFloating}))}>{inspectorFloating?<DockIcon size={16}/>:<ExternalLink size={16}/>}</button>
                  <button type="button" aria-label="Collapse inspector" title="Collapse panel" onPointerDown={event=>event.stopPropagation()} onClick={()=>{if(isHandset)setHandsetPanel(null);else setLayout(value=>({...value,inspectorOpen:false}));}}>×</button>
                </div>
              </div>
              {selectedClip && <nav className="mm-selection-tabs" aria-label="Selected clip property categories">
                {((selectedIs3DObject ? [
                  ["world3d","Transform"], ["animation","Animation"],
                  ["speed","Playback"], ["stage","Scene look"]
                ] : selectedTrack?.kind === "audio" ? [
                  ["volume","Audio"], ["speed","Speed"], ["animation","Animation"]
                ] : [
                  ["video","Video"], ["speed","Speed"], ["animation","Animation"],
                  ["adjust","Color"], ["effects","Effects"]
                ]) as Array<[string,string]>).map(([tool,label]) => <button type="button" key={tool}
                  className={inspectorTool===tool?"is-active":""}
                  aria-pressed={inspectorTool===tool}
                  title={"Open "+label+" controls"}
                  onClick={()=>{
                    if(tool==="stage"){selectCategory("stage");return;}
                    setActiveTool(tool);setPanePreference("inspector");if(isHandset)setHandsetPanel("inspector");
                  }}>{label}</button>)}
              </nav>}
              {inspectorTool==="stage"
                ? <CoProStageLookPanel environment={stageEnvironment} skyDefaults={samSceneSkyDefaults} skies={stageSkies}
                    videoSources={mediaItems.filter(item=>item.kind==="video").map(item=>({id:item.id,name:item.name}))}
                    onChange={patch=>onAction?.({type:"environment",patch})}/>
                : <CoProToolPanel
                key={selectedClipId??"project"}
                tool={inspectorTool}
                projectCanvas={project.canvas}
                transitionSettings={selectedClip?.metadata?.transitionOut as any}
                motionSettings={selectedClip?.metadata?.motion as any}
                adjustments={selectedClip?.metadata?.adjustments as CoProColorAdjustments|undefined}
                mask={selectedClip?.metadata?.mask as CoProClipMask|undefined}
                onMaskChange={mask=>selectedClip&&onAction?.({type:"mask",clipId:selectedClip.id,mask})}
                onAdjustmentChange={patch=>selectedClip&&onAction?.({type:"adjustments",clipId:selectedClip.id,patch})}
                scopeHistogram={scopeHistogram}
                scopeError={scopeError}
                onSampleScopes={sampleCurrentFrameScopes}
                onBrowsePresets={()=>selectCategory(inspectorTool==="animation"?"animation":"transitions")}
                onTransitionSettingsChange={patch=>selectedClip&&onAction?.({type:"transition",clipId:selectedClip.id,transition:String((selectedClip.metadata?.transitionOut as any)?.type??"none"),...(selectedClip.metadata?.transitionOut as any),...patch})}
                onMotionSettingsChange={patch=>selectedClip&&onAction?.({type:"motion",clipId:selectedClip.id,motion:String((selectedClip.metadata?.motion as any)?.id??"none"),
                  durationUs:(selectedClip.metadata?.motion as any)?.durationUs,delayUs:(selectedClip.metadata?.motion as any)?.delayUs,
                  amplitude:(selectedClip.metadata?.motion as any)?.amplitude,...patch})}
                onClose={() => { if (isHandset) setHandsetPanel(null); else setLayout(value => ({ ...value, inspectorOpen: false })); }}
                selectedClipId={selectedClipId}
                projectTitle={projectTitle}
                projectTrackCount={project.tracks.length}
                projectClipCount={project.tracks.reduce((total,track) => total + track.clips.length,0)}
                projectDurationUs={Math.max(0,...project.tracks.flatMap(track=>track.clips.map(clip=>clip.startUs+clip.durationUs)))}
                hasSelectedClip={Boolean(selectedClip)}
                selectedClipKind={selectedTrack?.kind}
                selectedClipStartUs={selectedClip?.startUs ?? 0}
                selectedClipDurationUs={selectedClip?.durationUs ?? 0}
                initialSpeed={selectedClip?.playbackRate ?? 1}
                initialVolume={selectedClip?.volume ?? 1}
                transform={selectedClip?.metadata?.transform as {scale?:number;x?:number;y?:number;rotation?:number;opacity?:number}|undefined}
                world3dTransform={(selectedClip?.metadata?.world3d as {transform?:{x?:number;y?:number;z?:number;rotationYDeg?:number;scale?:number;opacity?:number}}|undefined)?.transform}
                world3dVisible={(selectedClip?.metadata?.world3d as {visible?:boolean}|undefined)?.visible!==false}
                onWorld3DChange={patch=>selectedClip&&onAction?.({type:"world3d",clipId:selectedClip.id,patch})}
                onTransformChange={(patch) => selectedClip && onAction?.({type:"transform",clipId:selectedClip.id,patch})}
                initialText={typeof selectedClip?.metadata?.text === "string" ? selectedClip.metadata.text : ""}
                hasSelection={Boolean(selectedClip &&
                  ((activeTool === "text" && selectedTrack?.kind === "overlay") ||
                   (activeTool === "captions" && selectedTrack?.kind === "captions")))}
                onTrimChange={(patch) => selectedClip && onAction?.({type:"trim",clipId:selectedClip.id,patch})}
                onSpeedChange={(playbackRate) => selectedClip && onAction?.({type:"speed",clipId:selectedClip.id,playbackRate})}
                onVolumeChange={(volume) => selectedClip && onAction?.({type:"volume",clipId:selectedClip.id,volume})}
                onTextCommit={(text, kind) => {
                  if (selectedClip && ((kind === "overlay" && selectedTrack?.kind === "overlay") ||
                       (kind === "captions" && selectedTrack?.kind === "captions"))) {
                    onAction?.({type:"text",clipId:selectedClip.id,text});
                  } else {
                    onAction?.({type:"create-text",kind,text,atUs:playheadUs});
                  }
                }}
                onMediaPicked={(file) => onAction?.({type:"import-media",file,atUs:playheadUs})}
                mediaItems={mediaItems}
                onMediaAdd={(id) => onMediaAdd?.(id,playheadUs)}
                creativeAssets={creativeAssets}
                currentEffect={String(selectedClip?.metadata?.effect ?? "none")}
                currentTransition={String((selectedClip?.metadata?.transitionOut as any)?.type ?? "none")}
                currentMotion={String((selectedClip?.metadata?.motion as any)?.id ?? "")}
                currentGraphic={String((selectedClip?.metadata?.graphic as any)?.id ?? "")}
                currentGraphicText={String((selectedClip?.metadata?.graphic as any)?.text ?? "")}
                creativeParameters={(selectedClip?.metadata?.creative as any)?.parameters as Record<string,unknown>|undefined}
                creativeScene={String((selectedClip?.metadata?.creative as any)?.scene??"")}
                onEffectChange={(effect) => selectedClip && onAction?.({type:"effect",clipId:selectedClip.id,effect})}
                onTransitionChange={(transition) => selectedClip && onAction?.({type:"transition",clipId:selectedClip.id,transition,durationUs:300_000})}
                onMotionChange={(motion) => selectedClip && onAction?.({type:"motion",clipId:selectedClip.id,motion})}
                onGraphicChange={(graphic,text) => selectedClip && onAction?.({type:"graphic",clipId:selectedClip.id,graphic,text})}
                onCreativeParametersChange={(patch) => selectedClip && onAction?.({type:"creative-parameters",clipId:selectedClip.id,patch})}
                onProjectExport={() => onAction?.({type:"export-project"})}
              />}
            </SidePanel>
          )}

          {dockInspector && !isNarrow && <ResizeHandle axis="x" className="copro-inspector-divider" label="Resize clip inspector" value={inspectorWidth} min={250} max={Math.max(270, workspaceWidth - (showBrowser ? browserWidth : 0) - 410)} direction={layout.reversed ? 1 : -1} onChange={width => setLayout(value => ({ ...value, inspectorWidth: width }))}/>}
          <ResizeHandle axis="y" className="copro-timeline-divider" label="Resize timeline" value={timelineHeight} min={isCompact ? 115 : 150} max={Math.max(isCompact ? 170 : 180, workspaceHeight - (isCompact ? 320 : 230))} direction={-1} onChange={height => setLayout(value => ({ ...value, timelineHeight: height }))}/>
          <CoProTimeline
            project={project}
            mediaThumbnails={Object.fromEntries(mediaItems.filter(item=>item.thumbnails?.length).map(item=>[item.id,item.thumbnails!]))}
            selectedClipId={selectedClipId}
            playheadUs={playheadUs}
            onSelectClip={onSelectClip}
            onSeek={onSeek}
            onMoveClip={(clipId, startUs) => onAction?.({ type: "move", clipId, startUs })}
            onTrimClip={(clipId, patch) => onAction?.({ type: "trim", clipId, patch })}
            onAddTrack={() => onAction?.({ type: "add-track" })}
            onTrackState={(trackId, patch) => onAction?.({ type: "track-state", trackId, patch })}
            onTrackReorder={(trackId, index) => onAction?.({ type: "track-reorder", trackId, index })}
            onClipContextAction={(action,clipId,atUs)=>{
              onSelectClip?.(clipId);
              if(action==="split")onAction?.({type:"split",clipId,atUs});
              else if(action==="duplicate")onAction?.({type:"duplicate",clipId});
              else if(action==="delete")onAction?.({type:"delete",clipId});
              else {
                setActiveTool(action==="adjust"?"adjust":action);
                setPanePreference("inspector");
                if(isHandset)setHandsetPanel("inspector");
                setLayout(value=>({...value,inspectorOpen:true}));
              }
            }}
          />

          <section className={"copro-context-tools" + (isHandset ? " is-handset" : "") + (selectedClip ? " is-contextual" : "")} aria-label={selectedClip ? "Selected clip actions" : "Editing destinations"}>
            {!isNarrow && <>
              <button type="button" disabled={!canUndo} aria-label="Undo last edit" title="Undo (⌘Z)" onClick={() => onAction?.({ type: "undo" })}><i><Undo2 size={19}/></i><span>Undo</span></button>
              <button type="button" disabled={!canRedo} aria-label="Redo last edit" title="Redo (⇧⌘Z)" onClick={() => onAction?.({ type: "redo" })}><i><Redo2 size={19}/></i><span>Redo</span></button>
            </>}
            {isNarrow && selectedClip ? <button type="button" className="copro-deselect-button" aria-label="Finish clip editing" onClick={() => {onSelectClip?.(null);if(isHandset)setHandsetPanel(null);}}><i><X size={19}/></i><span>Done</span></button> : null}
            {(isHandset
              ? selectedClip ? CLIP_TOOLS : HANDSET_PRIMARY_TOOLS
              : selectedClip ? CLIP_TOOLS : PRIMARY_TOOLS
            ).map(([id, label]) => (
              <button type="button" key={id} aria-pressed={activeTool === id || (id === "more" && categoryTool === "more" && handsetPanel === "browser")} className={[id === "delete" ? "is-danger" : "", activeTool === id || (id === "more" && categoryTool === "more" && handsetPanel === "browser") ? "is-active" : ""].join(" ")} onClick={() => runTool(id)}>
                <i>{renderToolIcon(id,systemIcons)}</i><span>{label}</span>
              </button>
            ))}
          </section>
        </div>
      </main>


    </section>
  );
}

function formatTime(timeUs: number) {
  const totalSeconds = Math.max(0, timeUs / 1_000_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frames = Math.floor((totalSeconds % 1) * 30);
  return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0") + ":" + String(frames).padStart(2, "0");
}
