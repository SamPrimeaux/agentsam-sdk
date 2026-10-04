import React, { useMemo, useRef, useState } from "react";
import {
  collectSnapPointsUs,
  projectDurationUs,
  snapTimeUs,
  timeUsToPixels,
} from "@inneranimalmedia/copro-timeline";

export type CoProClipView = {
  id: string;
  assetId: string;
  startUs: number;
  durationUs: number;
  inUs: number;
  layer?: number;
  playbackRate?: number;
  volume?: number;
  metadata?: Record<string, unknown>;
};

export type CoProTrackView = {
  id: string;
  kind: string;
  name?: string;
  visible?: boolean;
  muted?: boolean;
  locked?: boolean;
  clips: CoProClipView[];
};

export type CoProProjectView = {
  id: string;
  tracks: CoProTrackView[];
};

type TimelineProps = {
  project: CoProProjectView;
  selectedClipId?: string | null;
  playheadUs: number;
  onSelectClip?: (clipId: string) => void;
  onMoveClip?: (clipId: string, startUs: number) => void;
  onTrimClip?: (clipId: string, patch: { startUs?: number; inUs?: number; durationUs?: number }) => void;
  onSeek?: (timeUs: number) => void;
  onAddTrack?: () => void;
  onTrackState?: (trackId: string, patch: { visible?: boolean; muted?: boolean; locked?: boolean }) => void;
  onTrackReorder?: (trackId: string, index: number) => void;
};

const MIN_CLIP_US = 100_000;
const MIN_PPS = 36;
const MAX_PPS = 220;

