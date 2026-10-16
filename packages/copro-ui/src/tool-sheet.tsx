import React, { useEffect, useId, useState } from "react";
import { FileAudio, Film, Upload, X } from "lucide-react";

/** A single reusable tool body for the CoPro inspector, never a modal or a second editor. */
export type CoProMediaShelfItem = {
  id: string;
  name: string;
  kind: "video" | "audio" | "image";
  url: string;
  durationUs?: number;
};

export type CoProToolPanelProps = {
  tool: string | null;
  onClose: () => void;
  initialSpeed?: number;
  initialVolume?: number;
  initialText?: string;
  hasSelection?: boolean;
  hasSelectedClip?: boolean;
  selectedClipKind?: string;
  selectedClipId?: string | null;
  selectedClipStartUs?: number;
  selectedClipDurationUs?: number;
  onSpeedChange?: (rate: number) => void;
  onVolumeChange?: (volume: number) => void;
  onTrimChange?: (patch: { startUs?: number; durationUs?: number }) => void;
  onProjectExport?: () => void;
  onTextCommit?: (text: string, kind: "overlay" | "captions") => void;
  onMediaPicked?: (file: File) => void;
  mediaItems?: CoProMediaShelfItem[];
  onMediaAdd?: (id: string) => void;
  currentEffect?: string;
  currentTransition?: string;
  onEffectChange?: (effect: string) => void;
  onTransitionChange?: (transition: string) => void;
};

const DESCRIPTION: Record<string, string> = {
  media: "Bring in video, photographs, or audio and add them to the timeline.",
  audio: "Add audio, select a clip, and adjust its level.",
  text: "Add a title or edit the selected text directly on the timeline.",
  captions: "Write captions that remain editable as timeline clips.",
  trim: "Precisely adjust the selected clip's time and duration.",
  speed: "Change the selected clip's playback rate.",
  volume: "Adjust the selected clip's audio level.",
  effects: "Choose a visual treatment for the selected clip.",
  transitions: "Choose how the selected clip moves into the next.",
  templates: "Reusable composition templates are not connected yet.",
  export: "Save an editable project file. Video rendering requires a connected runtime.",
};

