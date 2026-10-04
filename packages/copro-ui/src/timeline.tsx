import React, { useMemo, useRef } from "react";
import { projectDurationUs, timeUsToPixels } from "@inneranimalmedia/copro-timeline";

export type CoProClipView = {
  id: string;
  assetId: string;
  startUs: number;
  durationUs: number;
  inUs: number;
  layer?: number;
};

export type CoProTrackView = {
  id: string;
  kind: string;
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
  pixelsPerSecond?: number;
  onSelectClip?: (clipId: string) => void;
  onMoveClip?: (clipId: string, startUs: number) => void;
  onTrimClip?: (clipId: string, patch: { startUs?: number; inUs?: number; durationUs?: number }) => void;
  onSeek?: (timeUs: number) => void;
};

const MIN_CLIP_US = 100_000;

export function CoProTimeline({
  project,
  selectedClipId,
  playheadUs,
  pixelsPerSecond = 76,
  onSelectClip,
  onMoveClip,
  onTrimClip,
  onSeek,
}: TimelineProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const durationUs = Math.max(projectDurationUs(project as any), 15_000_000);
  const timelineWidth = Math.max(640, timeUsToPixels(durationUs + 2_000_000, { pixelsPerSecond }));

  const ticks = useMemo(() => {
    const seconds = Math.ceil(durationUs / 1_000_000) + 2;
    return Array.from({ length: seconds + 1 }, (_, second) => second);
  }, [durationUs]);

  function timeFromPointer(clientX: number) {
    const el = scroller.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    return Math.max(0, Math.round((x / pixelsPerSecond) * 1_000_000));
  }

  return (
    <div className="copro-timeline-shell">
      <div
        ref={scroller}
        className="copro-timeline-scroll"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("[data-copro-clip]")) return;
          onSeek?.(timeFromPointer(event.clientX));
        }}
      >
        <div className="copro-timeline-stage" style={{ width: timelineWidth }}>
          <div className="copro-ruler">
            {ticks.map((second) => (
              <div className="copro-tick" key={second} style={{ left: second * pixelsPerSecond }}>
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
              <div className="copro-track-row" key={track.id}>
                {track.clips.map((clip) => {
                  const selected = clip.id === selectedClipId;
                  const left = timeUsToPixels(clip.startUs, { pixelsPerSecond });
                  const width = Math.max(52, timeUsToPixels(clip.durationUs, { pixelsPerSecond }));
                  return (
                    <div
                      key={clip.id}
                      data-copro-clip
                      className={"copro-clip " + (selected ? "is-selected" : "")}
                      style={{ left, width }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        onSelectClip?.(clip.id);
                        const originX = event.clientX;
                        const originStart = clip.startUs;
                        const target = event.currentTarget;
                        target.setPointerCapture(event.pointerId);

                        const move = (next: PointerEvent) => {
                          const deltaUs = Math.round(((next.clientX - originX) / pixelsPerSecond) * 1_000_000);
                          onMoveClip?.(clip.id, Math.max(0, originStart + deltaUs));
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
                      {selected && (
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
                              const deltaUs = Math.max(-originIn, Math.min(originDuration - MIN_CLIP_US, rawDelta));
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

                      <div className="copro-clip-filmstrip" aria-hidden="true">
                        {Array.from({ length: Math.max(2, Math.ceil(width / 48)) }, (_, index) => (
                          <span key={index} />
                        ))}
                      </div>
                      <span className="copro-clip-label">{clip.assetId.replace(/^asset:/, "")}</span>

                      {selected && (
                        <button
                          className="copro-trim-handle copro-trim-right"
                          aria-label="Trim clip end"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            const originX = event.clientX;
                            const originDuration = clip.durationUs;
                            const target = event.currentTarget;
                            target.setPointerCapture(event.pointerId);
                            const move = (next: PointerEvent) => {
                              const deltaUs = Math.round(((next.clientX - originX) / pixelsPerSecond) * 1_000_000);
                              onTrimClip?.(clip.id, {
                                durationUs: Math.max(MIN_CLIP_US, originDuration + deltaUs),
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
            <button className="copro-add-track" type="button">+ Add track</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + ":" + String(seconds).padStart(2, "0");
}
