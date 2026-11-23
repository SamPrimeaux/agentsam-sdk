import React, { useEffect, useId, useRef, useState } from "react";
import { DEFAULT_COLOR_ADJUSTMENTS, type CoProColorAdjustments } from "./color-adjustments.js";
import { CoProNumberControl, CoProRangeControl } from "./panel-controls.js";
import type { CoProCreativeAsset } from "./creative-types.js";
import { FileAudio, Film, Upload, X, Sparkles } from "lucide-react";

/** A single reusable tool body for the CoPro inspector, never a modal or a second editor. */
export type CoProMediaShelfItem = {
  id: string;
  name: string;
  kind: "video" | "audio" | "image" | "scene";
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
  motionSettings?: {id?:string;durationUs?:number;delayUs?:number;amplitude?:number};
  onTransitionSettingsChange?: (patch:{durationUs?:number;direction?:string;easing?:string})=>void;
  onMotionSettingsChange?: (patch:{durationUs?:number;delayUs?:number;amplitude?:number})=>void;
  onBrowsePresets?:()=>void;
  transform?: { scale?: number; x?: number; y?: number; rotation?: number; opacity?: number };
  onTransformChange?: (patch: { scale?: number; x?: number; y?: number; rotation?: number; opacity?: number }) => void;
  world3dTransform?:{x?:number;y?:number;z?:number;rotationYDeg?:number;scale?:number;opacity?:number};
  world3dVisible?:boolean;
  onWorld3DChange?:(patch:{transform?:{x?:number;y?:number;z?:number;rotationYDeg?:number;scale?:number;opacity?:number};visible?:boolean})=>void;
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
  creativeScene?: string;
  creativeAssets?: CoProCreativeAsset[];
  onEffectChange?: (effect: string) => void;
  onTransitionChange?: (transition: string) => void;
  onMotionChange?: (motion: string) => void;
  onGraphicChange?: (graphic: string, text?: string) => void;
  onCreativeParametersChange?: (patch: Record<string, unknown>) => void;
  adjustments?: CoProColorAdjustments;
  onAdjustmentChange?: (patch: CoProColorAdjustments) => void;
  mask?: CoProClipMask|null;
  onMaskChange?: (mask:CoProClipMask|null)=>void;
  scopeHistogram?: {red:number[];green:number[];blue:number[]}|null;
  onSampleScopes?: ()=>void;
  scopeError?: string|null;
};

function CreativeTextField({label,value,onCommit,multiline=false,rows=2}:{label:string;value:string;onCommit:(value:string)=>void;multiline?:boolean;rows?:number}) {
  const [draft,setDraft]=useState(value);
  const draftRef=useRef(value);
  useEffect(()=>{draftRef.current=value;setDraft(value);},[value]);
  const commit=()=>{if(draftRef.current!==value)onCommit(draftRef.current);};
  return <label><span>{label}</span>{multiline
    ? <textarea rows={rows} value={draft} maxLength={4000} onChange={event=>{draftRef.current=event.currentTarget.value;setDraft(event.currentTarget.value);}} onBlur={commit}/>
    : <input value={draft} maxLength={4000} onChange={event=>{draftRef.current=event.currentTarget.value;setDraft(event.currentTarget.value);}} onBlur={commit} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();commit();event.currentTarget.blur();}}}/>}</label>;
}

function CreativeListField({label,value,onCommit}:{label:string;value:string[];onCommit:(value:string[])=>void}) {
  const serialized=value.join("\n");
  const [draft,setDraft]=useState(serialized);
  const draftRef=useRef(serialized);
  useEffect(()=>{draftRef.current=serialized;setDraft(serialized);},[serialized]);
  const commit=()=>{
    const next=draftRef.current.split(/\r?\n/).map(item=>item.trim()).filter(Boolean).slice(0,24).map(item=>item.slice(0,160));
    if(next.join("\n")!==serialized)onCommit(next);
  };
  return <label><span>{label} <small>One entry per line</small></span><textarea rows={4} value={draft} onChange={event=>{draftRef.current=event.currentTarget.value;setDraft(event.currentTarget.value);}} onBlur={commit}/></label>;
}

