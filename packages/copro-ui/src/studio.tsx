import React, { useEffect, useMemo, useRef, useState } from "react";
import { CoProTimeline, type CoProProjectView } from "./timeline";
import { CoProToolSheet } from "./tool-sheet";
import { CoProExportSheet } from "./export-sheet";

export type CoProStudioAction =
  | { type: "back" }
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
  | { type: "create-text"; kind: "overlay" | "captions"; text: string; atUs: number }
  | { type: "import-media"; file: File; atUs: number }
  | { type: "add-track" }
  | { type: "track-state"; trackId: string; patch: { visible?: boolean; muted?: boolean; locked?: boolean } }
  | { type: "track-reorder"; trackId: string; index: number };

export type CoProStudioProps = {
  project: CoProProjectView;
  playheadUs: number;
  selectedClipId?: string | null;
  canUndo?: boolean;
  canRedo?: boolean;
  projectTitle?: string;
  previewSrc?: string | null;
  previewKind?: "video" | "image" | null;
  onSeek?: (timeUs: number) => void;
  onSelectClip?: (clipId: string) => void;
  onAction?: (action: CoProStudioAction) => void;
};

const PRIMARY_TOOLS = [
  ["media", "Media", "+"],
  ["audio", "Audio", "♫"],
  ["text", "Text", "T"],
  ["captions", "Captions", "CC"],
  ["effects", "Effects", "✦"],
  ["templates", "Templates", "▦"],
] as const;

const CLIP_TOOLS = [
  ["split", "Split", "⌁"],
  ["trim", "Trim", "↔"],
  ["speed", "Speed", "1×"],
  ["volume", "Volume", "◖"],
  ["duplicate", "Duplicate", "▣"],
  ["delete", "Delete", "⌫"],
] as const;

export function CoProStudio({
  project,
  playheadUs,
  selectedClipId,
  canUndo = false,
  canRedo = false,
  projectTitle = "Untitled project",
  previewSrc,
  previewKind,
  onSeek,
  onSelectClip,
  onAction,
}: CoProStudioProps) {
  const [playing, setPlaying] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
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
    const seekSeconds = playheadUs / 1_000_000;
    if (Math.abs(video.currentTime - seekSeconds) > .25 && Number.isFinite(video.duration)) {
      video.currentTime = Math.min(seekSeconds, video.duration || seekSeconds);
    }
    video.playbackRate = Math.max(.25, Math.min(4, selectedClip?.playbackRate ?? 1));
    video.volume = Math.max(0, Math.min(1, selectedClip?.volume ?? 1));
  }, [playheadUs, selectedClip?.playbackRate, selectedClip?.volume]);

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
      return;
    }
    setActiveTool(id);
  }

  return (
    <section className="copro-studio">
      <header className="copro-topbar">
        <button className="copro-icon-button" aria-label="Back to projects" onClick={() => onAction?.({ type: "back" })}>‹</button>
        <div className="copro-title-block">
          <strong>{projectTitle}</strong>
          <span>CoPro</span>
        </div>
        <div className="copro-topbar-actions">
          <button className="copro-icon-button" aria-label="Undo" disabled={!canUndo} onClick={() => onAction?.({ type: "undo" })}>↶</button>
          <button className="copro-icon-button" aria-label="Redo" disabled={!canRedo} onClick={() => onAction?.({ type: "redo" })}>↷</button>
          <button className="copro-export-button" onClick={() => setExportOpen(true)}>Export</button>
        </div>
      </header>

      <main className="copro-workspace">
        <aside className="copro-desktop-rail">
          {PRIMARY_TOOLS.map(([id, label, icon]) => (
            <button key={id} onClick={() => setActiveTool(id)}>
              <i>{icon}</i><span>{label}</span>
            </button>
          ))}
        </aside>

        <div className="copro-editor-column">
          <section className="copro-preview-stage">
            <div className="copro-preview-device">
              {previewSrc && previewKind === "video" ? (
                <video
                  ref={videoRef}
                  className="copro-preview-media"
                  src={previewSrc}
                  playsInline
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onTimeUpdate={(event) => onSeek?.(Math.round(event.currentTarget.currentTime * 1_000_000))}
                />
              ) : previewSrc && previewKind === "image" ? (
                <img className="copro-preview-media" src={previewSrc} alt="" />
              ) : (
                <div className="copro-preview-placeholder">
                  <div className="copro-preview-mark">CoPro</div>
                  <p>Drop media or tap Media</p>
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
              {playing ? "Ⅱ" : "▶"}
            </button>
            <span>{formatTime(playheadUs)}</span>
            <div className="copro-transport-line" />
            <button className="copro-icon-button" aria-label="Fit timeline">↔</button>
          </section>

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
            {(selectedClip ? CLIP_TOOLS : PRIMARY_TOOLS).map(([id, label, icon]) => (
              <button key={id} className={id === "delete" ? "is-danger" : ""} onClick={() => runTool(id)}>
                <i>{icon}</i><span>{label}</span>
              </button>
            ))}
          </section>
        </div>
      </main>

      <CoProToolSheet
        tool={activeTool}
        open={Boolean(activeTool)}
        onClose={() => setActiveTool(null)}
        initialSpeed={selectedClip?.playbackRate ?? 1}
        initialVolume={selectedClip?.volume ?? 1}
        initialText={typeof selectedClip?.metadata?.text === "string" ? selectedClip.metadata.text : ""}
        hasSelection={Boolean(
          selectedClip &&
          ((activeTool === "text" && selectedTrack?.kind === "overlay") ||
            (activeTool === "captions" && selectedTrack?.kind === "captions"))
        )}
        onSpeedChange={(playbackRate) => selectedClip && onAction?.({ type: "speed", clipId: selectedClip.id, playbackRate })}
        onVolumeChange={(volume) => selectedClip && onAction?.({ type: "volume", clipId: selectedClip.id, volume })}
        onTextCommit={(text, kind) => {
          const selectedMatchesKind =
            selectedClip &&
            ((kind === "overlay" && selectedTrack?.kind === "overlay") ||
              (kind === "captions" && selectedTrack?.kind === "captions"));
          if (selectedMatchesKind) {
            onAction?.({ type: "text", clipId: selectedClip.id, text });
          } else {
            onAction?.({ type: "create-text", kind, text, atUs: playheadUs });
          }
        }}
        onMediaPicked={(file) => onAction?.({ type: "import-media", file, atUs: playheadUs })}
      />
      <CoProExportSheet open={exportOpen} onClose={() => setExportOpen(false)} />
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
