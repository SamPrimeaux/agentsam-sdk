import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, Code2, Download, ExternalLink, FileCode2, Grid2X2, Hand, LayoutGrid, Maximize2, Minus, MousePointer2, PanelLeftClose, PanelRightClose, Plus, RotateCcw, Save, Search, Upload, X } from 'lucide-react';
import manifest from '../public/sources/manifest.json';
import sourceDocuments from './source-documents.generated.json';
import './source-library.css';

type Board = { id:string;filename:string;family:string;title:string;category:string;page:string;width:number;height:number;x:number;y:number;interactive:boolean;stock_asset_id?:string };
type Props = { assetsBase?:string; onNativeCanvas?:()=>void; onExit?:()=>void };
type Draft = { content:string; updatedAt:string };
const boards = manifest.boards as Board[];
const documents = sourceDocuments as Record<string,string>;
const groups = ['Desktop GPT shell','Design canvas','Side Assistant','miniAgentSam','Apps & embeds','Canvas & library','Onboarding & offers','Design system','Light & responsive','Browser & control','Media & motion','Platform stock'];
const groupLabels:Record<string,string> = {'Desktop GPT shell':'Workspace shell','Side Assistant':'Assistant','miniAgentSam':'Assistant widget','Canvas & library':'Canvas references','Light & responsive':'Responsive layouts','Browser & control':'Browser tools','Platform stock':'Platform templates'};
const familyLabels:Record<string,string> = {agentsam:'AgentSam designs',onboarding:'Onboarding', 'onboarding-exports':'Onboarding templates',reference:'References',media:'Media',stock:'Platform templates'};
const persistKey = 'iam.design-canvas.app.v1';
function readDrafts():Record<string,Draft>{try{return JSON.parse(localStorage.getItem(persistKey)||'{}')||{};}catch{return {};}}
function download(name:string,body:string,type:string){const blob=new Blob([body],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function safeFile(name:string){return name.replace(/[^a-z0-9_.-]+/gi,'-');}
/** Keyboard- and focus-visible explanations for icon-only controls. */
function Tooltip({label,children}:{label:string;children:ReactNode}){
 return <span className="dca-help-wrap">{children}<span className="dca-help-tip" role="tooltip">{label}</span></span>;
}
export function SourceLibraryApp({assetsBase='./sources',onNativeCanvas,onExit}:Props){
 const [group,setGroup]=useState(groups[0]);
 const [family,setFamily]=useState<'all'|'agentsam'|'onboarding'|'onboarding-exports'|'media'|'reference'|'stock'>('all');
 const [query,setQuery]=useState('');
 const [selected,setSelected]=useState('agentsam:Shell.dc.html');
 const [zoom,setZoom]=useState(()=>typeof window!=='undefined'&&window.innerWidth<=480?.24:.48);
 const [focus,setFocus]=useState(false);
 const [interact,setInteract]=useState(false);
 const [left,setLeft]=useState(false);
 const [right,setRight]=useState(false);
 const [compact,setCompact]=useState(true);
 const rootRef=useRef<HTMLDivElement>(null);
 const [inspector,setInspector]=useState<'details'|'source'|'notes'>('details');
 const [drafts,setDrafts]=useState<Record<string,Draft>>(readDrafts);
 const [persistent] = useState(()=>{try{const k=persistKey+'.probe';localStorage.setItem(k,'1');localStorage.removeItem(k);return true;}catch{return false;}});
 const [source,setSource]=useState('');
 const [editing,setEditing]=useState('');
 const [loading,setLoading]=useState(false);
 const [loadError,setLoadError]=useState('');
 const [message,setMessage]=useState('');
 const [notes,setNotes]=useState<Record<string,string>>(()=>{try{return JSON.parse(localStorage.getItem(persistKey+'.notes')||'{}')||{};}catch{return {};}});
 const [panning,setPanning]=useState(false);
 const scrollRef=useRef<HTMLDivElement>(null);
 const fileInput=useRef<HTMLInputElement>(null);
 const pan=useRef<{x:number;y:number;left:number;top:number}|null>(null);
 const visible=useMemo(()=>boards.filter(b=>b.category===group&&(family==='all'||b.family===family)&&(!query||((b.title+' '+b.filename).toLowerCase().includes(query.toLowerCase())))).sort((a,b)=>a.y-b.y||a.x-b.x||a.title.localeCompare(b.title)),[group,family,query]);
 const active=boards.find(b=>b.id===selected)||visible[0];
 const shown=focus&&active?[active]:visible;
 const base=assetsBase.replace(/\/$/,'');
 useEffect(()=>{
  const root=rootRef.current;
  if(!root)return;
  let previous:boolean|undefined;
  const adapt=()=>{
   const narrow=root.clientWidth<=840;
   if(previous===narrow)return;
   previous=narrow;
   setCompact(narrow);setLeft(!narrow);setRight(!narrow);
  };
  adapt();
  const observer=new ResizeObserver(adapt);
  observer.observe(root);
  return()=>observer.disconnect();
 },[]);
 const currentDraft=active?drafts[active.id]:undefined;
 useEffect(()=>{if(!persistent)return;try{localStorage.setItem(persistKey,JSON.stringify(drafts));}catch{setMessage('Could not save changes. Export a copy to keep them.');}},[drafts,persistent]);
 useEffect(()=>{if(!persistent)return;try{localStorage.setItem(persistKey+'.notes',JSON.stringify(notes));}catch{}},[notes,persistent]);
 useEffect(()=>{setFocus(false);setInteract(false);setSelected(visible[0]?.id||'');if(scrollRef.current)scrollRef.current.scrollTo({left:0,top:0});},[group,family]);
 useEffect(()=>{
  if(!active){setSource('');setEditing('');return;}
  const content=documents[active.family+'/'+active.filename]||'';
  setSource(content);setEditing(drafts[active.id]?.content||content);
  setLoading(false);setLoadError(content?'':'This reference could not be opened.');
 },[active?.id]);
 // Sandboxed frames can request only packaged design documents, never host APIs.
 useEffect(()=>{
  const handler=(event:MessageEvent)=>{
   const data=event.data;
   if(!data||data.__agentsam_canvas_need!==1||!Number.isInteger(data.id)||typeof data.path!=='string')return;
   const frames=document.querySelectorAll<HTMLIFrameElement>('.dca-app iframe');
   if(!Array.from(frames).some(frame=>frame.contentWindow===event.source))return;
   const content=documents[data.path];
   if(typeof content!=='string')return;
   (event.source as Window).postMessage({__agentsam_canvas_document:1,id:data.id,body:content},'*');
  };
  window.addEventListener('message',handler);
  return()=>window.removeEventListener('message',handler);
 },[]);

 function select(board:Board){setSelected(board.id);setFocus(true);setInteract(false);setInspector('details');}
 function saveSource(){if(!active||!editing.trim())return;setDrafts(d=>({...d,[active.id]:{content:editing,updatedAt:new Date().toISOString()}}));setMessage(persistent?'Changes saved in this browser. Export HTML to keep a copy.':'Changes saved for this session. Export HTML to keep a copy.');}
 function revertSource(){if(!active)return;const next={...drafts};delete next[active.id];setDrafts(next);setEditing(source);setMessage('Restored the bundled original.');}
 function exportAll(){const payload={schema:'agentsam.design-canvas.drafts.v1',title:'Design Canvas edits',exportedAt:new Date().toISOString(),drafts,notes};download('agentsam-design-canvas-edits.json',JSON.stringify(payload,null,2),'application/json');}
 async function importAll(file?:File){if(!file)return;try{const data=JSON.parse(await file.text());if(data.schema!=='agentsam.design-canvas.drafts.v1'||!data.drafts||typeof data.drafts!=='object')throw Error('This file is not a valid design export.');const valid=Object.fromEntries(Object.entries(data.drafts).filter(([id,v])=>boards.some(b=>b.id===id)&&typeof (v as Draft)?.content==='string'&&((v as Draft).content.length<250000))) as Record<string,Draft>;setDrafts(old=>({...old,...valid}));setNotes(old=>({...old,...(data.notes||{})}));setMessage('Imported '+Object.keys(valid).length+' edited artboards.');}catch(err){setMessage('This file could not be imported. Check the format and try again.');}}
 function srcDoc(board:Board){
  const content=drafts[board.id]?.content||documents[board.family+'/'+board.filename];
  if(!content)return '<p>This reference could not be opened.</p>';
  const folder=board.filename.includes('/')?board.filename.slice(0,board.filename.lastIndexOf('/')+1):'';
  const root=new URL(base+'/'+board.family+'/'+folder,location.href).href;
  const own=JSON.stringify(board.family+'/'+board.filename);
  const bridge=[
    '<script>(function(){',
    'var originalFetch=window.fetch.bind(window),counter=0,waiting=new Map(),own='+own+';',
    'window.addEventListener("message",function(e){var d=e.data;if(e.source!==window.parent||!d||d.__agentsam_canvas_document!==1)return;var r=waiting.get(d.id);if(!r)return;waiting.delete(d.id);r.resolve(new Response(d.body,{status:200,headers:{"content-type":"text/html"}}));});',
    'window.fetch=function(input,init){var raw=typeof input==="string"?input:(input&&input.url)||"",path="";',
    'if(raw==="about:srcdoc"||raw===location.href){path=own;}else{try{var u=new URL(raw,document.baseURI),p=u.pathname.split("/").filter(Boolean),i=p.lastIndexOf("sources"),q=p.slice(i+1),f=q[q.length-1];if(i>=0&&/^[a-zA-Z0-9_.-]+[.]html$/.test(f)&&((q.length===2&&["agentsam","onboarding","onboarding-exports","reference","media"].indexOf(q[0])>=0)||(q.length===3&&q[0]==="stock"&&/^[a-z0-9-]+$/.test(q[1]))))path=q.join("/");}catch(e){}}',
    'if(!path)return originalFetch(input,init);',
    'return new Promise(function(resolve,reject){var id=++counter;waiting.set(id,{resolve:resolve,reject:reject});window.parent.postMessage({__agentsam_canvas_need:1,id:id,path:path},"*");setTimeout(function(){var p=waiting.get(id);if(p){waiting.delete(id);reject(Error("Reference could not be loaded."));}},4000);});};',
    '})();</scr'+'ipt>'
  ].join('');
  const injected='<base href="'+root.replace(/"/g,'%22')+'">'+bridge;
  if(/<head(?:\s|>)/i.test(content))return content.replace(/<head([^>]*)>/i,match=>match+injected);
  // Many authentic .dc.html exports omit an explicit head. Their relative
  // vendor scripts and nested document imports still need the sandbox base.
  if(/^\s*<!doctype[^>]*>/i.test(content))return content.replace(/^(\s*<!doctype[^>]*>)/i,'$1<head>'+injected+'</head>');
  return '<head>'+injected+'</head>'+content;
 }

 function zoomBy(n:number){setZoom(z=>Math.min(1.5,Math.max(.04,Number((z+n).toFixed(2)))))}
 function fitReference(){
  const area=scrollRef.current;
  if(!area||!active)return;
  const next=Math.max(.04,Math.min(1.5,(area.clientWidth-24)/active.width,(area.clientHeight-100)/active.height));
  setZoom(Math.floor(next*100)/100);setFocus(true);setInteract(false);
 }
 useEffect(()=>{
  if(compact&&active)fitReference();
 },[compact,active?.id]);
 const count=boards.filter(b=>b.category===group).length;
 return <div ref={rootRef} className={"dca-app"+(compact?" is-compact":"")}>
  <header className="dca-topbar">
   <div className="dca-mark" aria-hidden="true"><LayoutGrid size={17}/></div>
   <div className="dca-heading"><strong>Reference Library</strong><span>Browse and refine design references</span></div>
   <div className="dca-top-actions">
    {onExit?<button className="dca-secondary" aria-label="Back to Design" title="Back to Design" onClick={onExit}><LayoutGrid size={15}/> Back to Design</button>:null}
    {onNativeCanvas?<button className="dca-secondary" aria-label="Native Canvas" title="Native Canvas" onClick={onNativeCanvas}><Grid2X2 size={15}/> Native Canvas</button>:null}
    <button className="dca-secondary" aria-label="Import changes" title="Import changes" onClick={()=>fileInput.current?.click()}><Upload size={15}/> Import changes</button>
    <button className="dca-primary" aria-label="Export changes" title="Export changes" onClick={exportAll}><Download size={15}/> Export changes</button>
    <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={e=>{void importAll(e.target.files?.[0]);e.target.value='';}}/>
   </div>
  </header>
  <div className="dca-toolbar">
   <div className="dca-route">
    {!left?<Tooltip label="Show pages"><button aria-label="Show pages" onClick={()=>{setLeft(true);if(compact)setRight(false);}}><PanelLeftClose size={16}/></button></Tooltip>:null}
    <span>Library</span><span className="dca-route-divider">/</span><b>{groupLabels[group]||group}</b><span className="dca-counter">{visible.length} of {count}</span>
   </div>
   <div className="dca-tools">
    <Tooltip label="Zoom out"><button aria-label="Zoom out" onClick={()=>zoomBy(-.1)}><Minus size={15}/></button></Tooltip>
    <span className="dca-zoom-label">{Math.round(zoom*100)}%</span>
    <Tooltip label="Zoom in"><button aria-label="Zoom in" onClick={()=>zoomBy(.1)}><Plus size={15}/></button></Tooltip>
    <Tooltip label="Fit selected artboard"><button aria-label="Fit selected artboard" title="Fit selected artboard" onClick={fitReference}><Maximize2 size={15}/></button></Tooltip>
    <span className="dca-toolbar-divider"/>
    <button aria-pressed={focus} aria-label={focus?"Show all artboards":"Focus selected artboard"} title="Focus selected artboard" onClick={()=>{setFocus(v=>!v);setInteract(false);}}><Grid2X2 size={15}/>{focus?'All boards':'Focus'}</button>
    <button aria-pressed={interact} aria-label={interact?"Exit preview":"Preview reference"} title="Preview the selected reference" onClick={()=>{setInteract(v=>!v);setFocus(true);}}><MousePointer2 size={15}/>{interact?'Exit preview':'Preview'}</button>
    {!right?<Tooltip label="Show inspector"><button aria-label="Show inspector" onClick={()=>{setRight(true);if(compact)setLeft(false);}}><PanelRightClose size={16}/></button></Tooltip>:null}
   </div>
  </div>
  <div className="dca-main">
   {compact&&(left||right)?<button type="button" className="dca-sheet-backdrop" aria-label="Close panel" onClick={()=>{setLeft(false);setRight(false);}}/>:null}
   {left?<aside className="dca-sidebar" aria-label="Reference library collections">
     <div className="dca-pane-heading"><b>Collections</b><Tooltip label="Hide scenes"><button onClick={()=>setLeft(false)} aria-label="Hide scenes"><PanelLeftClose size={16}/></button></Tooltip></div>
     <nav className="dca-scenes">{groups.map(name=><button key={name} aria-current={name===group?'page':undefined} onClick={()=>{setGroup(name);setQuery('');}}><span>{groupLabels[name]||name}</span><small>{boards.filter(b=>b.category===name).length}</small></button>)}</nav>
     <div className="dca-pane-heading"><b>References</b><small>{visible.length}</small></div>
     <div className="dca-search"><Search size={14}/><input aria-label="Search artboards" placeholder="Search references..." value={query} onChange={e=>setQuery(e.target.value)}/></div>
     <div className="dca-source-filter"><label htmlFor="source-filter">Type</label><select id="source-filter" value={family} onChange={e=>setFamily(e.target.value as typeof family)}><option value="all">All types</option><option value="agentsam">AgentSam designs</option><option value="onboarding">Onboarding & offers</option><option value="onboarding-exports">Onboarding templates</option><option value="reference">References</option><option value="media">Media</option></select></div>
     <div className="dca-board-list">{visible.map(b=><button key={b.id} aria-current={active?.id===b.id?'true':undefined} onClick={()=>select(b)}><FileCode2 size={14}/><span>{b.title}</span>{drafts[b.id]?<i aria-label="Edited source"/>:null}</button>)}</div>
     <div className="dca-sidebar-foot"><span>{boards.length} references</span></div>
    </aside>:null}
   <section className="dca-workspace" aria-label="Spatial design board">
    <div className="dca-canvas-scroll" ref={scrollRef} onPointerDown={e=>{if(e.button===1||panning){pan.current={x:e.clientX,y:e.clientY,left:e.currentTarget.scrollLeft,top:e.currentTarget.scrollTop};e.currentTarget.setPointerCapture(e.pointerId);}}} onPointerMove={e=>{if(!pan.current)return;e.currentTarget.scrollLeft=pan.current.left-(e.clientX-pan.current.x);e.currentTarget.scrollTop=pan.current.top-(e.clientY-pan.current.y);}} onPointerUp={()=>pan.current=null}>
     <div className={'dca-board-space'+(focus?' dca-focus':'')} style={{'--board-zoom':zoom} as CSSProperties}>
      {shown.length===0?<div className="dca-empty">No references found.</div>:null}
      {shown.map((b,i)=>{
       const selectedBoard=active?.id===b.id;
       return <article className={'dca-board'+(selectedBoard?' selected':'')} key={b.id} style={{'--dca-board-width':(b.width*zoom+4)+'px'} as CSSProperties}>
        <div className="dca-board-head"><span>{String(i+1).padStart(2,'0')} / {b.title}</span><span>{b.width} × {b.height}</span></div>
        <div className="dca-frame-wrap" style={{'--dca-frame-width':b.width*zoom+'px','--dca-frame-height':b.height*zoom+'px'} as CSSProperties}>
         <iframe title={b.title} srcDoc={srcDoc(b)} loading={focus?'eager':'lazy'} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" className="dca-source-iframe" style={{'--dca-natural-width':b.width+'px','--dca-natural-height':b.height+'px','--dca-scale':String(zoom),'--dca-events':interact&&selectedBoard?'auto':'none'} as CSSProperties}/>
         {!(interact&&selectedBoard)?<button className="dca-frame-select" aria-label={'Open '+b.title} onClick={()=>select(b)}><span>Open artboard <ArrowRight size={13}/></span></button>:null}
        </div>
       </article>;
      })}
     </div>
    </div>
    <div className="dca-floating-tools"><Tooltip label="Select"><button aria-label="Select" aria-pressed={!panning} onClick={()=>setPanning(false)} title="Select"><MousePointer2 size={16}/></button></Tooltip><Tooltip label="Pan with pointer"><button aria-label="Pan with pointer" aria-pressed={panning} onClick={()=>setPanning(true)} title="Pan with pointer"><Hand size={16}/></button></Tooltip><Tooltip label="Fit selected artboard"><button aria-label="Fit selected artboard" onClick={fitReference} title="Fit selected artboard"><Maximize2 size={16}/></button></Tooltip></div>
    <div className="dca-footer"><span>Reference library</span><span>{focus?'Focused reference':'All references'}</span></div>
   </section>
   {right?<aside className="dca-inspector" aria-label="Artboard inspector">
      <div className="dca-pane-heading"><b>Inspector</b><Tooltip label="Hide inspector"><button aria-label="Hide inspector" onClick={()=>setRight(false)}><PanelRightClose size={16}/></button></Tooltip></div>
      <div className="dca-inspector-tabs">{(['details','source','notes'] as const).map(tab=><button key={tab} aria-current={inspector===tab?'page':undefined} onClick={()=>setInspector(tab)}>{tab==='source'?'HTML':tab[0].toUpperCase()+tab.slice(1)}</button>)}</div>
      {!active?<div className="dca-inspector-body">Select a reference.</div>:inspector==='details'?<div className="dca-inspector-body">
        <h3>{active.title}</h3><p className="dca-muted">{active.family==='reference'?'Reference image':active.family==='media'?'Media reference':active.family==='stock'?'Platform-provided design template':'Interactive design reference'}</p>
        <dl><dt>File</dt><dd>{active.filename}</dd><dt>Collection</dt><dd>{familyLabels[active.family]||active.family}</dd><dt>Canvas size</dt><dd>{active.width} × {active.height}</dd><dt>Format</dt><dd>{active.interactive?'Interactive': 'Design reference'}</dd><dt>Changes</dt><dd>{currentDraft?'Saved '+new Date(currentDraft.updatedAt).toLocaleString():'Original'}</dd></dl>
        {active.family==='stock' && active.stock_asset_id && /^agentsam\.stock\.[a-z0-9-]+$/.test(active.stock_asset_id)
          ? <a className="dca-wide" href={'/admin/store?stock=platform/'+encodeURIComponent(active.stock_asset_id.slice('agentsam.stock.'.length))} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={15}/> Add to website
          </a> : null}
        <button className="dca-wide" onClick={()=>{setInspector('source');setFocus(true);}}><Code2 size={15}/> Edit HTML</button>
        <button className="dca-wide" onClick={()=>{fitReference();setInteract(true);if(compact)setRight(false);}}><ExternalLink size={15}/> Preview design</button>
        <button className="dca-wide" onClick={()=>download(safeFile(active.filename),currentDraft?.content||source,'text/html')}><Download size={15}/> Export HTML</button>
       </div>:inspector==='source'?<div className="dca-inspector-body dca-code-inspector">
        <div className="dca-code-status"><span>{loading?'Loading reference':loadError||'HTML editor'}</span>{currentDraft?<span>Saved</span>:null}</div>
        <textarea aria-label="Edit artboard HTML source" spellCheck={false} value={editing} onChange={e=>setEditing(e.target.value)}/>
        <div className="dca-code-actions"><button className="dca-primary" disabled={loading||!editing||editing===(currentDraft?.content||source)} onClick={saveSource}><Save size={14}/> Save and preview</button><button className="dca-secondary" disabled={!currentDraft} onClick={revertSource}><RotateCcw size={14}/> Restore</button></div>
        <p className="dca-muted">Changes are saved in this browser. Export an HTML copy to use them elsewhere.</p>
       </div>:<div className="dca-inspector-body"><label className="dca-note-label" htmlFor="dca-note">Review notes</label><textarea id="dca-note" className="dca-notes" placeholder="Add a note about this reference" value={notes[active.id]||''} onChange={e=>setNotes(n=>({...n,[active.id]:e.target.value}))}/><p className="dca-muted">Notes are saved with this reference.</p></div>}
     </aside>:null}
  </div>
  {message?<div className="dca-message" role="status">{message}<Tooltip label="Dismiss notification"><button aria-label="Dismiss notification" onClick={()=>setMessage('')}><X size={14}/></button></Tooltip></div>:null}
 </div>;
}
