import React, { useMemo, useState } from "react";
import {
  Aperture, Box, Brush, Camera, ChevronDown, Eye, Film, Globe2,
  Grid3X3, Layers, Monitor, Network, Orbit, Palette, Pause, Play, Plus,
  Presentation, Sparkles, Sun,
} from "lucide-react";

type Department =
  | "scene" | "world" | "model" | "sculpt" | "geometry" | "rigging"
  | "animation" | "camera" | "lighting" | "materials" | "compositing"
  | "render" | "presentations";

const DEPARTMENTS: Array<{ id: Department; label: string; icon: React.ReactNode; group: string }> = [
  { id:"scene", label:"Scene", icon:<Box size={15}/>, group:"Build" },
  { id:"world", label:"World", icon:<Globe2 size={15}/>, group:"Build" },
  { id:"model", label:"Model", icon:<Layers size={15}/>, group:"Build" },
  { id:"sculpt", label:"Sculpt", icon:<Brush size={15}/>, group:"Build" },
  { id:"geometry", label:"Geometry", icon:<Network size={15}/>, group:"Build" },
  { id:"rigging", label:"Rigging", icon:<Orbit size={15}/>, group:"Motion" },
  { id:"animation", label:"Animation", icon:<Film size={15}/>, group:"Motion" },
  { id:"camera", label:"Camera", icon:<Camera size={15}/>, group:"Cinematic" },
  { id:"lighting", label:"Lighting", icon:<Sun size={15}/>, group:"Cinematic" },
  { id:"materials", label:"Materials", icon:<Palette size={15}/>, group:"Cinematic" },
  { id:"compositing", label:"Compositing", icon:<Aperture size={15}/>, group:"Finish" },
  { id:"render", label:"Render", icon:<Monitor size={15}/>, group:"Finish" },
  { id:"presentations", label:"Presentations", icon:<Presentation size={15}/>, group:"Finish" },
];

