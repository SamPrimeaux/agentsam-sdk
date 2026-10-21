import { IconAction } from "./icon-action.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, AudioLines, Captions, Copy, Film,
  Layers, Play, Pause, Redo2, Scissors, SlidersHorizontal, Sparkles,
  Trash2, Type, Undo2, X, Gauge, Volume2, Replace, Clapperboard, PanelLeftClose, PanelRightClose, PanelsTopLeft, RotateCcw,
  Sticker, Palette, SlidersVertical, Folder, Download, Film as FilmIcon, GripVertical, PanelsTopLeft as DockIcon, ExternalLink,
} from "lucide-react";
import { CoProTimeline, type CoProProjectView } from "./timeline.js";
import { CoProToolPanel, type CoProMediaShelfItem } from "./tool-sheet.js";
import { ResizeHandle, useWorkspaceLayout, clampWorkspaceSize } from "./workspace-layout-moviemode.js";


export type CoProStudioAction =
  | { type: "back" }
  | { type: "export-project" }
  | { type: "browse-templates" }
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
  | { type: "text"; clipId: string; text: string }
  | { type: "effect"; clipId: string; effect: string }
  | { type: "transition"; clipId: string; transition: string; durationUs?: number }
  | { type: "create-text"; kind: "overlay" | "captions"; text: string; atUs: number }
  | { type: "import-media"; file: File; atUs: number }
  | { type: "add-track" }
  | { type: "track-state"; trackId: string; patch: { visible?: boolean; muted?: boolean; locked?: boolean } }
  | { type: "track-reorder"; trackId: string; index: number };

export type CoProStudioProps = {
  project: CoProProjectView;
  initialTool?: "text" | "captions" | null;
  playheadUs: number;
  selectedClipId?: string | null;
  canUndo?: boolean;
  canRedo?: boolean;
  projectTitle?: string;
  previewSrc?: string | null;
  previewKind?: "video" | "image" | null;
  mediaItems?: CoProMediaShelfItem[];
  onSeek?: (timeUs: number) => void;
  onSelectClip?: (clipId: string | null) => void;
  onMediaAdd?: (id: string, atUs: number) => void;
  onAction?: (action: CoProStudioAction) => void;
};

