import React, {useMemo, useState} from 'react';
import {applyDesignOperation} from '@inneranimalmedia/agentsam-cad-shared';
import type {ProjectState, ActiveTool, WallMaterial, DesignOperation} from '@inneranimalmedia/agentsam-cad-shared';
import {Layers3, PanelLeftClose, PanelRightClose, PanelLeftOpen, PanelRightOpen,
 Search, ChevronRight, ChevronDown, Box, Plus, ArrowUpRight, Grid2X2,
 MousePointer2, DoorOpen, Ruler, PencilRuler, Hand, Eraser, Square, SlidersHorizontal, Blocks, Undo2, Redo2, Bot, Activity} from 'lucide-react';
import {preloadRoboticsWorkspace} from '../workspaces/robotics/lazy';
import './engineering-workbench.css';

export type CadElementGroup = 'walls'|'doors'|'windows'|'rooms'|'furniture'|'parametricObjects';
export type CadElementSelection = {group:CadElementGroup;id:string}|null;
type Update = (updater:(p:ProjectState)=>ProjectState)=>void;
const groups = (p:ProjectState):Array<{id:CadElementGroup;title:string;entries:{id:string;label:string}[]}> => [
 {id:'walls',title:'Walls',entries:p.walls.map(x=>({id:x.id,label:x.id}))},
 {id:'doors',title:'Doors',entries:p.doors.map(x=>({id:x.id,label:x.label||x.id}))},
 {id:'windows',title:'Windows',entries:p.windows.map(x=>({id:x.id,label:x.label||x.id}))},
 {id:'rooms',title:'Spaces',entries:p.rooms.map(x=>({id:x.id,label:x.name}))},
 {id:'furniture',title:'Fixtures',entries:p.furniture.map(x=>({id:x.id,label:x.name}))},
 {id:'parametricObjects',title:'Parametric',entries:(p.parametricObjects||[]).map(x=>({id:x.id,label:x.name}))},
];

export function CadProjectExplorer({project,selection,onSelect,onClose}:{
 project:ProjectState;selection:CadElementSelection;onSelect:(s:CadElementSelection)=>void;onClose:()=>void
}) {
 const [filter,setFilter]=useState('');
 const [closed,setClosed]=useState<Record<string,boolean>>({});
 const data=useMemo(()=>groups(project),[project]);
 return <aside className="cad-work-pane" aria-label="CAD project explorer">
  <header className="cad-pane-head"><span><Layers3 size={16}/> Project explorer</span>
   <button aria-label="Hide project explorer" title="Hide project explorer" onClick={onClose}><PanelLeftClose size={17}/><span className="cad-focus-help">Hide project explorer</span></button></header>
  <label className="cad-tree-search"><Search size={15}/><input aria-label="Filter project objects" value={filter}
   onChange={e=>setFilter(e.target.value)} placeholder="Filter objects…"/></label>
  <button className="cad-tree-project" onClick={()=>onSelect(null)}><Box size={15}/><span>{project.name}</span><small>v{project.version}</small></button>
  <div className="cad-tree-contents">
  {data.map(g=>{
   const entries=g.entries.filter(e=>(e.id+' '+e.label).toLowerCase().includes(filter.toLowerCase()));
   if(filter&&!entries.length)return null;
   const isClosed=!filter&&closed[g.id];
   return <section className="cad-tree-group" key={g.id}>
    <button className="cad-tree-heading" onClick={()=>setClosed(c=>({...c,[g.id]:!c[g.id]}))}>
     {isClosed?<ChevronRight size={14}/>:<ChevronDown size={14}/>}<span>{g.title}</span><small>{g.entries.length}</small></button>
    {!isClosed&&entries.map(e=><button title={e.id} key={e.id} onClick={()=>onSelect({group:g.id,id:e.id})}
     className={'cad-tree-item'+(selection?.group===g.id&&selection.id===e.id?' active':'')}>
     <Square size={12}/><span>{e.label}</span></button>)}
   </section>;
  })}
  </div>
  <footer className="cad-pane-note">Select an element to edit its real document properties.</footer>
 </aside>;
}