const DEPARTMENT_COPY: Record<Department, { eyebrow:string; title:string; description:string; tools:string[]; controls:Array<{label:string;value:number;min:number;max:number;unit?:string}> }> = {
  scene:{eyebrow:"SCENE GRAPH",title:"Scene & object management",description:"Organize collections, objects, cameras, lights and scene-level settings.",tools:["Select","Move","Rotate","Scale","Measure"],controls:[{label:"Unit scale",value:1,min:.001,max:100,unit:"m"},{label:"Preview exposure",value:0,min:-5,max:5,unit:"EV"}]},
  world:{eyebrow:"ENVIRONMENT",title:"World & atmosphere",description:"Build the environment surrounding the scene, from HDRI lighting to volumetric atmosphere.",tools:["HDRI","Sky","Fog","Clouds","Background"],controls:[{label:"World strength",value:1,min:0,max:10},{label:"Atmosphere density",value:18,min:0,max:100,unit:"%"},{label:"Horizon blend",value:42,min:0,max:100,unit:"%"}]},
  model:{eyebrow:"MESH WORKFLOW",title:"Modeling",description:"Create and refine production geometry with editable object and mesh operations.",tools:["Select","Extrude","Inset","Bevel","Loop cut","Knife"],controls:[{label:"Bevel amount",value:.08,min:0,max:1,unit:"m"},{label:"Segments",value:3,min:1,max:12}]},
  sculpt:{eyebrow:"SCULPT MODE",title:"Sculpting",description:"Shape forms with brush-based sculpt tools, symmetry and dynamic topology controls.",tools:["Draw","Clay strips","Smooth","Grab","Inflate","Crease","Pinch","Flatten"],controls:[{label:"Brush radius",value:64,min:1,max:300,unit:"px"},{label:"Strength",value:42,min:0,max:100,unit:"%"},{label:"Detail size",value:12,min:1,max:50,unit:"px"}]},
  geometry:{eyebrow:"PROCEDURAL",title:"Geometry nodes",description:"Compose procedural systems with reusable inputs, modifiers, fields and node groups.",tools:["Add node","Group","Reroute","Frame","Link"],controls:[{label:"Viewport preview",value:75,min:0,max:100,unit:"%"},{label:"Instance density",value:50,min:0,max:100,unit:"%"}]},
  rigging:{eyebrow:"CHARACTER & MOTION",title:"Rigging",description:"Build armatures, constraints, controls, skinning and reusable character rigs.",tools:["Pose","Bone","IK chain","Constraint","Weight paint"],controls:[{label:"IK influence",value:100,min:0,max:100,unit:"%"},{label:"Deform strength",value:100,min:0,max:100,unit:"%"}]},
  animation:{eyebrow:"ANIMATION EDITOR",title:"Animation & keyframes",description:"Work with keyframes, curves, actions, NLA tracks, constraints and motion paths.",tools:["Keyframe","Graph editor","Dope sheet","NLA","Motion path"],controls:[{label:"Playback speed",value:100,min:10,max:300,unit:"%"},{label:"Motion blur",value:50,min:0,max:100,unit:"%"}]},
  camera:{eyebrow:"CINEMATOGRAPHY",title:"Camera & lens",description:"Configure camera rigs, focal length, depth of field, focus pulls and shot composition.",tools:["Camera","Orbit","Dolly","Track","Focus"],controls:[{label:"Focal length",value:50,min:8,max:300,unit:"mm"},{label:"Focus distance",value:4,min:.1,max:100,unit:"m"},{label:"Aperture",value:2.8,min:.7,max:32,unit:"f"}]},
  lighting:{eyebrow:"LIGHTING RIG",title:"Lighting & shadows",description:"Build cinematic key, fill, rim, practical and environment lighting setups.",tools:["Area","Point","Spot","Sun","IES"],controls:[{label:"Key intensity",value:1200,min:0,max:10000,unit:"W"},{label:"Fill ratio",value:35,min:0,max:100,unit:"%"},{label:"Shadow softness",value:65,min:0,max:100,unit:"%"}]},
  materials:{eyebrow:"SURFACE & SHADING",title:"Materials & textures",description:"Author PBR materials, shader graphs, texture maps, displacement and surface response.",tools:["Base color","Metallic","Roughness","Normal","Displacement"],controls:[{label:"Metallic",value:0,min:0,max:100,unit:"%"},{label:"Roughness",value:42,min:0,max:100,unit:"%"},{label:"Transmission",value:0,min:0,max:100,unit:"%"}]},
  compositing:{eyebrow:"NODE COMPOSITOR",title:"Compositing",description:"Build node-based image pipelines for grading, masks, effects, layers and final output.",tools:["Render layers","Color grade","Mask","Blur","Glare","Output"],controls:[{label:"Glare threshold",value:1,min:0,max:10},{label:"Bloom amount",value:24,min:0,max:100,unit:"%"}]},
  render:{eyebrow:"RENDER PIPELINE",title:"Render settings",description:"Configure render engine, samples, denoising, resolution, frame range and output.",tools:["Preview render","Final render","Batch queue","AOVs","Output"],controls:[{label:"Samples",value:128,min:1,max:4096},{label:"Resolution",value:100,min:10,max:400,unit:"%"},{label:"Motion blur",value:0,min:0,max:100,unit:"%"}]},
  presentations:{eyebrow:"VISUAL STORYTELLING",title:"Presentations & sequences",description:"Compose visual decks, scene walkthroughs, shot boards, titles, transitions and presenter notes.",tools:["Slide","Storyboard","Shot list","Titles","Transitions","Speaker notes"],controls:[{label:"Slide duration",value:6,min:1,max:60,unit:"s"},{label:"Transition duration",value:0.6,min:0,max:5,unit:"s"}]},
};

const STARTER_OBJECTS = [
  {id:"camera",name:"Camera",kind:"Camera"},
  {id:"key-light",name:"Key Light",kind:"Area Light"},
  {id:"hero-mesh",name:"Hero Mesh",kind:"Mesh"},
  {id:"ground",name:"Ground",kind:"Mesh"},
];