function CreativeNumberListField({label,value,onCommit}:{label:string;value:number[];onCommit:(value:number[])=>void}) {
  const serialized=value.join(", ");
  const [draft,setDraft]=useState(serialized);
  const draftRef=useRef(serialized);
  useEffect(()=>{draftRef.current=serialized;setDraft(serialized);},[serialized]);
  const commit=()=>{
    const next=draftRef.current.split(/[\s,;]+/).filter(Boolean).map(Number).filter(item=>Number.isFinite(item)&&item>=0&&item<=1_000_000).slice(0,24);
    if(next.join(",")!==value.join(","))onCommit(next);
  };
  return <label><span>{label} <small>Comma-separated values</small></span><textarea rows={2} value={draft} onChange={event=>{draftRef.current=event.currentTarget.value;setDraft(event.currentTarget.value);}} onBlur={commit}/></label>;
}

const DESCRIPTION: Record<string, string> = {
  project: "Project information and timeline configuration.",
  video: "Video properties, masks, background removal and retouch controls.",
  animation: "Keyframes, motion curves, easing and animation controls.",
  tracking: "Object and camera tracking requires a connected motion-analysis processor.",
  adjust: "Professional image and footage adjustments.",
  "ai-stylize": "AI visual treatment requires a connected image-generation processor.",
  media: "Bring in video, photographs, or audio and add them to the timeline.",
  audio: "Add audio, select a clip, and adjust its level.",
  text: "Add a title or edit the selected text directly on the timeline.",
  captions: "Write captions that remain editable as timeline clips.",
  trim: "Precisely adjust the selected clip's time and duration.",
  transform: "Position, scale and rotate the selected visual layer using exact values.",
  world3d: "Edit the selected GLB object in scene coordinates, not video-layer percentages.",
  speed: "Change the selected clip's playback rate.",
  volume: "Adjust the selected clip's audio level.",
  effects: "Choose a visual treatment for the selected clip.",
  transitions: "Choose how the selected clip moves into the next.",
  stickers: "Add editable annotations, arrows and graphic marks to the timeline.",
  templates: "Browse reusable, editable compositions from the CoPro creative library.",
  export: "Save an editable project file. Video rendering requires a connected runtime.",
};

export type CoProClipMask = { shape:"circle"|"rectangle"; size:number; feather:number; invert:boolean };
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
      return <div key={key} className="mm-transform-row">
        <span>{label}</span>
        <div className="mm-transform-inputs">
          <CoProRangeControl className="mm-transform-range" label={label+" slider"} value={Math.max(min,Math.min(max,value))} min={min} max={max} step={step} format={next=>`${next}${unit}`} onCommit={change}/>
          <CoProNumberControl className="mm-transform-number" label={label} value={value} min={min} max={max} step={step} onCommit={change}/>
          <b>{unit}</b>
          <button type="button" title={"Reset "+label} aria-label={"Reset "+label} onClick={()=>change(fallback)}>↺</button>
        </div>
      </div>;
    })}
    <p className="copro-panel-note">Changes update the selected clip, preview and editable project history. Drag the image to reposition it.</p>
  </div>;
}

