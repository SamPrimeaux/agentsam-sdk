import {useEffect,useMemo,useRef,useState,type CSSProperties,type PointerEvent as ReactPointerEvent} from 'react';
import {ChevronDown,Check,Copy,Download,ExternalLink,Hand,Layers,Maximize2,MessageSquare,MousePointer2,PanelLeftClose,PanelRightClose,Pin,Plus,Search,Send,Type,Upload,X} from 'lucide-react';
import {CanvasStage} from '../../../apps/local-studio/frontend/src/components/workbench/canvas/stage';
import {CanvasLayers,CanvasInspector} from '../../../apps/local-studio/frontend/src/components/workbench/canvas/panels';
import {blankDocument,copy,editNode,locateNode,makeId,removeNode,type CanvasDocument,type CanvasNode,type Artboard} from '../../../apps/local-studio/frontend/src/components/workbench/canvas/model';
import {themeStarter} from './atlas-document';
import {isAgentSamCanvasHandoffReceipt,type AgentSamCanvasHandoff,type AgentSamCanvasHandoffReceipt} from '../../agentsam-workbench/src/design/canvas-handoff.js';
import {AgentComposer} from '../../agentsam-workbench/src/agent/Composer.js';
import evidence from './visual-assets/manifest.json';
import '../../../apps/local-studio/frontend/src/components/workbench/canvas/canvas.css';
import './visual-review.css';

