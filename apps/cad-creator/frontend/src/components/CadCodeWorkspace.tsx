import {useEffect,useMemo,useState} from 'react';
import type {ProjectState} from '@inneranimalmedia/agentsam-cad-shared';
import {ParametricEditor} from './ParametricEditor';
import type {CadElementSelection} from './EngineeringWorkbench';

import {editable,codeObjectFields,validatedObjectPatch,type Group} from '../lib/cad/source-operations';
export {codeObjectFields,validatedObjectPatch} from '../lib/cad/source-operations';
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
