import {useEffect,useMemo,useState} from 'react';
import type {ProjectState,DesignOperation} from '@inneranimalmedia/agentsam-cad-shared';
import {applyDesignOperation} from '@inneranimalmedia/agentsam-cad-shared';
import {ParametricEditor} from './ParametricEditor';
import type {CadElementSelection} from './EngineeringWorkbench';

type Group='walls'|'doors'|'windows'|'rooms'|'furniture';
const editable:Record<Group,string[]>={
 walls:['x1','y1','x2','y2','thickness','height3D','material','color','exterior','assembly'],
 doors:['wallId','distanceAlongWall','width','height','swing','openAngle'],
 windows:['wallId','distanceAlongWall','width','height','elevation'],
 rooms:['name','points','areaSqFt','floorMaterial','color'],
 furniture:['name','type','category','x','y','w','d','h','rotation','color']
};
const operations:Record<Group,[string,string]>={
 walls:['update_wall','wallId'],doors:['update_door','doorId'],windows:['update_window','windowId'],
 rooms:['update_room','roomId'],furniture:['update_fixture','fixtureId']
};
export function codeObjectFields(group:Group,object:Record<string,unknown>){
 return Object.fromEntries(editable[group].filter(key=>Object.prototype.hasOwnProperty.call(object,key)).map(key=>[key,object[key]]));
}
export function validatedObjectPatch(project:ProjectState,group:Group,id:string,source:string){
 const parsed:unknown=JSON.parse(source);
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Object definition must be a JSON object.');
 const update=parsed as Record<string,unknown>;
 const unknown=Object.keys(update).filter(key=>!editable[group].includes(key));
 if(unknown.length)throw new Error('These object properties are not editable: '+unknown.join(', '));
 if(Object.keys(update).length===0)throw new Error('At least one property is required.');
 const [type,idKey]=operations[group];
 const operation={type,[idKey]:id,updates:update,id:'cad-code-'+crypto.randomUUID(),timestamp:Date.now()} as unknown as DesignOperation;
 const result=applyDesignOperation(project,operation);
 if(!result.success)throw new Error(result.error||'Project rejected the parameter changes.');
 return result.project;
}
/** Code view edits the *same* document. JSON BIM parameters and OpenSCAD recipe sources are explicit and validated. */
export function CadCodeWorkspace({project,selection,onUpdateProject,readOnly,onBack}:{
 project:ProjectState;selection:CadElementSelection;onUpdateProject:(next:ProjectState)=>void;readOnly:boolean;onBack:()=>void;
}){
 const group=selection&&selection.group in editable?selection.group as Group:null;
 const object=useMemo(()=>group?project[group].find(item=>item.id===selection?.id):null,[group,project,selection?.id]);
 const text=useMemo(()=>group&&object?JSON.stringify(codeObjectFields(group,object as unknown as Record<string,unknown>),null,2):'',[group,object]);
 const [source,setSource]=useState(text),[error,setError]=useState(''),[applied,setApplied]=useState(false);
 useEffect(()=>{setSource(text);setError('');setApplied(false)},[text,selection?.id]);
 if(!group||!object)return <ParametricEditor project={project} onUpdateProject={onUpdateProject} canEdit={!readOnly}
  initialObjectId={selection?.group==='parametricObjects'?selection.id:undefined}/>;
 return <section className="cad-code-workspace" aria-label="BIM object code editor">
  <header>
   <div><strong>Object parameters · {object.id}</strong><p>Editable BIM recipe in inches. Validated against the current project and native geometry contract.</p></div>
   <div className="cad-code-actions">
    <button type="button" onClick={()=>{setSource(text);setError('');setApplied(false)}}>Revert</button>
    <button type="button" onClick={onBack}>Back to model</button>
    <button type="button" disabled={readOnly||source===text} onClick={()=>{
     try{const next=validatedObjectPatch(project,group,object.id,source);onUpdateProject(next);setError('');setApplied(true);}
     catch(e){setError(e instanceof Error?e.message:String(e));setApplied(false);}
    }}>Apply validated edit</button>
   </div>
  </header>
  <div className="cad-code-editor-shell">
   <div className="cad-code-filename">{object.id}.bim.json <small>JSON / project object · source-controlled revision</small></div>
   <textarea aria-label="Editable BIM object parameter JSON" spellCheck={false} disabled={readOnly} value={source}
    onChange={e=>{setSource(e.target.value);setError('');setApplied(false)}}/>
   {error&&<p role="alert" className="cad-operation-error">{error}</p>}
   {applied&&<p role="status" className="cad-property-help">Applied to the shared CAD project. Use Save to commit a revision.</p>}
   <p>Code edits use the same wall and opening operations as the GUI. Native BRep verification runs through the OCCT evaluation path; changing this JSON is not a new geometry engine.</p>
  </div>
 </section>;
}
