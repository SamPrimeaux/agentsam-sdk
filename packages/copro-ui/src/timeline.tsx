import { IconAction } from "./icon-action.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { isCoProMediaDragForTrack, readCoProMediaDragId } from "./media-dnd.js";
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
  metadata?: Record<string, unknown>;
  tracks: CoProTrackView[];
  canvas?: { width: number; height: number; frameRate?: number };
};

type TimelineProps = {
  project: CoProProjectView;
  mediaThumbnails?: Readonly<Record<string, string[]>>;
  selectedClipId?: string | null;
  playheadUs: number;
  onSelectClip?: (clipId: string) => void;
  onMoveClip?: (clipId: string, startUs: number, trackId?: string) => void;
  onDropMedia?: (mediaId: string, atUs: number, trackId: string) => void;
  onTrimClip?: (clipId: string, patch: { startUs?: number; inUs?: number; durationUs?: number }) => void;
  onSeek?: (timeUs: number) => void;
  onAddTrack?: () => void;
  onTrackState?: (trackId: string, patch: { visible?: boolean; muted?: boolean; locked?: boolean }) => void;
  onTrackReorder?: (trackId: string, index: number) => void;
  onClipContextAction?: (action: "split"|"duplicate"|"delete"|"trim"|"speed"|"animation"|"adjust", clipId:string, atUs:number) => void;
};

const MIN_CLIP_US = 100_000;
const MIN_PPS = 36;
const MAX_PPS = 220;

/** Keep pointer-driven timeline edits local while dragging, then emit one undoable command. */
export function bindTimelinePointerTransaction<T>(
  target: EventTarget,
  pointerId: number,
  originX: number,
  originY: number,
  calculate: (event: PointerEvent) => T,
  preview: (value: T) => void,
  commit: (value: T) => void,
  revert: () => void,
  shouldCommit: (value: T) => boolean,
): () => void {
  let finished=false;
  const cleanup=()=>{
    if(finished)return;
    finished=true;
    target.removeEventListener("pointermove",move as EventListener);
    target.removeEventListener("pointerup",up as EventListener);
    target.removeEventListener("pointercancel",cancel as EventListener);
    target.removeEventListener("lostpointercapture",cancel as EventListener);
  };
  const move=(event:Event)=>{
    const pointer=event as PointerEvent;
    if(pointer.pointerId!==pointerId)return;
    preview(calculate(pointer));
  };
  const up=(event:Event)=>{
    const pointer=event as PointerEvent;
    if(pointer.pointerId!==pointerId)return;
    const value=calculate(pointer);
    preview(value);
    if(Math.hypot(pointer.clientX-originX,pointer.clientY-originY)>.5 && shouldCommit(value))commit(value);
    else revert();
    cleanup();
  };
  const cancel=(event:Event)=>{
    const pointer=event as PointerEvent;
    if(pointer.pointerId!==pointerId)return;
    revert();
    cleanup();
  };
  target.addEventListener("pointermove",move as EventListener);
  target.addEventListener("pointerup",up as EventListener);
  target.addEventListener("pointercancel",cancel as EventListener);
  target.addEventListener("lostpointercapture",cancel as EventListener);
  return cleanup;
}