function Numeric({label,value,onCommit,min,unit='in'}:{
 label:string;value:number;onCommit:(n:number)=>void;min?:number;unit?:string
}) {
 return <label className="cad-property"><span>{label}</span><div className="cad-input-wrap">
  <input type="number" aria-label={label} key={label+value} defaultValue={value} min={min} step="any"
   onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}
   onBlur={e=>{const n=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(n)&&(min==null||n>=min)&&n!==value)onCommit(n);else e.target.value=String(value)}}/>
   <small>{unit}</small></div></label>;
}
export function CadPropertyInspector({project,selection,onSelect,onChange,onClose,readOnly}:{
 project:ProjectState;selection:CadElementSelection;onSelect:(s:CadElementSelection)=>void;onChange:Update;
 onClose:()=>void;readOnly:boolean
}) {
 const [tab,setTab]=useState<'object'|'project'>('object');
 const [operationError,setOperationError]=useState<string|null>(null);
 const record=(selection&&(project[selection.group]||[]).find(x=>x.id===selection.id)) as unknown as (Record<string, unknown> & {id:string})|null;
 const update=(key:string,value:unknown)=>{
  if(!selection)return;
  const mapping={
    walls:['update_wall','wallId'],doors:['update_door','doorId'],
    windows:['update_window','windowId'],rooms:['update_room','roomId'],
    furniture:['update_fixture','fixtureId']
  } as const;
  if(selection.group==='parametricObjects')return;
  const [type,idKey]=mapping[selection.group];
  const operation={id:'cad-ui-'+Date.now(),timestamp:Date.now(),type,
    [idKey]:selection.id,updates:{[key]:value}} as unknown as DesignOperation;
  const check=applyDesignOperation(project,operation);
  if(!check.success){setOperationError(check.error||'CAD operation rejected');return;}
  setOperationError(null);
  onChange(previous=>{
    const applied=applyDesignOperation(previous,operation);
    return applied.success?applied.project:previous;
  });
 };
 const num=(label:string,key:string,min?:number,unit='in')=>record&&typeof record[key as keyof typeof record]==='number'?
  <Numeric key={key} label={label} value={Number(record[key])} min={min} unit={unit} onCommit={n=>update(key,n)}/>:null;
 return <aside className="cad-work-pane cad-properties" aria-label="CAD inspector">
  <header className="cad-pane-head"><span><SlidersHorizontal size={16}/> Properties</span>
   <button aria-label="Hide property inspector" title="Hide property inspector" onClick={onClose}><PanelRightClose size={17}/><span className="cad-focus-help">Hide property inspector</span></button></header>
  <div className="cad-pane-tabs"><button className={tab==='object'?'active':''} onClick={()=>setTab('object')}>Object</button>
   <button className={tab==='project'?'active':''} onClick={()=>setTab('project')}>Project</button></div>
  <div className="cad-property-scroll">{operationError&&<p className="cad-operation-error" role="alert">{operationError}</p>}<fieldset disabled={readOnly}>
  {tab==='project'||!selection||!record?
  <><h4>Document</h4>
   <label className="cad-property"><span>Project name</span><input aria-label="Project name" value={project.name} onChange={e=>onChange(p=>({...p,name:e.target.value}))}/></label>
   <Numeric label="Grid spacing" value={project.gridSize} min={1} onCommit={n=>onChange(p=>({...p,gridSize:n}))}/>
   <Numeric label="Ceiling height" value={project.ceilingHeight} min={1} onCommit={n=>onChange(p=>({...p,ceilingHeight:n}))}/>
   <label className="cad-property"><span>Snap to grid</span><input type="checkbox" checked={project.snapToGrid}
    onChange={e=>onChange(p=>({...p,snapToGrid:e.target.checked}))}/></label>
   <h4>Composition</h4>
   {groups(project).map(g=><div className="cad-property-summary" key={g.id}><span>{g.title}</span><b>{g.entries.length}</b></div>)}
  </>:
  <><div className="cad-inspected-id"><small>{selection.group}</small><strong>{record.id}</strong></div>
   {selection.group==='walls'&&<><h4>Wall geometry</h4>{num('Start X','x1')}{num('Start Y','y1')}
    {num('End X','x2')}{num('End Y','y2')}{num('Thickness','thickness',0.1)}{num('Height','height3D',1)}
    <label className="cad-property"><span>Material</span><select value={String(record.material)} onChange={e=>update('material',e.target.value as WallMaterial)}>
     {['drywall','brick','concrete','glass','wood_panel','steel'].map(v=><option key={v} value={v}>{v.replace('_',' ')}</option>)}</select></label>
    <label className="cad-property"><span>Exterior</span><input type="checkbox" checked={!!record.exterior} onChange={e=>update('exterior',e.target.checked)}/></label></>}
   {selection.group==='doors'&&<><h4>Opening</h4>{num('Width','width',1)}{num('Height','height',1)}
    {num('Position on wall','distanceAlongWall',0,'ratio')}
    <label className="cad-property"><span>Swing</span><select value={String(record.swing)} onChange={e=>update('swing',e.target.value)}>{['left','right','sliding','double','pocket'].map(v=><option key={v}>{v}</option>)}</select></label>
    <p className="cad-property-help">Host wall: {String(record.wallId)}</p></>}
   {selection.group==='windows'&&<><h4>Opening</h4>{num('Width','width',1)}{num('Height','height',1)}
    {num('Sill elevation','elevation',0)}{num('Position on wall','distanceAlongWall',0,'ratio')}</>}
   {selection.group==='rooms'&&<><h4>Space</h4><label className="cad-property"><span>Room name</span><input value={String(record.name)} onChange={e=>update('name',e.target.value)}/></label>
    <div className="cad-property-summary"><span>Recorded area</span><b>{String(record.areaSqFt)} ft²</b></div></>}
   {selection.group==='furniture'&&<><h4>Fixture placement</h4>{num('X','x')}{num('Y','y')}
    {num('Width','w',0.1)}{num('Depth','d',0.1)}{num('Height','h',0.1)}{num('Rotation','rotation',undefined,'°')}</>}
   {selection.group==='parametricObjects'&&<><h4>Parametric feature</h4>
    <div className="cad-property-summary"><span>Generator</span><b>{String(record.generator)}</b></div>
    <p className="cad-property-help">Open Parametric tools for source editing and native generation.</p></>}
   <button type="button" className="cad-clear-selection" onClick={()=>onSelect(null)}>Clear selection</button></>}
  </fieldset></div>
  <footer className="cad-pane-note">Edits use the current project, undo history, and save workflow.</footer>
 </aside>;
}
const TOOLS:{id:ActiveTool;label:string;icon:React.ComponentType<{size?:number}>}[]=[
 {id:'select',label:'Select',icon:MousePointer2},{id:'wall',label:'Wall',icon:Layers3},
 {id:'door',label:'Door',icon:DoorOpen},{id:'window',label:'Window',icon:Grid2X2},
 {id:'room',label:'Space',icon:Square},
 {id:'measure',label:'Measure',icon:Ruler},{id:'eraser',label:'Erase',icon:Eraser},
 {id:'pan',label:'Pan',icon:Hand}
];
export function CadEngineeringToolbar({tool,onTool,workspace,onWorkspace,planLayout,onPlanLayout,readOnly,onNew,onTemplates,onExport,onToggleExplorer,onToggleInspector,explorerOpen,inspectorOpen,onMore,moreOpen,accent,onAccentChange,isDark,onToggleDark,onUndo,onRedo,canUndo,canRedo,onToggleDiagnostics,showDiagnostics}:{
 tool:ActiveTool;onTool:(v:ActiveTool)=>void;workspace:string;onWorkspace:(v:'plan'|'model'|'robotics')=>void;
 planLayout:'2d'|'split'|'sketch';onPlanLayout:(v:'2d'|'split'|'sketch')=>void;readOnly:boolean;
 onNew:()=>void;onTemplates:()=>void;onExport:()=>void;onToggleExplorer:()=>void;onToggleInspector:()=>void;
 explorerOpen:boolean;inspectorOpen:boolean;onMore:()=>void;moreOpen:boolean;accent:string;onAccentChange:(v:string)=>void;isDark:boolean;onToggleDark:()=>void;
 onUndo:()=>void;onRedo:()=>void;canUndo:boolean;canRedo:boolean;
 onToggleDiagnostics:()=>void;showDiagnostics:boolean;
}) {
 return <div className="cad-real-toolbar" role="toolbar" aria-label="CAD authoring tools">
  <div className="cad-tool-cluster"><button aria-label="Toggle project explorer" className={explorerOpen?'active':''} onClick={onToggleExplorer} title="Project explorer"><PanelLeftOpen size={17}/><span className="cad-focus-help">Project explorer</span></button>
   <button aria-label="Toggle property inspector" className={inspectorOpen?'active':''} onClick={onToggleInspector} title="Property inspector"><PanelRightOpen size={17}/><span className="cad-focus-help">Property inspector</span></button></div>
  <div className="cad-tool-cluster cad-tool-modes">
   <button className={workspace==='plan'?'active':''} onClick={()=>onWorkspace('plan')}>Draft</button>
   <button className={workspace==='model'?'active':''} onClick={()=>onWorkspace('model')}>3D Model</button>
   <button className={workspace==='robotics'?'active':''} onMouseEnter={()=>void preloadRoboticsWorkspace()} onFocus={()=>void preloadRoboticsWorkspace()} onClick={()=>onWorkspace('robotics')}><Bot size={16}/>Robotics</button>
   {workspace==='robotics'&&<button type="button" aria-pressed={showDiagnostics} onClick={onToggleDiagnostics} title="Toggle robotics diagnostics"><Activity size={16}/>Diagnostics</button>}
  </div>
  {workspace==='plan'&&<div className="cad-tool-cluster cad-direct-tools">{TOOLS.map(t=><button key={t.id} className={tool===t.id?'active':''}
    title={t.label} aria-pressed={tool===t.id} disabled={readOnly&&!['select','measure','pan'].includes(t.id)} onClick={()=>onTool(t.id)}>
    <t.icon size={16}/><span>{t.label}</span></button>)}</div>}
  <div className="cad-tool-cluster">
   <button type="button" title="Undo" aria-label="Undo CAD edit" disabled={!canUndo} onClick={onUndo}><Undo2 size={16}/><span className="cad-focus-help">Undo CAD edit</span></button>
   <button type="button" title="Redo" aria-label="Redo CAD edit" disabled={!canRedo} onClick={onRedo}><Redo2 size={16}/><span className="cad-focus-help">Redo CAD edit</span></button>
  </div>
  <div className="cad-tool-cluster cad-tool-actions">
   {workspace==='plan'&&<select aria-label="Viewport arrangement" value={planLayout} onChange={e=>onPlanLayout(e.target.value as typeof planLayout)}>
    <option value="split">Plan + 3D</option><option value="2d">2D only</option><option value="sketch">SamSketch</option></select>}
   <button title="Open template library" onClick={onTemplates}><Blocks size={16}/>Templates</button>
   <button title="Create a blank project" onClick={onNew}><Plus size={16}/>New</button>
   <button title="Additional native CAD tools and libraries" className={moreOpen?'active':''} onClick={onMore}><SlidersHorizontal size={16}/>More tools</button>
   <details className="cad-theme-menu"><summary title="Live interface appearance">Appearance</summary>
     <div className="cad-theme-popover"><strong>Interface appearance</strong><p>Updates immediately, without changing model materials.</p>
      <label>Accent color <input type="color" aria-label="Interface accent" value={accent} onChange={e=>onAccentChange(e.target.value)}/></label>
      <button type="button" onClick={onToggleDark}>{isDark?'Use light interface':'Use dark interface'}</button></div>
   </details>
   <button title="Export project" onClick={onExport}><ArrowUpRight size={16}/>Export</button>
  </div>
 </div>;
}