export function CoProCreativeWorkspace() {
  const [department,setDepartment] = useState<Department>("scene");
  const [viewMode,setViewMode] = useState<"Solid"|"Material"|"Rendered">("Material");
  const [projection,setProjection] = useState<"Perspective"|"Orthographic">("Perspective");
  const [gridVisible,setGridVisible] = useState(true);
  const [overlaysVisible,setOverlaysVisible] = useState(true);
  const [cameraView,setCameraView] = useState(false);
  const [selectedTool,setSelectedTool] = useState("Select");
  const [selectedObject,setSelectedObject] = useState("hero-mesh");
  const [objects,setObjects] = useState(STARTER_OBJECTS);
  const [showAddMenu,setShowAddMenu] = useState(false);
  const [renderState,setRenderState] = useState<"idle"|"preview">("idle");
  const [playing,setPlaying] = useState(false);
  const [activeInspector,setActiveInspector] = useState("Object");
  const [values,setValues] = useState<Record<string,number>>({});
  const [toggles,setToggles] = useState<Record<string,boolean>>({symmetry:true, overlays:true, shadows:true, denoise:true, ambientOcclusion:true, motionBlur:false});
  const config = DEPARTMENT_COPY[department];
  const groups = useMemo(()=>["Build","Motion","Cinematic","Finish"],[]);
  const selected = objects.find(object=>object.id===selectedObject) ?? objects[0];

  function addObject(kind:string) {
    const id = kind.toLowerCase().replace(/[^a-z0-9]+/g,"-")+"-"+Date.now();
    setObjects(current=>[...current,{id,name:kind+" "+(current.length+1),kind}]);
    setSelectedObject(id);
    setShowAddMenu(false);
  }
  function setValue(label:string,value:number) {
    setValues(current=>({...current,[label]:value}));
  }
  function toggle(label:string) {
    setToggles(current=>({...current,[label]:!current[label]}));
  }

  return <section className="mm-creative-workspace" aria-label="3D and creative workspace">
    <header className="mm-creative-workspace-header">
      <div><span>CREATIVE APPLICATION DEPARTMENT</span><strong>3D / Scene Studio</strong><small>Model · Sculpt · Animate · Light · Render · Present</small></div>
      <div className="mm-creative-workspace-status"><i/> INTERFACE PREVIEW <span>Preview controls</span></div>
    </header>
    <nav className="mm-creative-departments" aria-label="Creative departments" role="tablist">
      {groups.map(group=><div className="mm-creative-department-group" key={group}><span>{group}</span>{DEPARTMENTS.filter(item=>item.group===group).map(item=><button type="button" role="tab" key={item.id} aria-selected={department===item.id} className={department===item.id?"is-active":""} onClick={()=>{setDepartment(item.id);setSelectedTool(DEPARTMENT_COPY[item.id].tools[0]);}}>{item.icon}{item.label}</button>)}</div>)}
    </nav>
    <div className="mm-creative-workspace-main">
      <aside className="mm-creative-tool-rail" aria-label={config.title+" tools"}>
        <div className="mm-creative-rail-heading">TOOLS</div>
        {config.tools.map((tool,index)=><button type="button" key={tool} className={selectedTool===tool?"is-active":""} onClick={()=>setSelectedTool(tool)}><span>{index+1}</span>{tool}</button>)}
        <div className="mm-creative-rail-divider"/>
        <button type="button" onClick={()=>setShowAddMenu(value=>!value)}><Plus size={15}/> Add object</button>
        {showAddMenu&&<div className="mm-creative-add-menu">{["Cube","Sphere","Plane","Cylinder","Text","Camera","Area Light","Collection"].map(kind=><button type="button" key={kind} onClick={()=>addObject(kind)}>{kind}</button>)}</div>}
      </aside>
      <main className="mm-creative-viewport">
        <header className="mm-creative-viewport-toolbar">
          <div><span className="mm-creative-live-dot"/> Scene Viewport <small>{projection} · {viewMode}</small></div>
          <div className="mm-creative-viewport-actions">
            <button type="button" className={gridVisible?"is-active":""} aria-pressed={gridVisible} onClick={()=>setGridVisible(value=>!value)}><Grid3X3 size={14}/> Grid</button>
            <button type="button" className={overlaysVisible?"is-active":""} aria-pressed={overlaysVisible} onClick={()=>setOverlaysVisible(value=>!value)}><Eye size={14}/> Overlays</button>
            <button type="button" className={cameraView?"is-active":""} aria-pressed={cameraView} onClick={()=>setCameraView(value=>!value)}><Camera size={14}/> Camera</button>
            <button type="button" onClick={()=>setProjection(value=>value==="Perspective"?"Orthographic":"Perspective")}>{projection==="Perspective"?"Perspective":"Ortho"} <ChevronDown size={12}/></button>
          </div>
        </header>
        <div className={"mm-creative-viewport-stage view-"+viewMode.toLowerCase()} data-grid={gridVisible} data-overlays={overlaysVisible}>
          <div className="mm-creative-viewport-axis axis-x"/><div className="mm-creative-viewport-axis axis-y"/>
          <div className="mm-creative-stage-caption"><span>CAMERA 01</span><span>1920 × 1080 · 30 FPS</span></div>
          <div className={"mm-creative-object "+(selectedObject==="hero-mesh"?"is-selected":"")} onClick={()=>setSelectedObject("hero-mesh")} role="button" tabIndex={0} aria-label="Select hero mesh">
            <div className="mm-creative-object-top"/><div className="mm-creative-object-left"/><div className="mm-creative-object-right"/><div className="mm-creative-object-label">HERO MESH</div>
          </div>
          <div className="mm-creative-floor-grid"/>
          {overlaysVisible&&<div className="mm-creative-safe-frame"><span>SAFE AREA</span><i/></div>}
          <div className="mm-creative-viewport-gizmo"><span>X</span><span>Y</span><span>Z</span></div>
          <div className="mm-creative-viewmode-switch">{(["Solid","Material","Rendered"] as const).map(mode=><button type="button" key={mode} className={viewMode===mode?"is-active":""} onClick={()=>setViewMode(mode)}>{mode}</button>)}</div>
          {cameraView&&<div className="mm-creative-camera-frame">CAMERA VIEW · PREVIEW</div>}
        </div>
        <footer className="mm-creative-viewport-footer"><span>{selectedTool} tool active</span><span>Viewport controls · orbit / pan / zoom</span><span>Preview only</span></footer>
        <div className="mm-creative-timeline">
          <div><strong>Animation timeline</strong><span>00:00:00:00 — 00:00:10:00</span><button type="button" className={playing?"is-active":""} onClick={()=>setPlaying(value=>!value)}>{playing?<Pause size={14}/>:<Play size={14}/>} {playing?"Pause":"Play"}</button></div>
          <div className="mm-creative-timeline-ruler"><i/><i/><i/><i/><i/><i/></div>
          <div className="mm-creative-keyframe-lane"><span>Camera</span><i/><i/><i/></div>
          <div className="mm-creative-keyframe-lane"><span>{selected?.name ?? "Object"}</span><i/><i/></div>
        </div>
      </main>
      <aside className="mm-creative-inspector" aria-label="Creative properties">
        <header><strong>Properties</strong><span>{selected?.name ?? "Scene"}</span></header>
        <nav role="tablist" aria-label="Property contexts">{["Object","Tool","World","View"].map(tab=><button type="button" role="tab" aria-selected={activeInspector===tab} className={activeInspector===tab?"is-active":""} key={tab} onClick={()=>setActiveInspector(tab)}>{tab}</button>)}</nav>
        <div className="mm-creative-inspector-body">
          <div className="mm-creative-status-note"><Sparkles size={14}/><span>Controls are interactive previews. Engine execution is documented separately.</span></div>
          {activeInspector==="Object"&&<section><h3>Scene Outliner</h3>{objects.map(object=><div role="button" tabIndex={0} key={object.id} className={"mm-creative-object-row "+(selectedObject===object.id?"is-active":"")} onClick={()=>setSelectedObject(object.id)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setSelectedObject(object.id);}}}><Box size={14}/><span><strong>{object.name}</strong><small>{object.kind}</small></span><button type="button" aria-label={"Toggle visibility of "+object.name} aria-pressed={toggles["visible:"+object.id]!==false} onClick={event=>{event.stopPropagation();toggle("visible:"+object.id);}}><Eye size={13}/></button></div>)}</section>}
          {activeInspector==="Tool"&&<section><h3>{selectedTool} settings</h3>{config.controls.map(control=><label className="mm-creative-control" key={control.label}><span>{control.label}<b>{values[control.label]??control.value}{control.unit??""}</b></span><input type="range" min={control.min} max={control.max} step={control.max <= 10 ? .1 : 1} value={values[control.label]??control.value} onChange={event=>setValue(control.label,Number(event.currentTarget.value))}/></label>)}{["symmetry","shadows","ambientOcclusion","motionBlur"].map(toggleId=><label className="mm-creative-toggle" key={toggleId}><span>{toggleId.replace(/[A-Z]/g," $&")}</span><input type="checkbox" checked={Boolean(toggles[toggleId])} onChange={()=>toggle(toggleId)}/></label>)}</section>}
          {activeInspector==="World"&&<section><h3>World & render layers</h3>{["World surface","Environment texture","Volumetrics","Color management","View transform"].map(item=><button type="button" className="mm-creative-setting-row" key={item} onClick={()=>setSelectedTool(item)}>{item}<ChevronDown size={13}/></button>)}</section>}
          {activeInspector==="View"&&<section><h3>Viewport display</h3>{["Grid","Floor","Camera guides","Safe areas","Selection outline","Gizmos"].map(item=><label className="mm-creative-toggle" key={item}><span>{item}</span><input type="checkbox" defaultChecked onChange={()=>toggle("view:"+item)}/></label>)}</section>}
        </div>
        <footer><button type="button" onClick={()=>setRenderState("preview")}><Sparkles size={14}/> Render preview</button><small>{renderState==="preview"?"Preview only":"Preview only"}</small></footer>
      </aside>
    </div>
  </section>;
}
