import {useState} from 'react';
import {Folder, ImageOff, ChevronLeft, ChevronRight, ExternalLink} from 'lucide-react';
import {creativeWidgetEntry,creativeWidgetCover} from './creative-covers';
export interface WidgetArtifactPreview {id:string; title:string; kind:string; thumbnail?:string;}
export interface CreativeWidgetHost {
  openEntry: (key:string)=>void;
  openArtifact: (id:string)=>void;
  artifacts: readonly WidgetArtifactPreview[];
  artifactStatus: 'loading'|'ready'|'unavailable';
}
export function CreativeEntryWidget({widgetId,host}:{widgetId:string;host?:CreativeWidgetHost}) {
  const entry=creativeWidgetEntry(widgetId); if(!entry)return null;
  const cover=creativeWidgetCover(widgetId);
  const content=<>{cover?<img src={cover} alt="" draggable={false}/>:<Folder size={28}/>}<span>{entry.title}</span></>;
  return host?<button type="button" className="agentsam-creative-entry" onClick={()=>host.openEntry(widgetId)}>{content}</button>:<div className="agentsam-creative-entry">{content}</div>;
}
export function ArtifactPreviewWidget({host,configuration={}}:{host?:CreativeWidgetHost;configuration?:Record<string,unknown>}) {
 const [index,setIndex]=useState(0);
 const [failed,setFailed]=useState<string[]>([]);
 const mode=configuration.previewMode==='list'?'list':configuration.previewMode==='cover'?'cover':'preview';
 const items=host?.artifacts??[]; const active=items[Math.min(index,Math.max(items.length-1,0))];
 const preview=(item:WidgetArtifactPreview)=><>{item.thumbnail&&!failed.includes(item.id)?<img src={item.thumbnail} alt="" loading="lazy" decoding="async" onError={()=>setFailed(old=>[...old,item.id])}/>:<span className="agentsam-artifact-placeholder"><ImageOff size={23}/><small>No thumbnail</small></span>}</>;
 return <div className="agentsam-artifact-widget">
  <div className="agentsam-artifact-widget__header"><strong>Artifacts</strong>{host?<button type="button" className="agentsam-widget-button" aria-label="Open Artifacts" onClick={()=>host.openEntry('artifact-preview')}><ExternalLink size={15}/></button>:null}</div>
  {!host||mode==='cover'?<div className="agentsam-artifact-widget__cover"><Folder size={34}/>{host?<button className="agentsam-widget-button" onClick={()=>host.openEntry('artifact-preview')}>Open library</button>:<span>Saved work</span>}</div>:
    host.artifactStatus==='loading'?<p role="status">Loading artifacts…</p>:host.artifactStatus==='unavailable'?<p role="status">Artifacts unavailable.</p>:!active?<p>No saved artifacts yet.</p>:
    mode==='list'?<ul>{items.slice(0,3).map(item=><li key={item.id}><button type="button" onClick={()=>host.openArtifact(item.id)}>{preview(item)}<span>{item.title}<small>{item.kind}</small></span></button></li>)}</ul>:
    <><button type="button" className="agentsam-artifact-widget__preview" onClick={()=>host.openArtifact(active.id)}>{preview(active)}<strong>{active.title}</strong><small>{active.kind}</small></button><div className="agentsam-artifact-widget__pager"><button type="button" aria-label="Previous artifact" disabled={index<=0} onClick={()=>setIndex(i=>Math.max(0,i-1))}><ChevronLeft size={18}/></button><span>{Math.min(index+1,items.length)} / {items.length}</span><button type="button" aria-label="Next artifact" disabled={index>=items.length-1} onClick={()=>setIndex(i=>Math.min(items.length-1,i+1))}><ChevronRight size={18}/></button></div></>}
 </div>;
}