export function CoProToolPanel({
  tool,
  onClose,
  initialSpeed = 1,
  initialVolume = 1,
  initialText = "",
  hasSelection = false,
  hasSelectedClip = false,
  selectedClipKind,
  selectedClipId,
  selectedClipStartUs = 0,
  selectedClipDurationUs = 0,
  onSpeedChange,
  onVolumeChange,
  onTrimChange,
  onProjectExport,
  onTextCommit,
  onMediaPicked,
  mediaItems = [],
  onMediaAdd,
  currentEffect = "none",
  currentTransition = "none",
  onEffectChange,
  onTransitionChange,
}: CoProToolPanelProps) {
  const [speed, setSpeed] = useState(initialSpeed);
  const [volume, setVolume] = useState(Math.round(initialVolume * 100));
  const [text, setText] = useState(initialText);
  const [trimStart, setTrimStart] = useState((selectedClipStartUs / 1e6).toFixed(2));
  const [trimDuration, setTrimDuration] = useState((selectedClipDurationUs / 1e6).toFixed(2));
  const uploadId = useId();
  const titleId = useId();

  useEffect(() => setSpeed(initialSpeed), [initialSpeed, tool, selectedClipId]);
  useEffect(() => setVolume(Math.round(initialVolume * 100)), [initialVolume, tool, selectedClipId]);
  useEffect(() => setText(initialText), [initialText, tool, selectedClipId]);
  useEffect(() => setTrimStart((selectedClipStartUs / 1e6).toFixed(2)), [selectedClipStartUs, selectedClipId, tool]);
  useEffect(() => setTrimDuration((selectedClipDurationUs / 1e6).toFixed(2)), [selectedClipDurationUs, selectedClipId, tool]);

  if (!tool) return null;
  const title = tool.charAt(0).toUpperCase() + tool.slice(1);
  const isText = tool === "text" || tool === "captions";
  const needSelection = ["trim", "speed", "volume", "effects", "transitions"].includes(tool);
  const isAudio = tool === "audio" || tool === "volume";
  const showMedia = tool === "media" || tool === "audio";

  const chooseFile = (file: File | undefined) => {
    if (!file) return;
    onMediaPicked?.(file);
  };

  return (
    <section className="copro-tool-panel" aria-labelledby={titleId} data-active-tool={tool}>
      <header className="copro-tool-panel-header">
        <div><span className="copro-panel-eyebrow">EDITING TOOLS</span><h2 id={titleId}>{title}</h2></div>
        <button className="copro-panel-close" aria-label={"Close " + title + " panel"} onClick={onClose}><X size={20}/></button>
      </header>
      <div className="copro-tool-panel-body">
        <p className="copro-tool-intro">{DESCRIPTION[tool] ?? "Choose settings for the selected clip."}</p>
        {needSelection && !hasSelectedClip ? (
          <div className="copro-inspector-guidance">
            <Film size={23}/>
            <strong>Select a clip</strong>
            <p>Tap a clip in the timeline to edit its {tool === "volume" ? "volume" : tool}. The canvas and timeline stay visible.</p>
          </div>
        ) : tool === "trim" ? (
          <div className="copro-tool-control">
            <label className="copro-number-control"><span>Timeline start (seconds)</span><input type="number" min="0" step="0.1" value={trimStart} onChange={(e)=>setTrimStart(e.target.value)} onBlur={() => {
              const value = Number(trimStart);
              if (Number.isFinite(value) && value >= 0) onTrimChange?.({startUs:Math.round(value*1e6)});
              else setTrimStart((selectedClipStartUs/1e6).toFixed(2));
            }}/></label>
            <label className="copro-number-control"><span>Duration (seconds)</span><input type="number" min="0.1" step="0.1" value={trimDuration} onChange={(e)=>setTrimDuration(e.target.value)} onBlur={() => {
              const value = Number(trimDuration);
              if (Number.isFinite(value) && value >= 0.1) onTrimChange?.({durationUs:Math.round(value*1e6)});
              else setTrimDuration((selectedClipDurationUs/1e6).toFixed(2));
            }}/></label>
            <p className="copro-panel-note">You can also drag the teal handles on a selected timeline clip.</p>
          </div>
        ) : tool === "speed" ? (
          <div className="copro-tool-control">
            <div className="copro-value-row"><span>Playback speed</span><strong>{speed.toFixed(2)}×</strong></div>
            <input aria-label="Playback speed" type="range" min=".25" max="4" step=".05" value={speed} onChange={(e) => {
              const value = Number(e.target.value); setSpeed(value); onSpeedChange?.(value);
            }}/>
            <div className="copro-preset-row">
              {[.5,1,1.5,2].map((value) => <button aria-pressed={Math.abs(speed-value)<.001} className={Math.abs(speed-value)<.001?"is-active":""} key={value} onClick={()=>{setSpeed(value);onSpeedChange?.(value);}}>{value}×</button>)}
            </div>
            <p className="copro-panel-note">Changing speed adjusts the clip's timeline duration.</p>
          </div>
        ) : (tool === "volume" || (tool === "audio" && hasSelectedClip && selectedClipKind === "audio")) ? (
          <div className="copro-tool-control">
            <div className="copro-value-row"><span>Clip volume</span><strong>{volume}%</strong></div>
            <input aria-label="Clip volume" type="range" min="0" max="200" value={volume} onChange={(e)=>{
              const value=Number(e.target.value);setVolume(value);onVolumeChange?.(value/100);
            }}/>
            <div className="copro-preset-row">
              {[0,50,100,150].map((value)=><button key={value} className={volume===value?"is-active":""} aria-pressed={volume===value} onClick={()=>{setVolume(value);onVolumeChange?.(value/100);}}>{value}%</button>)}
            </div>
          </div>
        ) : isText ? (
          <form className="copro-tool-control" onSubmit={(event)=>{
            event.preventDefault();
            const value=text.trim();
            if (!value) return;
            onTextCommit?.(value, tool === "captions" ? "captions" : "overlay");
            if (!hasSelection) setText("");
          }}>
            <label className="copro-text-field">
              <span>{tool === "captions" ? "Caption text" : "Title text"}</span>
              <textarea value={text} onChange={(e)=>setText(e.target.value)} placeholder={tool === "captions" ? "Type your caption…" : "Write a title…"} rows={4}/>
            </label>
            <button type="submit" className="copro-inline-primary" disabled={!text.trim()}>{hasSelection ? "Update selected text" : tool === "captions" ? "Add caption to timeline" : "Add title to timeline"}</button>
            <p className="copro-panel-note">Titles and captions are editable clips. Select one on the timeline to revise it.</p>
          </form>
        ) : tool === "effects" ? (
          <div className="copro-tool-grid">
            {[["none","Clean"],["punch","Punch"],["soft","Soft"],["film","Film"],["mono","Mono"],["warm","Warm"]].map(([id,label]) => (
              <button aria-pressed={currentEffect===id} className={currentEffect===id?"is-active":""} key={id} onClick={()=>onEffectChange?.(id)}>
                <i className={"copro-effect-preview copro-effect-"+id}>{label.slice(0,1)}</i><span>{label}</span>
              </button>
            ))}
          </div>
        ) : tool === "transitions" ? (
          <div className="copro-tool-grid">
            {[["none","None"],["crossfade","Crossfade"],["dip-black","Dip black"],["slide","Slide"],["zoom","Zoom"],["blur","Blur"]].map(([id,label]) => (
              <button aria-pressed={currentTransition===id} className={currentTransition===id?"is-active":""} key={id} onClick={()=>onTransitionChange?.(id)}>
                <i>{label.slice(0,1)}</i><span>{label}</span>
              </button>
            ))}
            <p className="copro-panel-note">Transition metadata is preserved on the clip. Playback rendering support is still being integrated.</p>
          </div>
        ) : tool === "export" ? (
          <div className="copro-tool-control">
            <button className="copro-inline-primary" onClick={onProjectExport}>Download editable CoPro project</button>
            <p className="copro-panel-note">The JSON project contains your editing decisions and asset references. Original video and audio files are not bundled.</p>
            <div className="copro-inspector-guidance"><strong>Rendered video exports</strong><p>MP4 encoding is not connected to this standalone editor yet. No simulated progress or pretend success.</p></div>
          </div>
        ) : showMedia ? (
          <div className="copro-media-library">
            <div className="copro-media-import">
              <input id={uploadId} type="file" accept={tool==="audio"?"audio/*":"video/*,audio/*,image/*"} onChange={(event)=>{chooseFile(event.currentTarget.files?.[0]);event.currentTarget.value="";}}/>
              <label htmlFor={uploadId} className="copro-file-picker copro-file-picker-compact">
                <b><Upload size={22}/></b><strong>Import {isAudio?"audio":"media"}</strong><span>Choose a file from your device</span>
              </label>
            </div>
            {mediaItems.filter((item)=>!isAudio||item.kind==="audio").length ? (
              <div className="copro-media-shelf">
                {mediaItems.filter((item)=>!isAudio||item.kind==="audio").map((item)=>(
                  <article className="copro-media-shelf-item" key={item.id}>
                    <div className="copro-media-shelf-preview">
                      {item.kind==="image"?<img src={item.url} alt=""/>:item.kind==="video"?<video src={item.url} muted playsInline preload="metadata"/>:<FileAudio size={25}/>}
                    </div>
                    <div className="copro-media-shelf-copy"><strong>{item.name}</strong><small>{item.kind}{item.durationUs?" · "+formatDuration(item.durationUs):""}</small></div>
                    <button onClick={()=>onMediaAdd?.(item.id)}>Add</button>
                  </article>
                ))}
              </div>
            ) : <p className="copro-media-empty">No imported {isAudio?"audio":"media"} in this session. Choose a file above.</p>}
            <p className="copro-panel-note">Local media previews are session-only; keep your original files for reopening the project.</p>
          </div>
        ) : <div className="copro-inspector-guidance">
          <strong>{tool === "templates" ? "Template catalog not connected" : "Not yet available"}</strong>
          <p>{tool === "templates" ? "The portable CoPro template contracts exist, but a working catalog hasn't been integrated into this editor." : "This capability isn't enabled in the current local editor."}</p>
        </div>}
        {tool === "audio" && !(hasSelectedClip && selectedClipKind === "audio") && <p className="copro-panel-note">Select an audio clip to adjust its volume.</p>}
      </div>
    </section>
  );
}

/**
 * Compatibility adapter: existing consumers may still pass `open`.
 * Even on old entrypoints, editing tools now occupy layout space, never a modal.
 */
export function CoProToolSheet(props: CoProToolPanelProps & { open?: boolean }) {
  if (props.open === false) return null;
  return <CoProToolPanel {...props}/>;
}

function formatDuration(durationUs:number) {
  const seconds=Math.max(0,Math.round(durationUs/1e6));
  return Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0");
}
