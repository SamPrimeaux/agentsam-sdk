import {useEffect,useState} from 'react';
import {ARCHITECTURAL_STOCK,type FurniturePreset} from './FurniturePicker';
import {OPENSCAD_PARAMETRIC_TEMPLATES} from '../lib/openscad/generator';
import {OpenScadLibraryPane} from './OpenScadLibraryPane';
import {useMemo} from 'react';
import type {ProjectState,WallAssembly} from '@inneranimalmedia/agentsam-cad-shared';
import {Box,Layers3,Library,PanelLeftClose} from 'lucide-react';
import {WALL_ASSEMBLY_STARTERS,cloneAssembly,defaultWallAssembly,wallAssemblyTotal} from '../lib/cad/wall-assemblies';
import type {CadElementSelection} from './EngineeringWorkbench';

export function CadResourcesPane({mode,project,selection,onSelect,onClose,onApplyAssembly,onPlaceStock,onCreateParametric,onInsertScadImport,readOnly,onOpenTemplates,sceneInventory,preferredSection}:{
 mode:'assets'|'libraries';project:ProjectState;selection:CadElementSelection;
 onSelect:(value:CadElementSelection)=>void;onClose:()=>void;onApplyAssembly:(assembly:WallAssembly)=>void;onPlaceStock:(preset:FurniturePreset)=>void;
 onCreateParametric:(templateKey:string)=>void;onInsertScadImport:(importLine:string)=>void;
 readOnly:boolean;onOpenTemplates:()=>void;sceneInventory?:Array<{category:string;count:number}>;
 preferredSection?:'assemblies'|'stock'|'parametric'|'openscad';
}){
 const [librarySection,setLibrarySection]=useState<'assemblies'|'stock'|'parametric'|'openscad'>(preferredSection||'assemblies');
 useEffect(()=>{if(preferredSection)setLibrarySection(preferredSection)},[preferredSection]);
 const [stockSearch,setStockSearch]=useState('');
 const [stockCategory,setStockCategory]=useState('all');
 const filteredStock=ARCHITECTURAL_STOCK.filter(stock=>(stockCategory==='all'||stock.category===stockCategory)&&
  (stock.name+' '+stock.description).toLowerCase().includes(stockSearch.trim().toLowerCase()));
 const materials=useMemo(()=>{
  const map=new Map<string,{wallIds:string[];thickness:number}>();
  for(const wall of project.walls){
   const layers=defaultWallAssembly(wall).layers;
   for(const part of layers){
    const entry=map.get(part.material)||{wallIds:[],thickness:0};
    if(!entry.wallIds.includes(wall.id))entry.wallIds.push(wall.id);
    entry.thickness+=part.thickness;
    map.set(part.material,entry);
   }
  }
  return [...map].sort((a,b)=>a[0].localeCompare(b[0]));
 },[project.walls]);
 const selectedWall=selection?.group==='walls'?project.walls.find(w=>w.id===selection.id):undefined;
 return <aside className="cad-work-pane cad-resource-pane" aria-label={mode==='assets'?'Project assets':'Assembly libraries'}>
   <header className="cad-pane-head"><span>{mode==='assets'?<Box size={16}/>:<Library size={16}/>} {mode==='assets'?'Project assets':'Libraries'}</span>
     <button type="button" aria-label="Hide resource panel" onClick={onClose}><PanelLeftClose size={17}/></button></header>
   <div className="cad-resource-content">
    {mode==='assets'?<>
     <p className="cad-pane-note">Materials and assets referenced by the current CAD document. Select a wall to inspect its layers and quantities.</p>
     <h4>Material usage</h4>
     {materials.length?materials.map(([material,usage])=><div className="cad-resource-group" key={material}>
      <strong>{material.replace('_',' ')}</strong><small>{usage.wallIds.length} wall(s)</small>
      {usage.wallIds.map(id=><button type="button" key={id} onClick={()=>onSelect({group:'walls',id})}><Layers3 size={14}/><span>{id}</span></button>)}
     </div>):<p className="cad-pane-note">No wall materials in this design yet.</p>}
     <h4>Project sources</h4>
     <div className="cad-property-summary"><span>Parametric objects</span><b>{project.parametricObjects?.length||0}</b></div>
     <div className="cad-property-summary"><span>Scene elements</span><b>{project.sceneElements?.length||0}</b></div>
     {project.sceneSource&&<p className="cad-pane-note">Scene source {project.sceneSource.assetId} · revision {project.sceneSource.revision}. Imported mesh assets are not editable BIM components.</p>}
     {sceneInventory?.map(item=><div className="cad-property-summary" key={item.category}><span>{item.category.replaceAll('-',' ')}</span><b>{item.count}</b></div>)}
    </>:<>
     <div className="cad-resource-subtabs" role="tablist" aria-label="Library categories">
      {(['assemblies','stock','parametric','openscad'] as const).map(section=>
       <button key={section} role="tab" type="button" aria-selected={librarySection===section}
        onClick={()=>setLibrarySection(section)}>{section==='openscad'?'OpenSCAD':section[0].toUpperCase()+section.slice(1)}</button>)}
     </div>
     {librarySection==='assemblies'&&<>
     <p className="cad-pane-note">Assembly starters are copied into your selected wall. Edit their real material-layer properties in the inspector.</p>
     <h4>Wall assemblies</h4>
     {WALL_ASSEMBLY_STARTERS.map(template=><div className="cad-library-assembly" key={template.name}>
       <strong>{template.name}</strong>
       <small>{template.layers.length} material layers · {wallAssemblyTotal(template)} in total</small>
       <div className="cad-assembly-stack" aria-label="Assembly layers">
        {template.layers.map(layer=><span key={layer.id} title={layer.name+' · '+layer.material+' · '+layer.thickness+' in'} style={{flexGrow:layer.thickness}}/>)}
       </div>
       <button type="button" disabled={readOnly||!selectedWall} onClick={()=>onApplyAssembly(cloneAssembly(template))}>
         {selectedWall?'Apply to '+selectedWall.id:'Select a wall first'}
       </button>
     </div>)}
     <h4>Project templates</h4>
     <button type="button" className="cad-clear-selection" onClick={onOpenTemplates}>Browse saved drafting templates</button>
     </>}
     {librarySection==='stock'&&<>
     <h4>Architectural stock · fixtures &amp; furniture</h4>
     <label className="cad-stock-search">Search stock
      <input type="search" value={stockSearch} onChange={event=>setStockSearch(event.target.value)} placeholder="Sofa, table, plant, vanity…" aria-label="Search architectural stock"/>
     </label>
     <div className="cad-stock-filters" role="group" aria-label="Stock categories">
      {['all','seating','tables','bedroom','kitchen','bathroom','office','decor'].map(category=>
       <button key={category} type="button" aria-pressed={stockCategory===category} onClick={()=>setStockCategory(category)}>{category}</button>)}
     </div>
     <div className="cad-stock-list">{filteredStock.map(item=><article key={item.type} className="cad-stock-card">
       <div className="cad-stock-swatch" style={{background:item.color}} aria-hidden="true"/>
       <div><strong>{item.name}</strong><small>{item.w} × {item.d} × {item.h} in · {item.category}</small>
        <p>{item.description}</p></div>
       <button type="button" disabled={readOnly} onClick={()=>onPlaceStock(item)}>Place</button>
     </article>)}
     {!filteredStock.length&&<p className="cad-pane-note">No stock items match your filters.</p>}</div>
     </>}
     {librarySection==='parametric'&&<>
     <h4>Parametric generators · OpenSCAD</h4>
     <p className="cad-property-help">Create a real parametric part in this project, then edit its dimensions and source in Properties.</p>
     <div className="cad-generator-list">
      {Object.entries(OPENSCAD_PARAMETRIC_TEMPLATES).map(([key,template])=>
       <div key={key} className="cad-generator-card">
        <strong>{template.name}</strong><small>{template.description}</small>
        <button type="button" disabled={readOnly} onClick={()=>onCreateParametric(key)}>Add to project</button>
       </div>)}
     </div>
     </>}
     {librarySection==='openscad'&&<>
     <h4>Registered OpenSCAD libraries</h4>
     <p className="cad-property-help">Catalog entries are not installed dependencies. Select a parametric part before inserting an import into its source.</p>
     <OpenScadLibraryPane compact disabled={readOnly||selection?.group!=='parametricObjects'} onInsert={onInsertScadImport}/>
     </>}
    </>}
   </div>
 </aside>;
}
