import React, { useEffect, useId, useState } from "react";
import type { CoProCreativeAsset } from "./creative-types.js";
import { FileAudio, Film, Upload, X, Sparkles } from "lucide-react";

/** A single reusable tool body for the CoPro inspector, never a modal or a second editor. */
export type CoProMediaShelfItem = {
  id: string;
  name: string;
  kind: "video" | "audio" | "image";
  url: string;
  durationUs?: number;
  thumbnails?: string[];
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
  projectTitle?: string;
  projectTrackCount?: number;
  projectClipCount?: number;
  projectDurationUs?: number;
  projectCanvas?: {width:number;height:number;frameRate?:number};
  transitionSettings?: {type?:string;durationUs?:number;direction?:string;easing?:string};
  motionSettings?: {id?:string;durationUs?:number};
  onTransitionSettingsChange?: (patch:{durationUs?:number;direction?:string;easing?:string})=>void;
  onMotionSettingsChange?: (durationUs:number)=>void;
  onBrowsePresets?:()=>void;
  transform?: { scale?: number; x?: number; y?: number; rotation?: number; opacity?: number };
  onTransformChange?: (patch: { scale?: number; x?: number; y?: number; rotation?: number; opacity?: number }) => void;
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
  currentMotion?: string;
  currentGraphic?: string;
  currentGraphicText?: string;
  creativeParameters?: Record<string, unknown>;
  creativeAssets?: CoProCreativeAsset[];
  onEffectChange?: (effect: string) => void;
  onTransitionChange?: (transition: string) => void;
  onMotionChange?: (motion: string) => void;
  onGraphicChange?: (graphic: string, text?: string) => void;
  onCreativeParametersChange?: (patch: Record<string, unknown>) => void;
};

const DESCRIPTION: Record<string, string> = {
  project: "Project information and timeline configuration.",
  video: "Video properties, masks, background removal and retouch controls.",
  animation: "Keyframes, motion curves, easing and animation controls.",
  tracking: "Object, camera and planar tracking controls.",
  adjust: "Professional image and footage adjustments.",
  "ai-stylize": "Style-transfer and AI-assisted visual treatment controls.",
  media: "Bring in video, photographs, or audio and add them to the timeline.",
  audio: "Add audio, select a clip, and adjust its level.",
  text: "Add a title or edit the selected text directly on the timeline.",
  captions: "Write captions that remain editable as timeline clips.",
  trim: "Precisely adjust the selected clip's time and duration.",
  transform: "Position, scale and rotate the selected visual layer using exact values.",
  speed: "Change the selected clip's playback rate.",
  volume: "Adjust the selected clip's audio level.",
  effects: "Choose a visual treatment for the selected clip.",
  transitions: "Choose how the selected clip moves into the next.",
  stickers: "Add editable annotations, arrows and graphic marks to the timeline.",
  templates: "Browse reusable, editable compositions from the CoPro creative library.",
  export: "Save an editable project file. Video rendering requires a connected runtime.",
};

type TransformEditorProps = Pick<CoProToolPanelProps,"transform"|"onTransformChange">;

function TransformEditor({transform,onTransformChange}:TransformEditorProps){
  return <div className="mm-transform-controls">
    <div className="mm-transform-subheading">Basic properties <span>Exact transform values</span></div>
    <h3>Transform <small>Real-time preview</small></h3>
    {([
      ["scale", "Scale", 5, 600, 1, "%", 100],
      ["x", "Position X", -100, 100, 1, "%", 0],
      ["y", "Position Y", -100, 100, 1, "%", 0],
      ["rotation", "Rotate", -180, 180, 1, "°", 0],
      ["opacity", "Opacity", 0, 100, 1, "%", 100],
    ] as const).map(([key,label,min,max,step,unit,fallback]) => {
      const raw = transform?.[key] ?? (key === "scale" || key === "opacity" ? 1 : 0);
      const value = key === "scale" || key === "opacity" ? Number((raw * 100).toFixed(2)) : raw;
      const change = (next: number) => {
        if (!Number.isFinite(next)) return;
        onTransformChange?.({[key] : key === "scale" || key === "opacity" ? next/100 : next});
      };
      return <label key={key} className="mm-transform-row">
        <span>{label}</span>
        <div className="mm-transform-inputs">
          <input aria-label={label+" slider"} type="range" min={min} max={max} step={step} value={Math.max(min,Math.min(max,value))} onChange={event => change(Number(event.currentTarget.value))}/>
          <input aria-label={label} type="number" min={min} max={max} step={step} value={value} onChange={event => change(Math.min(max,Math.max(min,Number(event.currentTarget.value))))}/>
          <b>{unit}</b>
          <button type="button" title={"Reset "+label} aria-label={"Reset "+label} onClick={()=>change(fallback)}>↺</button>
        </div>
      </label>;
    })}
    <p className="copro-panel-note">Changes update the selected clip, preview and editable project history. Drag the image to reposition it.</p>
  </div>;
}