export function CoProTimeline({
  project,
  selectedClipId,
  playheadUs,
  onSelectClip,
  onMoveClip,
  onTrimClip,
  onSeek,
  onAddTrack,
  onTrackState,
  onTrackReorder,
}: TimelineProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinchStart = useRef<{ distance: number; pixelsPerSecond: number } | null>(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(76);
  const [snapEnabled, setSnapEnabled] = useState(true);

  const durationUs = Math.max(projectDurationUs(project as any), 15_000_000);
  const timelineWidth = Math.max(720, timeUsToPixels(durationUs + 2_000_000, { pixelsPerSecond }));

  const ticks = useMemo(() => {
    const tickEvery = pixelsPerSecond >= 120 ? .5 : pixelsPerSecond >= 60 ? 1 : 2;
    const count = Math.ceil((durationUs / 1_000_000 + 2) / tickEvery);
    return Array.from({ length: count + 1 }, (_, index) => index * tickEvery);
  }, [durationUs, pixelsPerSecond]);

  function clampZoom(value: number) {
    return Math.max(MIN_PPS, Math.min(MAX_PPS, value));
  }

  function zoomBy(factor: number) {
    setPixelsPerSecond((value) => clampZoom(value * factor));
  }

  function timeFromPointer(clientX: number) {
    const el = scroller.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    return Math.max(0, Math.round((x / pixelsPerSecond) * 1_000_000));
  }

  function snap(clipId: string, timeUs: number) {
    if (!snapEnabled) return timeUs;
    const points = collectSnapPointsUs(project as any, {
      excludeClipId: clipId,
      includeGrid: true,
      gridUs: pixelsPerSecond > 120 ? 250_000 : 500_000,
      playheadUs,
    });
    const thresholdUs = Math.round((10 / pixelsPerSecond) * 1_000_000);
    return snapTimeUs(timeUs, points, thresholdUs);
  }

  return (
    <section className="copro-timeline-shell">
      <header className="copro-timeline-toolbar">
        <div className="copro-timeline-tool-group">
          <button aria-label="Zoom out" onClick={() => zoomBy(.8)}>−</button>
          <span>{Math.round(pixelsPerSecond)} px/s</span>
          <button aria-label="Zoom in" onClick={() => zoomBy(1.25)}>＋</button>
        </div>
        <button
          className={snapEnabled ? "is-active" : ""}
          aria-pressed={snapEnabled}
          onClick={() => setSnapEnabled((value) => !value)}
        >
          Snap
        </button>
      </header>

      <div className="copro-timeline-layout">
        <div className="copro-track-labels">
          <div className="copro-track-label-spacer" />
          {project.tracks.map((track, trackIndex) => (
            <div className="copro-track-label" key={track.id}>
              <div>
                <strong>{track.name ?? humanTrackKind(track.kind)}</strong>
                <small>{track.kind}</small>
              </div>
              <div className="copro-track-state">
                <button
                  className={track.visible === false ? "is-off" : ""}
                  aria-label={track.visible === false ? "Show track" : "Hide track"}
                  onClick={() => onTrackState?.(track.id, { visible: track.visible === false })}
                >◉</button>
                <button
                  className={track.muted ? "is-on" : ""}
                  aria-label={track.muted ? "Unmute track" : "Mute track"}
                  onClick={() => onTrackState?.(track.id, { muted: !track.muted })}
                >M</button>
                <button
                  className={track.locked ? "is-on" : ""}
                  aria-label={track.locked ? "Unlock track" : "Lock track"}
                  onClick={() => onTrackState?.(track.id, { locked: !track.locked })}
                >⌑</button>
                <button
                  disabled={trackIndex === 0}
                  aria-label="Move track up"
                  onClick={() => onTrackReorder?.(track.id, trackIndex - 1)}
                >↑</button>
                <button
                  disabled={trackIndex === project.tracks.length - 1}
                  aria-label="Move track down"
                  onClick={() => onTrackReorder?.(track.id, trackIndex + 1)}
                >↓</button>
              </div>
            </div>
          ))}
          <button className="copro-add-track-label" type="button" onClick={onAddTrack}>＋ Track</button>
        </div>

        <div
          ref={scroller}
          className="copro-timeline-scroll"
          onWheel={(event) => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            zoomBy(event.deltaY > 0 ? .9 : 1.1);
          }}
          onTouchStart={(event) => {
            if (event.touches.length !== 2) {
              pinchStart.current = null;
              return;
            }
            const a = event.touches[0];
            const b = event.touches[1];
            pinchStart.current = {
              distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
              pixelsPerSecond,
            };
          }}
          onTouchMove={(event) => {
            if (event.touches.length !== 2 || !pinchStart.current) return;
            const a = event.touches[0];
            const b = event.touches[1];
            const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            setPixelsPerSecond(clampZoom(pinchStart.current.pixelsPerSecond * (distance / pinchStart.current.distance)));
          }}
          onTouchEnd={() => { pinchStart.current = null; }}
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest("[data-copro-clip]")) return;
            onSeek?.(timeFromPointer(event.clientX));
          }}
        >
          <div className="copro-timeline-stage" style={{ width: timelineWidth }}>
            <div className="copro-ruler">
              {ticks.map((second) => (
                <div
                  className="copro-tick"
                  key={second}
                  style={{ left: second * pixelsPerSecond }}
                >
                  <i />
                  <span>{formatTime(second)}</span>
                </div>
              ))}
            </div>

            <div
              className="copro-playhead"
              style={{ left: timeUsToPixels(playheadUs, { pixelsPerSecond }) }}
              aria-label="Playhead"
            >
              <b />
            </div>

            <div className="copro-track-stack">
              {project.tracks.map((track) => (
                <div
                  className={"copro-track-row copro-track-" + track.kind + (track.visible === false ? " is-hidden-track" : "")}
                  key={track.id}
                >
                  {track.clips.map((clip) => {
                    const selected = clip.id === selectedClipId;
                    const left = timeUsToPixels(clip.startUs, { pixelsPerSecond });
                    const width = Math.max(44, timeUsToPixels(clip.durationUs, { pixelsPerSecond }));
                    const text = typeof clip.metadata?.text === "string" ? clip.metadata.text : null;
                    return (
                      <div
                        key={clip.id}
                        data-copro-clip
                        className={"copro-clip copro-clip-" + track.kind + " " + (selected ? "is-selected" : "")}
                        style={{ left, width }}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          if (track.locked) return;
                          onSelectClip?.(clip.id);
                          const originX = event.clientX;
                          const originStart = clip.startUs;
                          const target = event.currentTarget;
                          target.setPointerCapture(event.pointerId);

                          const move = (next: PointerEvent) => {
                            const deltaUs = Math.round(((next.clientX - originX) / pixelsPerSecond) * 1_000_000);
                            onMoveClip?.(clip.id, snap(clip.id, Math.max(0, originStart + deltaUs)));
                          };
                          const up = () => {
                            target.removeEventListener("pointermove", move as EventListener);
                            target.removeEventListener("pointerup", up);
                            target.removeEventListener("pointercancel", up);
                          };
                          target.addEventListener("pointermove", move as EventListener);
                          target.addEventListener("pointerup", up);
                          target.addEventListener("pointercancel", up);
                        }}
                      >
                        {selected && !track.locked && (
                          <button
                            className="copro-trim-handle copro-trim-left"
                            aria-label="Trim clip start"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              const originX = event.clientX;
                              const originStart = clip.startUs;
                              const originIn = clip.inUs;
                              const originDuration = clip.durationUs;
                              const target = event.currentTarget;
                              target.setPointerCapture(event.pointerId);
                              const move = (next: PointerEvent) => {
                                const rawDelta = Math.round(((next.clientX - originX) / pixelsPerSecond) * 1_000_000);
                                let deltaUs = Math.max(-originIn, Math.min(originDuration - MIN_CLIP_US, rawDelta));
                                const proposedStart = originStart + deltaUs;
                                const snappedStart = snap(clip.id, proposedStart);
                                deltaUs += snappedStart - proposedStart;
                                onTrimClip?.(clip.id, {
                                  startUs: originStart + deltaUs,
                                  inUs: originIn + deltaUs,
                                  durationUs: originDuration - deltaUs,
                                });
                              };
                              const up = () => {
                                target.removeEventListener("pointermove", move as EventListener);
                                target.removeEventListener("pointerup", up);
                                target.removeEventListener("pointercancel", up);
                              };
                              target.addEventListener("pointermove", move as EventListener);
                              target.addEventListener("pointerup", up);
                              target.addEventListener("pointercancel", up);
                            }}
                          />
                        )}

                        {track.kind === "audio" ? (
                          <div className="copro-waveform" aria-hidden="true">
                            {(Array.isArray(clip.metadata?.waveform) && clip.metadata.waveform.length
                              ? clip.metadata.waveform
                              : Array.from({ length: Math.max(8, Math.ceil(width / 8)) }, (_, index) => .26 + (((index * 37) % 62) / 100))
                            ).map((sample, index) => (
                              <i
                                key={index}
                                className={Array.isArray(clip.metadata?.waveform) ? "is-decoded" : "is-fallback"}
                                style={{ height: Math.max(8, Math.min(100, Number(sample) * 100)) + "%" }}
                              />
                            ))}
                          </div>
                        ) : track.kind === "captions" || track.kind === "overlay" ? (
                          <span className="copro-text-clip">{text ?? clip.assetId.replace(/^asset:/, "")}</span>
                        ) : (
                          <div className="copro-clip-filmstrip" aria-hidden="true">
                            {Array.from({ length: Math.max(2, Math.ceil(width / 48)) }, (_, index) => <span key={index} />)}
                          </div>
                        )}

                        <span className="copro-clip-label">
                          {text ?? clip.assetId.replace(/^asset:/, "")}
                          {clip.playbackRate && clip.playbackRate !== 1 ? " · " + clip.playbackRate.toFixed(2) + "×" : ""}
                        </span>

                        {selected && !track.locked && (
                          <button
                            className="copro-trim-handle copro-trim-right"
                            aria-label="Trim clip end"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              const originX = event.clientX;
                              const originDuration = clip.durationUs;
                              const clipEnd = clip.startUs + originDuration;
                              const target = event.currentTarget;
                              target.setPointerCapture(event.pointerId);
                              const move = (next: PointerEvent) => {
                                const deltaUs = Math.round(((next.clientX - originX) / pixelsPerSecond) * 1_000_000);
                                const proposedEnd = clipEnd + deltaUs;
                                const snappedEnd = snap(clip.id, proposedEnd);
                                onTrimClip?.(clip.id, {
                                  durationUs: Math.max(MIN_CLIP_US, originDuration + (snappedEnd - clipEnd)),
                                });
                              };
                              const up = () => {
                                target.removeEventListener("pointermove", move as EventListener);
                                target.removeEventListener("pointerup", up);
                                target.removeEventListener("pointercancel", up);
                              };
                              target.addEventListener("pointermove", move as EventListener);
                              target.addEventListener("pointerup", up);
                              target.addEventListener("pointercancel", up);
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              <button className="copro-add-track" type="button" onClick={onAddTrack}>+ Add track</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function humanTrackKind(kind: string) {
  if (kind === "video") return "Video";
  if (kind === "audio") return "Audio";
  if (kind === "captions") return "Captions";
  if (kind === "overlay") return "Overlay";
  return kind;
}

function formatTime(totalSeconds: number) {
  const whole = Math.floor(totalSeconds);
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  return minutes + ":" + String(seconds).padStart(2, "0");
}