const PRIMARY_TOOLS = [
  ["media", "Media", "+"],
  ["audio", "Audio", "♫"],
  ["text", "Text", "T"],
  ["captions", "Captions", "CC"],
  ["stickers", "Stickers", "☆"],
  ["effects", "Effects", "✦"],
  ["filters", "Filters", "◐"],
  ["adjustments", "Adjustment", "☷"],
  ["transitions", "Transitions", "◇"],
  ["templates", "Templates", "▦"],
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

function renderToolIcon(id: string) {
  const size = 21;
  switch (id) {
    case "media": return <Film size={size}/>;
    case "audio": return <AudioLines size={size}/>;
    case "text": return <Type size={size}/>;
    case "captions": return <Captions size={size}/>;
    case "stickers": return <Sticker size={size}/>;
    case "filters": return <Palette size={size}/>;
    case "adjustments": return <SlidersVertical size={size}/>;
    case "effects": return <Sparkles size={size}/>;
    case "transitions": return <Layers size={size}/>;
    case "templates": return <Clapperboard size={size}/>;
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
  playheadUs,
  selectedClipId,
  canUndo = false,
  canRedo = false,
  projectTitle = "Untitled project",
  previewSrc,
  previewKind,
  mediaItems = [],
  onSeek,
  onSelectClip,
  onMediaAdd,
  onAction,
}: CoProStudioProps) {
  const [playing, setPlaying] = useState(false);
  const [previewDecodeWarning, setPreviewDecodeWarning] = useState<string|null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(initialTool);
  const [categoryTool, setCategoryTool] = useState<string>(initialTool ?? "media");
  const [browserSection, setBrowserSection] = useState<"import" | "media" | "subprojects" | "yours" | "generate" | "spaces" | "library">("import");
  const [panePreference, setPanePreference] = useState<"browser" | "inspector">("browser");
  const [handsetPanel, setHandsetPanel] = useState<"browser" | "inspector" | null>(null);
  const { layout, setLayout, resetLayout } = useWorkspaceLayout();
  const workspaceRef = useRef<HTMLElement>(null);
  const [workspaceWidth, setWorkspaceWidth] = useState(1440);
  const [workspaceHeight, setWorkspaceHeight] = useState(800);

  useEffect(() => {
    if (!workspaceRef.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setWorkspaceWidth(entry.contentRect.width);
      setWorkspaceHeight(entry.contentRect.height);
    });
    observer.observe(workspaceRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { if (selectedClipId) setPanePreference("inspector"); }, [selectedClipId]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const dragStartRef = useRef<{startX:number;startY:number;x:number;y:number;clipId:string;nextX:number;nextY:number}|null>(null);

  const selectedEntry = useMemo(() => {
    for (const track of project.tracks) {
      const found = track.clips.find((clip) => clip.id === selectedClipId);
      if (found) return { clip: found, track };
    }
    return null;
  }, [project, selectedClipId]);

  const selectedClip = selectedEntry?.clip ?? null;
  const selectedTrack = selectedEntry?.track ?? null;
  const isNarrow = workspaceWidth < 1180;
  const isCompact = workspaceWidth < 760;
  const isHandset = workspaceWidth < 560;
  const clipSpecificTools = ["trim", "speed", "volume", "effects", "transitions", "text", "captions", "transform", "filters", "adjustments"];
  const canonicalTool = (tool: string | null) => tool === "filters" ? "effects" : tool === "adjustments" ? "transform" : tool;
  const inspectorTool = activeTool === "export" ? "export" : selectedClip
    ? (activeTool && clipSpecificTools.includes(activeTool) ? canonicalTool(activeTool) : selectedTrack?.kind === "audio" ? "volume" : selectedTrack?.kind === "captions" ? "captions" : selectedTrack?.kind === "overlay" ? "text" : "transform")
    : "project";
  const inspectorAvailable = Boolean(inspectorTool);
  const showInspector = isHandset ? handsetPanel === "inspector" && inspectorAvailable : inspectorAvailable && layout.inspectorOpen && (!isNarrow || panePreference === "inspector" || !layout.browserOpen);
  const showBrowser = isHandset ? handsetPanel === "browser" : layout.browserOpen && (!isNarrow || !showInspector);
  const browserFloating = !isNarrow && showBrowser && layout.browserFloating;
  const inspectorFloating = !isNarrow && showInspector && layout.inspectorFloating;
  const dockBrowser = showBrowser && !browserFloating;
  const dockInspector = showInspector && !inspectorFloating;
  const browserWidth = clampWorkspaceSize(layout.browserWidth, 260, Math.max(260, workspaceWidth - (dockInspector ? layout.inspectorWidth : 0) - 330));
  const inspectorWidth = clampWorkspaceSize(layout.inspectorWidth, 260, Math.max(260, workspaceWidth - (dockBrowser ? browserWidth : 0) - 330));
  const timelineHeight = clampWorkspaceSize(layout.timelineHeight || Math.round(workspaceHeight * .45), isCompact ? 115 : 150, Math.max(isCompact ? 170 : 180, workspaceHeight - (isCompact ? 300 : 225)));
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
        if (playheadUs >= clip.startUs && playheadUs < clip.startUs + clip.durationUs) {
          if (track.kind === "video" || mediaItems.some((media) => media.id === clip.assetId && media.kind === "image")) {
            return clip;
          }
        }
      }
    }
    return null;
  }, [project, playheadUs, mediaItems]);

  const activeMedia = activeVisualClip
    ? mediaItems.find((item) => item.id === activeVisualClip.assetId) ?? null
    : null;
  const activeTransform = (activeVisualClip?.metadata?.transform ?? {}) as { scale?:number; x?:number; y?:number; rotation?:number; opacity?:number };
  const mediaTransformStyle: React.CSSProperties = {
    transform: `translate(${activeTransform.x ?? 0}%, ${activeTransform.y ?? 0}%) scale(${activeTransform.scale ?? 1}) rotate(${activeTransform.rotation ?? 0}deg)`,
    opacity: activeTransform.opacity ?? 1,
    cursor: activeVisualClip ? "grab" : undefined,
    touchAction: "none",
  };
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
  const effectivePreviewSrc = activeMedia ? activeMedia.url : (mediaItems.length ? null : previewSrc);
  useEffect(()=>setPreviewDecodeWarning(null),[effectivePreviewSrc]);
  const effectivePreviewKind = activeMedia?.kind === "image" ? "image"
    : activeMedia?.kind === "video" ? "video"
    : mediaItems.length ? null : previewKind;
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
    if (!video) return;
    const seekSeconds = activeVisualClip
      ? (playheadUs - activeVisualClip.startUs + (activeVisualClip.inUs ?? 0)) / 1_000_000
      : 0;
    if (Math.abs(video.currentTime - seekSeconds) > .25 && Number.isFinite(video.duration)) {
      video.currentTime = Math.min(seekSeconds, video.duration || seekSeconds);
    }
    video.playbackRate = Math.max(.25, Math.min(4, selectedClip?.playbackRate ?? 1));
    video.volume = Math.max(0, Math.min(1, selectedClip?.volume ?? 1));
  }, [playheadUs, activeVisualClip?.startUs, activeVisualClip?.inUs, selectedClip?.playbackRate, selectedClip?.volume]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;

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

      if (event.key.toLowerCase() === "s" && selectedClip) {
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
      setPlaying((value) => !value);
      return;
    }
    if (video.paused) {
      await video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  }

  function runTool(id: string) {
    if (id === "templates") { onAction?.({type:"browse-templates"}); return; }
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
    if (id === "templates") { onAction?.({type:"browse-templates"}); return; }
    setCategoryTool(id);
    if (isHandset) setHandsetPanel("browser");
    setLayout(value => ({...value,browserOpen:true}));
    setPanePreference("browser");
    if (selectedClip && ["effects","transitions","filters","adjustments"].includes(id)) setActiveTool(id);
  }

  return (
    <section className="copro-studio" data-inspector-open={Boolean(activeTool)} data-handset={isHandset}>
      <header className="copro-topbar">
        <IconAction className="copro-icon-button" aria-label="Back to projects" onClick={() => onAction?.({ type: "back" })}><ArrowLeft size={22}/></IconAction>
        <div className="copro-title-block">
          <strong>{projectTitle}</strong>
          <span>MovieMode</span>
        </div>
        <div className="copro-topbar-actions">
          <IconAction className="copro-icon-button copro-history-button" aria-label="Undo" disabled={!canUndo} onClick={() => onAction?.({ type: "undo" })}><Undo2 size={20}/></IconAction>
          <IconAction className="copro-icon-button copro-history-button" aria-label="Redo" disabled={!canRedo} onClick={() => onAction?.({ type: "redo" })}><Redo2 size={20}/></IconAction>
          <IconAction className="copro-icon-button" type="button" title={layout.browserOpen ? "Collapse media browser" : "Show media browser"} aria-label={layout.browserOpen ? "Collapse media browser" : "Show media browser"} aria-pressed={isHandset ? handsetPanel === "browser" : layout.browserOpen} onClick={() => { if (isHandset) setHandsetPanel(value => value === "browser" ? null : "browser"); else setLayout(value => ({ ...value, browserOpen: !value.browserOpen })); setPanePreference("browser"); }}><PanelLeftClose size={18}/></IconAction>
          <IconAction className="copro-icon-button" type="button" title={layout.inspectorOpen ? "Collapse inspector" : "Show inspector"} aria-label={layout.inspectorOpen ? "Collapse inspector" : "Show inspector"} aria-pressed={isHandset ? handsetPanel === "inspector" : layout.inspectorOpen} onClick={() => { if (isHandset) setHandsetPanel(value => value === "inspector" ? null : "inspector"); else setLayout(value => ({ ...value, inspectorOpen: !value.inspectorOpen })); setPanePreference("inspector"); }}><PanelRightClose size={18}/></IconAction>
          <IconAction className="copro-icon-button copro-wide-layout-control" type="button" title="Swap dock positions of browser and inspector" aria-label="Swap browser and inspector" onClick={() => setLayout(value => ({ ...value, reversed: !value.reversed }))}><PanelsTopLeft size={18}/></IconAction>
          <label className="mm-workspace-preset" title="Choose a saved-panel layout preset"><span>Layout</span><select aria-label="Workspace layout preset" defaultValue="custom" onChange={event=>{
            const choice=event.currentTarget.value;
            if (choice === "balanced") resetLayout();
            if (choice === "media") setLayout(old=>({...old,browserWidth:590,inspectorWidth:300,timelineHeight:Math.round(workspaceHeight*.36),browserOpen:true,inspectorOpen:true,browserFloating:false,inspectorFloating:false}));
            if (choice === "timeline") setLayout(old=>({...old,browserWidth:390,inspectorWidth:300,timelineHeight:Math.round(workspaceHeight*.55),browserOpen:true,inspectorOpen:true,browserFloating:false,inspectorFloating:false}));
          }}><option value="custom">Custom</option><option value="balanced">Balanced</option><option value="media">Media focus</option><option value="timeline">Timeline focus</option></select></label>
          <IconAction className="copro-icon-button copro-wide-layout-control" type="button" title="Restore default panel widths, docking and timeline height" aria-label="Reset workspace layout" onClick={() => { resetLayout(); setPanePreference("browser"); }}><RotateCcw size={18}/></IconAction>
          <button className="copro-export-button" aria-expanded={activeTool === "export"} aria-controls="copro-tool-inspector" onClick={() => { setActiveTool("export"); if (isHandset) setHandsetPanel("inspector"); setLayout(value => ({ ...value, inspectorOpen: true })); setPanePreference("inspector"); }}>Export</button>
        </div>
      </header>

      <main className="copro-workspace" ref={workspaceRef}>
        <div className={["copro-editing-grid", showBrowser ? "has-browser" : "", showInspector ? "has-inspector" : "", isNarrow ? "is-narrow" : "", isCompact ? "is-compact" : "", layout.reversed ? "is-reversed" : ""].filter(Boolean).join(" ")} style={{
          "--copro-browser-width": dockBrowser ? browserWidth + "px" : "0px",
          "--copro-browser-handle": dockBrowser ? "8px" : "0px",
          "--copro-inspector-width": dockInspector ? inspectorWidth + "px" : "0px",
          "--copro-inspector-handle": dockInspector ? "8px" : "0px",
          "--copro-timeline-height": timelineHeight + "px",
        } as React.CSSProperties} data-layout-mode={isCompact ? "mobile" : isNarrow ? "single-pane" : "wide"}>
          {showBrowser && <aside id="copro-tool-browser" className={`copro-browser-slot mm-browser${browserFloating ? " is-floating" : ""}`} aria-label={`${categoryTool} browser`}
            style={{
              "--copro-floating-left": layout.browserX + "px",
              "--copro-floating-top": layout.browserY + "px",
              "--copro-floating-width": browserWidth + "px",
              "--copro-floating-height": layout.browserFloatHeight + "px",
            } as React.CSSProperties}
            onPointerUp={browserFloating ? (event) => saveFloatingSize(event,"browser") : undefined}>
      <nav className="mm-editor-categories" aria-label="MovieMode editing categories">
        {PRIMARY_TOOLS.map(([id,label]) => <button key={id} type="button" className={categoryTool===id?"is-active":""} aria-pressed={categoryTool===id} title={id==="templates"?"Browse editable composition templates":`${label}: open the creation browser`} onClick={()=>selectCategory(id)}>
          {renderToolIcon(id)}<span>{label}</span>
        </button>)}
      </nav>
            <div className="mm-browser-top" onPointerDown={browserFloating ? event => moveFloating(event,"browser") : undefined}><span>{browserFloating && <GripVertical size={14} aria-hidden="true"/>}<strong>{categoryTool.charAt(0).toUpperCase()+categoryTool.slice(1)}</strong></span><div className="mm-panel-window-buttons"><button type="button" aria-label={browserFloating ? "Dock Media browser" : "Undock Media browser"} title={browserFloating ? "Dock Media browser back into workspace" : "Float and drag Media browser"} onPointerDown={event=>event.stopPropagation()} onClick={()=>setLayout(value=>({...value,browserFloating:!value.browserFloating}))}>{browserFloating?<DockIcon size={16}/>:<ExternalLink size={16}/>}</button><strong>{categoryTool.charAt(0).toUpperCase()+categoryTool.slice(1)}</strong><button type="button" aria-label="Collapse media browser" title="Collapse panel" onPointerDown={event=>event.stopPropagation()} onClick={()=>setLayout(value=>({...value,browserOpen:false}))}>×</button></div></div>
            {categoryTool === "media" && <nav className="mm-media-subnav" aria-label="Media collections">
              {([ ["import","Import"], ["media","Media"], ["subprojects","Subprojects"], ["yours","Yours"], ["generate","Generate"], ["spaces","Spaces"], ["library","Library"] ] as const).map(([id,label]) => <button type="button" key={id} className={browserSection===id?"is-active":""} aria-pressed={browserSection===id} onClick={()=>setBrowserSection(id)}>{label}</button>)}
            </nav>}
            {categoryTool === "media" && ["subprojects","generate","spaces"].includes(browserSection) ? <div className="mm-browser-unavailable"><strong>{browserSection==="subprojects"?"Compound clips":browserSection==="generate"?"Media generation":"Connected spaces"}</strong><p>{browserSection==="generate"?"Generation requires an authorized provider. Open miniAgentSam to explore connected capabilities; no fake generations here.":browserSection==="spaces"?"Connect a permitted workspace to browse remote files; imported local files remain in Media and Yours.":"Build compositions by adding clips to tracks. Compound-clip browsing requires the linked subproject engine."}</p><button onClick={()=>setBrowserSection("media")}>Browse imported media</button></div> : <CoProToolPanel tool={categoryTool==="filters"?"effects":categoryTool==="adjustments"?"transform":categoryTool==="stickers"?"stickers":categoryTool} onClose={() => { if (isHandset) setHandsetPanel(null); else setLayout(value => ({ ...value, browserOpen: false })); }}
              mediaItems={mediaItems} onMediaAdd={(id) => onMediaAdd?.(id,playheadUs)}
              onMediaPicked={(file) => onAction?.({type:"import-media",file,atUs:playheadUs})}
              onTextCommit={(text,kind) => onAction?.({type:"create-text",kind,text,atUs:playheadUs})}
              onEffectChange={(effect) => selectedClip && onAction?.({type:"effect",clipId:selectedClip.id,effect})}
              onTransitionChange={(transition) => selectedClip && onAction?.({type:"transition",clipId:selectedClip.id,transition,durationUs:300_000})}
              onTransformChange={(patch) => selectedClip && onAction?.({type:"transform",clipId:selectedClip.id,patch})}
              transform={selectedClip?.metadata?.transform as {scale?:number;x?:number;y?:number;rotation?:number;opacity?:number}|undefined}
              hasSelectedClip={Boolean(selectedClip && ["effects","transitions","filters","adjustments"].includes(categoryTool))}
              selectedClipId={selectedClipId}
              onProjectExport={() => onAction?.({type:"export-project"})}
            />}
          </aside>}
          {dockBrowser && !isNarrow && <ResizeHandle axis="x" className="copro-browser-divider" label="Resize tool browser" value={browserWidth} min={240} max={Math.max(260,workspaceWidth - (showInspector ? inspectorWidth : 0) - 410)} direction={layout.reversed ? -1 : 1} onChange={width => setLayout(value => ({ ...value, browserWidth: width }))}/>}

          <section className={`mm-player-pane${layout.playerFloating && !isNarrow?" is-floating":""}`} aria-label="MovieMode player"
            style={{
              "--copro-floating-left": layout.playerX + "px",
              "--copro-floating-top": layout.playerY + "px",
              "--copro-floating-width": layout.playerFloatWidth + "px",
              "--copro-floating-height": layout.playerFloatHeight + "px",
            } as React.CSSProperties}
            onPointerUp={layout.playerFloating && !isNarrow?event=>saveFloatingSize(event,"player"):undefined}>
            <div className="mm-player-pane-header" onPointerDown={layout.playerFloating && !isNarrow?event=>moveFloating(event,"player"):undefined}>
              <span>{layout.playerFloating && !isNarrow && <GripVertical size={14}/>}Player · Timeline 01</span>
              <button type="button" aria-label={layout.playerFloating ? "Dock player" : "Undock player"} title={layout.playerFloating ? "Dock player" : "Float and drag player"} onPointerDown={event=>event.stopPropagation()} onClick={()=>setLayout(old=>({...old,playerFloating:!old.playerFloating}))}>{layout.playerFloating?<DockIcon size={16}/>:<ExternalLink size={16}/>}</button>
            </div>
            <section className="copro-preview-stage">
            <div className={`copro-preview-device${effectivePreviewSrc?"":" is-empty"}`}>
              {effectivePreviewSrc && effectivePreviewKind === "video" ? (
                <video
                  ref={videoRef}
                  className={"copro-preview-media copro-preview-effect-" + String(selectedClip?.metadata?.effect ?? "none")}
                  src={effectivePreviewSrc}
                  playsInline
                  style={{
                    "--copro-media-transform": mediaTransformStyle.transform ?? "none",
                    "--copro-media-opacity": mediaTransformStyle.opacity ?? 1,
                    "--copro-media-cursor": mediaTransformStyle.cursor ?? "auto",
                  } as React.CSSProperties}
                  onPointerDown={startVisualDrag} onPointerMove={moveVisualDrag} onPointerUp={endVisualDrag} onPointerCancel={endVisualDrag}
                  onLoadedData={event => {
                    const player=event.currentTarget;
                    setPreviewDecodeWarning(player.videoWidth && player.videoHeight ? null : "This file imported, but the browser cannot decode its video track. Try H.264 MP4 or browser-compatible WebM. Your original is preserved.");
                  }}
                  onError={() => setPreviewDecodeWarning("The browser could not decode this video. Relink a supported H.264 or WebM source; the original is preserved.")}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onTimeUpdate={(event) => {
                    const base = activeVisualClip?.startUs ?? 0;
                    onSeek?.(base + Math.round(event.currentTarget.currentTime * 1_000_000));
                  }}
                />
              ) : effectivePreviewSrc && effectivePreviewKind === "image" ? (
                <img
                  className={"copro-preview-media copro-preview-effect-" + String(selectedClip?.metadata?.effect ?? "none")}
                  src={effectivePreviewSrc}
                  alt="Project footage"
                  style={{
                    "--copro-media-transform": mediaTransformStyle.transform ?? "none",
                    "--copro-media-opacity": mediaTransformStyle.opacity ?? 1,
                    "--copro-media-cursor": mediaTransformStyle.cursor ?? "auto",
                  } as React.CSSProperties}
                  onPointerDown={startVisualDrag} onPointerMove={moveVisualDrag} onPointerUp={endVisualDrag} onPointerCancel={endVisualDrag}
                />
              ) : (
                <div className="copro-preview-placeholder">
                  <div className="copro-preview-mark">{hasUnavailableFootage ? "Media unavailable" : "Preview ready"}</div>
                  <p>{hasUnavailableFootage ? "Relink the original files in Media to restore this project." : "Import media or drag a clip to the timeline."}</p>
                </div>
              )}

              {previewDecodeWarning && activeMedia?.kind === "video" && <div className="mm-video-decoding-alert" role="alert">{previewDecodeWarning}</div>}
              <div className="copro-canvas-overlays" aria-live="polite">
                {activeCanvasText.map((item) => (
                  <button
                    key={item.id}
                    className={"copro-canvas-text copro-canvas-text-" + item.kind + (selectedClipId === item.id ? " is-selected" : "")}
                    onClick={() => onSelectClip?.(item.id)}
                  >
                    {item.text}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="copro-transport">
            <button className="copro-play-button" aria-label={playing ? "Pause" : "Play"} onClick={() => void togglePlayback()}>
              {playing ? <Pause size={16} fill="currentColor"/> : <Play size={16} fill="currentColor"/>}
            </button>
            <span>{formatTime(playheadUs)}</span>
            <div className="copro-transport-line" />
            <IconAction className="copro-icon-button" aria-label="Timeline controls" onClick={() => onSelectClip?.(null)}><SlidersHorizontal size={18}/></IconAction>
          </section>

          </section>{/* Player and transport remain one resizable, movable unit. */}

          {showInspector && inspectorTool && (
            <aside id="copro-tool-inspector" className={`copro-inspector-slot${inspectorFloating?" is-floating":""}`} data-inspector-tool={inspectorTool} aria-label={`${inspectorTool} inspector`}
              style={{
                "--copro-floating-left": layout.inspectorX + "px",
                "--copro-floating-top": layout.inspectorY + "px",
                "--copro-floating-width": inspectorWidth + "px",
                "--copro-floating-height": layout.inspectorFloatHeight + "px",
              } as React.CSSProperties}
              onPointerUp={inspectorFloating ? event => saveFloatingSize(event,"inspector") : undefined}>
              <div className="mm-inspector-dock-header" onPointerDown={inspectorFloating ? event=>moveFloating(event,"inspector") : undefined}>
                <span>{inspectorFloating && <GripVertical size={14}/>}<strong>{selectedTrack?.kind === "audio"?"Audio":selectedClip?"Clip properties":"Project Details"}</strong></span>
                <button type="button" aria-label={inspectorFloating?"Dock inspector":"Undock inspector"} title={inspectorFloating?"Dock inspector":"Float and drag inspector"} onPointerDown={event=>event.stopPropagation()} onClick={()=>setLayout(value=>({...value,inspectorFloating:!value.inspectorFloating}))}>{inspectorFloating?<DockIcon size={16}/>:<ExternalLink size={16}/>}</button>
              </div>
              {selectedClip && <nav className="mm-selection-tabs" aria-label="Selected clip property categories">
                {((selectedTrack?.kind === "audio" ? [
                  ["volume","Audio",true], ["speed","Speed",true], ["animation","Animation",false]
                ] : [
                  ["transform","Video",true], ["volume","Audio",true], ["speed","Speed",true],
                  ["animation","Animation",false], ["effects","Effects",true], ["transitions","Transitions",true]
                ]) as Array<[string,string,boolean]>).map(([tool,label,ready]) => <button type="button" key={tool}
                  className={inspectorTool===tool?"is-active":""} aria-pressed={inspectorTool===tool}
                  disabled={!ready} title={ready ? `Edit ${label.toLowerCase()} properties of the selected clip` : "Animation keyframes require a verified preview and render implementation"}
                  onClick={()=>setActiveTool(tool)}>{label}</button>)}
              </nav>}
              <CoProToolPanel
                tool={inspectorTool}
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
                currentEffect={String(selectedClip?.metadata?.effect ?? "none")}
                currentTransition={String((selectedClip?.metadata?.transitionOut as any)?.type ?? "none")}
                onEffectChange={(effect) => selectedClip && onAction?.({type:"effect",clipId:selectedClip.id,effect})}
                onTransitionChange={(transition) => selectedClip && onAction?.({type:"transition",clipId:selectedClip.id,transition,durationUs:300_000})}
                onProjectExport={() => onAction?.({type:"export-project"})}
              />
            </aside>
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
          />

          <section className="copro-context-tools" aria-label="Editing tools">
            <button type="button" disabled={!canUndo} aria-label="Undo last edit" title="Undo (⌘Z)" onClick={() => onAction?.({ type: "undo" })}><i><Undo2 size={19}/></i><span>Undo</span></button>
            <button type="button" disabled={!canRedo} aria-label="Redo last edit" title="Redo (⇧⌘Z)" onClick={() => onAction?.({ type: "redo" })}><i><Redo2 size={19}/></i><span>Redo</span></button>
            {selectedClip ? <button className="copro-deselect-button" onClick={() => onSelectClip?.(null)}><X size={20}/><span>Done</span></button> : null}
            {(selectedClip ? CLIP_TOOLS : PRIMARY_TOOLS).map(([id, label]) => (
              <button key={id} aria-pressed={activeTool === id} className={[id === "delete" ? "is-danger" : "", activeTool === id ? "is-active" : ""].join(" ")} onClick={() => runTool(id)}>
                <i>{renderToolIcon(id)}</i><span>{label}</span>
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
