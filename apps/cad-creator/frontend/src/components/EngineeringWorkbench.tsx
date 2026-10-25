import React, {useMemo, useState} from 'react';
import {applyDesignOperation} from '@inneranimalmedia/agentsam-cad-shared';
import type {ProjectState, ActiveTool, WallMaterial, DesignOperation, ParametricParameterDef} from '@inneranimalmedia/agentsam-cad-shared';
import {Layers3, PanelLeftClose, PanelRightClose, PanelLeftOpen, PanelRightOpen,
 Search, ChevronRight, ChevronDown, Box, Plus, ArrowUpRight, Grid2X2,
 MousePointer2, DoorOpen, Ruler, PencilRuler, Hand, Eraser, Square, SlidersHorizontal, Blocks, Undo2, Redo2, Bot, Activity} from 'lucide-react';
import './engineering-workbench.css';

export type CadElementGroup = 'walls'|'doors'|'windows'|'rooms'|'furniture'|'parametricObjects';
export type CadElementSelection = {group:CadElementGroup;id:string}|null;
const GROUP_ICONS:Record<CadElementGroup,React.ComponentType<{size?:number}>> = {
 walls:Layers3, doors:DoorOpen, windows:Grid2X2, rooms:Square, furniture:Box, parametricObjects:Blocks
};
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
   const GroupIcon=GROUP_ICONS[g.id];
   return <section className="cad-tree-group" key={g.id}>
    <button className="cad-tree-heading" aria-expanded={!isClosed} onClick={()=>setClosed(c=>({...c,[g.id]:!c[g.id]}))}>
     {isClosed?<ChevronRight size={14}/>:<ChevronDown size={14}/>}<GroupIcon size={14}/><span>{g.title}</span><small>{g.entries.length}</small></button>
    {!isClosed&&entries.map(e=><button title={e.id} key={e.id} onClick={()=>onSelect({group:g.id,id:e.id})}
     aria-pressed={selection?.group===g.id&&selection.id===e.id} className={'cad-tree-item'+(selection?.group===g.id&&selection.id===e.id?' active':'')}>
     <GroupIcon size={13}/><span>{e.label}</span></button>)}
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
 const [tab,setTab]=useState<'object'|'project'|'scene'>('object');
 React.useEffect(()=>{if(selection)setTab('object')},[selection?.group,selection?.id]);
 const patchLighting=(updates:Partial<ProjectState['lighting']>)=>onChange(p=>({...p,lighting:{...p.lighting,...updates}}));
 const [operationError,setOperationError]=useState<string|null>(null);
 const record=(selection&&(project[selection.group]||[]).find(x=>x.id===selection.id)) as unknown as (Record<string, unknown> & {id:string})|null;
 const parametric=selection?.group==='parametricObjects'?project.parametricObjects?.find(x=>x.id===selection.id):undefined;
 const patchParameter=(parameterName:string,value:number|string|boolean)=>{
  if(!parametric)return;
  const operation={id:'cad-ui-'+Date.now(),timestamp:Date.now(),type:'update_parametric_parameter',
   parametricObjectId:parametric.id,parameterName,value} as DesignOperation;
  const check=applyDesignOperation(project,operation);
  if(!check.success){setOperationError(check.error||'Invalid parametric value');return;}
  setOperationError(null);
  onChange(previous=>{
   const applied=applyDesignOperation(previous,operation);
   return applied.success?applied.project:previous;
  });
 };
 const patchTransform=(key:keyof NonNullable<typeof parametric>['transform'],value:number)=>{
  if(!parametric)return;
  onChange(previous=>({...previous,parametricObjects:(previous.parametricObjects||[]).map(obj=>
   obj.id===parametric.id?{...obj,transform:{...obj.transform,[key]:value}}:obj)}));
 };
 const paramDefs:ParametricParameterDef[]=parametric?.parameterDefs?.length?parametric.parameterDefs:
  Object.entries(parametric?.parameters||{}).map(([name,value])=>({name,label:name,type:typeof value==='number'?'number':typeof value==='boolean'?'boolean':'string',value}));

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
  <div className="cad-pane-tabs" role="tablist" aria-label="Inspector">
   {(['object','project','scene'] as const).map(view=><button key={view} role="tab" aria-selected={tab===view}
    className={tab===view?'active':''} onClick={()=>setTab(view)}>{view[0].toUpperCase()+view.slice(1)}</button>)}</div>
  <div className="cad-property-scroll">{operationError&&<p className="cad-operation-error" role="alert">{operationError}</p>}<fieldset disabled={readOnly}>
  {tab==='scene'?
  <><h4>Environment & lighting</h4>
   <label className="cad-property"><span>Time of day</span><select aria-label="Scene time of day" value={project.lighting.timeOfDay} onChange={e=>patchLighting({timeOfDay:e.target.value as ProjectState['lighting']['timeOfDay']})}>
    {(['morning','noon','sunset','night'] as const).map(v=><option key={v} value={v}>{v[0].toUpperCase()+v.slice(1)}</option>)}</select></label>
   <Numeric label="Sun intensity" unit="×" min={0.2} value={project.lighting.intensity} onCommit={n=>patchLighting({intensity:Math.min(2,n)})}/>
   <Numeric label="Sun altitude" unit="°" min={0} value={project.lighting.sunAltitude} onCommit={n=>patchLighting({sunAltitude:Math.min(90,n)})}/>
   <Numeric label="Sun azimuth" unit="°" min={0} value={project.lighting.sunAzimuth} onCommit={n=>patchLighting({sunAzimuth:Math.min(360,n)})}/>
   <label className="cad-property"><span>Shadows</span><input aria-label="Scene shadows" type="checkbox" checked={project.lighting.shadows} onChange={e=>patchLighting({shadows:e.target.checked})}/></label>
   <label className="cad-property"><span>Ambient color</span><input aria-label="Scene ambient color" type="color" value={/^#[0-9a-f]{6}$/i.test(project.lighting.ambientColor)?project.lighting.ambientColor:'#ffffff'} onChange={e=>patchLighting({ambientColor:e.target.value})}/></label>
   <h4>Building envelope</h4>
   <label className="cad-property"><span>Roof profile</span><select aria-label="Roof profile" value={project.roofType} onChange={e=>onChange(p=>({...p,roofType:e.target.value as ProjectState['roofType']}))}>
    <option value="none">No roof</option><option value="flat">Flat</option><option value="gable">Gable</option></select></label>
   <p className="cad-property-help">Scene changes live in the current CAD project and participate in its undo and save history.</p>
  </>:
  tab==='project'||!selection||!record?
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
    <label className="cad-property"><span>Finish color</span><input type="color" aria-label="Wall finish color" value={typeof record.color==='string'&&/^#[0-9a-f]{6}$/i.test(record.color)?record.color:'#cccccc'} onChange={e=>update('color',e.target.value)}/></label>
    <label className="cad-property"><span>Exterior</span><input type="checkbox" checked={!!record.exterior} onChange={e=>update('exterior',e.target.checked)}/></label></>}
   {selection.group==='doors'&&<><h4>Opening</h4>{num('Width','width',1)}{num('Height','height',1)}
    {num('Position on wall','distanceAlongWall',0,'ratio')}
    {num('Open angle','openAngle',0,'°')}
    <label className="cad-property"><span>Swing</span><select value={String(record.swing)} onChange={e=>update('swing',e.target.value)}>{['left','right','sliding','double','pocket'].map(v=><option key={v}>{v}</option>)}</select></label>
    <p className="cad-property-help">Host wall: {String(record.wallId)}</p></>}
   {selection.group==='windows'&&<><h4>Opening</h4>{num('Width','width',1)}{num('Height','height',1)}
    {num('Sill elevation','elevation',0)}{num('Position on wall','distanceAlongWall',0,'ratio')}
    <label className="cad-property"><span>Style</span><select value={String(record.style)} onChange={e=>update('style',e.target.value)}>{['casement','sliding','picture','hung'].map(v=><option key={v}>{v}</option>)}</select></label></>}
   {selection.group==='rooms'&&<><h4>Space</h4><label className="cad-property"><span>Room name</span><input value={String(record.name)} onChange={e=>update('name',e.target.value)}/></label>
    <label className="cad-property"><span>Floor material</span><select value={String(record.floorMaterial)} onChange={e=>update('floorMaterial',e.target.value)}>
     {['hardwood','marble','tile','polished_concrete','carpet','terrazzo'].map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select></label>
    <label className="cad-property"><span>Floor color</span><input type="color" aria-label="Space floor color" value={String(record.color||'#aaaaaa')} onChange={e=>update('color',e.target.value)}/></label>
    <div className="cad-property-summary"><span>Recorded area</span><b>{String(record.areaSqFt)} ft²</b></div></>}
   {selection.group==='furniture'&&<><h4>Fixture placement</h4>
    <label className="cad-property"><span>Name</span><input aria-label="Fixture name" value={String(record.name)} onChange={e=>update('name',e.target.value)}/></label>
    {num('X','x')}{num('Y','y')}
    {num('Width','w',0.1)}{num('Depth','d',0.1)}{num('Height','h',0.1)}{num('Rotation','rotation',undefined,'°')}
    <h4>Material & finish</h4>
    <label className="cad-property"><span>Finish color</span><input aria-label="Fixture color" type="color" value={String(record.color||'#aaaaaa')} onChange={e=>update('color',e.target.value)}/></label>
    <label className="cad-property"><span>Material</span><input aria-label="Fixture material" value={String(record.material||'')} onChange={e=>update('material',e.target.value)}/></label></>}
   {selection.group==='parametricObjects'&&parametric&&<><h4>Parametric feature</h4>
    <div className="cad-property-summary"><span>Generator</span><b>{String(record.generator)}</b></div>
    <h4>Placement</h4>
    {(['x','y','z'] as const).map(axis=><Numeric key={axis} label={axis.toUpperCase()} value={parametric.transform[axis]}
      onCommit={value=>patchTransform(axis,value)}/>)}
    <h4>Generator parameters</h4>
    {paramDefs.length?paramDefs.map(def=>{
     const value=parametric.parameters[def.name]??def.value;
     if(def.type==='number')return <Numeric key={def.name} label={def.label||def.name}
       value={Number(value)} min={def.min} unit={def.unit||''} onCommit={n=>patchParameter(def.name,def.max!=null?Math.min(n,def.max):n)}/>;
     return <label key={def.name} className="cad-property"><span>{def.label||def.name}</span>
      {def.type==='boolean'?<input type="checkbox" aria-label={def.label||def.name} checked={Boolean(value)} onChange={e=>patchParameter(def.name,e.target.checked)}/>:
       def.type==='select'?<select aria-label={def.label||def.name} value={String(value)} onChange={e=>{
        const selected=def.options?.find(option=>String(option.value)===e.target.value);
        patchParameter(def.name,selected?.value??e.target.value);
       }}>{def.options?.map(option=><option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select>:
       <input aria-label={def.label||def.name} value={String(value)} onChange={e=>patchParameter(def.name,e.target.value)}/>}
     </label>;
    }):<p className="cad-property-help">This feature has no editable generator parameters in the project.</p>}
    <p className="cad-property-help">Parameters are applied to the canonical generator recipe. Use Parametric tools to edit source code and regenerate artifacts.</p></>}
   <button type="button" className="cad-clear-selection" onClick={()=>onSelect(null)}>Clear selection</button></>}
  </fieldset></div>
  <footer className="cad-pane-note">Edits use the current project, undo history, and save workflow.</footer>
 </aside>;
}
/** One typed tool contract for shortcuts, compact toolbar and advanced disclosure. */
export const CAD_STUDIO_TOOLS:{id:ActiveTool;label:string;shortcut:string;tier:1|2;icon:React.ComponentType<{size?:number}>}[]=[
 {id:'select',label:'Select',shortcut:'V',tier:1,icon:MousePointer2},
 {id:'wall',label:'Wall',shortcut:'W',tier:1,icon:Layers3},
 {id:'room',label:'Space',shortcut:'S',tier:1,icon:Square},
 {id:'door',label:'Door',shortcut:'D',tier:2,icon:DoorOpen},
 {id:'window',label:'Window',shortcut:'N',tier:2,icon:Grid2X2},
 {id:'measure',label:'Measure',shortcut:'M',tier:1,icon:Ruler},
 {id:'eraser',label:'Erase',shortcut:'E',tier:2,icon:Eraser},
 {id:'pan',label:'Pan',shortcut:'H',tier:2,icon:Hand}
];
export function CadEngineeringToolbar({tool,onTool,workspace,onWorkspace,planLayout,onPlanLayout,readOnly,onNew,onTemplates,onExport,onToggleExplorer,onToggleInspector,explorerOpen,inspectorOpen,onMore,moreOpen,accent,onAccentChange,isDark,onToggleDark,onUndo,onRedo,canUndo,canRedo,onToggleDiagnostics,showDiagnostics,studioView,onStudioView,runtimeSlot,projectSlot}:{
 tool:ActiveTool;onTool:(v:ActiveTool)=>void;workspace:string;onWorkspace:(v:'plan'|'model'|'robotics')=>void;
 planLayout:'2d'|'split'|'sketch';onPlanLayout:(v:'2d'|'split'|'sketch')=>void;readOnly:boolean;
 onNew:()=>void;onTemplates:()=>void;onExport:()=>void;onToggleExplorer:()=>void;onToggleInspector:()=>void;
 explorerOpen:boolean;inspectorOpen:boolean;onMore:()=>void;moreOpen:boolean;accent:string;onAccentChange:(v:string)=>void;isDark:boolean;onToggleDark:()=>void;
 onUndo:()=>void;onRedo:()=>void;canUndo:boolean;canRedo:boolean;
 onToggleDiagnostics:()=>void;showDiagnostics:boolean;
 studioView:'preview'|'edit'|'code';onStudioView:(v:'preview'|'edit'|'code')=>void;runtimeSlot:React.ReactNode;projectSlot:React.ReactNode;
}) {
 const toolbarRef=React.useRef<HTMLDivElement>(null);
 React.useEffect(()=>{
  const root=toolbarRef.current;
  if(!root)return;
  const closeMenus=(except?:HTMLDetailsElement)=>root.querySelectorAll<HTMLDetailsElement>('details.cad-toolbar-menu[open]').forEach(menu=>{if(menu!==except)menu.open=false});
  const onToggle=(event:Event)=>{
   const menu=event.target;
   if(menu instanceof HTMLDetailsElement&&menu.open)closeMenus(menu);
  };
  const onOutside=(event:PointerEvent)=>{if(!root.contains(event.target as Node))closeMenus()};
  const onEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')closeMenus()};
  root.addEventListener('toggle',onToggle,true);
  document.addEventListener('pointerdown',onOutside,true);
  document.addEventListener('keydown',onEscape);
  return ()=>{root.removeEventListener('toggle',onToggle,true);document.removeEventListener('pointerdown',onOutside,true);document.removeEventListener('keydown',onEscape)};
 },[]);
 const button=(label:string,icon:React.ReactNode,handler:()=>void,active=false,disabled=false)=><button
  type="button" aria-label={label} title={label} aria-pressed={active} className={active?'active':''}
  disabled={disabled} onClick={handler}>{icon}</button>;
 React.useEffect(()=>{
  const keys=(event:KeyboardEvent)=>{
   if(event.metaKey||event.ctrlKey||event.altKey||workspace!=='plan'||studioView!=='edit')return;
   const target=event.target;
   if(target instanceof HTMLElement && (target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName)))return;
   const entry=CAD_STUDIO_TOOLS.find(t=>t.shortcut.toLowerCase()===event.key.toLowerCase());
   if(entry&&!(readOnly&&!['select','measure','pan'].includes(entry.id))){onTool(entry.id);event.preventDefault()}
  };
  window.addEventListener('keydown',keys);return()=>window.removeEventListener('keydown',keys);
 },[onTool,workspace,studioView,readOnly]);
 return <div ref={toolbarRef} className="cad-real-toolbar" role="toolbar" aria-label="CAD authoring tools" data-studio-toolbar="progressive">
  <div className="cad-view-tabs" role="group" aria-label="Studio view">
   {(['preview','edit','code'] as const).map(v=><button key={v} type="button" title={v==='code'?'Code / parametric model':v==='preview'?'Preview current model':'Edit current project'}
     aria-label={v==='code'?'Code / parametric model':v==='preview'?'Preview current model':'Edit current project'}
     aria-pressed={studioView===v} className={studioView===v?'active':''} onClick={()=>onStudioView(v)}>{v[0].toUpperCase()+v.slice(1)}</button>)}
  </div>
  <div className="cad-tool-cluster cad-pane-toggles">
   {button('Objects / project explorer',<PanelLeftOpen size={17}/>,onToggleExplorer,explorerOpen)}
   {button('Properties / contextual inspector',<PanelRightOpen size={17}/>,onToggleInspector,inspectorOpen)}
  </div>
  <div className="cad-tool-cluster cad-direct-tools" aria-label="Drawing tools">
    {workspace==='plan'&&studioView==='edit'&&CAD_STUDIO_TOOLS.filter(t=>t.tier===1).map(t=><button key={t.id} type="button"
      title={`${t.label} (${t.shortcut})`} aria-label={`${t.label} (${t.shortcut})`} aria-pressed={tool===t.id} className={tool===t.id?'active':''}
      disabled={readOnly&&!['select','measure','pan'].includes(t.id)} onClick={()=>onTool(t.id)}><t.icon size={17}/></button>)}
   {studioView==='edit'&&workspace==='plan'&&<details className="cad-toolbar-menu">
     <summary aria-label="More drawing tools" title="More drawing tools"><Plus size={18}/></summary>
     <div className="cad-toolbar-popover" role="group" aria-label="Additional drawing tools">
       {CAD_STUDIO_TOOLS.filter(t=>t.tier===2).map(t=><button key={t.id} type="button"
         title={`${t.label} (${t.shortcut})`} disabled={readOnly&&!['select','measure','pan'].includes(t.id)}
         onClick={e=>{onTool(t.id);e.currentTarget.closest('details')?.removeAttribute('open')}}><t.icon size={16}/>{t.label}<kbd>{t.shortcut}</kbd></button>)}
     </div>
   </details>}
  </div>
  <div className="cad-tool-cluster cad-edit-history">
   {button('Undo (⌘Z)',<Undo2 size={16}/>,onUndo,false,!canUndo)}
   {button('Redo (⇧⌘Z)',<Redo2 size={16}/>,onRedo,false,!canRedo)}
  </div>
  <div className="cad-tool-cluster cad-tool-actions">
   <details className="cad-toolbar-menu cad-workspace-picker">
    <summary aria-label="Workspace" title="Workspace · Draft, 3D or Robotics"><Box size={17}/><span>{workspace==='plan'?'Draft':workspace==='model'?'3D':'Robotics'}</span><ChevronDown size={14}/></summary>
    <div className="cad-toolbar-popover" role="group" aria-label="Workspace choices">
     {(['plan','model','robotics'] as const).map(w=><button key={w} type="button" aria-pressed={workspace===w} onClick={e=>{onWorkspace(w);e.currentTarget.closest('details')?.removeAttribute('open')}}>
       {w==='plan'?<PencilRuler size={16}/>:w==='model'?<Box size={16}/>:<Bot size={16}/>}{w==='plan'?'Draft':w==='model'?'3D model':'Robotics'}</button>)}
    </div>
   </details>
   {workspace==='plan'&&studioView==='edit'&&<details className="cad-toolbar-menu">
     <summary aria-label="Viewport arrangement" title="Viewport arrangement"><Grid2X2 size={18}/></summary>
     <div className="cad-toolbar-popover" role="group" aria-label="Viewport arrangement">
      {(['split','2d','sketch'] as const).map(v=><button key={v} type="button" aria-pressed={planLayout===v} onClick={e=>{onPlanLayout(v);e.currentTarget.closest('details')?.removeAttribute('open')}}>{v==='split'?'2D + 3D':v==='2d'?'2D plan':'Sketch to CAD'}</button>)}
     </div>
   </details>}
   {button('Templates',<Blocks size={18}/>,onTemplates)}
   {button('New project',<Plus size={18}/>,onNew)}
   <details className="cad-toolbar-menu cad-advanced-menu">
     <summary title="Advanced tools and appearance" aria-label="Advanced tools and appearance"><SlidersHorizontal size={18}/></summary>
     <div className="cad-toolbar-popover" role="group" aria-label="Advanced studio settings">
      <button type="button" onClick={onTemplates}><Blocks size={16}/>Templates</button>
      <button type="button" onClick={onNew}><Plus size={16}/>New project</button>
      <button type="button" onClick={onExport}><ArrowUpRight size={16}/>Export project</button>
      <button type="button" onClick={onMore} aria-pressed={moreOpen}>Advanced CAD tools</button>
      {workspace==='robotics'&&<button type="button" onClick={onToggleDiagnostics} aria-pressed={showDiagnostics}>Robotics diagnostics</button>}
      <label>Accent <input aria-label="Interface accent" type="color" value={accent} onChange={e=>onAccentChange(e.target.value)}/></label>
      <button type="button" onClick={onToggleDark}>{isDark?'Light interface':'Dark interface'}</button>
     </div>
   </details>
   <details className="cad-toolbar-menu cad-project-menu"><summary aria-label="Project revisions" title="Project revisions and native tools"><Layers3 size={18}/></summary>
    <div className="cad-runtime-slot">{projectSlot}</div></details>
   <details className="cad-toolbar-menu cad-runtime-menu"><summary aria-label="Connected engines" title="Connected engines"><Activity size={18}/></summary>
    <div className="cad-runtime-slot">{runtimeSlot}</div></details>
   {button('Export project',<ArrowUpRight size={18}/>,onExport)}
  </div>
 </div>;
}