/** Real scene-space controls, backed by CoPro clip.set_world3d (not video-layer percentages). */
function World3DTransformEditor({transform={},visible=true,onChange}:{
  transform?:CoProToolPanelProps['world3dTransform'];
  visible?:boolean;
  onChange?:CoProToolPanelProps['onWorld3DChange'];
}) {
  const axes=[
    {key:'x',label:'X',unit:'Scene units',step:.1,min:-100000,max:100000,defaultValue:0},
    {key:'y',label:'Y',unit:'Scene units',step:.1,min:-100000,max:100000,defaultValue:0},
    {key:'z',label:'Z',unit:'Scene units',step:.1,min:-100000,max:100000,defaultValue:0},
    {key:'rotationYDeg',label:'Yaw (Y)',unit:'°',step:1,min:-36000,max:36000,defaultValue:0},
    {key:'scale',label:'Uniform scale',unit:'×',step:.05,min:.05,max:100,defaultValue:1},
    {key:'opacity',label:'Opacity',unit:'×',step:.05,min:0,max:1,defaultValue:1},
  ] as const;
  return <section className="mm-world3d-properties" aria-label="Spatial object transform">
    <div className="mm-world3d-properties-title">
      <strong>Spatial transform</strong>
      <small>CoPro world3d · editable project values</small>
    </div>
    <div className="mm-world3d-axis-grid">
      {axes.map(axis=><div key={axis.key} className="mm-world3d-axis">
        <span>{axis.label}</span>
        <div><CoProNumberControl className="mm-world3d-number" label={axis.label+" world3d"} value={transform?.[axis.key]??axis.defaultValue}
          min={axis.min} max={axis.max} step={axis.step} onCommit={value=>onChange?.({transform:{[axis.key]:value}})}/><small>{axis.unit}</small></div>
      </div>)}
    </div>
    <label className="mm-world3d-visibility"><span>Visible in scene</span>
      <input type="checkbox" checked={visible} aria-label="3D object visible"
        onChange={event=>onChange?.({visible:event.currentTarget.checked})}/></label>
    <p>Position is relative to the imported model center. Rotation is around the vertical Y axis. Changes affect the selected 3D object, not the entire video layer.</p>
  </section>;
}

function VideoTools({transform,onTransformChange,mask,onMaskChange}:TransformEditorProps&Pick<CoProToolPanelProps,"mask"|"onMaskChange">){
  const [tab,setTab]=useState<"Basic"|"Remove BG"|"Mask"|"Retouch">("Basic");
  const current:CoProClipMask=mask ?? {shape:"circle",size:80,feather:0,invert:false};
  const update=(patch:Partial<CoProClipMask>)=>onMaskChange?.({...current,...patch});
  return <section className="mm-video-tools" aria-label="Video editing tools">
    <nav className="mm-video-subtabs" role="tablist" aria-label="Video tools">
      {(["Basic","Remove BG","Mask","Retouch"] as const).map(item=><button type="button" role="tab" aria-selected={tab===item} className={tab===item?"is-active":""} key={item} onClick={()=>setTab(item)}>{item}</button>)}
    </nav>
    {tab==="Basic"&&<TransformEditor transform={transform} onTransformChange={onTransformChange}/>}
    {tab==="Remove BG"&&<div className="mm-video-feature-panel">
      <div className="mm-video-feature-heading"><span>SUBJECT ISOLATION</span><strong>Remove background</strong>
        <p>Subject segmentation requires a connected processor. It is not available in this editor runtime.</p></div>
      <div className="copro-panel-note">No fake removal toggle or synthetic processing status is shown. You can still use a geometric mask today.</div>
      <button type="button" className="mm-feature-primary" onClick={()=>setTab("Mask")}>Open working mask editor</button>
    </div>}
    {tab==="Mask"&&<div className="mm-video-feature-panel">
      <div className="mm-video-feature-heading"><span>NON-DESTRUCTIVE MASK</span><strong>Shape mask</strong>
        <p>Apply an editable shape to the selected clip. Undo, redo and project persistence are supported.</p></div>
      <div className="mm-mask-shapes" role="group" aria-label="Mask shapes">
        {(["circle","rectangle"] as const).map(shape=><button type="button" key={shape}
          aria-pressed={mask?.shape===shape} className={mask?.shape===shape?"is-active":""}
          onClick={()=>update({shape,invert:shape==="circle"?current.invert:false})}>
          <i aria-hidden="true">{shape==="circle"?"○":"▭"}</i><span>{shape==="circle"?"Circle":"Rectangle"}</span></button>)}
      </div>
      <CoProRangeControl className="mm-feature-control" label="Mask size" value={current.size} min={20} max={100} step={1} format={value=>`${value}%`} onCommit={value=>update({size:value})}/>
      <CoProRangeControl className="mm-feature-control" label="Mask feather" value={current.feather} min={0} max={30} step={1} format={value=>`${value}%`} disabled={current.shape!=="circle"} onCommit={value=>update({feather:value})}/>
      <label className="mm-feature-toggle"><span><strong>Invert circle</strong><small>Show the area outside the circle.</small></span>
        <input aria-label="Invert circle mask" type="checkbox" checked={current.shape==="circle"&&current.invert}
          disabled={current.shape!=="circle"} onChange={event=>update({invert:event.currentTarget.checked})}/></label>
      <button type="button" className="mm-feature-primary" disabled={!mask} onClick={()=>onMaskChange?.(null)}>Remove mask</button>
      <p className="copro-panel-note">Circle feather and inversion are live. Rectangle masking supports sharp edges and rounded corners; tracked mattes need a separate tracking handler.</p>
    </div>}
    {tab==="Retouch"&&<div className="mm-video-feature-panel">
      <div className="mm-video-feature-heading"><span>IMAGE REFINEMENT</span><strong>Retouch</strong>
        <p>Localized face, hair and detail correction requires a real image-processing provider.</p></div>
      <p className="copro-panel-note">Until that processor is connected, use the working Color, Curves and HSL adjustments in the Adjust inspector.</p>
    </div>}
  </section>;
}

