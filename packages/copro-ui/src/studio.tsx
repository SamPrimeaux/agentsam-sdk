import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, AudioLines, Captions, Copy, Film,
  Layers, Play, Pause, Redo2, Scissors, SlidersHorizontal, Sparkles,
  Trash2, Type, Undo2, X, Gauge, Volume2, Replace, Clapperboard,
} from "lucide-react";
import { CoProTimeline, type CoProProjectView } from "./timeline";
import { CoProToolPanel, type CoProMediaShelfItem } from "./tool-sheet";


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
  const [activeTool, setActiveTool] = useState<string | null>(initialTool);

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
      setActiveTool(id);
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
    setActiveTool((current) => current === id ? null : id);
  }

  return (
    <section className="copro-studio" data-inspector-open={Boolean(activeTool)}>
      <header className="copro-topbar">
        <button className="copro-icon-button" aria-label="Back to projects" onClick={() => onAction?.({ type: "back" })}><ArrowLeft size={22}/></button>
        <div className="copro-title-block">
          <strong>{projectTitle}</strong>
          <span>CoPro</span>
        </div>
        <div className="copro-topbar-actions">
          <button className="copro-icon-button" aria-label="Undo" disabled={!canUndo} onClick={() => onAction?.({ type: "undo" })}><Undo2 size={20}/></button>
          <button className="copro-icon-button" aria-label="Redo" disabled={!canRedo} onClick={() => onAction?.({ type: "redo" })}><Redo2 size={20}/></button>
          <button className="copro-export-button" aria-expanded={activeTool === "export"} aria-controls="copro-tool-inspector" onClick={() => setActiveTool(activeTool === "export" ? null : "export")}>Export</button>
        </div>
      </header>

      <main className="copro-workspace">
        <aside className="copro-desktop-rail">
          {PRIMARY_TOOLS.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={activeTool === id} aria-expanded={activeTool === id} aria-controls="copro-tool-inspector" className={activeTool === id ? "is-active" : ""} disabled={id === "templates"} title={id === "templates" ? "Template catalog not connected" : label} onClick={() => setActiveTool(activeTool === id ? null : id)}>
              <i>{renderToolIcon(id)}</i><span>{label}</span>
            </button>
          ))}
          {selectedClip ? (
            <div className="copro-rail-clip-tools" aria-label="Selected clip tools">
              <span className="copro-rail-section-label">CLIP</span>
              {CLIP_TOOLS.filter(([id]) => !["effects","transitions"].includes(id)).map(([id,label]) => (
                <button key={id} type="button" aria-pressed={activeTool === id} aria-controls="copro-tool-inspector" className={[activeTool === id ? "is-active" : "",id === "delete" ? "is-danger" : ""].join(" ")} onClick={() => runTool(id)}>
                  <i>{renderToolIcon(id)}</i><span>{label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </aside>

        <div className={"copro-editing-grid" + (activeTool ? " has-inspector" : "")}>
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

          {activeTool && (
            <aside id="copro-tool-inspector" className="copro-inspector-slot" aria-label={activeTool + " settings"}>
              <CoProToolPanel
                tool={activeTool}
                onClose={() => setActiveTool(null)}
                selectedClipId={selectedClipId}
                hasSelectedClip={Boolean(selectedClip)}
                selectedClipKind={selectedTrack?.kind}
                selectedClipStartUs={selectedClip?.startUs ?? 0}
                selectedClipDurationUs={selectedClip?.durationUs ?? 0}
                initialSpeed={selectedClip?.playbackRate ?? 1}
                initialVolume={selectedClip?.volume ?? 1}
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
              <button key={id} disabled={id === "templates"} aria-pressed={activeTool === id} className={[id === "delete" ? "is-danger" : "", activeTool === id ? "is-active" : ""].join(" ")} onClick={() => runTool(id)}>
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