function VideoTools({transform,onTransformChange}:TransformEditorProps){
  const [tab,setTab]=useState<"Basic"|"Remove BG"|"Mask"|"Retouch">("Basic");
  const [removeBgEnabled,setRemoveBgEnabled]=useState(false);
  const [maskShape,setMaskShape]=useState("Rectangle");
  const [retouchMode,setRetouchMode]=useState("Face");
  const [values,setValues]=useState<Record<string,number>>({Feather:0,"Round corners":0,Strength:50,Smooth:0,Clear:0,Whitening:0});
  const [toggles,setToggles]=useState<Record<string,boolean>>({invert:false,track:false,keepHair:true,protectDetails:true});
  const setValue=(key:string,value:number)=>setValues(current=>({...current,[key]:value}));
  const toggle=(key:string)=>setToggles(current=>({...current,[key]:!current[key]}));
  return <section className="mm-video-tools" aria-label="Video editing tools">
    <nav className="mm-video-subtabs" role="tablist" aria-label="Video tools">
      {(["Basic","Remove BG","Mask","Retouch"] as const).map(item=><button type="button" role="tab" aria-selected={tab===item} className={tab===item?"is-active":""} key={item} onClick={()=>setTab(item)}>{item}</button>)}
    </nav>
    {tab==="Basic"&&<TransformEditor transform={transform} onTransformChange={onTransformChange}/>}
    {tab==="Remove BG"&&<div className="mm-video-feature-panel">
      <div className="mm-video-feature-heading"><span>SUBJECT ISOLATION</span><strong>Remove background</strong><p>Subject segmentation, edge cleanup, spill control and replacement compositing.</p></div>
      <label className="mm-feature-toggle"><span><strong>Auto removal</strong><small>Detect the primary subject in the selected footage.</small></span><input type="checkbox" checked={removeBgEnabled} onChange={event=>setRemoveBgEnabled(event.currentTarget.checked)}/></label>
      <div className="mm-feature-control"><span>Edge refinement <b>{values.Strength}%</b></span><input type="range" min="0" max="100" value={values.Strength} onChange={event=>setValue("Strength",Number(event.currentTarget.value))}/></div>
      <div className="mm-feature-control"><span>Feather <b>{values.Feather}px</b></span><input type="range" min="0" max="30" value={values.Feather} onChange={event=>setValue("Feather",Number(event.currentTarget.value))}/></div>
      <label className="mm-feature-toggle"><span><strong>Preserve fine hair</strong><small>Keep detailed edges and transparent strands.</small></span><input type="checkbox" checked={toggles.keepHair} onChange={()=>toggle("keepHair")}/></label>
      <div className="mm-feature-status"><Sparkles size={15}/><span><strong>Interface preview</strong> · Preview only</span></div>
      <button type="button" className="mm-feature-primary" onClick={()=>setRemoveBgEnabled(value=>!value)}>{removeBgEnabled?"Disable preview":"Preview removal"}</button>
    </div>}
    {tab==="Mask"&&<div className="mm-video-feature-panel">
      <div className="mm-video-feature-heading"><span>MASK EDITOR</span><strong>Mask & matte</strong><p>Shape masks, brush masks, tracked mattes, feathering and compositing controls.</p></div>
      <div className="mm-mask-shapes">{["Split","Filmstrip","Circle","Rectangle","Stars","Heart","Text","Brush","Pen"].map(shape=><button type="button" key={shape} className={maskShape===shape?"is-active":""} aria-pressed={maskShape===shape} onClick={()=>setMaskShape(shape)}><i>{shape==="Circle"?"○":shape==="Rectangle"?"▭":shape==="Split"?"◫":shape==="Brush"?"✎":"◇"}</i><span>{shape}</span></button>)}</div>
      <div className="mm-feature-control"><span>Feather <b>{values.Feather}px</b></span><input type="range" min="0" max="100" value={values.Feather} onChange={event=>setValue("Feather",Number(event.currentTarget.value))}/></div>
      <div className="mm-feature-control"><span>Round corners <b>{values["Round corners"]}%</b></span><input type="range" min="0" max="100" value={values["Round corners"]} onChange={event=>setValue("Round corners",Number(event.currentTarget.value))}/></div>
      <label className="mm-feature-toggle"><span><strong>Invert mask</strong><small>Reverse the visible and masked areas.</small></span><input type="checkbox" checked={toggles.invert} onChange={()=>toggle("invert")}/></label>
      <label className="mm-feature-toggle"><span><strong>Track mask</strong><small>Follow the selected region across frames.</small></span><input type="checkbox" checked={toggles.track} onChange={()=>toggle("track")}/></label>
      <div className="mm-feature-status"><Sparkles size={15}/><span><strong>{maskShape} mask selected</strong> · Preview only</span></div>
    </div>}
    {tab==="Retouch"&&<div className="mm-video-feature-panel">
      <div className="mm-video-feature-heading"><span>IMAGE REFINEMENT</span><strong>Retouch</strong><p>Separate face, body, hair and global refinement controls.</p></div>
      <div className="mm-retouch-modes">{["Face","Body","Hair","Face presets","Body presets"].map(mode=><button type="button" key={mode} className={retouchMode===mode?"is-active":""} onClick={()=>setRetouchMode(mode)}>{mode}</button>)}</div>
      {["Smooth","Clear","Whitening","Detail preserve"].map(label=><div className="mm-feature-control" key={label}><span>{label} <b>{values[label]??0}%</b></span><input type="range" min="0" max="100" value={values[label]??0} onChange={event=>setValue(label,Number(event.currentTarget.value))}/></div>)}
      <label className="mm-feature-toggle"><span><strong>Protect details</strong><small>Retain texture and fine edges.</small></span><input type="checkbox" checked={toggles.protectDetails} onChange={()=>toggle("protectDetails")}/></label>
      <div className="mm-feature-status"><Sparkles size={15}/><span><strong>{retouchMode}</strong> · Preview only</span></div>
    </div>}
  </section>;
}