import { IconAction } from '../../copro-ui/src/icon-action';
type Evidence={id:string;name:string;group:string;owner:string;source:string;url:string;image:string|null;status:string;detail:string;capturedAt?:string};
type Thread={id:string;boardId:string;nodeId:string;replies:{body:string;at:string}[];resolved:boolean};
type Review={verdict?:'keep'|'refine'|'repair'|'retire';note?:string};
type Handoff=AgentSamCanvasHandoff;
type Props={onInventory:()=>void;onLab:()=>void;onHandoff?:(task:Handoff)=>Promise<AgentSamCanvasHandoffReceipt>};
const records=evidence.items as Evidence[];
const groups=['Chat & Work','Products & Apps','Commerce & Themes','Your references','Theme Canvas'];
const key='agentsam.visual-review.v3.';
const read=<T,>(name:string,fallback:T):T=>{try{return JSON.parse(localStorage.getItem(key+name)||'null')||fallback;}catch{return fallback;}};
const save=(name:string,value:unknown)=>{try{localStorage.setItem(key+name,JSON.stringify(value));}catch{ /* export instead */ }};
function download(name:string,data:unknown){const b=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),3000);}
function textNode(id:string,name:string,text:string,x:number,y:number,size=16):CanvasNode{return{id,type:'text',name,text,x,y,width:1080,height:size>20?68:80,style:{color:size>20?'#f4f5f8':'#b3bfce',fontSize:size,fontWeight:size>20?700:450}};}
function artboard(item:Evidence,i:number):Artboard{
 const id='evidence-'+item.id.split(':').pop(),nodes:CanvasNode=[
  textNode(id+'-title','Title',item.name,48,36,37),
  textNode(id+'-status','Evidence status',item.status==='captured'?'REAL CAPTURE · '+item.owner:item.status==='auth-required'?'AUTHENTICATED SCREEN — NEEDS CAPTURE':'UNAVAILABLE — NO VALID SCREENSHOT',48,102)
 ];
 if(item.image)nodes.push({id:id+'-image',type:'image',name:item.group==='Chat & Work'?'Live packaged component':'Captured screen',src:item.image,
 componentId:item.id==='visual:chat-composer'||item.id==='visual:work-composer'?'live-preview:'+item.id:undefined,
 x:42,y:158,width:1095,height:590,style:{objectFit:'contain',backgroundColor:'#0b0e15',borderRadius:6}});
 else nodes.push({id:id+'-missing',type:'frame',name:'Evidence not captured',x:42,y:158,width:1095,height:590,style:{backgroundColor:'#242a36',borderRadius:8},children:[
   textNode(id+'-explanation','Why there is no screenshot',item.detail,32,180,20),textNode(id+'-source','Source path',item.source,32,320)]});
 nodes.push(textNode(id+'-provenance','Provenance',item.source+' · '+(item.status==='captured'?'captured source screenshot (not a live UI)':'reference only'),48,776));
 return{id,name:item.name,x:i%3*1260,y:Math.floor(i/3)*950,width:1180,height:860,background:'#171b24',route:item.url,nodes};
}
function firstDocument():CanvasDocument{return{...blankDocument('design','Source-backed visual review'),name:'InnerAnimalMedia / Visual Atlas',artboards:records.map(artboard),provenance:{source:'packages/agentsam-nav/dev/visual-assets/manifest.json'}};}
function evidenceFor(board?:Artboard){return records.find(r=>board?.id==='evidence-'+r.id.split(':').pop());}
function pinNode(id:string,n:number,x:number,y:number):CanvasNode{return{id,type:'frame',componentId:'review-pin:'+id,name:'Comment pin '+n,text:String(n),x:x-19,y:y-19,width:38,height:38,style:{backgroundColor:'#315bef',color:'#ffffff',fontSize:19,borderRadius:99,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'#fff'}};}
export function VisualReview({onInventory,onLab,onHandoff}:Props){
 const [visual,setVisual]=useState<CanvasDocument>(()=>read('document',firstDocument()));
 const [themeDoc,setThemeDoc]=useState<CanvasDocument>(()=>read('theme',themeStarter()));
 const [threads,setThreads]=useState<Thread[]>(()=>read('threads',[]));
 const [reviews,setReviews]=useState<Record<string,Review>>(()=>read('reviews',{}));
 const [page,setPage]=useState(groups[0]),[focus,setFocus]=useState(''),[boardId,setBoardId]=useState('evidence-chat-composer'),[selected,setSelected]=useState('');
 const [userPages,setUserPages]=useState<string[]>(()=>read('userPages',[]));
 const [newPageName,setNewPageName]=useState('');
 const pageOptions=[...groups.slice(0,-1),...userPages,'Theme Canvas'];
 const [tool,setTool]=useState<'select'|'pan'|'comment'>('select'),[zoom,setZoom]=useState(.4),[fit,setFit]=useState(1);
 const [leftWidth,setLeftWidth]=useState(()=>read('leftWidth',254)),[rightWidth,setRightWidth]=useState(()=>read('rightWidth',310));
 const [showLeft,setShowLeft]=useState(true),[showRight,setShowRight]=useState(true);
 const [leftTab,setLeftTab]=useState<'pages'|'layers'|'sources'>('pages'),[rightTab,setRightTab]=useState<'properties'|'comments'|'source'|'agent'>('properties');
 const [pageMenu,setPageMenu]=useState(false),[handoffModal,setHandoffModal]=useState(false),[query,setQuery]=useState(''),[commentDraft,setCommentDraft]=useState('');
 const [feedback,setFeedback]=useState(''),[submitting,setSubmitting]=useState(false);
 const [interact,setInteract]=useState(false),[liveDraft,setLiveDraft]=useState(''),[liveEffort,setLiveEffort]=useState('High');
 const imageInput=useRef<HTMLInputElement>(null);
 const theme=page==='Theme Canvas',doc=theme?themeDoc:visual,setDoc=theme?setThemeDoc:setVisual;
 const visibleBoards=useMemo(()=>doc.artboards.filter(b=>theme?true:page==='Your references'?b.id.startsWith('import-'):
   evidenceFor(b)?.group===page||b.id.startsWith('page-'+encodeURIComponent(page)+'-')),[doc,theme,page]);
 const boards=focus?visibleBoards.filter(b=>b.id===focus):visibleBoards;
 const stageDoc=useMemo(()=>({...doc,artboards:boards}),[doc,boards]);
 const active=doc.artboards.find(b=>b.id===boardId)||visibleBoards[0],source=evidenceFor(active);
 const reviewId=source?.id||active?.id||'none',review=reviews[reviewId]||{};
 const boardThreads=threads.filter(t=>t.boardId===active?.id),selectedThread=threads.find(t=>t.nodeId===selected);
 const pageThreads=threads.filter(t=>visibleBoards.some(b=>b.id===t.boardId));
 useEffect(()=>{save('document',visual);},[visual]);
 useEffect(()=>{save('theme',themeDoc);},[themeDoc]);
 useEffect(()=>{save('threads',threads);},[threads]);
 useEffect(()=>{save('userPages',userPages);},[userPages]);
 useEffect(()=>{save('reviews',reviews);},[reviews]);
 useEffect(()=>{save('leftWidth',leftWidth);save('rightWidth',rightWidth);},[leftWidth,rightWidth]);
 useEffect(()=>{setSelected('');setBoardId(visibleBoards[0]?.id||'');setFocus('');setInteract(false);setTool('select');setFit(v=>v+1);},[page]);
 useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement).tagName)||e.ctrlKey||e.metaKey)return;
  if(e.key==='Escape'){setTool('select');setPageMenu(false);setHandoffModal(false);}
  if(e.key==='p')setTool('comment');if(e.key==='h')setTool('pan');if(e.key==='v')setTool('select');
 };window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[]);
 function selectNode(id:string,b:string){setBoardId(b);setSelected(id);if(id.startsWith('comment-'))setRightTab('comments');}
 function patchBoard(patch:Partial<Artboard>){if(!active)return;const d=copy(doc),b=d.artboards.find(b=>b.id===active.id);if(b){Object.assign(b,patch);setDoc(d);}}
 function placePin(b:string,x:number,y:number){const id='comment-'+makeId('pin'),d=copy(doc),board=d.artboards.find(a=>a.id===b);if(!board)return;
  board.nodes.push(pinNode(id,threads.filter(t=>t.boardId===b).length+1,x,y));setDoc(d);setThreads(v=>[...v,{id:makeId('thread'),boardId:b,nodeId:id,replies:[],resolved:false}]);
  setBoardId(b);setSelected(id);setRightTab('comments');setShowRight(true);setCommentDraft('');
 }
 function postComment(){if(!commentDraft.trim()||!active)return;let target=selectedThread;
  if(!target){const id='comment-'+makeId('pin'),d=copy(doc),b=d.artboards.find(b=>b.id===active.id);b?.nodes.push(pinNode(id,boardThreads.length+1,110,110));setDoc(d);
   target={id:makeId('thread'),boardId:active.id,nodeId:id,replies:[],resolved:false};setSelected(id);}
  const t=target;setThreads(old=>{const list=old.some(x=>x.id===t.id)?old:[...old,t];return list.map(x=>x.id===t.id?{...x,replies:[...x.replies,{body:commentDraft.trim(),at:new Date().toISOString()}]}:x);});setCommentDraft('');
 }
 function addBoard(){const d=copy(doc),id=(theme?'theme-new-':page==='Your references'?'import-':'page-'+encodeURIComponent(page)+'-')+makeId('artboard');d.artboards.push({id,name:'New artboard',x:d.artboards.length*1480,y:0,width:1440,height:900,background:'#fff',nodes:[]});
  setDoc(d);setBoardId(id);setFocus(id);setFit(v=>v+1);
 }
 function addElement(kind:'text'|'frame'){if(!theme||!active)return;const d=copy(doc),b=d.artboards.find(b=>b.id===active.id),id=makeId('node');
  b?.nodes.push({id,name:kind==='text'?'Heading':'Section',type:kind,x:65,y:110,width:kind==='text'?620:820,height:kind==='text'?95:400,
   ...(kind==='text'?{text:'Your headline'}:{}),style:kind==='text'?{color:'#151a24',fontSize:56,fontWeight:700}:{backgroundColor:'#eef1fa',borderRadius:10}});
  setDoc(d);setSelected(id);
 }
 function duplicateBoard(){if(!active)return;const d=copy(doc),b=copy(active);b.id=(theme?'theme-new-':page==='Your references'?'import-':'page-'+encodeURIComponent(page)+'-')+makeId('artboard');b.name+=' · copy';b.x+=190;
  b.nodes=b.nodes.filter(n=>!n.componentId?.startsWith('review-pin:')).map(n=>({...n,id:makeId('node')}));d.artboards.push(b);setDoc(d);setFocus(b.id);setBoardId(b.id);setFit(v=>v+1);
 }
 function resize(which:'left'|'right',e:ReactPointerEvent<HTMLDivElement>){e.preventDefault();const element=e.currentTarget,start=e.clientX,initial=which==='left'?leftWidth:rightWidth;
  element.setPointerCapture(e.pointerId);
  const move=(ev:PointerEvent)=>{const value=Math.max(180,Math.min(540,initial+(ev.clientX-start)*(which==='left'?1:-1)));if(which==='left')setLeftWidth(value);else setRightWidth(value);};
  const end=()=>{element.removeEventListener('pointermove',move);element.removeEventListener('pointerup',end);element.removeEventListener('pointercancel',end);};
  element.addEventListener('pointermove',move);element.addEventListener('pointerup',end);element.addEventListener('pointercancel',end);
 }
 async function importScreenshot(file?:File){if(!file)return;try{
  if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>10_000_000)throw Error('Import PNG, JPEG, or WebP under 10 MB');
  const bitmap=await createImageBitmap(file),scale=Math.min(1,1440/bitmap.width,1024/bitmap.height),cv=document.createElement('canvas');
  cv.width=Math.round(bitmap.width*scale);cv.height=Math.round(bitmap.height*scale);cv.getContext('2d')?.drawImage(bitmap,0,0,cv.width,cv.height);bitmap.close();
  const d=copy(visual),id='import-'+makeId('artboard');d.artboards.push({id,name:file.name,x:0,y:0,width:1200,height:900,background:'#171b24',nodes:[
    textNode(id+'-title','Imported reference',file.name,40,30,35),
    {id:id+'-image',type:'image',name:'Imported actual screenshot',src:cv.toDataURL('image/jpeg',.8),x:45,y:128,width:1100,height:680,style:{objectFit:'contain'}}]});
  setVisual(d);setPage('Your references');setFocus(id);setBoardId(id);setFeedback('Imported a real screenshot as editable Canvas image layer.');
 }catch(err){setFeedback(err instanceof Error?err.message:'Import failed');}}
 function liveComponent(node:CanvasNode){
  const isWork=node.componentId==='live-preview:visual:work-composer';
  return <div className="vr-live-component">
   <div className="vr-live-head"><strong>AgentComposer · {isWork?'Work':'Chat'}</strong><small>LIVE · @inneranimalmedia/agentsam-workbench</small></div>
   <div className="vr-live-holder"><AgentComposer value={liveDraft} onChange={setLiveDraft} onSend={()=>{setFeedback('Packaged composer submitted in local demo: '+liveDraft);setLiveDraft('');}}
     runMode={isWork?'agent':'ask'} placeholder={isWork?'Work with AgentSam':'Ask AgentSam'}
     toolbarStart={<IconAction type="button" title="Tools menu uses the shared Nav contract in the component lab" onClick={onLab}><Plus size={18}/></IconAction>}
     toolbarEnd={<label>Thinking <select value={liveEffort} onChange={e=>setLiveEffort(e.target.value)}>
       <option>Instant</option><option>Medium</option><option>High</option><option>Extra High</option>
     </select></label>}
     sendControl={<button type="button" disabled={!liveDraft.trim()} onClick={()=>{setFeedback('Composer submitted in local demo: '+liveDraft);setLiveDraft('');}}>Send</button>}
   /></div>
   <p>The real packaged composer rendered inside the existing CanvasStage. Use Interact to type and test; Pin to annotate the design.</p>
  </div>;
 }
 function handoff():Handoff{return{schema:'agentsam.canvas.handoff.v1',createdAt:new Date().toISOString(),target:{board:active?.name||'',page,owner:source?.owner||'local-design',source:source?.source||'',url:source?.url||''},
  document:{...doc,artboards:active?[active]:[]},threads:boardThreads,review,
  instructions:['Inspect actual package before coding; do not create a duplicate app','Use screenshot, artboard, pins and comments as acceptance inputs','Preserve existing typed components, installed apps and app embeds','Verify desktop/mobile and interaction states','Report code changes, tests and unresolved issues']};}
 const task=handoff();
 const prompt=['AgentSam software development handoff','Board: '+task.target.board,'Source: '+task.target.source,'Review: '+(review.verdict||'pending'),review.note||'',
  ...boardThreads.flatMap(t=>t.replies.map(m=>'- '+m.body)),...task.instructions].join('\n');
 async function submit(){if(!onHandoff)return;setSubmitting(true);try{const receipt=await onHandoff(task);if(!isAgentSamCanvasHandoffReceipt(receipt))throw Error('Host returned no valid task receipt.');setFeedback('AgentSam task '+receipt.status+': '+receipt.taskId);setHandoffModal(false);}catch(err){setFeedback('AgentSam handoff was not confirmed: '+String(err));}finally{setSubmitting(false);}}
 return <div className="vr-root" data-visual-review="true">
  <header className="vr-global">
   <div className="vr-brand"><IconAction className="vr-icon" title="Source inventory" onClick={onInventory}><Layers size={16}/></IconAction><strong>InnerAnimalMedia</strong><span>/ Visual Atlas</span><small>Local development</small></div>
   <div className="vr-actions">
    <button onClick={()=>{setShowRight(true);setRightTab('comments');}}><MessageSquare size={15}/> Comments <small>{pageThreads.length}</small></button>
    <button className="vr-primary" onClick={()=>setHandoffModal(true)}><Send size={14}/> Hand off to AgentSam</button>
    <IconAction className="vr-icon" title="Export native Canvas" onClick={()=>download('agentsam-review.canvas.json',doc)}><Download size={16}/></IconAction>
   </div>
  </header>
  <div className="vr-toolbar">
   <div className="vr-page-control">
    {!showLeft?<IconAction className="vr-icon" title="Open layers" onClick={()=>setShowLeft(true)}><Layers size={15}/></IconAction>:null}
    <button className="vr-page" onClick={()=>setPageMenu(v=>!v)} aria-expanded={pageMenu}><span>{groups.indexOf(page)+1}</span> {page} <ChevronDown size={13}/></button>
    {pageMenu?<div role="menu" className="vr-page-menu"><p>Design pages</p>{pageOptions.map(name=><button key={name} role="menuitem" aria-current={name===page?'page':undefined} onClick={()=>{setPage(name);setPageMenu(false);}}>{name}{name===page?<Check size={13}/>:null}</button>)}
      <form className="vr-new-page" onSubmit={e=>{e.preventDefault();const value=newPageName.trim();if(!value||pageOptions.includes(value))return;setUserPages(list=>[...list,value]);setPage(value);setNewPageName('');setPageMenu(false);}}>
       <input aria-label="New page name" value={newPageName} placeholder="New page name" onChange={e=>setNewPageName(e.target.value)}/>
       <button type="submit" disabled={!newPageName.trim()||pageOptions.includes(newPageName.trim())}>Create page</button>
      </form>
     </div>:null}
    <small>{visibleBoards.length} artboards</small>
   </div>
   <div className="vr-zoom-actions">
    <IconAction title="Fit artboards" onClick={()=>setFit(v=>v+1)}><Maximize2 size={15}/></IconAction>
    <button onClick={()=>{setFocus(v=>v?'':active?.id||'');setInteract(false);setFit(v=>v+1);}}>{focus?'Show all':'Focus selection'}</button>
    {source?.id==='visual:chat-composer'||source?.id==='visual:work-composer'?<button aria-pressed={interact} onClick={()=>{setInteract(v=>!v);setFocus(active?.id||'');setFit(v=>v+1);}}>{interact?'Edit/Pin':'Interact'}</button>:null}
    <button aria-label="Zoom out" onClick={()=>setZoom(z=>Math.max(.08,z/1.25))}>−</button>
    <select aria-label="Zoom level" value={Math.round(zoom*100)} onChange={e=>setZoom(Number(e.target.value)/100)}>
     {![25,50,75,100,150,200].includes(Math.round(zoom*100))?<option value={Math.round(zoom*100)}>{Math.round(zoom*100)}%</option>:null}
     {[25,50,75,100,150,200].map(n=><option key={n} value={n}>{n}%</option>)}
    </select>
    <button aria-label="Zoom in" onClick={()=>setZoom(z=>Math.min(3,z*1.25))}>+</button>
    {!showRight?<IconAction className="vr-icon" onClick={()=>setShowRight(true)} title="Show inspector"><PanelRightClose size={15}/></IconAction>:null}
   </div>
  </div>
  <div className="vr-layout" style={{'--vr-left':showLeft?leftWidth+'px':'0px','--vr-right':showRight?rightWidth+'px':'0px'} as CSSProperties}>
   {showLeft?<aside className="vr-left" aria-label="Pages and layers">
    <nav className="vr-tabs">{(['pages','layers','sources'] as const).map(t=><button key={t} aria-pressed={leftTab===t} onClick={()=>setLeftTab(t)}>{t}</button>)}<IconAction title="Collapse left panel" onClick={()=>setShowLeft(false)}><PanelLeftClose size={13}/></IconAction></nav>
    {leftTab==='pages'?<div className="vr-sidebar">
      <div className="vr-section-head"><strong>{page}</strong><IconAction aria-label="Add artboard" onClick={addBoard}><Plus size={16}/></IconAction></div>
      <label className="vr-search"><Search size={14}/><input placeholder="Search visual artboards" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      {visibleBoards.filter(b=>b.name.toLowerCase().includes(query.toLowerCase())).map(b=>{
       const ref=evidenceFor(b),count=threads.filter(x=>x.boardId===b.id).length;
       return <button key={b.id} className={'vr-board-row'+(active?.id===b.id?' selected':'')} onClick={()=>{setBoardId(b.id);setSelected('');setFocus(b.id);setFit(v=>v+1);}}>
        {ref?.image?<img src={ref.image} alt="" loading="lazy"/>:<span className="vr-placeholder"><Layers size={17}/></span>}
        <span><strong>{b.name}</strong><small>{ref?.status==='captured'?'Actual screenshot':ref?.status==='auth-required'?'Needs authenticated capture':ref?.status==='unavailable'?'Invalid capture':'Editable artboard'}</small></span>
        {count?<em>{count}</em>:null}
       </button>;
      })}
      <button className="vr-wide" onClick={addBoard}><Plus size={14}/> New artboard</button>
      <button className="vr-wide" onClick={()=>imageInput.current?.click()}><Upload size={14}/> Import real screenshot</button>
      <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>{void importScreenshot(e.target.files?.[0]);e.target.value='';}}/>
      <div className="vr-divider"/>
      <div className="vr-section-head"><strong>Real components and code</strong></div>
      <button className="vr-wide" onClick={onLab}><Layers size={14}/> Live component lab</button>
      <button className="vr-wide" onClick={onInventory}><Search size={14}/> 452 source records</button>
     </div>:leftTab==='layers'?<div className="vr-native-panel"><CanvasLayers document={stageDoc} selected={selected} boardId={boardId} onSelect={selectNode} onAdd={addBoard} onComponent={()=>setFeedback('Choose a component from the Theme Canvas library.')}/></div>:
     <div className="vr-sidebar"><p className="vr-helper">Source-backed screenshots, actual packaged React controls, app manifests, and editable Canvas artboards are kept distinct.</p>{pageOptions.map(name=><button className="vr-wide" key={name} onClick={()=>{setPage(name);setLeftTab('pages');}}>{name}</button>)}<button className="vr-wide" onClick={onInventory}>Search all repository exports</button></div>}
   </aside>:null}
   {showLeft?<div className="vr-resizer" role="separator" aria-label="Resize layers panel" tabIndex={0} aria-orientation="vertical" onPointerDown={e=>resize('left',e)} onKeyDown={e=>{if(e.key==='ArrowLeft')setLeftWidth(v=>Math.max(180,v-12));if(e.key==='ArrowRight')setLeftWidth(v=>Math.min(540,v+12));}}/>:null}
   <main className="vr-center" aria-label="Fullscreen spatial canvas">
    <div className="vr-stage"><CanvasStage document={stageDoc} selected={selected} boardId={boardId} preview={interact} width={0} zoom={zoom} onZoom={setZoom} onSelect={selectNode}
      onChange={(id,patch)=>setDoc(editNode(doc,id,patch))} fitToken={fit} tool={tool} onPlacePin={placePin} renderComponent={liveComponent}/></div>
    <div className="vr-floating" aria-label="Canvas tools">
     <IconAction title="Select (V)" aria-pressed={tool==='select'} onClick={()=>setTool('select')}><MousePointer2 size={16}/></IconAction>
     <IconAction title="Hand / pan (H)" aria-pressed={tool==='pan'} onClick={()=>setTool('pan')}><Hand size={16}/></IconAction>
     <span/>
     <IconAction title="Pin comment (P) — click on artboard" aria-pressed={tool==='comment'} onClick={()=>{setTool('comment');setRightTab('comments');setShowRight(true);}}><Pin size={16}/></IconAction>
     {theme?<><span/><IconAction title="Insert text" onClick={()=>addElement('text')}><Type size={16}/></IconAction><IconAction title="Insert frame" onClick={()=>addElement('frame')}><Plus size={16}/></IconAction></>:null}
     <span/><IconAction title="Fit all artboards" onClick={()=>setFit(v=>v+1)}><Maximize2 size={15}/></IconAction>
    </div>
    <div className="vr-footer"><span>{tool==='comment'?'Click anywhere on a design to pin a comment':theme?'Native editable artboards · independent of CMS':'Genuine captures · review pins · linked source'}</span><span>{active?.name||''}</span></div>
   </main>
   {showRight?<div className="vr-resizer" role="separator" aria-label="Resize properties panel" tabIndex={0} aria-orientation="vertical" onPointerDown={e=>resize('right',e)} onKeyDown={e=>{if(e.key==='ArrowLeft')setRightWidth(v=>Math.min(540,v+12));if(e.key==='ArrowRight')setRightWidth(v=>Math.max(180,v-12));}}/>:null}
   {showRight?<aside className="vr-right" aria-label="Properties, comments, provenance, and AgentSam">
    <nav className="vr-tabs">{(['properties','comments','source','agent'] as const).map(t=><button key={t} aria-pressed={rightTab===t} onClick={()=>setRightTab(t)}>{t==='agent'?'AgentSam':t}</button>)}<IconAction onClick={()=>setShowRight(false)} aria-label="Collapse inspector"><PanelRightClose size={14}/></IconAction></nav>
    {rightTab==='properties'?<div className="vr-panel">
     <div className="vr-section-head"><strong>Design properties</strong><small>{source?.status==='captured'?'Real screenshot':theme?'Editable Canvas':'Source record'}</small></div>
     {source?<p className="vr-helper">{source.detail}</p>:null}
     <div className="vr-native-panel"><CanvasInspector document={doc} selected={selected} boardId={boardId}
      onNode={patch=>selected&&setDoc(editNode(doc,selected,patch))} onBoard={patchBoard} onDocument={setDoc}
      onRemove={()=>{if(selected){setDoc(removeNode(doc,selected));setSelected('');}}}
      onDuplicate={()=>{const found=locateNode(doc,selected)?.node;if(!found||!active)return;const d=copy(doc),b=d.artboards.find(b=>b.id===active.id);b?.nodes.push({...copy(found),id:makeId('node'),x:found.x+24,y:found.y+24});setDoc(d);}}
      onComponent={()=>setFeedback('Use the native Canvas Components library to reuse this element.')}/></div>
     <button className="vr-wide" onClick={duplicateBoard}><Copy size={14}/> Duplicate artboard</button>
     <div className="vr-divider"/>
     <div className="vr-section-head"><strong>Review verdict</strong></div>
     <div className="vr-verdict">{(['keep','refine','repair','retire'] as const).map(v=><button key={v} aria-pressed={review.verdict===v} onClick={()=>setReviews(x=>({...x,[reviewId]:{...x[reviewId],verdict:v}}))}>{v}</button>)}</div>
     <label className="vr-input-label">What should change?<textarea rows={3} value={review.note||''} onChange={e=>setReviews(x=>({...x,[reviewId]:{...x[reviewId],note:e.target.value}}))} placeholder="Preserve what works; identify what to revise…"/></label>
    </div>:null}
    {rightTab==='comments'?<div className="vr-panel">
     <div className="vr-section-head"><strong>Comments & pins</strong><span>{boardThreads.length} pins</span></div>
     <p className="vr-helper">Choose the Pin tool (P), then click any location on the artboard. Comments stay attached to that design.</p>
     <button className="vr-wide" onClick={()=>setTool('comment')}><Pin size={14}/> Pin on the canvas</button>
     {boardThreads.map((t,i)=><section key={t.id} className={'vr-thread'+(selected===t.nodeId?' selected':'')}>
       <div><button onClick={()=>setSelected(t.nodeId)}><b>{i+1}</b> Thread {i+1}</button><button onClick={()=>setThreads(old=>old.map(x=>x.id===t.id?{...x,resolved:!x.resolved}:x))}>{t.resolved?'Reopen':'Resolve'}</button></div>
       {t.replies.length?t.replies.map((msg,j)=><p key={j}>{msg.body}<small>Reviewer · {new Date(msg.at).toLocaleString()}</small></p>):<p className="vr-helper">Pin placed. Add your instruction below.</p>}
      </section>)}
     {!boardThreads.length?<div className="vr-empty">No pins on this artboard.</div>:null}
     <label className="vr-input-label">{selectedThread?'Reply to selected pin':'New artboard comment'}<textarea rows={4} value={commentDraft} onChange={e=>setCommentDraft(e.target.value)} placeholder="Describe what should change or stay the same…"/></label>
     <button className="vr-primary vr-block" disabled={!commentDraft.trim()} onClick={postComment}><MessageSquare size={14}/> Post comment</button>
    </div>:null}
    {rightTab==='source'?<div className="vr-panel">
     <div className="vr-section-head"><strong>Implementation source</strong></div>
     <p className="vr-helper">These are actual captured screenshots or source records, not invented clickable app implementations.</p>
     <dl className="vr-source"><dt>Surface</dt><dd>{active?.name||'None'}</dd><dt>Owner</dt><dd>{source?.owner||'Independent Canvas'}</dd><dt>Source</dt><dd><code>{source?.source||'Locally authored'}</code></dd><dt>Evidence</dt><dd>{source?.status||'Editable Canvas'}</dd><dt>Captured</dt><dd>{source?.capturedAt?new Date(source.capturedAt).toLocaleString():'Not captured'}</dd></dl>
     {source?<><a className="vr-wide" href={'https://github.com/SamPrimeaux/agentsam-sdk/blob/main/'+source.source} target="_blank" rel="noreferrer">Open repository source <ExternalLink size={13}/></a>
      {source.url.startsWith('https://')?<a className="vr-wide" href={source.url} target="_blank" rel="noreferrer">Open original surface <ExternalLink size={13}/></a>:null}</>:null}
     <button className="vr-wide" onClick={onInventory}>Open full source inventory</button>
    </div>:null}
    {rightTab==='agent'?<div className="vr-panel">
     <div className="vr-section-head"><strong>Work with AgentSam</strong><Send size={15}/></div>
     <p className="vr-helper">Graduate an artboard into actual software work. The existing coding agent needs the owning source, pinned comments and acceptance criteria — not just a screenshot.</p>
     <div className="vr-task-card"><strong>{active?.name||'Canvas document'}</strong><small>{boardThreads.length} comment threads · {source?.owner||'independent design'}</small><p>{review.note||'Add an instruction or pin a specific area before handoff.'}</p></div>
     <button className="vr-primary vr-block" onClick={()=>setHandoffModal(true)}><Send size={14}/> Prepare AgentSam handoff</button>
     <button className="vr-wide" onClick={async()=>{await navigator.clipboard.writeText(prompt);setFeedback('Task prompt copied; submit it in your authenticated AgentSam chat.');}}><Copy size={14}/> Copy task prompt</button>
     <a className="vr-wide" href="https://agentsam.inneranimalmedia.com/admin/agentsam" target="_blank" rel="noreferrer">Open AgentSam workspace <ExternalLink size={13}/></a>
     <p className="vr-helper">Local preview cannot secretly start a coding run. An authenticated host can supply the typed onHandoff callback.</p>
    </div>:null}
   </aside>:null}
  </div>
  {feedback?<div className="vr-toast" role="status">{feedback}<IconAction onClick={()=>setFeedback('')} aria-label="Dismiss notice"><X size={13}/></IconAction></div>:null}
  {handoffModal?<div className="vr-modal-mask" onMouseDown={e=>{if(e.target===e.currentTarget)setHandoffModal(false);}}>
   <section className="vr-modal" role="dialog" aria-modal="true" aria-label="Hand off to AgentSam">
    <header><div><small>DEVELOPMENT HANDOFF</small><h2>Hand off to AgentSam</h2></div><IconAction aria-label="Close handoff" onClick={()=>setHandoffModal(false)}><X size={17}/></IconAction></header>
    <p>Package the selected artboard, real source reference, review verdict, pinned comments and acceptance requirements for an AgentSam coding agent.</p>
    <dl className="vr-source"><dt>Artboard</dt><dd>{task.target.board}</dd><dt>Owner</dt><dd>{task.target.owner}</dd><dt>Source</dt><dd><code>{task.target.source||'New native Canvas'}</code></dd><dt>Pins</dt><dd>{task.threads.length}</dd><dt>Verdict</dt><dd>{task.review.verdict||'Not reviewed'}</dd></dl>
    <div className="vr-task-ready"><Check size={14}/> Source-backed engineering brief ready for review.</div>
    {!onHandoff?<p className="vr-warning">This is a local prototype. No AgentSam run has started. Export the task JSON or copy the prompt and submit it in the existing AgentSam workspace.</p>:null}
    <footer><button onClick={()=>download('agentsam-canvas-handoff.json',task)}><Download size={14}/> Export task JSON</button>
     <button onClick={async()=>{await navigator.clipboard.writeText(prompt);setFeedback('Handoff prompt copied.');}}><Copy size={14}/> Copy task</button>
     {onHandoff?<button className="vr-primary" disabled={submitting} onClick={()=>void submit()}>{submitting?'Submitting…':'Start AgentSam work'}</button>:
      <a className="vr-primary" href="https://agentsam.inneranimalmedia.com/admin/agentsam" target="_blank" rel="noreferrer">Open AgentSam <ExternalLink size={13}/></a>}
    </footer>
   </section>
  </div>:null}
 </div>;
}
