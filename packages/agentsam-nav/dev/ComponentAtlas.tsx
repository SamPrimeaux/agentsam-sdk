import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ExternalLink, FileJson, FolderOpen, Layers, PanelRight, Plus, Search, SlidersHorizontal, Star, X } from 'lucide-react';
import { CanvasStage } from '../../../apps/local-studio/frontend/src/components/workbench/canvas/stage';
import { TooltipProvider } from '../../../apps/local-studio/frontend/src/components/ui/tooltip';
import { CanvasInspector, CanvasLayers } from '../../../apps/local-studio/frontend/src/components/workbench/canvas/panels';
import { editNode, locateNode, copy, type CanvasDocument, type CanvasNode, type Artboard } from '../../../apps/local-studio/frontend/src/components/workbench/canvas/model';
import { itemDocument, overviewDocument, themeStarter, type Review, type InventoryItem, type Inventory } from './atlas-document';
import inventoryData from './.generated/component-inventory.json';
import '../../../apps/local-studio/frontend/src/components/workbench/canvas/canvas.css';
import './atlas.css';
import './.generated/cms-theme-stage.css';

import { IconAction } from '../../copro-ui/src/icon-action';
const inventory = inventoryData as Inventory;
const reviewKey='agentsam.component-atlas.reviews.v1';
const documentKey='agentsam.component-atlas.artboard.v1.';
const canonicalGrowth='/apps/ecommerce-cms-agentsam?page=%2Fadmin%2Fgrowth';
const external='https://agentsam.inneranimalmedia.com';
const statusOptions:[NonNullable<Review['state']>,string][]=[
 ['keep','Keep'],['refine','Refine'],['repair','Repair'],['retire','Retire'],
];
function getReviews():Record<string,Review>{
 try {const value=JSON.parse(localStorage.getItem(reviewKey)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}
}
function getStoredDocument(item:InventoryItem, review:Review):CanvasDocument {
 try {
  const obj=JSON.parse(localStorage.getItem(documentKey+item.id)||'null') as CanvasDocument|null;
  if(obj?.version===1 && Array.isArray(obj.artboards) && obj.provenance?.catalogId===item.id)return obj;
 }catch{}
 return itemDocument(item,review);
}
function download(filename:string,value:unknown){
 const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
 const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function routeFor(item:InventoryItem){
 if(item.id.includes('/apps/growth/')||item.owner.includes('/growth')||item.name==='Growth')return canonicalGrowth;
 return item.route?.startsWith('/')?item.route:undefined;
}
function sourceUrl(item:InventoryItem) {
 return 'https://github.com/SamPrimeaux/agentsam-sdk/blob/'+inventory.sourceRevision+'/'+item.source;
}
const familyFilters=['All',...inventory.families];
export function ComponentAtlas({onLab}:{onLab:()=>void}) {
 const [reviews,setReviews]=useState<Record<string,Review>>(getReviews);
 const [query,setQuery]=useState('');
 const [family,setFamily]=useState('All');
 const [scope,setScope]=useState<'all'|'review'|'favorite'>('all');
 const [selectedId,setSelectedId]=useState<string>('');
 const [stageView,setStageView]=useState<'overview'|'item'|'theme'>('overview');
 const [selectedNode,setSelectedNode]=useState('');
 const [boardId,setBoardId]=useState('');
 const [zoom,setZoom]=useState(.34);
 const [fitToken,setFitToken]=useState(1);
 const [tool,setTool]=useState<'select'|'pan'>('select');
 const [previewInteractions,setPreviewInteractions]=useState(false);
 const [layers,setLayers]=useState(false);
 const [showInspector,setShowInspector]=useState(true);
 const canvasInput=useRef<HTMLInputElement>(null);
 const [feedback,setFeedback]=useState('');
 const fileInput=useRef<HTMLInputElement>(null);
 const selected=inventory.items.find(item=>item.id===selectedId);
 const filtered=useMemo(()=>inventory.items.filter(item=>{
  if(family!=='All'&&item.family!==family)return false;
  if(scope==='review'&&!reviews[item.id]?.state)return false;
  if(scope==='favorite'&&!reviews[item.id]?.favorite)return false;
  const needle=query.trim().toLowerCase();
  return !needle||[item.name,item.owner,item.source,item.family,item.detail||'',...(item.capabilities||[])].some(x=>x.toLowerCase().includes(needle));
 }),[family,query,scope,reviews]);
 const overview=useMemo(()=>overviewDocument(filtered,
  family==='All'?inventory.families:[family],reviews),[filtered,family,reviews]);
 const [document,setDocument]=useState<CanvasDocument>(()=>overview.document);
 const refs=useMemo(()=>overview.nodeRefs,[overview]);
 const review=selected?reviews[selected.id]||{}:{};
 useEffect(()=>{
  if(stageView==='overview'){
   setDocument(overview.document);
   setBoardId(overview.document.artboards[0]?.id||'');
   setSelectedNode('');
   setFitToken(i=>i+1);
  }
 },[overview,stageView]);
 useEffect(()=>{
  if(stageView==='overview')return;
  if(stageView==='item'&&!selected)return;
  const fallback=stageView==='theme'?themeStarter(selected):itemDocument(selected!,reviews[selected!.id]||{});
  const key=documentKey+(stageView==='theme'?'theme:'+(selected?.id||'standalone'):'item:'+selected!.id);
  let next=fallback;
  try {
   const stored=JSON.parse(localStorage.getItem(key)||'null') as CanvasDocument|null;
   if(stored?.version===1&&Array.isArray(stored.artboards)&&stored.artboards.length<=100)next=stored;
  } catch {}
  setDocument(next);
  setBoardId(next.artboards[0]?.id||'');
  setSelectedNode('');
  setFitToken(i=>i+1);
 },[selectedId,stageView]);
 useEffect(()=>{
  try {localStorage.setItem(reviewKey,JSON.stringify(reviews));} catch {setFeedback('Could not persist reviews in this browser. Export review JSON to preserve them.');}
 },[reviews]);
 function changeDocument(next:CanvasDocument){
  setDocument(next);
  if(stageView!=='overview'){
   const key=documentKey+(stageView==='theme'?'theme:'+(selected?.id||'standalone'):'item:'+selected!.id);
   try {localStorage.setItem(key,JSON.stringify(next));}
   catch {setFeedback('Canvas exceeds local storage. Export Canvas JSON to preserve it.');}
  }
 }
 function mark(patch:Partial<Review>){
  if(!selected)return;
  setReviews(prev=>({...prev,[selected.id]:{...prev[selected.id],...patch,updatedAt:new Date().toISOString()}}));
 }
 function choose(item:InventoryItem){
  setSelectedId(item.id);setStageView('item');setFeedback('');
 }
 function chooseBoard(nodeId:string,board:string) {
  const key=refs.get(nodeId);
  if(stageView==='overview'&&key){
   const item=inventory.items.find(x=>x.id===key);
   if(item)choose(item);
   return;
  }
  setSelectedNode(nodeId);setBoardId(board);
 }
 function changeSelected(patch:Partial<CanvasNode>){
  if(!selectedNode)return;
  changeDocument(editNode(document,selectedNode,patch));
 }
 function updateBoard(patch:Partial<Artboard>) {
  const next=copy(document),b=next.artboards.find(board=>board.id===boardId);
  if(b){Object.assign(b,patch);changeDocument(next);}
 }
 function removeNode(){
  if(!selectedNode)return;
  const next=copy(document),b=next.artboards.find(board=>board.id===boardId);
  if(b){b.nodes=b.nodes.filter(node=>node.id!==selectedNode);changeDocument(next);setSelectedNode('');}
 }
 function duplicateNode(){
  const found=locateNode(document,selectedNode);if(!found)return;
  const next=copy(document),b=next.artboards.find(board=>board.id===boardId);
  if(b){b.nodes.push({...copy(found.node),id:'atlas-copy-'+Date.now(),x:found.node.x+24,y:found.node.y+24});changeDocument(next);}
 }
 function newBoard(){
  if(stageView==='overview')return;
  const next=copy(document);
  const id='atlas-board-'+Date.now();
  next.artboards.push({id,name:'New artboard',width:1440,height:1024,x:next.artboards.length*1500,y:0,background:'#fff',nodes:[]});
  changeDocument(next);setBoardId(id);setSelectedNode('');setFitToken(v=>v+1);
 }
 function cloneComponent(){
  const found=locateNode(document,selectedNode);if(!found)return;
  const next=copy(document),componentId='atlas-component-'+Date.now();
  next.components.push({id:componentId,name:found.node.name,node:copy(found.node)});
  changeDocument(next);
 }
 function insertComponent(id:string){
  const c=document.components.find(c=>c.id===id);if(!c?.node)return;
  const next=copy(document),board=next.artboards.find(b=>b.id===boardId);
  if(board) {board.nodes.push({...copy(c.node),id:'atlas-insert-'+Date.now(),componentId:id,x:50,y:100});changeDocument(next);}
 }
 function beginTheme(){
  setSelectedId('');
  setStageView('theme');
  setLayers(true);
  setShowInspector(true);
  setPreviewInteractions(false);
 }
 function addElement(type:CanvasNode['type']){
  if(stageView!=='theme')return;
  const next=copy(document),board=next.artboards.find(b=>b.id===boardId);
  if(!board)return;
  const num=board.nodes.length+1,id='atlas-'+type+'-'+Date.now();
  const defaultStyles:Record<CanvasNode['type'],CanvasNode['style']>={
   text:{fontSize:32,color:'#172033',fontWeight:600},
   frame:{backgroundColor:'#E6EDFB',borderRadius:10},
   button:{backgroundColor:'#263EE5',color:'#FFFFFF',borderRadius:9,padding:12,fontSize:16},
   image:{backgroundColor:'#E8EBF2',borderRadius:8},
   input:{backgroundColor:'#FFFFFF',borderColor:'#94A3B8',borderWidth:1,borderRadius:8,padding:12},
   link:{color:'#2563EB',textDecoration:'underline',fontSize:17}
  };
  const node:CanvasNode={id,type,name:type+' '+num,x:48,y:48+((num-1)%8)*68,width:type==='frame'?540:320,height:type==='frame'?230:type==='text'?66:58,style:defaultStyles[type],
   ...(type==='text'||type==='link'||type==='button'?{text:type==='text'?'Add your heading':type==='link'?'Link':'Button label'}:{})};
  board.nodes.push(node);
  changeDocument(next);setSelectedNode(id);
 }
 async function importCanvas(file:File|undefined){
  if(!file)return;
  try {
   if(file.size>3_000_000)throw Error('Canvas file exceeds 3 MB');
   const data=JSON.parse(await file.text()) as CanvasDocument;
   if(data?.version!==1||!Array.isArray(data.artboards)||data.artboards.length>100||!data.artboards.every(b=>
    typeof b.id==='string'&&typeof b.name==='string'&&Number.isFinite(b.width)&&Number.isFinite(b.height)&&b.width>0&&b.height>0&&
    b.width<=12000&&b.height<=12000&&Array.isArray(b.nodes)))throw Error('Not a supported AgentSam Canvas document');
   if(stageView==='overview')throw Error('Select a component or open Theme Canvas before importing.');
   changeDocument({...data,provenance:{...data.provenance,importedFrom:'local-dev-json'}});
   setSelectedNode('');setBoardId(data.artboards[0]?.id||'');setFitToken(i=>i+1);
   setFeedback('Loaded '+data.artboards.length+' editable artboard(s) into this local Canvas.');
  } catch(error){setFeedback(error instanceof Error?error.message:'Invalid Canvas JSON');}
 }
 const activeBoard=document.artboards.find(b=>b.id===boardId)||document.artboards[0];
 const visibleDocument={...document,artboards:activeBoard?[activeBoard]:[]};
 async function importReviews(file:File|undefined){
  if(!file)return;
  try {
   if(file.size>2_000_000)throw Error('Review file exceeds 2 MB');
   const data=JSON.parse(await file.text());
   if(data?.schema!=='agentsam.component-atlas.reviews.v1'||!data.reviews||typeof data.reviews!=='object')throw Error('Not a component review export');
   const allowed=new Set(inventory.items.map(i=>i.id));
   const incoming=Object.fromEntries(Object.entries(data.reviews).filter(([id,r])=>allowed.has(id)&&r&&typeof r==='object'));
   setReviews(prev=>({...prev,...incoming}));setFeedback('Imported '+Object.keys(incoming).length+' review records.');
  }catch(error){setFeedback(error instanceof Error?error.message:'Invalid review file');}
 }
 const livePath=selected&&routeFor(selected);
 const reviewed=Object.values(reviews).filter(x=>x?.state).length;
 const needs=inventory.items.filter(x=>reviews[x.id]?.state==='repair').length;
 return <TooltipProvider><div className="atlas-root" data-atlas="true">
  <header className="atlas-global">
   <div className="atlas-brand"><strong>InnerAnimalMedia</strong><span>/ Component Atlas</span><small>Local development</small></div>
   <div className="atlas-global-actions">
    <button onClick={beginTheme}>New theme canvas <Plus size={13}/></button>
    <button onClick={onLab}>Live component lab <ExternalLink size={13}/></button>
    <button onClick={()=>download('agentsam-component-atlas-reviews.json',{
      schema:'agentsam.component-atlas.reviews.v1',sourceRevision:inventory.sourceRevision,exportedAt:new Date().toISOString(),reviews
    })}>Export review <FileJson size={14}/></button>
    <button onClick={()=>fileInput.current?.click()}>Import review <FolderOpen size={14}/></button>
    <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={e=>{void importReviews(e.target.files?.[0]);e.target.value='';}}/>
   </div>
  </header>
  <section className="atlas-metrics" aria-label="Catalog evidence">
   <div><strong>{inventory.items.length}</strong><span>Source-backed entries</span></div>
   <div><strong>{inventory.counts.component}</strong><span>Exported UI components</span></div>
   <div><strong>{inventory.counts.app}</strong><span>App contracts</span></div>
   <div><strong>{inventory.counts.embed}</strong><span>CMS embeds</span></div>
   <div><strong>{reviewed}</strong><span>Reviewed</span></div>
   <div><strong>{needs}</strong><span>Marked repair</span></div>
  </section>
  <div className="atlas-workspace">
   <aside className="atlas-catalog" aria-label="Source inventory">
    <div className="atlas-pane-heading"><div><strong>Inventory</strong><small>Real source and manifest records</small></div><IconAction title="Reset to overview" aria-label="Show inventory overview" onClick={()=>setStageView('overview')}><Layers size={17}/></IconAction></div>
    <label className="atlas-search"><Search size={15}/><input aria-label="Search components and apps" placeholder="Search source, component, owner…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <div className="atlas-filters"><select aria-label="Source family" value={family} onChange={e=>{setFamily(e.target.value);setStageView('overview');}}>{familyFilters.map(group=><option key={group}>{group}</option>)}</select>
     <select aria-label="Review filter" value={scope} onChange={e=>{setScope(e.target.value as typeof scope);setStageView('overview');}}><option value="all">All records</option><option value="review">Reviewed</option><option value="favorite">Favorites</option></select>
    </div>
    <div className="atlas-list" role="list" aria-label="Repository records">
     {filtered.map(item=><button type="button" role="listitem" key={item.id} className={'atlas-record'+(selectedId===item.id&&stageView!=='overview'?' active':'')} onClick={()=>choose(item)}>
      <span className="atlas-record-main"><strong>{item.name}</strong>{reviews[item.id]?.favorite?<Star size={13} fill="currentColor"/>:null}</span>
      <span className="atlas-record-detail">{item.family} · {item.kind}</span>
      <span className="atlas-record-source">{item.source}</span>
      {reviews[item.id]?.state?<span className={'atlas-review-tag '+reviews[item.id].state}>{reviews[item.id].state}</span>:null}
     </button>)}
     {!filtered.length?<p className="atlas-none">No source records match this filter.</p>:null}
    </div>
    <footer className="atlas-pane-foot">{filtered.length} of {inventory.items.length} records · scanning actual repository sources, not account installation status</footer>
   </aside>
   <main className="atlas-center" aria-label="Native Canvas review workspace">
    <div className="atlas-canvas-toolbar">
     <div className="atlas-breadcrumb"><button onClick={()=>{setStageView('overview');setSelectedId('');}}>Catalog</button><ChevronLeft size={13}/>
      <strong>{stageView==='overview'?'Spatial overview':stageView==='theme'?'Independent theme canvas':selected?.name}</strong>
     </div>
     <div className="atlas-toolbar-end">
      <label className="atlas-board-selector"><span>Artboard</span><select aria-label="Select artboard" value={boardId} onChange={e=>{setBoardId(e.target.value);setSelectedNode('');setFitToken(i=>i+1);}}>{document.artboards.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      {stageView==='theme'?<div className="atlas-insert-tools" aria-label="Insert actual Canvas elements">
       {(['frame','text','button','image','input','link'] as const).map(type=><button key={type} onClick={()=>addElement(type)} title={'Insert '+type}>+ {type}</button>)}
       <button onClick={newBoard}>+ artboard</button>
      </div>:null}
      <button aria-pressed={layers} onClick={()=>setLayers(x=>!x)}><Layers size={14}/> Layers</button>
      <button aria-pressed={tool==='pan'} onClick={()=>setTool(x=>x==='pan'?'select':'pan')}>Pan / select</button>
      <button onClick={()=>setFitToken(v=>v+1)}>Fit</button>
      <button onClick={()=>setZoom(z=>Math.max(.08,z/1.2))} aria-label="Zoom out">−</button>
      <span>{Math.round(zoom*100)}%</span>
      <button onClick={()=>setZoom(z=>Math.min(3,z*1.2))} aria-label="Zoom in">+</button>
      <IconAction aria-pressed={showInspector} aria-label="Toggle inspector" onClick={()=>setShowInspector(x=>!x)}><PanelRight size={14}/></IconAction>
     </div>
    </div>
    <div className="atlas-canvas-region">
     {layers?<aside className="atlas-layers"><CanvasLayers document={document} selected={selectedNode} boardId={boardId}
        onSelect={chooseBoard} onAdd={newBoard} onComponent={insertComponent}/></aside>:null}
     <div className="atlas-stage cms-theme-canvas-stage">
      <CanvasStage document={visibleDocument} selected={selectedNode} boardId={boardId} preview={previewInteractions} width={0}
       zoom={zoom} onZoom={setZoom} onSelect={chooseBoard}
       onChange={(id,patch)=>changeDocument(editNode(document,id,patch))} fitToken={fitToken} tool={tool}/>
     </div>
    </div>
    <div className="atlas-canvas-bottom"><span>AgentSam Canvas model + genuine CMS stage background · {stageView==='theme'?'independent theme design':'source inspection'}</span>
      <div>{stageView==='theme'?<button onClick={()=>setPreviewInteractions(x=>!x)}>{previewInteractions?'Edit artboard':'Preview interactions'}</button>:null}
      {stageView!=='overview'?<><button onClick={()=>canvasInput.current?.click()}>Import Canvas JSON</button><input ref={canvasInput} hidden type="file" accept=".json,application/json" onChange={e=>{void importCanvas(e.target.files?.[0]);e.target.value='';}}/></>:null}
      <button onClick={()=>download((document.name||'component-artboard').replace(/[^a-z0-9]+/gi,'-')+'.canvas.json',document)}><FileJson size={14}/> Export Canvas JSON</button>
      <a href={external+'/canvas'} target="_blank" rel="noreferrer">Open authenticated Canvas <ExternalLink size={13}/></a></div>
    </div>
   </main>
   {showInspector?<aside className="atlas-inspector" aria-label="Component review and properties">
    <header className="atlas-inspector-head"><strong>{stageView==='theme'?'Theme Canvas':selected?.name||'Component Atlas'}</strong><small>{stageView==='theme'?'Independent artboard editor':selected?selected.kind:'Spatial inventory overview'}</small></header>
    {selected&&stageView!=='theme'?<div className="atlas-inspector-scroll">
     <section className="atlas-review"><h3>Design review</h3>
      <p>Mark what to keep, refine, repair, or retire. Your verdict is a local review, never an automatic claim of quality.</p>
      <div className="atlas-review-actions">{statusOptions.map(([state,label])=><button key={state} aria-pressed={review.state===state} onClick={()=>mark({state})} className={state}>{label}</button>)}</div>
      <label className="atlas-review-note"><span>What should change?</span><textarea rows={4} placeholder="E.g. reduce duplicate menus, fix mobile clipping, preserve the editor layout…" value={review.note||''} onChange={e=>mark({note:e.target.value})}/></label>
      <button className="atlas-favorite" aria-pressed={!!review.favorite} onClick={()=>mark({favorite:!review.favorite})}><Star size={14} fill={review.favorite?'currentColor':'none'}/> {review.favorite?'Favorite':'Mark favorite'}</button>
     </section>
     <section className="atlas-origin"><h3>Actual implementation</h3>
      <dl><dt>Owner</dt><dd>{selected.owner}</dd><dt>Source</dt><dd><code>{selected.source}</code></dd><dt>Evidence</dt><dd>{selected.evidence||'export declaration'}</dd>{selected.version?<><dt>Version</dt><dd>{selected.version}</dd></>:null}</dl>
      <div className="atlas-linkstack"><a target="_blank" rel="noreferrer" href={sourceUrl(selected)}>Inspect source <ExternalLink size={12}/></a>
       {livePath?<a target="_blank" rel="noreferrer" href={external+livePath}>Open actual app surface <ExternalLink size={12}/></a>:null}
      </div>
      {selected.kind==='integration'?<p className="atlas-caution">Source contract only. Authentication, plugin installation, permissions, and current connection state are not asserted.</p>:null}
      {selected.kind==='component'&&!selected.preview?<p className="atlas-caution">No runtime preview adapter registered. This record shows a real export and source link—not a simulated UI.</p>:null}
     </section>
     <section className="atlas-theme-journey"><h3>Theme canvas · independent authoring</h3>
      <p>Edit real artboards, reusable sections, and tokens. Your design is not confined to a CMS website; publishing to a site is optional.</p>
      <button onClick={()=>{setStageView('theme');setLayers(true);}}>Develop as theme canvas <Plus size={14}/></button>
      <button onClick={()=>setStageView('item')}>Return to implementation review</button>
      <a href={external+'/themes'} target="_blank" rel="noreferrer">Existing CMS Theme Editor <ExternalLink size={12}/></a>
     </section>
     <section className="atlas-actual-canvas-inspector"><h3>Canvas properties</h3>
      <CanvasInspector document={document} selected={selectedNode} boardId={boardId}
       onNode={changeSelected} onBoard={updateBoard} onDocument={changeDocument}
       onRemove={removeNode} onDuplicate={duplicateNode} onComponent={cloneComponent}/>
     </section>
    </div>:stageView==='theme'?<div className="atlas-inspector-scroll">
      <section className="atlas-theme-editor-intro"><h3>Independent Theme Canvas</h3>
       <p>Design pages and reusable sections on editable artboards. This shares AgentSam's Canvas data model and the CMS stage treatment, but is not a copy of the CMS page editor.</p>
       <p>Four blank, editable artboards: desktop, mobile, sections, and components. Nothing here is a mockup of your production app.</p>
      </section>
      <section className="atlas-actual-canvas-inspector"><h3>Artboard &amp; element properties</h3>
        <CanvasInspector document={document} selected={selectedNode} boardId={boardId}
         onNode={changeSelected} onBoard={updateBoard} onDocument={changeDocument}
         onRemove={removeNode} onDuplicate={duplicateNode} onComponent={cloneComponent}/>
      </section>
      <section className="atlas-theme-journey"><h3>Optional publishing later</h3>
        <p>Keep this as an independent Canvas, export its native JSON, or open the actual CMS Theme Studio when a specific website needs editing. No website selection is required here.</p>
        <a href={external+'/canvas'} target="_blank" rel="noreferrer">Native Canvas workspace <ExternalLink size={12}/></a>
      </section>
    </div>:<div className="atlas-inspector-scroll"><p className="atlas-empty-prompt">Choose a source record or click a card on the spatial canvas. Records link to their implementation; they are not invented app previews.</p>
     <p className="atlas-caution">This inventory describes repository sources, not installation status or design quality. Keep/refine/repair/retire marks are yours to make.</p>
     <p className="atlas-empty-prompt">Nav and Composer are interactive in the <button onClick={onLab}>live component lab</button>.</p>
    </div>}
   </aside>:null}
  </div>
  {feedback?<output role="status" className="atlas-feedback">{feedback}<IconAction onClick={()=>setFeedback('')} aria-label="Dismiss message"><X size={14}/></IconAction></output>:null}
 </div></TooltipProvider>;
}