const ADJUST_TABS: Record<string, Array<{label:string;value:number;min:number;max:number;unit?:string}>> = {
  Basic: [
    {label:"Exposure",value:0,min:-5,max:5,unit:" EV"},
    {label:"Contrast",value:0,min:-100,max:100},
    {label:"Saturation",value:100,min:0,max:200,unit:"%"},
    {label:"Highlights",value:0,min:-100,max:100},
    {label:"Shadows",value:0,min:-100,max:100},
  ],
  Color: [
    {label:"Temperature",value:0,min:-100,max:100},
    {label:"Tint",value:0,min:-100,max:100},
    {label:"Saturation",value:100,min:0,max:200,unit:"%"},
  ],
  Curves: [
    {label:"Lift",value:0,min:-100,max:100},
    {label:"Gamma",value:0,min:-100,max:100},
    {label:"Gain",value:0,min:-100,max:100},
  ],
  HSL: [
    {label:"Hue",value:0,min:-180,max:180,unit:"°"},
    {label:"Saturation",value:100,min:0,max:200,unit:"%"},
    {label:"Luminance",value:0,min:-100,max:100},
  ],
  Scopes: [],
};

function CapabilityPreviewPanel({hasSelectedClip,adjustments,onAdjustmentChange,scopeHistogram,onSampleScopes,scopeError}:{hasSelectedClip:boolean;adjustments?:CoProColorAdjustments;onAdjustmentChange?: (patch:CoProColorAdjustments)=>void;scopeHistogram?:{red:number[];green:number[];blue:number[]}|null;onSampleScopes?:()=>void;scopeError?:string|null}){
  const [tab,setTab]=useState("Basic");
  return <section className="mm-capability-preview-panel" aria-label="Clip color adjustment">
    <div className="mm-capability-heading"><span>COLOR & IMAGE</span><strong>Adjust</strong><p>Primary correction, tonal controls, color balance and measured RGB scopes.</p></div>
    <div className="mm-capability-tabs" role="tablist" aria-label="Color adjustment sections">{Object.keys(ADJUST_TABS).map(item=><button type="button" role="tab" aria-selected={tab===item} className={tab===item?"is-active":""} key={item} onClick={()=>setTab(item)}>{item}</button>)}</div>
    {(ADJUST_TABS[tab] ?? []).map(control => {
      const key = control.label.toLowerCase() as keyof typeof DEFAULT_COLOR_ADJUSTMENTS;
      const value = adjustments?.[key] ?? control.value;
      return <CoProRangeControl key={control.label} className="mm-feature-control"
        label={control.label} value={value} min={control.min} max={control.max}
        step={control.max <= 10 ? .1 : 1} format={next=>`${next}${control.unit??""}`}
        disabled={!hasSelectedClip || !onAdjustmentChange}
        onCommit={next=>onAdjustmentChange?.({[key]:next})}/>
    })}
    {tab === "Scopes" && <div className="mm-color-scopes">
      <div className="mm-scopes-heading"><strong>Source RGB histogram</strong><span>Current playhead frame</span></div>
      <button type="button" disabled={!hasSelectedClip} onClick={onSampleScopes}>Sample current frame</button>
      {scopeHistogram ? <svg viewBox="0 0 320 108" role="img" aria-label="Measured red green and blue channel histogram">
        {(["red","green","blue"] as const).map(channel => {
          const points=scopeHistogram[channel],peak=Math.max(1,...points);
          return <polyline key={channel} className={"mm-scope-"+channel} fill="none"
            points={points.map((count,i)=>(i*320/(points.length-1)).toFixed(1)+","+(102-94*count/peak).toFixed(1)).join(" ")}/>;
        })}
      </svg> : <p>Sample the selected frame to inspect its actual color distribution.</p>}
      {scopeError && <p role="status">{scopeError}</p>}
    </div>}
    <button type="button" className="mm-capability-action" disabled={!hasSelectedClip || !onAdjustmentChange}
      onClick={() => onAdjustmentChange?.({...DEFAULT_COLOR_ADJUSTMENTS})}>Reset adjustments</button>
    <p className="copro-panel-note">{hasSelectedClip
      ? "Adjustments are stored per clip with one undo step per slider drag. The viewport uses a browser preview approximation; source-accurate exported grading requires the render backend."
      : "Select a video, image or 3D scene clip to edit its color adjustments."}</p>
  </section>;
}

