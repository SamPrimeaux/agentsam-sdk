import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, Code2, Download, ExternalLink, FileCode2, Grid2X2, Hand, LayoutGrid, Maximize2, Minus, MousePointer2, PanelLeftClose, PanelRightClose, Plus, RotateCcw, Save, Search, Upload, X } from 'lucide-react';
import manifest from '../public/sources/manifest.json';
import sourceDocuments from './source-documents.generated.json';
import './design-canvas.css';

type Board = { id:string;filename:string;family:string;title:string;category:string;page:string;width:number;height:number;x:number;y:number;interactive:boolean };
type Props = { assetsBase?:string; onNativeCanvas?:()=>void };
type Draft = { content:string; updatedAt:string };
const boards = manifest.boards as Board[];
const documents = sourceDocuments as Record<string,string>;
const groups = ['Desktop GPT shell','Design canvas','Side Assistant','miniAgentSam','Apps & embeds','Canvas & library','Onboarding & offers','Design system','Light & responsive','Browser & control','Media & motion','Platform stock'];
const persistKey = 'iam.design-canvas.app.v1';
function readDrafts():Record<string,Draft>{try{return JSON.parse(localStorage.getItem(persistKey)||'{}')||{};}catch{return {};}}
function download(name:string,body:string,type:string){const blob=new Blob([body],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function safeFile(name:string){return name.replace(/[^a-z0-9_.-]+/gi,'-');}
/** Keyboard- and focus-visible explanations for icon-only controls. */
function Tooltip({label,children}:{label:string;children:ReactNode}){
 return <span className="dca-help-wrap">{children}<span className="dca-help-tip" role="tooltip">{label}</span></span>;
}
export function DesignCanvasApp({assetsBase='./sources',onNativeCanvas}:Props){
 const [group,setGroup]=useState(groups[0]);
 const [family,setFamily]=useState<'all'|'agentsam'|'onboarding'|'onboarding-exports'|'media'|'reference'|'stock'>('all');
 const [query,setQuery]=useState('');
 const [selected,setSelected]=useState('agentsam:Shell.dc.html');
 const [zoom,setZoom]=useState(()=>typeof window!=='undefined'&&window.innerWidth<=480?.24:.48);
 const [focus,setFocus]=useState(false);
 const [interact,setInteract]=useState(false);
 const [left,setLeft]=useState(()=>typeof window==='undefined'||window.innerWidth>840);
 const [right,setRight]=useState(()=>typeof window==='undefined'||window.innerWidth>840);
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
  const query=window.matchMedia('(max-width: 840px)');
  const adapt=()=>{setLeft(!query.matches);setRight(!query.matches);};
  query.addEventListener('change',adapt);
  return()=>query.removeEventListener('change',adapt);
 },[]);
 const currentDraft=active?drafts[active.id]:undefined;
 useEffect(()=>{if(!persistent)return;try{localStorage.setItem(persistKey,JSON.stringify(drafts));}catch{setMessage('Storage unavailable. Export your edited source to preserve it.');}},[drafts,persistent]);
 useEffect(()=>{if(!persistent)return;try{localStorage.setItem(persistKey+'.notes',JSON.stringify(notes));}catch{}},[notes,persistent]);
 useEffect(()=>{setFocus(false);setInteract(false);setSelected(visible[0]?.id||'');if(scrollRef.current)scrollRef.current.scrollTo({left:0,top:0});},[group,family]);
 useEffect(()=>{
  if(!active){setSource('');setEditing('');return;}
  const content=documents[active.family+'/'+active.filename]||'';
  setSource(content);setEditing(drafts[active.id]?.content||content);
  setLoading(false);setLoadError(content?'':'Bundled source not found.');
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
 function saveSource(){if(!active||!editing.trim())return;setDrafts(d=>({...d,[active.id]:{content:editing,updatedAt:new Date().toISOString()}}));setMessage(persistent?active.title+' saved in this browser. Export HTML for a portable copy.':'Saved for this session only. Export edits to preserve them.');}
 function revertSource(){if(!active)return;const next={...drafts};delete next[active.id];setDrafts(next);setEditing(source);setMessage('Restored the bundled original.');}
 function exportAll(){const payload={schema:'agentsam.design-canvas.drafts.v1',title:'Design Canvas edits',exportedAt:new Date().toISOString(),drafts,notes};download('agentsam-design-canvas-edits.json',JSON.stringify(payload,null,2),'application/json');}
 async function importAll(file?:File){if(!file)return;try{const data=JSON.parse(await file.text());if(data.schema!=='agentsam.design-canvas.drafts.v1'||!data.drafts||typeof data.drafts!=='object')throw Error('Unrecognized design canvas file');const valid=Object.fromEntries(Object.entries(data.drafts).filter(([id,v])=>boards.some(b=>b.id===id)&&typeof (v as Draft)?.content==='string'&&((v as Draft).content.length<250000)));setDrafts(old=>({...old,...valid}));setNotes(old=>({...old,...(data.notes||{})}));setMessage('Imported '+Object.keys(valid).length+' edited artboards.');}catch(err){setMessage('Import failed: '+String(err));}}
 function srcDoc(board:Board){
  const content=drafts[board.id]?.content||documents[board.family+'/'+board.filename];
  if(!content)return '<p>Bundled document not found.</p>';
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
    'return new Promise(function(resolve,reject){var id=++counter;waiting.set(id,{resolve:resolve,reject:reject});window.parent.postMessage({__agentsam_canvas_need:1,id:id,path:path},"*");setTimeout(function(){var p=waiting.get(id);if(p){waiting.delete(id);reject(Error("Design source timed out: "+path));}},4000);});};',
    '})();</scr'+'ipt>'
  ].join('');
  const injected='<base href="'+root.replace(/"/g,'%22')+'">'+bridge;
  if(/<head(?:\s|>)/i.test(content))return content.replace(/<head([^>]*)>/i,match=>match+injected);
  // Many authentic .dc.html exports omit an explicit head. Their relative
  // vendor scripts and nested document imports still need the sandbox base.
  if(/^\s*<!doctype[^>]*>/i.test(content))return content.replace(/^(\s*<!doctype[^>]*>)/i,'$1<head>'+injected+'</head>');
  return '<head>'+injected+'</head>'+content;
 }

 function zoomBy(n:number){setZoom(z=>Math.min(1.5,Math.max(.18,Number((z+n).toFixed(2)))))}
 const count=boards.filter(b=>b.category===group).length;
 return <div className="dca-app">
  <header className="dca-topbar">
   <div className="dca-mark" aria-hidden="true"><LayoutGrid size={17}/></div>
   <div className="dca-heading"><strong>Design Canvas</strong><span>{persistent?'AgentSam / Source-backed artboards':'AgentSam / Source-backed artboards · Session-only edits'}</span></div>
   <div className="dca-top-actions">
    {onNativeCanvas?<button className="dca-secondary" onClick={onNativeCanvas}><Grid2X2 size={15}/> Native Canvas</button>:null}
    <button className="dca-secondary" onClick={()=>fileInput.current?.click()}><Upload size={15}/> Import edits</button>
    <button className="dca-primary" onClick={exportAll}><Download size={15}/> Export edits</button>
    <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={e=>{void importAll(e.target.files?.[0]);e.target.value='';}}/>
   </div>
  </header>
  <div className="dca-toolbar">
   <div className="dca-route">
    {!left?<Tooltip label="Show pages"><button aria-label="Show pages" onClick={()=>setLeft(true)}><PanelLeftClose size={16}/></button></Tooltip>:null}
    <span>Projects</span><span className="dca-route-divider">/</span><b>{group}</b><span className="dca-counter">{visible.length} of {count}</span>
   </div>
   <div className="dca-tools">
    <Tooltip label="Zoom out"><button aria-label="Zoom out" onClick={()=>zoomBy(-.1)}><Minus size={15}/></button></Tooltip>
    <span className="dca-zoom-label">{Math.round(zoom*100)}%</span>
    <Tooltip label="Zoom in"><button aria-label="Zoom in" onClick={()=>zoomBy(.1)}><Plus size={15}/></button></Tooltip>
    <Tooltip label="Reset zoom and framing"><button aria-label="Reset zoom and framing" title="Reset zoom and framing" onClick={()=>{setZoom(.48);setFocus(false);setInteract(false);}}><Maximize2 size={15}/></button></Tooltip>
    <span className="dca-toolbar-divider"/>
    <button aria-pressed={focus} title="Focus selected artboard" onClick={()=>{setFocus(v=>!v);setInteract(false);}}><Grid2X2 size={15}/>{focus?'All boards':'Focus'}</button>
    <button aria-pressed={interact} title="Interact with the selected source document" onClick={()=>{setInteract(v=>!v);setFocus(true);}}><MousePointer2 size={15}/>{interact?'Edit layout':'Interact'}</button>
    {!right?<Tooltip label="Show inspector"><button aria-label="Show inspector" onClick={()=>setRight(true)}><PanelRightClose size={16}/></button></Tooltip>:null}
   </div>
  </div>
  <div className="dca-main">
   {left?<aside className="dca-sidebar" aria-label="Design canvas pages">
     <div className="dca-pane-heading"><b>Scenes</b><Tooltip label="Hide scenes"><button onClick={()=>setLeft(false)} aria-label="Hide scenes"><PanelLeftClose size={16}/></button></Tooltip></div>
     <nav className="dca-scenes">{groups.map(name=><button key={name} aria-current={name===group?'page':undefined} onClick={()=>{setGroup(name);setQuery('');}}><span>{name}</span><small>{boards.filter(b=>b.category===name).length}</small></button>)}</nav>
     <div className="dca-pane-heading"><b>Artboards</b><small>{visible.length}</small></div>
     <div className="dca-search"><Search size={14}/><input aria-label="Search artboards" placeholder="Find a screen..." value={query} onChange={e=>setQuery(e.target.value)}/></div>
     <div className="dca-source-filter"><label htmlFor="source-filter">Source set</label><select id="source-filter" value={family} onChange={e=>setFamily(e.target.value as typeof family)}><option value="all">All sources</option><option value="agentsam">AgentSam canvas v3</option><option value="onboarding">Onboarding & offers</option><option value="onboarding-exports">Standalone onboarding exports</option><option value="reference">Reference captures</option><option value="media">Media pipeline</option></select></div>
     <div className="dca-board-list">{visible.map(b=><button key={b.id} aria-current={active?.id===b.id?'true':undefined} onClick={()=>select(b)}><FileCode2 size={14}/><span>{b.title}</span>{drafts[b.id]?<i aria-label="Edited source"/>:null}</button>)}</div>
     <div className="dca-sidebar-foot"><span>{boards.length} packaged source artboards</span><span>Workspace: local</span></div>
    </aside>:null}
   <section className="dca-workspace" aria-label="Spatial design board">
    <div className="dca-canvas-scroll" ref={scrollRef} onPointerDown={e=>{if(e.button===1||panning){pan.current={x:e.clientX,y:e.clientY,left:e.currentTarget.scrollLeft,top:e.currentTarget.scrollTop};e.currentTarget.setPointerCapture(e.pointerId);}}} onPointerMove={e=>{if(!pan.current)return;e.currentTarget.scrollLeft=pan.current.left-(e.clientX-pan.current.x);e.currentTarget.scrollTop=pan.current.top-(e.clientY-pan.current.y);}} onPointerUp={()=>pan.current=null}>
     <div className={'dca-board-space'+(focus?' dca-focus':'')} style={{'--board-zoom':zoom} as CSSProperties}>
      {shown.length===0?<div className="dca-empty">No artboards match this view.</div>:null}
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
    <div className="dca-floating-tools"><Tooltip label="Select"><button aria-label="Select" aria-pressed={!panning} onClick={()=>setPanning(false)} title="Select"><MousePointer2 size={16}/></button></Tooltip><Tooltip label="Pan with pointer"><button aria-label="Pan with pointer" aria-pressed={panning} onClick={()=>setPanning(true)} title="Pan with pointer"><Hand size={16}/></button></Tooltip><Tooltip label="Fit all artboards"><button aria-label="Fit all artboards" onClick={()=>{setZoom(.48);setFocus(false);}} title="Fit all artboards"><Maximize2 size={16}/></button></Tooltip></div>
    <div className="dca-footer"><span>Source-owned HTML artboards · no publishing to a storefront</span><span>{focus?'Focused artboard':'Scene board'}</span></div>
   </section>
   {right?<aside className="dca-inspector" aria-label="Artboard inspector">
      <div className="dca-pane-heading"><b>Inspector</b><Tooltip label="Hide inspector"><button aria-label="Hide inspector" onClick={()=>setRight(false)}><PanelRightClose size={16}/></button></Tooltip></div>
      <div className="dca-inspector-tabs">{(['details','source','notes'] as const).map(tab=><button key={tab} aria-current={inspector===tab?'page':undefined} onClick={()=>setInspector(tab)}>{tab}</button>)}</div>
      {!active?<div className="dca-inspector-body">Select an artboard.</div>:inspector==='details'?<div className="dca-inspector-body">
        <h3>{active.title}</h3><p className="dca-muted">{active.family==='reference'?'A source reference image, not an active browser session.':active.family==='media'?'Original media exports, not a simulated application.':active.family==='stock'?'Versioned platform stock from an original HTML export. Editing here never changes a customer site.':'An authored interactive source document, not a screenshot or fabricated production route.'}</p>
        <dl><dt>Source file</dt><dd>{active.filename}</dd><dt>Set</dt><dd>{active.family}</dd><dt>Canvas size</dt><dd>{active.width} × {active.height}</dd><dt>Mode</dt><dd>{active.interactive?'Interactive': 'Design reference'}</dd><dt>Local edits</dt><dd>{currentDraft?'Saved '+new Date(currentDraft.updatedAt).toLocaleString():'Original source'}</dd></dl>
        <button className="dca-wide" onClick={()=>{setInspector('source');setFocus(true);}}><Code2 size={15}/> Edit source</button>
        <button className="dca-wide" onClick={()=>{setFocus(true);setInteract(true);}}><ExternalLink size={15}/> Interact with screen</button>
        <button className="dca-wide" onClick={()=>download(safeFile(active.filename),currentDraft?.content||source,'text/html')}><Download size={15}/> Export HTML</button>
       </div>:inspector==='source'?<div className="dca-inspector-body dca-code-inspector">
        <div className="dca-code-status"><span>{loading?'Loading source':loadError||'Editable HTML source'}</span>{currentDraft?<span>Saved</span>:null}</div>
        <textarea aria-label="Edit artboard HTML source" spellCheck={false} value={editing} onChange={e=>setEditing(e.target.value)}/>
        <div className="dca-code-actions"><button className="dca-primary" disabled={loading||!editing||editing===(currentDraft?.content||source)} onClick={saveSource}><Save size={14}/> Save and preview</button><button className="dca-secondary" disabled={!currentDraft} onClick={revertSource}><RotateCcw size={14}/> Restore</button></div>
        <p className="dca-muted">Edits save to this app's local draft store. Export before switching browsers or deploying. This does not write into the Git checkout.</p>
       </div>:<div className="dca-inspector-body"><label className="dca-note-label" htmlFor="dca-note">Review notes</label><textarea id="dca-note" className="dca-notes" placeholder="Record acceptance criteria, changes, or decisions" value={notes[active.id]||''} onChange={e=>setNotes(n=>({...n,[active.id]:e.target.value}))}/><p className="dca-muted">Notes are included in the exported edit bundle.</p></div>}
     </aside>:null}
  </div>
  {message?<div className="dca-message" role="status">{message}<Tooltip label="Dismiss notification"><button aria-label="Dismiss notification" onClick={()=>setMessage('')}><X size={14}/></button></Tooltip></div>:null}
 </div>;
}