export function CoProTimeline({
  project,
  mediaThumbnails = {},
  selectedClipId,
  playheadUs,
  onSelectClip,
  onMoveClip,
  onDropMedia,
  onTrimClip,
  onSeek,
  onAddTrack,
  onTrackState,
  onTrackReorder,
  onClipContextAction,
}: TimelineProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const menuRef=useRef<HTMLDivElement>(null);
  const [clipMenu,setClipMenu]=useState<{clipId:string;locked:boolean;x:number;y:number;atUs:number}|null>(null);
  const [dropTrackId,setDropTrackId]=useState<string|null>(null);
  useEffect(()=>{
    if(!clipMenu)return;
    const dismiss=(event:PointerEvent)=>{
      if(!menuRef.current?.contains(event.target as Node))setClipMenu(null);
    };
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setClipMenu(null);};
    document.addEventListener("pointerdown",dismiss);
    document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("pointerdown",dismiss);document.removeEventListener("keydown",escape);};
  },[clipMenu]);
  const pinchStart = useRef<{ distance: number; pixelsPerSecond: number } | null>(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(76);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [trackHeight, setTrackHeight] = useState(() => {
    if(typeof window === "undefined") return 70;
    try {const saved=Number(window.localStorage.getItem("moviemode.timeline.trackHeight.v1"));return [48,70,96,128].includes(saved)?saved:70;} catch {return 70;}
  });
  function changeTrackHeight(height:number){
    setTrackHeight(height);
    try{window.localStorage.setItem("moviemode.timeline.trackHeight.v1",String(height));}catch{/* preserve editing without storage */}
  }

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

  function trackAtPointer(clientY:number, sourceTrackId:string):{trackId:string;offset:number} {
    const rows=Array.from(scroller.current?.querySelectorAll<HTMLElement>("[data-copro-track-id]")??[]);
    const source=project.tracks.find(track=>track.id===sourceTrackId);
    const sourceRow=rows.find(row=>row.dataset.coproTrackId===sourceTrackId);
    const targetRow=rows.find(row=>{
      const rect=row.getBoundingClientRect();
      return clientY>=rect.top && clientY<=rect.bottom;
    });
    const target=project.tracks.find(track=>track.id===targetRow?.dataset.coproTrackId);
    if(!source||!sourceRow||!target||!targetRow||target.locked||target.kind!==source.kind)
      return {trackId:sourceTrackId,offset:0};
    return {
      trackId:target.id,
      offset:targetRow.getBoundingClientRect().top-sourceRow.getBoundingClientRect().top,
    };
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
        <span className="mm-timeline-heading">Timeline</span>
        <span className="mm-timeline-playhead-readout" title="Playhead position">{formatTime(playheadUs / 1_000_000)}</span>
        <div className="copro-timeline-tool-group" role="group" aria-label="Timeline zoom">
          <button aria-label="Zoom out" onClick={() => zoomBy(.8)}>−</button>
          <span>{Math.round(pixelsPerSecond)} px/s</span>
          <button aria-label="Zoom in" onClick={() => zoomBy(1.25)}>＋</button>
        </div>
        <label className="mm-track-size-control" title="Resize all track lanes; each media track remains editable">
          <span>Track height</span>
          <select aria-label="Timeline track height" value={trackHeight} onChange={event=>changeTrackHeight(Number(event.currentTarget.value))}>
            <option value={48}>Compact</option><option value={70}>Standard</option><option value={96}>Large</option><option value={128}>Extra large</option>
          </select>
        </label>
        <button
          className={snapEnabled ? "is-active" : ""}
          aria-pressed={snapEnabled}
          onClick={() => setSnapEnabled((value) => !value)}
        >
          Snap
        </button>
      </header>

      <div className="copro-timeline-layout" style={{"--copro-track-height":`${trackHeight}px`,"--copro-clip-height":`${trackHeight-6}px`} as React.CSSProperties}>
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
            const target=event.target as HTMLElement;
            if (target.closest("[data-copro-clip]")) return;
            onSeek?.(timeFromPointer(event.clientX));
            if(!target.closest(".copro-ruler") || event.button!==0)return;
            const captureTarget=event.currentTarget;
            const pointerId=event.pointerId;
            try{captureTarget.setPointerCapture(pointerId);}catch{return;}
            const seek=(next:PointerEvent)=>{if(next.pointerId===pointerId)onSeek?.(timeFromPointer(next.clientX));};
            const finish=(next:PointerEvent)=>{
              if(next.pointerId!==pointerId)return;
              seek(next);
              captureTarget.removeEventListener("pointermove",seek);
              captureTarget.removeEventListener("pointerup",finish);
              captureTarget.removeEventListener("pointercancel",finish);
              captureTarget.removeEventListener("lostpointercapture",finish);
            };
            captureTarget.addEventListener("pointermove",seek);
            captureTarget.addEventListener("pointerup",finish);
            captureTarget.addEventListener("pointercancel",finish);
            captureTarget.addEventListener("lostpointercapture",finish);
          }}
        >
          <div className="copro-timeline-stage" style={{ "--copro-timeline-width": timelineWidth + "px" } as React.CSSProperties}>
            <div className="copro-ruler">
              {ticks.map((second) => (
                <div
                  className="copro-tick"
                  key={second}
                  style={{ "--copro-tick-left": (second * pixelsPerSecond) + "px" } as React.CSSProperties}
                >
                  <i />
                  <span>{formatTime(second)}</span>
                </div>
              ))}
            </div>

            <div
              className="copro-playhead"
              style={{ "--copro-playhead-left": timeUsToPixels(playheadUs, { pixelsPerSecond }) + "px" } as React.CSSProperties}
              aria-label="Playhead"
            >
              <b />
              <i className="mm-playhead-stem" aria-hidden="true" />
            </div>

            <div className="copro-track-stack">
              {project.tracks.map((track) => (
                <div
                  className={"copro-track-row copro-track-" + track.kind + (track.visible === false ? " is-hidden-track" : "") + (dropTrackId===track.id ? " is-drop-target" : "")}
                  key={track.id}
                  data-copro-track-id={track.id}
                  data-copro-track-kind={track.kind}
                  onDragOver={event=>{
                    if(track.locked||!isCoProMediaDragForTrack(event.dataTransfer,track.kind))return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect="copy";
                    setDropTrackId(track.id);
                  }}
                  onDragLeave={event=>{
                    if(!event.currentTarget.contains(event.relatedTarget as Node|null))
                      setDropTrackId(current=>current===track.id?null:current);
                  }}
                  onDrop={event=>{
                    const mediaId=readCoProMediaDragId(event.dataTransfer);
                    if(!mediaId||track.locked||!isCoProMediaDragForTrack(event.dataTransfer,track.kind))return;
                    event.preventDefault();
                    setDropTrackId(null);
                    onDropMedia?.(mediaId,snap("media-drop",timeFromPointer(event.clientX)),track.id);
                  }}
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
                        style={{ "--copro-clip-left": left + "px", "--copro-clip-width": width + "px" } as React.CSSProperties}
                        title={text ?? clip.assetId.replace(/^asset:/, "")}
                        onContextMenu={event=>{
                          event.preventDefault();event.stopPropagation();
                          onSelectClip?.(clip.id);
                          setClipMenu({clipId:clip.id,locked:Boolean(track.locked),
                            x:Math.min(event.clientX,window.innerWidth-218),
                            y:Math.min(event.clientY,window.innerHeight-305),
                            atUs:Math.max(clip.startUs,Math.min(clip.startUs+clip.durationUs,playheadUs))});
                        }}
                        onPointerDown={(event) => {
                          if(event.button!==0)return;
                          event.stopPropagation();
                          if (track.locked) return;
                          onSelectClip?.(clip.id);
                          const originX = event.clientX;
                          const originY = event.clientY;
                          const originStart = clip.startUs;
                          const target = event.currentTarget;
                          target.setPointerCapture(event.pointerId);

                          const originalWidth=width;
                          const calculate=(next:PointerEvent)=>{
                            const deltaUs=Math.round(((next.clientX-originX)/pixelsPerSecond)*1_000_000);
                            const destination=trackAtPointer(next.clientY,track.id);
                            return {startUs:snap(clip.id,Math.max(0,originStart+deltaUs)),trackId:destination.trackId,offset:destination.offset};
                          };
                          const preview=(value:{startUs:number;trackId:string;offset:number})=>{
                            target.style.setProperty("--copro-clip-left",timeUsToPixels(value.startUs,{pixelsPerSecond})+"px");
                            target.style.setProperty("--copro-clip-top",value.offset+"px");
                          };
                          const revert=()=>{
                            target.style.setProperty("--copro-clip-left",left+"px");
                            target.style.setProperty("--copro-clip-top","0px");
                            target.style.setProperty("--copro-clip-width",originalWidth+"px");
                          };
                          bindTimelinePointerTransaction(target,event.pointerId,originX,originY,calculate,preview,
                            value=>onMoveClip?.(clip.id,value.startUs,value.trackId),revert,
                            value=>value.startUs!==originStart||value.trackId!==track.id);
                        }}
                      >
                        {selected && !track.locked && (
                          <IconAction
                            className="copro-trim-handle copro-trim-left"
                            aria-label="Trim clip start"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              const originX = event.clientX;
                              const originY = event.clientY;
                              const originStart = clip.startUs;
                              const originIn = clip.inUs ?? 0;
                              const rate=clip.playbackRate??1;
                              const originDuration = clip.durationUs;
                              const target = event.currentTarget;
                              target.setPointerCapture(event.pointerId);
                              const clipElement=target.closest<HTMLElement>("[data-copro-clip]");
                              const originalLeft=left,originalWidth=width;
                              const calculate=(next:PointerEvent)=>{
                                const rawDelta=Math.round(((next.clientX-originX)/pixelsPerSecond)*1_000_000);
                                const minDelta=Math.max(-Math.floor(originIn/rate),-originStart);
                                let deltaUs=Math.max(minDelta,Math.min(originDuration-MIN_CLIP_US,rawDelta));
                                const proposedStart=originStart+deltaUs;
                                const snappedStart=snap(clip.id,proposedStart);
                                deltaUs=Math.max(minDelta,Math.min(originDuration-MIN_CLIP_US,deltaUs+snappedStart-proposedStart));
                                return {startUs:originStart+deltaUs,inUs:originIn+Math.round(deltaUs*rate),durationUs:originDuration-deltaUs};
                              };
                              const preview=(value:{startUs:number;inUs:number;durationUs:number})=>{
                                clipElement?.style.setProperty("--copro-clip-left",timeUsToPixels(value.startUs,{pixelsPerSecond})+"px");
                                clipElement?.style.setProperty("--copro-clip-width",Math.max(44,timeUsToPixels(value.durationUs,{pixelsPerSecond}))+"px");
                              };
                              const revert=()=>{
                                clipElement?.style.setProperty("--copro-clip-left",originalLeft+"px");
                                clipElement?.style.setProperty("--copro-clip-width",originalWidth+"px");
                              };
                              bindTimelinePointerTransaction(target,event.pointerId,originX,originY,calculate,preview,
                                value=>onTrimClip?.(clip.id,value),revert,
                                value=>value.startUs!==originStart||value.inUs!==originIn||value.durationUs!==originDuration);
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
                                style={{ "--copro-waveform-height": Math.max(8, Math.min(100, Number(sample) * 100)) + "%" } as React.CSSProperties}
                              />
                            ))}
                          </div>
                        ) : track.kind === "captions" || track.kind === "overlay" ? (
                          <span className="copro-text-clip"><span>{text ?? clip.assetId.replace(/^asset:/, "")}</span></span>
                        ) : (
                          <div className="copro-clip-filmstrip" aria-hidden="true">
                            {Array.from({ length: Math.max(2, Math.ceil(width / 65)) }, (_, index) => {
                              const frames=mediaThumbnails[clip.assetId];
                              const frame=frames?.length?frames[Math.floor(index*frames.length/Math.max(2,Math.ceil(width/65)))%frames.length]:null;
                              return <span key={index} className={frame ? "is-decoded-frame" : undefined} style={{ "--copro-frame-image": frame ? "url(" + frame + ")" : "none" } as React.CSSProperties}/>;
                            })}
                          </div>
                        )}

                        {track.kind !== "captions" && track.kind !== "overlay" && <span className="copro-clip-label">
                          {text ?? clip.assetId.replace(/^asset:/, "")}
                          {clip.playbackRate && clip.playbackRate !== 1 ? " · " + clip.playbackRate.toFixed(2) + "×" : ""}
                        </span>}

                        {clip.metadata?.transitionOut && (clip.metadata.transitionOut as any).type !== "none" ? (
                          <span className="copro-transition-marker" title={"Transition: " + String((clip.metadata.transitionOut as any).type)}>◇</span>
                        ) : null}

                        {selected && !track.locked && (
                          <IconAction
                            className="copro-trim-handle copro-trim-right"
                            aria-label="Trim clip end"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              const originX = event.clientX;
                              const originY = event.clientY;
                              const originDuration = clip.durationUs;
                              const clipEnd = clip.startUs + originDuration;
                              const target = event.currentTarget;
                              target.setPointerCapture(event.pointerId);
                              const clipElement=target.closest<HTMLElement>("[data-copro-clip]");
                              const originalWidth=width;
                              const calculate=(next:PointerEvent)=>{
                                const deltaUs=Math.round(((next.clientX-originX)/pixelsPerSecond)*1_000_000);
                                const proposedEnd=clipEnd+deltaUs;
                                const snappedEnd=snap(clip.id,proposedEnd);
                                return {durationUs:Math.max(MIN_CLIP_US,originDuration+(snappedEnd-clipEnd))};
                              };
                              const preview=(value:{durationUs:number})=>clipElement?.style.setProperty("--copro-clip-width",Math.max(44,timeUsToPixels(value.durationUs,{pixelsPerSecond}))+"px");
                              const revert=()=>clipElement?.style.setProperty("--copro-clip-width",originalWidth+"px");
                              bindTimelinePointerTransaction(target,event.pointerId,originX,originY,calculate,preview,
                                value=>onTrimClip?.(clip.id,value),revert,value=>value.durationUs!==originDuration);
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
      {clipMenu&&<div ref={menuRef} className="mm-timeline-context-menu" role="menu"
        style={{"--mm-menu-x":Math.max(8,clipMenu.x)+"px","--mm-menu-y":Math.max(8,clipMenu.y)+"px"} as React.CSSProperties}>
        <strong>Clip actions</strong>
        {([
          ["split","Split at playhead","⌘B"],["duplicate","Duplicate clip",""],["trim","Trim & timing",""],
          ["speed","Speed",""],["animation","Animation",""],["adjust","Adjust",""],["delete","Delete clip",""]
        ] as const).map(([id,label,shortcut])=><button type="button" key={id} role="menuitem"
          className={id==="delete"?"is-danger":""} disabled={clipMenu.locked}
          onClick={()=>{onClipContextAction?.(id,clipMenu.clipId,clipMenu.atUs);setClipMenu(null);}}>
          <span>{label}</span>{shortcut&&<kbd>{shortcut}</kbd>}
        </button>)}
        {clipMenu.locked&&<small>Unlock the track to edit this clip.</small>}
      </div>}
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
