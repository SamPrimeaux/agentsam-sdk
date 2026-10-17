import React, { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft, AudioLines, Captions, Copy, Film,
  Layers, Play, Pause, Redo2, Scissors, SlidersHorizontal, Sparkles,
  PanelLeftClose, PanelRightClose, PanelsTopLeft, RotateCcw, GripVertical, ExternalLink,
  Trash2, Type, Undo2, X, Gauge, Volume2, Replace, Clapperboard,
} from "lucide-react";
import { CoProTimeline, type CoProProjectView } from "./timeline";
import { CoProToolPanel, type CoProMediaShelfItem } from "./tool-sheet";
import {CoProResizeHandle,useCoProWorkspaceLayout,useWorkspaceContainer,bounded,DEFAULT_WORKSPACE_LAYOUT,type WorkspacePane} from "./workspace-layout";


export type CoProStudioAction =
  | { type: "back" }
  | { type: "export-project" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "split"; clipId: string; atUs: number }
  | { type: "duplicate"; clipId: string }
  | { type: "delete"; clipId: string }
  | { type: "move"; clipId: string; startUs: number }
  | { type: "trim"; clipId: string; patch: { startUs?: number; inUs?: number; durationUs?: number } }
  | { type: "speed"; clipId: string; playbackRate: number }
  | { type: "volume"; clipId: string; volume: number }
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
  mediaError?: string | null;
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
  ["effects", "Effects", "✦"],
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
  mediaError = null,
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
  const {layout,update: updateLayout,reset: resetLayout}=useCoProWorkspaceLayout();
  const sourceTool=layout.sourceTool;
  const inspectorTool=layout.inspectorTool;
  const activePane=layout.activePane;
  const workspaceRef=useRef<HTMLDivElement>(null);
  const {width:containerWidth,mode}=useWorkspaceContainer(workspaceRef);
  useEffect(()=>{
    if(initialTool)updateLayout({sourceTool:initialTool,activePane:"source",sourceOpen:true});
  // Initial category is a one-time navigation input, not a permanent override.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[initialTool]);
  const floatingDrag=useRef<{x:number;y:number}|null>(null);
  useEffect(()=>{
    if(mode==="mobile"&&layout.floating)updateLayout({floating:null});
  // Follow actual container-size changes, never the global browser width.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[mode,layout.floating]);

  const videoRef = useRef<HTMLVideoElement>(null);

  const selectedEntry = useMemo(() => {
    for (const track of project.tracks) {
      const found = track.clips.find((clip) => clip.id === selectedClipId);
      if (found) return { clip: found, track };
    }
    return null;
  }, [project, selectedClipId]);

  const selectedClip = selectedEntry?.clip ?? null;
  const selectedTrack = selectedEntry?.track ?? null;

  useEffect(()=>{
    if(!selectedClipId)return;
    updateLayout({
      inspectorTool:selectedEntry?.track.kind==="audio"?"volume":
        selectedEntry?.track.kind==="captions"?"captions":
        selectedEntry?.track.kind==="overlay"?"text":"trim",
      activePane:"inspector",inspectorOpen:true,
    });
  // Recompute only when selection changes, not for every timeline edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selectedClipId]);

  const sourceDocked=layout.sourceOpen && layout.floating!=="source";
  const inspectorDocked=layout.inspectorOpen && layout.floating!=="inspector";
  const widthOf=(pane:WorkspacePane)=>pane==="source"?layout.sourceWidth:layout.inspectorWidth;
  const adjustWidth=(pane:WorkspacePane,delta:number)=>{
    const max=Math.min(pane==="source"?500:510,Math.max(240,containerWidth-440));
    updateLayout(pane==="source"?{sourceWidth:bounded(layout.sourceWidth+delta,220,max)}:
      {inspectorWidth:bounded(layout.inspectorWidth+delta,240,max)});
  };
  const adjustTimeline=(delta:number)=>{
    const max=Math.max(150,workspaceRef.current?.clientHeight??600)-180;
    updateLayout({timelineHeight:bounded(layout.timelineHeight-delta,150,Math.max(150,Math.min(550,max)))});
  };
  const activateSource=(id:string)=>{
    updateLayout({sourceTool:id,activePane:"source",sourceOpen:true});
  };
  const activateInspector=(id:string)=>{
    updateLayout({inspectorTool:id,activePane:"inspector",inspectorOpen:true});
  };
  const showPane=(pane:WorkspacePane)=> {
    updateLayout(pane==="source"?{activePane:pane,sourceOpen:!layout.sourceOpen}:{activePane:pane,inspectorOpen:!layout.inspectorOpen});
  };
  const setFloat=(pane:WorkspacePane)=>{
    updateLayout({floating:layout.floating===pane?null:pane,
      sourceOpen:pane==="source"?true:layout.sourceOpen,
      inspectorOpen:pane==="inspector"?true:layout.inspectorOpen});
  };
  const floatMove=(event:React.PointerEvent<HTMLButtonElement>)=>{
    if(!floatingDrag.current || !layout.floating)return;
    const dx=event.clientX-floatingDrag.current.x,dy=event.clientY-floatingDrag.current.y;
    floatingDrag.current={x:event.clientX,y:event.clientY};
    updateLayout({floatX:bounded(layout.floatX+dx,0,Math.max(0,containerWidth-260)),
      floatY:bounded(layout.floatY+dy,0,Math.max(0,(workspaceRef.current?.clientHeight??700)-130))});
  };

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
  const effectivePreviewSrc = activeMedia ? activeMedia.url : (mediaItems.length ? null : previewSrc);
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
    if (!selectedClip) {
      activateSource(id);
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
      updateLayout({inspectorTool:"trim"});
      return;
    }
    activateInspector(id);
  }

  return (
    <section className="copro-studio" data-inspector-open={layout.inspectorOpen} data-workspace-mode={mode}>
      <header className="copro-topbar">
        <button className="copro-icon-button" aria-label="Back to projects" onClick={() => onAction?.({ type: "back" })}><ArrowLeft size={22}/></button>
        <div className="copro-title-block">
          <strong>{projectTitle}</strong>
          <span>CoPro</span>
        </div>
        <div className="copro-topbar-actions">
          <button className="copro-icon-button" aria-label="Undo" disabled={!canUndo} onClick={() => onAction?.({ type: "undo" })}><Undo2 size={20}/></button>
          <button className="copro-icon-button" aria-label="Redo" disabled={!canRedo} onClick={() => onAction?.({ type: "redo" })}><Redo2 size={20}/></button>
          <button className="copro-icon-button copro-layout-wide-only" aria-label="Toggle source browser" title="Show or hide source browser" onClick={()=>showPane("source")}><PanelsTopLeft size={20}/></button>
          <button className="copro-icon-button copro-layout-wide-only" aria-label="Toggle selection inspector" title="Show or hide selection inspector" onClick={()=>showPane("inspector")}><PanelRightClose size={19}/></button>
          <button className="copro-icon-button copro-layout-wide-only" aria-label="Reset workspace layout" title="Reset panel sizes and docking" onClick={resetLayout}><RotateCcw size={18}/></button>
          <details className="copro-layout-menu">
            <summary aria-label="Workspace layout menu" title="Panels and layout"><PanelsTopLeft size={20}/></summary>
            <div className="copro-layout-menu-content">
              <button onClick={()=>showPane("source")}>{layout.sourceOpen?"Hide":"Show"} source browser</button>
              <button onClick={()=>showPane("inspector")}>{layout.inspectorOpen?"Hide":"Show"} selection inspector</button>
              <button onClick={()=>updateLayout({swapped:!layout.swapped})}>Swap panel sides</button>
              <button onClick={resetLayout}>Reset panel layout</button>
            </div>
          </details>
          <button className="copro-export-button" onClick={()=>activateInspector("export")}>Export</button>
        </div>
      </header>

      {mediaError&&<div role="alert" className="copro-media-error">{mediaError}</div>}
      <main className="copro-workspace">
        <aside className="copro-desktop-rail">
          {PRIMARY_TOOLS.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={sourceTool === id && layout.sourceOpen} aria-expanded={sourceTool === id && layout.sourceOpen} aria-controls="copro-source-browser" className={sourceTool === id && layout.sourceOpen ? "is-active" : ""} disabled={id === "templates"} title={id === "templates" ? "Template catalog not connected" : label} onClick={() => activateSource(id)}>
              <i>{renderToolIcon(id)}</i><span>{label}</span>
            </button>
          ))}
          {selectedClip ? (
            <div className="copro-rail-clip-tools" aria-label="Selected clip tools">
              <span className="copro-rail-section-label">CLIP</span>
              {CLIP_TOOLS.filter(([id]) => !["effects","transitions"].includes(id)).map(([id,label]) => (
                <button key={id} type="button" aria-pressed={inspectorTool === id && layout.inspectorOpen} aria-controls="copro-tool-inspector" className={[inspectorTool === id && layout.inspectorOpen ? "is-active" : "",id === "delete" ? "is-danger" : ""].join(" ")} onClick={() => runTool(id)}>
                  <i>{renderToolIcon(id)}</i><span>{label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </aside>

        <div ref={workspaceRef} className="copro-editing-grid copro-dockable-grid"
          data-layout-mode={mode}
          data-active-pane={activePane}
          data-source-open={layout.sourceOpen}
          data-inspector-open={layout.inspectorOpen}
          data-source-docked={sourceDocked}
          data-inspector-docked={inspectorDocked}
          data-swapped={layout.swapped}
          style={{
            "--copro-left-col":(layout.swapped?inspectorDocked?layout.inspectorWidth:0:sourceDocked?layout.sourceWidth:0)+"px",
            "--copro-right-col":(layout.swapped?sourceDocked?layout.sourceWidth:0:inspectorDocked?layout.inspectorWidth:0)+"px",
            "--copro-compact-col":(activePane==="source"?layout.sourceOpen?layout.sourceWidth:0:layout.inspectorOpen?layout.inspectorWidth:0)+"px",
            "--copro-timeline-size":layout.timelineHeight+"px",
          } as CSSProperties}>
          {layout.sourceOpen && <aside id="copro-source-browser"
              className={"copro-source-slot copro-pane-slot"+(layout.floating==="source"?" is-floating":"")}
              style={layout.floating==="source"?{left:layout.floatX,top:layout.floatY,width:layout.sourceWidth}:undefined}
              aria-label="Source browser">
            <div className="copro-pane-controls">
              <span>Source browser</span>
              <button aria-label="Drag source panel" title="Drag panel when undocked" className="copro-pane-grip"
                disabled={layout.floating!=="source"}
                onPointerDown={e=>{floatingDrag.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}}
                onPointerMove={floatMove}
                onPointerUp={e=>{floatingDrag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}><GripVertical size={16}/></button>
              <button title="Dock or undock source browser" aria-label="Dock or undock source browser" onClick={()=>setFloat("source")}><ExternalLink size={17}/></button>
              <button title="Switch source and inspector sides" aria-label="Swap panel sides" onClick={()=>updateLayout({swapped:!layout.swapped})}><PanelsTopLeft size={17}/></button>
              <button title="Collapse source browser" aria-label="Collapse source browser" onClick={()=>updateLayout({sourceOpen:false})}><PanelLeftClose size={17}/></button>
            </div>
            <CoProToolPanel
              tool={sourceTool}
              onClose={()=>updateLayout({sourceOpen:false})}
              hasSelectedClip={sourceTool==="audio"?false:Boolean(selectedClip)}
              selectedClipKind={selectedTrack?.kind}
              selectedClipId={selectedClipId}
              mediaItems={mediaItems}
              onMediaPicked={(file)=>onAction?.({type:"import-media",file,atUs:playheadUs})}
              onMediaAdd={(id)=>onMediaAdd?.(id,playheadUs)}
              onTextCommit={(text,kind)=>onAction?.({type:"create-text",kind,text,atUs:playheadUs})}
              onEffectChange={(effect)=>selectedClip&&onAction?.({type:"effect",clipId:selectedClip.id,effect})}
              onTransitionChange={(transition)=>selectedClip&&onAction?.({type:"transition",clipId:selectedClip.id,transition,durationUs:300_000})}
            />
          </aside>}
          {sourceDocked && <CoProResizeHandle label="Resize source browser" orientation="vertical"
            value={layout.sourceWidth} min={220} max={500} className="copro-source-divider"
            onDelta={(delta)=>adjustWidth("source",layout.swapped?-delta:delta)}
            onReset={()=>updateLayout({sourceWidth:DEFAULT_WORKSPACE_LAYOUT.sourceWidth})}/>}
          {inspectorDocked && <CoProResizeHandle label="Resize selection inspector" orientation="vertical"
            value={layout.inspectorWidth} min={240} max={510} className="copro-inspector-divider"
            onDelta={(delta)=>adjustWidth("inspector",layout.swapped?delta:-delta)}
            onReset={()=>updateLayout({inspectorWidth:DEFAULT_WORKSPACE_LAYOUT.inspectorWidth})}/>}
          <section className="copro-preview-stage">
            <div className="copro-preview-device">
              {effectivePreviewSrc && effectivePreviewKind === "video" ? (
                <video
                  ref={videoRef}
                  className={"copro-preview-media copro-preview-effect-" + String(selectedClip?.metadata?.effect ?? "none")}
                  src={effectivePreviewSrc}
                  playsInline
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
                />
              ) : (
                <div className="copro-preview-placeholder">
                  <div className="copro-preview-mark">{hasUnavailableFootage ? "Media unavailable" : "Your story starts here"}</div>
                  <p>{hasUnavailableFootage ? "This timeline needs its original files reattached." : "Import video or images to start editing."}</p>
                </div>
              )}

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
            <button className="copro-icon-button" aria-label="Timeline controls" onClick={() => onSelectClip?.(null)}><SlidersHorizontal size={18}/></button>
          </section>

          {layout.inspectorOpen && (
            <aside id="copro-tool-inspector" className={"copro-inspector-slot copro-pane-slot"+(layout.floating==="inspector"?" is-floating":"")}
              style={layout.floating==="inspector"?{left:layout.floatX,top:layout.floatY,width:layout.inspectorWidth}:undefined}
              aria-label="Selection inspector">
              <div className="copro-pane-controls">
                <span>Selection inspector</span>
                <button aria-label="Drag inspector panel" title="Drag when undocked" className="copro-pane-grip"
                  disabled={layout.floating!=="inspector"}
                  onPointerDown={e=>{floatingDrag.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}}
                  onPointerMove={floatMove}
                  onPointerUp={e=>{floatingDrag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}><GripVertical size={16}/></button>
                <button title="Dock or undock inspector" aria-label="Dock or undock inspector" onClick={()=>setFloat("inspector")}><ExternalLink size={17}/></button>
                <button title="Collapse inspector" aria-label="Collapse inspector" onClick={()=>updateLayout({inspectorOpen:false})}><PanelRightClose size={17}/></button>
              </div>
              <CoProToolPanel
                tool={inspectorTool}
                onClose={() => updateLayout({inspectorOpen:false})}
                selectedClipId={selectedClipId}
                hasSelectedClip={Boolean(selectedClip)}
                selectedClipKind={selectedTrack?.kind}
                selectedClipStartUs={selectedClip?.startUs ?? 0}
                selectedClipDurationUs={selectedClip?.durationUs ?? 0}
                initialSpeed={selectedClip?.playbackRate ?? 1}
                initialVolume={selectedClip?.volume ?? 1}
                initialText={typeof selectedClip?.metadata?.text === "string" ? selectedClip.metadata.text : ""}
                hasSelection={Boolean(selectedClip &&
                  ((inspectorTool === "text" && selectedTrack?.kind === "overlay") ||
                   (inspectorTool === "captions" && selectedTrack?.kind === "captions")))}
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

          <CoProResizeHandle label="Resize timeline height" orientation="horizontal"
            value={layout.timelineHeight} min={150} max={550} className="copro-timeline-divider"
            onDelta={adjustTimeline}
            onReset={()=>updateLayout({timelineHeight:DEFAULT_WORKSPACE_LAYOUT.timelineHeight})}/>
          <CoProTimeline
            project={project}
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
            {selectedClip ? <button className="copro-deselect-button" onClick={() => onSelectClip?.(null)}><X size={20}/><span>Done</span></button> : null}
            {(selectedClip ? CLIP_TOOLS : PRIMARY_TOOLS).map(([id, label]) => (
              <button key={id} disabled={id === "templates"} aria-pressed={inspectorTool === id && layout.inspectorOpen} className={[id === "delete" ? "is-danger" : "", inspectorTool === id && layout.inspectorOpen ? "is-active" : ""].join(" ")} onClick={() => runTool(id)}>
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