const FEATURE_PRESETS: Record<string,{eyebrow:string;title:string;description:string;tabs:string[];sliders:Array<{label:string;value:number;min:number;max:number;unit?:string}>;actions:string[]}> = {
  animation:{eyebrow:"MOTION DESIGN",title:"Animation & keyframes",description:"Animate transforms, opacity, effects and properties over time with editable curves and keyframe tracks.",tabs:["Keyframes","Graph editor","Dope sheet","NLA"],sliders:[{label:"Position X",value:0,min:-1000,max:1000,unit:"px"},{label:"Position Y",value:0,min:-1000,max:1000,unit:"px"},{label:"Rotation",value:0,min:-360,max:360,unit:"°"},{label:"Scale",value:100,min:1,max:800,unit:"%"},{label:"Opacity",value:100,min:0,max:100,unit:"%"}],actions:["Add keyframe","Auto keyframe","Add animation track"]},
  tracking:{eyebrow:"MOTION ANALYSIS",title:"Tracking & stabilization",description:"Object, camera and planar tracking with feature detection, solve settings and stabilization controls.",tabs:["Object","Camera","Planar","Stabilize"],sliders:[{label:"Feature threshold",value:50,min:0,max:100,unit:"%"},{label:"Track size",value:24,min:1,max:100,unit:"px"},{label:"Smoothing",value:35,min:0,max:100,unit:"%"},{label:"Solve accuracy",value:80,min:0,max:100,unit:"%"}],actions:["Analyze motion","Solve camera","Create tracking data"]},
  adjust:{eyebrow:"COLOR & IMAGE",title:"Adjust",description:"Primary and secondary correction, tonal controls, color balance, curves, HSL, scopes and finishing.",tabs:["Basic","Color","Curves","HSL","Scopes"],sliders:[{label:"Exposure",value:0,min:-5,max:5,unit:"EV"},{label:"Contrast",value:0,min:-100,max:100},{label:"Saturation",value:100,min:0,max:200,unit:"%"},{label:"Highlights",value:0,min:-100,max:100},{label:"Shadows",value:0,min:-100,max:100},{label:"Temperature",value:0,min:-100,max:100},{label:"Tint",value:0,min:-100,max:100}],actions:["Reset adjustments","Save look","Apply to selection"]},
  "ai-stylize":{eyebrow:"GENERATIVE FINISHING",title:"AI stylize",description:"Explore style transfer, cinematic looks, scene restyling and controlled image-to-image direction.",tabs:["Styles","Prompt","Structure","History"],sliders:[{label:"Style strength",value:45,min:0,max:100,unit:"%"},{label:"Structure preserve",value:80,min:0,max:100,unit:"%"},{label:"Detail retention",value:90,min:0,max:100,unit:"%"}],actions:["Generate preview","Create variation","Save style preset"]}
};

