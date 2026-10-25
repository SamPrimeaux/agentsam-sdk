import {useEffect,useState} from 'react';
import type {ProjectState} from '@inneranimalmedia/agentsam-cad-shared';
import {withNativeProject,exportNativeElement} from '../lib/native-engine';
export function NativeSolidPanel({project,elementId}:{project:ProjectState;elementId:string}){
 const [status,setStatus]=useState(''),[volume,setVolume]=useState<number|null>(null),[format,setFormat]=useState('step'),[busy,setBusy]=useState(false),[path,setPath]=useState('');
 useEffect(()=>{let active=true;setVolume(null);setStatus('Checking native solid…');void withNativeProject(project,r=>r({action:'mesh',id:elementId})).then(result=>{if(active){setVolume(result.volume_mm3);setStatus('OCCT solid · mesh and exports share this geometry');}},error=>{if(active)setStatus(String(error).includes('requires_desktop')?'Open this project in Local Studio desktop to evaluate the native solid.':String(error));});return()=>{active=false};},[project.id,project.nativeHistory,project.walls,project.doors,project.windows,elementId]);
 const save=async(view?:'plan'|'section'|'elevation')=>{setBusy(true);setPath('');try{const result=await exportNativeElement(project,elementId,view?'svg':format,view);setPath(result.artifact?.path||result.path||'');setStatus(result.cancelled?'Save cancelled':`Verified ${view||format.toUpperCase()} export · ${result.artifact?.sizeBytes||0} bytes`);}catch(error){setStatus(error instanceof Error?error.message:String(error));}finally{setBusy(false);}};
 return <section aria-label="Native solid"><h4>Native solid</h4><p className="cad-property-help" role="status">{status}</p>{volume!=null&&<div className="cad-property-summary"><span>Measured volume</span><b>{(volume/1e9).toLocaleString(undefined,{maximumFractionDigits:6})} m³</b></div>}
 <label className="cad-property"><span>Solid format</span><select aria-label="Solid export format" value={format} onChange={e=>setFormat(e.target.value)}>{['step','brep','gltf','ifc'].map(f=><option key={f} value={f}>{f.toUpperCase()}</option>)}</select></label>
 <button className="cad-clear-selection" type="button" disabled={busy||volume==null} onClick={()=>void save()}>Export selected solid</button>
 <div className="cad-native-drawings">{(['plan','section','elevation']as const).map(view=><button className="cad-clear-selection" type="button" key={view} disabled={busy||volume==null} onClick={()=>void save(view)}>{view[0].toUpperCase()+view.slice(1)} SVG</button>)}</div>
 {path&&<p className="cad-property-help" style={{overflowWrap:'anywhere'}}>{path}</p>}
 <p className="cad-property-help">Element IDs persist through parameter edits and replay. Edge/face indices belong to this evaluated shape.</p></section>;
}
