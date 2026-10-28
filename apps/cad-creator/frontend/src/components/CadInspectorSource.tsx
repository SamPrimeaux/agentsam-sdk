import {useEffect,useMemo,useState} from 'react';
import {applyDesignOperation} from '@inneranimalmedia/agentsam-cad-shared';
import type {ProjectState,DesignOperation} from '@inneranimalmedia/agentsam-cad-shared';
import type {CadElementSelection} from './EngineeringWorkbench';
import {codeObjectFields,validatedObjectPatch} from '../lib/cad/source-operations';
import {validateOpenScadSource} from '../lib/openscad/sandbox';
import {generateOpenScadFromParametric,generateFullBimOpenScad} from '../lib/openscad/generator';
import {getExecutionProvider} from '../lib/execution';
import {downloadFile} from '../lib/cad-export';

type JsonGroup='walls'|'doors'|'windows'|'rooms'|'furniture';
const jsonGroups:JsonGroup[]=['walls','doors','windows','rooms','furniture'];

export function CadInspectorSource({project,selection,onChange,readOnly}:{
 project:ProjectState;selection:CadElementSelection;onChange:(updater:(value:ProjectState)=>ProjectState)=>void;readOnly:boolean;
}){
 const group=selection&&jsonGroups.includes(selection.group as JsonGroup)?selection.group as JsonGroup:null;
 const record=useMemo(()=>group?project[group].find(item=>item.id===selection?.id):null,[group,project,selection?.id]);
 const part=selection?.group==='parametricObjects'?project.parametricObjects?.find(x=>x.id===selection.id):undefined;
 const sceneElement=selection?.group==='sceneElements';
 const isScadPart=Boolean(part?.generator==='openscad');
 const initial=useMemo(()=>{
  if(group&&record)return JSON.stringify(codeObjectFields(group,record as unknown as Record<string,unknown>),null,2);
  if(part)return part.source||(part.generator==='openscad'?generateOpenScadFromParametric(part):'');
  return '';
 },[group,record,part]);
 const [source,setSource]=useState(initial);
 const [error,setError]=useState('');
 const [saved,setSaved]=useState(false);
 const [fullBim,setFullBim]=useState(false);
 const [compiling,setCompiling]=useState(false);
 const [compileReceipt,setCompileReceipt]=useState('');
 useEffect(()=>{setSource(initial);setError('');setSaved(false);setCompileReceipt('')},[initial,selection?.id]);
 const candidate=fullBim?generateFullBimOpenScad(project):source;
 const isEditable=Boolean(group&&record||isScadPart)&&!readOnly&&!fullBim;
 const changed=source!==initial;
 const scadValidation=isScadPart&&!fullBim?validateOpenScadSource(source,{allowLibraryImports:true}):null;
 const compile=async()=>{
  if(!part||!isScadPart||changed||!scadValidation?.valid||compiling)return;
  setCompiling(true);setCompileReceipt('');setError('');
  try{
   const result=await getExecutionProvider().executeOpenScad({
    source:part.source||generateOpenScadFromParametric(part),outputFormat:'stl',
    filename:(part.id.toLowerCase().replace(/[^a-z0-9_-]+/g,'_').slice(0,70)||'part')+'.stl',
    parameters:part.parameters,
   });
   if(!result.success||!result.verified||!result.sha256||typeof result.artifactContent!=='string')
    throw new Error(result.error||'Compiler did not return a verified native artifact.');
   downloadFile(result.artifactContent,result.filename,'model/stl');
   setCompileReceipt('Verified native STL · '+result.sizeBytes+' bytes · SHA-256 '+result.sha256);
  }catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setCompiling(false)}
 };
 const apply=()=>{
  if(!selection||!isEditable)return;
  try{
   if(group&&record){
    // Validate against the visible revision before scheduling the state update.
    validatedObjectPatch(project,group,record.id,source);
    onChange(previous=>{
     try{return validatedObjectPatch(previous,group,record.id,source)}
     catch{return previous}
    });
   }else if(part){
    if(!scadValidation?.valid)throw new Error(scadValidation?.errors?.join('; ')||'Invalid OpenSCAD source');
    const operation={id:'cad-inspector-source-'+crypto.randomUUID(),timestamp:Date.now(),
     type:'update_parametric_source',parametricObjectId:part.id,source} as DesignOperation;
    const check=applyDesignOperation(project,operation);
    if(!check.success)throw new Error(check.error||'Native source operation was rejected.');
    onChange(previous=>{
     const result=applyDesignOperation(previous,operation);
     return result.success?result.project:previous;
    });
   }else return;
   setError('');setSaved(true);
  }catch(e){setError(e instanceof Error?e.message:String(e));setSaved(false)}
 };
 return <section className="cad-inline-source" aria-label="Selected element source editor">
  <div className="cad-inline-source-intro">
   <strong>{part?'OpenSCAD · '+part.name:record?group+' · '+record.id:sceneElement?'Imported scene element':'Project source'}</strong>
   <small>{part?(isScadPart?'Editable OpenSCAD generator source':'Native kernel recipe · read-only'):record?'Validated BIM parameters':'Select a model element for editable source'}</small>
  </div>
  {!selection||sceneElement?<p className="cad-property-help">
   {sceneElement?'This visual scene item is not an editable native BIM entity. Open its linked source revision to modify geometry.':
    'Select a wall, opening, room, fixture or parametric part in Objects or the canvas to edit its source here.'}</p>:null}
  {part&&!isScadPart&&<p className="cad-property-help">This part is authored by a native kernel, not OpenSCAD. Edit its supported parameters in Object or use the engine-specific adapter.</p>}
  <label className="cad-inline-source-toggle"><input type="checkbox" checked={fullBim} onChange={e=>setFullBim(e.target.checked)}/>
   View complete generated project OpenSCAD (read-only)</label>
  {(group&&record||part||fullBim)&&<>
   <div className="cad-inline-source-file">
    <span>{fullBim?project.name+'.scad':part?part.id+'.scad':record?.id+'.bim.json'}</span>
    <small>{fullBim?'Generated preview, not the saved source':part?'SCAD':'JSON'}</small>
   </div>
   <textarea aria-label="Selected element source" spellCheck={false} value={candidate}
    readOnly={!isEditable} onChange={e=>{setSource(e.target.value);setError('');setSaved(false)}}/>
   {scadValidation&&!scadValidation.valid&&<p className="cad-operation-error" role="alert">{scadValidation.errors.join('; ')}</p>}
   {error&&<p className="cad-operation-error" role="alert">{error}</p>}
   {saved&&<p className="cad-property-help" role="status">Updated the current project. Save to persist the revision.</p>}
   <div className="cad-inline-source-actions">
    <button type="button" disabled={!isEditable||!changed} onClick={()=>{setSource(initial);setError('');setSaved(false)}}>Revert</button>
    <button type="button" disabled={!isEditable||!changed||(scadValidation&&!scadValidation.valid)}
     onClick={apply}>Apply validated edit</button>
   </div>
   {part&&isScadPart&&!fullBim&&<button type="button" className="cad-native-compile"
     disabled={changed||compiling||!scadValidation?.valid} onClick={()=>void compile()}>
     {compiling?'Compiling in native CAD engine…':'Compile verified STL'}
    </button>}
   {compileReceipt&&<p className="cad-property-help" role="status">{compileReceipt}</p>}
  </>}
  <p className="cad-property-help">
   Source edits use the same project operations and undo/save history as the Properties fields.
   Imported scenes are review-only until a native source is linked.
  </p>
 </section>;
}
