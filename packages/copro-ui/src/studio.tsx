import React, { useMemo, useState } from "react";
import { CoProTimeline, type CoProProjectView } from "./timeline";

export type CoProStudioAction =
  | { type: "undo" }
  | { type: "redo" }
  | { type: "split"; clipId: string; atUs: number }
  | { type: "duplicate"; clipId: string }
  | { type: "delete"; clipId: string }
  | { type: "move"; clipId: string; startUs: number }
  | { type: "trim"; clipId: string; patch: { startUs?: number; inUs?: number; durationUs?: number } }
  | { type: "tool"; tool: string }
  | { type: "export" };

export type CoProStudioProps = {
  project: CoProProjectView;
  playheadUs: number;
  selectedClipId?: string | null;
  canUndo?: boolean;
  canRedo?: boolean;
  projectTitle?: string;
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
  onSeek,
  onSelectClip,
  onAction,
}: CoProStudioProps) {
  const [playing, setPlaying] = useState(false);
  const selectedClip = useMemo(() => {
    for (const track of project.tracks) {
      const found = track.clips.find((clip) => clip.id === selectedClipId);
      if (found) return found;
    }
    return null;
  }, [project, selectedClipId]);

  return (
    <section className="copro-studio">
      <header className="copro-topbar">
        <button className="copro-icon-button copro-mobile-only" aria-label="Back">‹</button>
        <div className="copro-title-block">
          <strong>{projectTitle}</strong>
          <span>CoPro</span>
        </div>
        <div className="copro-topbar-actions">
          <button className="copro-icon-button" aria-label="Undo" disabled={!canUndo} onClick={() => onAction?.({ type: "undo" })}>↶</button>
          <button className="copro-icon-button" aria-label="Redo" disabled={!canRedo} onClick={() => onAction?.({ type: "redo" })}>↷</button>
          <button className="copro-export-button" onClick={() => onAction?.({ type: "export" })}>Export</button>
        </div>
      </header>

      <main className="copro-workspace">
        <aside className="copro-desktop-rail">
          {PRIMARY_TOOLS.map(([id, label, icon]) => (
            <button key={id} onClick={() => onAction?.({ type: "tool", tool: id })}>
              <i>{icon}</i><span>{label}</span>
            </button>
          ))}
        </aside>

        <div className="copro-editor-column">
          <section className="copro-preview-stage">
            <div className="copro-preview-device">
              <div className="copro-preview-placeholder">
                <div className="copro-preview-mark">CoPro</div>
                <p>Preview</p>
              </div>
            </div>
          </section>

          <section className="copro-transport">
            <button className="copro-play-button" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((value) => !value)}>
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
          />

          <section className="copro-context-tools" aria-label="Editing tools">
            {(selectedClip ? CLIP_TOOLS : PRIMARY_TOOLS).map(([id, label, icon]) => (
              <button
                key={id}
                className={id === "delete" ? "is-danger" : ""}
                onClick={() => {
                  if (!selectedClip) {
                    onAction?.({ type: "tool", tool: id });
                  } else if (id === "split") {
                    onAction?.({ type: "split", clipId: selectedClip.id, atUs: playheadUs });
                  } else if (id === "duplicate") {
                    onAction?.({ type: "duplicate", clipId: selectedClip.id });
                  } else if (id === "delete") {
                    onAction?.({ type: "delete", clipId: selectedClip.id });
                  } else {
                    onAction?.({ type: "tool", tool: id });
                  }
                }}
              >
                <i>{icon}</i><span>{label}</span>
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