function CapabilityUnavailablePanel({tool}:{tool:"tracking"|"ai-stylize"}) {
  const isTracking=tool==="tracking";
  return <section className="mm-capability-preview-panel" aria-label={isTracking?"Tracking capability":"AI stylize capability"}>
    <div className="mm-capability-heading"><span>{isTracking?"MOTION ANALYSIS":"GENERATIVE FINISHING"}</span>
      <strong>{isTracking?"Tracking & stabilization":"AI stylize"}</strong>
      <p>{isTracking
        ? "Object, camera and planar tracking need a connected motion-analysis engine."
        : "Style transfer and scene restyling need a connected image-generation processor."}</p>
    </div>
    <div className="mm-capability-status"><span>NOT CONNECTED</span><strong>No processing controls shown</strong>
      <p>Nothing is simulated or saved here. The capability will become editable when its real processor is connected.</p></div>
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
  world3dTransform,
  world3dVisible,
  onWorld3DChange,
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
  creativeScene = "",
  creativeAssets = [],
  onEffectChange,
  onTransitionChange,
  onMotionChange,
  onGraphicChange,
  onCreativeParametersChange,
  adjustments,
  onAdjustmentChange,
  mask,
  onMaskChange,
  scopeHistogram,
  onSampleScopes,
  scopeError,
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
  const title = tool==="world3d" ? "3D object" : tool.charAt(0).toUpperCase() + tool.slice(1);
  const isText = tool === "text" || tool === "captions";
  const needSelection = ["trim", "speed", "volume", "effects", "transitions", "transform", "world3d", "video", "animation", "tracking", "adjust", "ai-stylize"].includes(tool);
  const isAudio = tool === "audio" || tool === "volume";
  const showMedia = tool === "media" || tool === "audio";

  const chooseFile = (file: File | undefined) => {
    if (!file) return;
    onMediaPicked?.(file);
  };

  return (
    <section className="copro-tool-panel" aria-labelledby={tool==="world3d"?undefined:titleId}
      aria-label={tool==="world3d"?"3D object properties":undefined} data-active-tool={tool}>
      {tool!=="world3d"&&<header className="copro-tool-panel-header">
        <div><span className="copro-panel-eyebrow">EDITING TOOLS</span><h2 id={titleId}>{title}</h2></div>
        <button className="copro-panel-close" aria-label={"Close " + title + " panel"} onClick={onClose}><X size={20}/></button>
      </header>}
      <div className="copro-tool-panel-body">
        {tool!=="world3d"&&<p className="copro-tool-intro">{DESCRIPTION[tool] ?? "Choose settings for the selected clip."}</p>}
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
          <VideoTools transform={transform} onTransformChange={onTransformChange} mask={mask} onMaskChange={onMaskChange}/>
        ) : tool === "world3d" ? (
          <World3DTransformEditor transform={world3dTransform} visible={world3dVisible} onChange={onWorld3DChange}/>
        ) : tool === "transform" ? (
          <TransformEditor transform={transform} onTransformChange={onTransformChange}/>
        ) : tool === "animation" ? (
          <section className="mm-motion-editor" aria-label="Clip animation controls">
            <div className="mm-motion-heading">
              <span>CLIP MOTION</span>
              <strong>{creativeAssets.find(asset=>asset.id===currentMotion)?.name ?? (currentMotion || "No animation")}</strong>
              <p>Animate the selected image, GIF, video or composition. Presets use the existing CoPro motion sampler and remain editable.</p>
            </div>
            <div className="mm-motion-preset-grid" role="group" aria-label="Animation presets">
              {creativeAssets.filter(asset=>asset.category==="animation").slice(0,18).map(asset=><button
                key={asset.id} type="button" aria-pressed={currentMotion===asset.id}
                className={currentMotion===asset.id?"is-active":""} onClick={()=>onMotionChange?.(asset.id)}>
                {asset.previewUrl ? <img src={asset.previewUrl} alt="" loading="lazy"/> : <Sparkles size={18}/>}
                <span>{asset.name}</span>
              </button>)}
            </div>
            <button className="mm-motion-more" type="button" onClick={onBrowsePresets}>Browse all animations</button>
            <div className="mm-motion-parameters">
              <CoProNumberControl className="mm-motion-number" label="Duration (seconds)" value={(motionSettings?.durationUs??800000)/1000000} min={.05} max={30} step={.05} disabled={!currentMotion} onCommit={value=>onMotionSettingsChange?.({durationUs:Math.round(value*1_000_000)})}/>
              <CoProNumberControl className="mm-motion-number" label="Delay (seconds)" value={(motionSettings?.delayUs??0)/1_000_000} min={0} max={30} step={.05} disabled={!currentMotion} onCommit={value=>onMotionSettingsChange?.({delayUs:Math.round(value*1_000_000)})}/>
              <CoProRangeControl className="mm-feature-control" label="Distance / intensity" value={motionSettings?.amplitude??80} min={0} max={400} step={1} format={value=>`${value}px`} disabled={!currentMotion} onCommit={value=>onMotionSettingsChange?.({amplitude:value})}/>
              <span className="mm-motion-amplitude">{motionSettings?.amplitude??80} px</span>
            </div>
            <button type="button" className="mm-motion-remove" disabled={!currentMotion} onClick={()=>onMotionChange?.("none")}>Remove animation</button>
          </section>
        ) : tool === "adjust" ? (
          <CapabilityPreviewPanel hasSelectedClip={hasSelectedClip} adjustments={adjustments} onAdjustmentChange={onAdjustmentChange} scopeHistogram={scopeHistogram} onSampleScopes={onSampleScopes} scopeError={scopeError}/>
        ) : tool === "tracking" || tool === "ai-stylize" ? (
          <CapabilityUnavailablePanel tool={tool}/>
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
            <CoProRangeControl label="Playback speed" value={speed} min={.25} max={4} step={.05} format={value=>`${value.toFixed(2)}×`} onCommit={value=>{setSpeed(value);onSpeedChange?.(value);}}/>
            <div className="copro-preset-row">
              {[.5,1,1.5,2].map((value) => <button aria-pressed={Math.abs(speed-value)<.001} className={Math.abs(speed-value)<.001?"is-active":""} key={value} onClick={()=>{setSpeed(value);onSpeedChange?.(value);}}>{value}×</button>)}
            </div>
            <p className="copro-panel-note">Changing speed adjusts the clip's timeline duration.</p>
          </div>
        ) : (tool === "volume" || (tool === "audio" && hasSelectedClip && selectedClipKind === "audio")) ? (
          <div className="copro-tool-control">
            <CoProRangeControl label="Clip volume" value={volume} min={0} max={200} step={1} format={value=>`${value}%`} onCommit={value=>{setVolume(value);onVolumeChange?.(value/100);}}/>
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
            <div className="mm-creative-parameter-heading"><strong>Composition content</strong><span>Text commits when you leave a field. Changes remain editable and undoable.</span></div>
            <CreativeTextField label="Title" value={String(creativeParameters.title ?? "")} onCommit={value=>onCreativeParametersChange?.({title:value})}/>
            <CreativeTextField label="Subtitle" value={String(creativeParameters.subtitle ?? "")} multiline rows={3} onCommit={value=>onCreativeParametersChange?.({subtitle:value})}/>
            <CreativeTextField label="Chapter / eyebrow" value={String(creativeParameters.label ?? "")} onCommit={value=>onCreativeParametersChange?.({label:value})}/>
            {(creativeScene==="quote-story"||creativeScene==="lower-third")&&<CreativeTextField label="Author / name" value={String(creativeParameters.author ?? "")} onCommit={value=>onCreativeParametersChange?.({author:value})}/>}
            {creativeScene==="contact-card"&&<CreativeTextField label="Contact detail" value={String(creativeParameters.contact ?? "")} onCommit={value=>onCreativeParametersChange?.({contact:value})}/>}
            {creativeScene==="kinetic-stack"&&<CreativeListField label="Words" value={Array.isArray(creativeParameters.words)?creativeParameters.words.map(String):[]} onCommit={value=>onCreativeParametersChange?.({words:value})}/>}
            {["floating-cards","flip-showcase","product-grid","technical-explainer","photo-montage"].includes(creativeScene)&&<CreativeListField label="Items / labels" value={Array.isArray(creativeParameters.items)?creativeParameters.items.map(String):[]} onCommit={value=>onCreativeParametersChange?.({items:value})}/>}
            {creativeScene==="data-brief"&&<>
              <CreativeListField label="Data labels" value={Array.isArray(creativeParameters.items)?creativeParameters.items.map(String):[]} onCommit={value=>onCreativeParametersChange?.({items:value})}/>
              <CreativeNumberListField label="Data values" value={Array.isArray(creativeParameters.values)?creativeParameters.values.map(Number):[]} onCommit={value=>onCreativeParametersChange?.({values:value})}/>
            </>}
            {["documentary-opener","social-story","lower-third","caption-story","photo-montage"].includes(creativeScene)&&<label><span>Image source</span>
              <select value={String(creativeParameters.media ?? "asset:creative-demo")} onChange={event=>onCreativeParametersChange?.({media:event.currentTarget.value})}>
                <option value="asset:creative-demo">Use the scene beneath</option>
                {mediaItems.filter(item=>item.kind==="image").map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>}
            <label><span>Canvas background</span><select value={String(creativeParameters.backgroundMode??"transparent")} onChange={event=>onCreativeParametersChange?.({backgroundMode:event.currentTarget.value})}>
              <option value="transparent">Transparent · show scene beneath</option>
              <option value="solid">Solid · fill canvas</option>
            </select></label>
            <div className="mm-creative-color-grid">
              <label className="mm-creative-accent-row"><span>Accent color</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(String(creativeParameters.accent ?? ""))?String(creativeParameters.accent):"#68dfc0"} onChange={event=>onCreativeParametersChange?.({accent:event.currentTarget.value})}/></label>
              <label className="mm-creative-accent-row"><span>Background color</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(String(creativeParameters.background ?? ""))?String(creativeParameters.background):"#101819"} onChange={event=>onCreativeParametersChange?.({background:event.currentTarget.value})}/></label>
              <label className="mm-creative-accent-row"><span>Text color</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(String(creativeParameters.foreground ?? ""))?String(creativeParameters.foreground):"#f4f4e9"} onChange={event=>onCreativeParametersChange?.({foreground:event.currentTarget.value})}/></label>
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
                      {item.kind==="image"?<img src={item.url} alt=""/>:(item.kind==="video"||item.kind==="scene") && item.thumbnails?.length?<img src={item.thumbnails[0]} alt="Imported asset cover"/>:item.kind==="video"?<video src={item.url} muted playsInline preload="auto"/>:<FileAudio size={25}/>}
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
          <p>{tool === "templates" ? "Choose Templates in the left tool browser to preview and apply an editable composition." : "This capability isn't enabled in the current local editor."}</p>
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