function CapabilityPreviewPanel({tool}:{tool:string}){
  const config=FEATURE_PRESETS[tool];
  const [tab,setTab]=useState(config.tabs[0]);
  const [values,setValues]=useState<Record<string,number>>({});
  const [preset,setPreset]=useState("Cinematic");
  const [prompt,setPrompt]=useState("");
  const [lastAction,setLastAction]=useState("");
  const [easing,setEasing]=useState("Ease in out");
  return <section className="mm-capability-preview-panel">
    <div className="mm-capability-heading"><span>{config.eyebrow}</span><strong>{config.title}</strong><p>{config.description}</p></div>
    <div className="mm-capability-tabs" role="tablist">{config.tabs.map(item=><button type="button" role="tab" aria-selected={tab===item} className={tab===item?"is-active":""} key={item} onClick={()=>setTab(item)}>{item}</button>)}</div>
    {tool==="ai-stylize"&&<div className="mm-ai-style-grid">{["Cinematic","Photoreal","Illustration","Anime","Clay","Architectural"].map(item=><button type="button" key={item} className={preset===item?"is-active":""} onClick={()=>setPreset(item)}><span className="mm-ai-style-art">{item.slice(0,1)}</span><strong>{item}</strong></button>)}</div>}
    {config.sliders.map(control=><label className="mm-feature-control" key={control.label}><span>{control.label}<b>{values[control.label]??control.value}{control.unit??""}</b></span><input type="range" min={control.min} max={control.max} step={control.max <= 10 ? .1 : 1} value={values[control.label]??control.value} onChange={event=>setValues(current=>({...current,[control.label]:Number(event.currentTarget.value)}))}/></label>)}
    {tool==="animation"&&<div className="mm-animation-curve-card"><div><strong>Interpolation</strong><select value={easing} onChange={event=>setEasing(event.currentTarget.value)}><option>Linear</option><option>Ease in</option><option>Ease out</option><option>Ease in out</option><option>Bezier</option><option>Step</option></select></div><div className="mm-animation-keyframe-track"><i/><i/><i/><i/></div><small>Frame 001 · 030 · 060 · 090</small></div>}
    {tool==="ai-stylize"&&<label className="mm-ai-prompt"><span>Creative direction</span><textarea rows={3} value={prompt} onChange={event=>setPrompt(event.currentTarget.value)} placeholder="Describe the visual treatment, atmosphere, lighting or material style…"/></label>}
    {config.actions.map(action=><button type="button" className="mm-capability-action" key={action} onClick={()=>setLastAction(action)}>{action}</button>)}
    {lastAction&&<div className="mm-feature-status"><Sparkles size={15}/><span><strong>{lastAction}</strong> · Preview only</span></div>}
    <div className="mm-capability-status"><span>UI PREVIEW</span><strong>Preview controls</strong><p>Explore settings before processing.</p></div>
  </section>;
}

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
  projectTitle = "Untitled project",
  projectTrackCount = 0,
  projectClipCount = 0,
  projectDurationUs = 0,
  projectCanvas, transitionSettings, motionSettings, onTransitionSettingsChange, onMotionSettingsChange, onBrowsePresets,
  onSpeedChange,
  onVolumeChange,
  onTrimChange,
  transform,
  onTransformChange,
  onProjectExport,
  onTextCommit,
  onMediaPicked,
  mediaItems = [],
  onMediaAdd,
  currentEffect = "none",
  currentTransition = "none",
  currentMotion = "",
  currentGraphic = "",
  currentGraphicText = "",
  creativeParameters,
  creativeAssets = [],
  onEffectChange,
  onTransitionChange,
  onMotionChange,
  onGraphicChange,
  onCreativeParametersChange,
}: CoProToolPanelProps) {
  const [speed, setSpeed] = useState(initialSpeed);
  const [volume, setVolume] = useState(Math.round(initialVolume * 100));
  const [text, setText] = useState(initialText);
  const [trimStart, setTrimStart] = useState((selectedClipStartUs / 1e6).toFixed(2));
  const [trimDuration, setTrimDuration] = useState((selectedClipDurationUs / 1e6).toFixed(2));
  const [effectTab, setEffectTab] = useState<"looks" | "overlays" | "motion" | "graphics">("looks");
  const uploadId = useId();
  const titleId = useId();

  useEffect(() => setSpeed(initialSpeed), [initialSpeed, tool, selectedClipId]);
  useEffect(() => setVolume(Math.round(initialVolume * 100)), [initialVolume, tool, selectedClipId]);
  useEffect(() => setText(initialText), [initialText, tool, selectedClipId]);
  useEffect(() => setTrimStart((selectedClipStartUs / 1e6).toFixed(2)), [selectedClipStartUs, selectedClipId, tool]);
  useEffect(() => setTrimDuration((selectedClipDurationUs / 1e6).toFixed(2)), [selectedClipDurationUs, selectedClipId, tool]);
  useEffect(() => setEffectTab("looks"), [tool, selectedClipId]);

  if (!tool) return null;
  const title = tool.charAt(0).toUpperCase() + tool.slice(1);
  const isText = tool === "text" || tool === "captions";
  const needSelection = ["trim", "speed", "volume", "effects", "transitions", "transform", "video", "animation", "tracking", "adjust", "ai-stylize"].includes(tool);
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
        ) : tool === "project" ? (
          <dl className="mm-project-inspector-details">
            <div><dt>Name</dt><dd>{projectTitle}</dd></div>
            <div><dt>Tracks</dt><dd>{projectTrackCount}</dd></div>
            <div><dt>Timeline clips</dt><dd>{projectClipCount}</dd></div>
            <div><dt>Sequence duration</dt><dd>{(projectDurationUs/1_000_000).toFixed(2)} seconds</dd></div>
            <div><dt>Resolution</dt><dd>{projectCanvas?projectCanvas.width+" × "+projectCanvas.height:"—"}</dd></div>
            <div><dt>Frame rate</dt><dd>{projectCanvas?.frameRate??30} fps</dd></div>

          </dl>
        ) : tool === "video" ? (
          <VideoTools transform={transform} onTransformChange={onTransformChange}/>
        ) : tool === "transform" ? (
          <TransformEditor transform={transform} onTransformChange={onTransformChange}/>
        ) : tool === "animation" ? (
          <div className="mm-preset-properties">
            <strong>{creativeAssets.find(asset=>asset.id===currentMotion)?.name??"No animation"}</strong>
            <button type="button" onClick={onBrowsePresets}>Browse animations</button>
            <label>Duration (seconds)<input aria-label="Animation duration" type="number" min=".05" max="30" step=".05" value={(motionSettings?.durationUs??800000)/1000000} onChange={event=>{const n=Number(event.currentTarget.value);if(n>=.05&&n<=30)onMotionSettingsChange?.(Math.round(n*1000000));}}/></label>
            <button type="button" onClick={()=>onMotionChange?.("none")}>Remove animation</button>
          </div>
        ) : tool === "tracking" || tool === "adjust" || tool === "ai-stylize" ? (
          <CapabilityPreviewPanel key={tool} tool={tool}/>
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
        ) : tool === "stickers" ? (
          <div className="copro-tool-control">
            <p className="copro-panel-note">Select a mark to create an editable, timed overlay on the timeline.</p>
            <div className="mm-sticker-grid">
              {([ ["→","Arrow right"], ["←","Arrow left"], ["↑","Arrow up"], ["↓","Arrow down"], ["★","Star"], ["●","Point"], ["✓","Check"], ["!","Callout"], ["▶","Play marker"], ["✦","Spark"], ["+","Plus"], ["□","Square"] ] as const).map(([mark,label]) => <button type="button" key={mark} title={`Add ${label}`} aria-label={`Add ${label} to timeline`} onClick={() => onTextCommit?.(mark,"overlay")}><span>{mark}</span><small>{label}</small></button>)}
            </div>
          </div>
        ) : isText && creativeParameters ? (
          <div className="mm-creative-parameter-editor">
            <div className="mm-creative-parameter-heading"><strong>Composition content</strong><span>Edits update the rendered composition and project history.</span></div>
            <label><span>Title</span><input value={String(creativeParameters.title ?? "")} maxLength={4000} onChange={event=>onCreativeParametersChange?.({title:event.currentTarget.value})}/></label>
            <label><span>Subtitle</span><textarea rows={3} value={String(creativeParameters.subtitle ?? "")} maxLength={4000} onChange={event=>onCreativeParametersChange?.({subtitle:event.currentTarget.value})}/></label>
            <label><span>Chapter / eyebrow</span><input value={String(creativeParameters.label ?? "")} maxLength={4000} onChange={event=>onCreativeParametersChange?.({label:event.currentTarget.value})}/></label>
            <label className="mm-creative-accent-row"><span>Accent color</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(String(creativeParameters.accent ?? ""))?String(creativeParameters.accent):"#68dfc0"} onChange={event=>onCreativeParametersChange?.({accent:event.currentTarget.value})}/></label>
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
          <div className="copro-creative-picker">
            <div className="copro-library-tabs" role="tablist" aria-label="Effect library">
              {([ ["looks","Looks"], ["overlays","Overlays"], ["motion","Motion"], ["graphics","Graphics"] ] as const).map(([id,label]) => <button type="button" role="tab" aria-selected={effectTab===id} className={effectTab===id?"is-active":""} key={id} onClick={()=>setEffectTab(id)}>{label}</button>)}
            </div>
            {effectTab === "looks" ? <div className="copro-creative-grid">
              {creativeAssets.filter(asset=>asset.category==="treatment").map(asset => <button type="button" key={asset.id} className={currentEffect===asset.id || (asset.id==="clean"&&currentEffect==="none")?"is-active":""} aria-pressed={currentEffect===asset.id || (asset.id==="clean"&&currentEffect==="none")} onClick={()=>onEffectChange?.(asset.id==="clean"?"none":asset.id)}>
                <span className="copro-creative-thumb">{asset.previewUrl ? <img src={asset.previewUrl} alt="" loading="lazy"/> : <b>{asset.name.slice(0,2).toUpperCase()}</b>}</span><span>{asset.name.replaceAll("-"," ")}</span>
              </button>)}
              {[["none","Clean"],["punch","Punch"],["soft","Soft"],["film","Film"],["mono","Mono"],["warm","Warm"]].map(([id,label]) => <button type="button" aria-pressed={currentEffect===id} className={currentEffect===id?"is-active":""} key={id} onClick={()=>onEffectChange?.(id)}>
                <span className={"copro-creative-thumb copro-effect-preview copro-effect-"+id}><b>{label.slice(0,1)}</b></span><span>{label}</span>
              </button>)}
            </div> : effectTab === "overlays" ? <div className="copro-creative-grid">
              {creativeAssets.filter(asset=>asset.category==="overlay").map(asset => <button type="button" key={asset.id} className={currentEffect===`overlay:${asset.id}`?"is-active":""} aria-pressed={currentEffect===`overlay:${asset.id}`} onClick={()=>onEffectChange?.(`overlay:${asset.id}`)}>
                <span className="copro-creative-thumb">{asset.previewUrl ? <img src={asset.previewUrl} alt="" loading="lazy"/> : <b>{asset.name.slice(0,2).toUpperCase()}</b>}</span><span>{asset.name.replaceAll("-"," ")}</span>
              </button>)}
            </div> : effectTab === "motion" ? <div className="copro-creative-grid">
              <button type="button" aria-pressed={!currentMotion} className={!currentMotion?"is-active":""} onClick={()=>onMotionChange?.("none")}>
                <span className="copro-creative-thumb copro-transition-none">∅</span><span>None</span>
              </button>
              {creativeAssets.filter(asset=>asset.category==="animation").map(asset => <button type="button" key={asset.id} className={currentMotion===asset.id?"is-active":""} aria-pressed={currentMotion===asset.id} onClick={()=>onMotionChange?.(asset.id)}>
                <span className="copro-creative-thumb">{asset.previewUrl ? <img src={asset.previewUrl} alt="" loading="lazy"/> : <b>{asset.name.slice(0,2).toUpperCase()}</b>}<small>{asset.durationUs?`${(asset.durationUs/1_000_000).toFixed(1)}s`:""}</small></span><span>{asset.name}</span>
              </button>)}
            </div> : <div className="copro-creative-grid">
              <button type="button" aria-pressed={!currentGraphic} className={!currentGraphic?"is-active":""} onClick={()=>onGraphicChange?.("none")}>
                <span className="copro-creative-thumb copro-transition-none">∅</span><span>None</span>
              </button>
              {creativeAssets.filter(asset=>asset.category==="graphic").map(asset => <button type="button" key={asset.id} className={currentGraphic===asset.id?"is-active":""} aria-pressed={currentGraphic===asset.id} onClick={()=>onGraphicChange?.(asset.id)}>
                <span className="copro-creative-thumb">{asset.previewUrl ? <img src={asset.previewUrl} alt="" loading="lazy"/> : <b>{asset.name.slice(0,2).toUpperCase()}</b>}</span><span>{asset.name}</span>
              </button>)}
            </div>}
            {effectTab === "graphics" && currentGraphic === "typewriter" && <label className="mm-graphic-text-control"><span>Typewriter copy</span><textarea rows={3} maxLength={4000} value={currentGraphicText} onChange={event=>onGraphicChange?.("typewriter",event.currentTarget.value)} placeholder="Write the words that animate onto the frame"/></label>}
            <p className="copro-panel-note">Preview looks and motion on your selected clip.</p>
          </div>
        ) : tool === "transitions" ? (
          <div className="mm-preset-properties">
            <strong>{creativeAssets.find(asset=>asset.id===currentTransition)?.name??"No transition"}</strong>
            <button type="button" onClick={onBrowsePresets}>Browse transitions</button>
            <label>Duration (seconds)<input aria-label="Transition duration" type="number" min=".05" max="10" step=".05" value={(transitionSettings?.durationUs??300000)/1000000} onChange={event=>{const n=Number(event.currentTarget.value);if(n>=.05&&n<=10)onTransitionSettingsChange?.({durationUs:Math.round(n*1000000)});}}/></label>
            <label>Direction<select aria-label="Transition direction" value={transitionSettings?.direction??"left"} onChange={event=>onTransitionSettingsChange?.({direction:event.currentTarget.value})}>{["left","right","up","down"].map(value=><option key={value}>{value}</option>)}</select></label>
            <label>Easing<select aria-label="Transition easing" value={transitionSettings?.easing??"ease-in-out"} onChange={event=>onTransitionSettingsChange?.({easing:event.currentTarget.value})}>{["linear","ease-in","ease-out","ease-in-out"].map(value=><option key={value}>{value}</option>)}</select></label>
            <button type="button" onClick={()=>onTransitionChange?.("none")}>Remove transition</button>
          </div>
        ) : tool === "export" ? (
          <div className="copro-tool-control">
            <button className="copro-inline-primary" onClick={onProjectExport}>Download editable CoPro project</button>
            <p className="copro-panel-note">The JSON project contains your editing decisions and asset references. Original video and audio files are not bundled.</p>
            <div className="copro-inspector-guidance"><strong>Rendered video exports</strong><p>Video export is unavailable. Save your editable project to continue later.</p></div>
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
                      {item.kind==="image"?<img src={item.url} alt=""/>:item.kind==="video" && item.thumbnails?.length?<img src={item.thumbnails[0]} alt="Video frame preview"/>:item.kind==="video"?<video src={item.url} muted playsInline preload="auto"/>:<FileAudio size={25}/>}
                    </div>
                    <div className="copro-media-shelf-copy"><strong>{item.name}</strong><small>{item.kind}{item.durationUs?" · "+formatDuration(item.durationUs):""}</small></div>
                    <button onClick={()=>onMediaAdd?.(item.id)}>Add</button>
                  </article>
                ))}
              </div>
            ) : <p className="copro-media-empty">No imported {isAudio?"audio":"media"} in this session. Choose a file above.</p>}
            <p className="copro-panel-note">Choose media to add to this project.</p>
          </div>
        ) : <div className="copro-inspector-guidance">
          <strong>{tool === "templates" ? "Browse editable compositions" : "Not yet available"}</strong>
          <p>{tool === "templates" ? "Open Template Studio from the MovieMode workspace to browse, preview and start an editable composition." : "This capability isn't enabled in the current local editor."}</p>
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
