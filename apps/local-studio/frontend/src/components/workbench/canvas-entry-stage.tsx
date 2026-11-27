import { WorkspaceOpeningField } from "@/components/runtime/LocalStudioRuntimeField";
import { IconAction } from "@/components/ui/icon-action";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Component, ExternalLink, FileCode2, Frame, Hand, History, Image, Layers, MousePointer2, PanelLeft, Plus, Redo2, RefreshCw, Save, Settings2, Square, Type, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { DesignWorkspaceFrame } from "@inneranimalmedia/agentsam-workbench/design";
import { AskAgentSamPill } from "@inneranimalmedia/agentsam-workbench/agent";
import { askAgentSamAboutArtifact } from "@/lib/work/artifact-assistance";
import "@inneranimalmedia/agentsam-workbench/design/design-workspace.css";
import type { DesignWorkspaceSnapshot } from "@inneranimalmedia/agentsam-contracts";
import type { SideTab } from "@inneranimalmedia/agentsam-local-shared";
import { useWorkStore } from "@/lib/work/store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { ModelSelect } from "@/components/workbench/model-select";
import { CanvasStage } from "./canvas/stage";
import { CanvasInspector, CanvasLayers } from "./canvas/panels";
import { CanvasCmsHandoff } from "./canvas/cms-handoff";
import { SourceArtboardLibrary, type ImportedSource } from "./canvas/source-library";
import { API, CanvasApiError, blankDocument, canvasBounds, canvasRequest, cloneNode, copy, editNode, insertNode, locateNode, makeId, removeNode, terminalRun, withStarterPages, type Artboard, type CanvasDocument, type CanvasEvent, type CanvasMeta, type CanvasNode, type CanvasResponse, type CanvasRun, type Direction } from "./canvas/model";
import "./canvas/canvas.css";
import { AnnotationToggle, DESIGN_WORKSPACE_PROMPT_EVENT, type DesignWorkspacePromptRequest } from "../../../agentsam/AnnotationHelper";

type EventResponse={ok:boolean;events:CanvasEvent[];cursor:number;canvas?:CanvasMeta;run:CanvasRun|null};
function idFromUrl(url?:string) {
 try {const parsed=new URL(url||"",location.origin);const id=parsed.searchParams.get("canvas");return id&&/^canvas_[A-Za-z0-9_-]+$/.test(id)?id:"";}catch{return "";}
}
function message(error:unknown) {return error instanceof Error?error.message:"The operation could not be completed.";}
function eventLabel(event:CanvasEvent) {
 const payload=event.payload||{};
 return String(event.message||payload.message||payload.title||payload.skill_id||payload.name||event.type.replaceAll("."," · ").replaceAll("_"," "));
}
function isThemeStudioEditorUrl(value?:string) {
 try {
  const url=new URL(value||"",location.origin);
  return url.origin===location.origin && (
   url.pathname==="/admin/theme-project-editor" ||
   /^\/admin\/sites\/[A-Za-z0-9_-]{1,160}\/themes\/[A-Za-z0-9_-]{1,160}\/editor(?:\/[A-Za-z0-9_-]{1,160})?$/.test(url.pathname)
  );
 } catch { return false; }
}
export function CanvasEntryStage({tab,openSources=false}:{tab:SideTab;openSources?:boolean}) {
 if(isThemeStudioEditorUrl(tab.url))return <ExistingThemeCanvas tab={tab}/>;
 return <IndependentCanvas key={tab.id} tab={tab} openSources={openSources}/>;
}

function IndependentCanvas({tab,openSources=false}:{tab:SideTab;openSources?:boolean}) {
 const setTabUrl=useWorkStore(s=>s.setTabUrl);
 const model=useWorkStore(s=>s.modelSelection);
 const activeProject=useWorkStore(s=>s.projects.find(p=>p.id===s.activeProjectId));
 const {user}=useCurrentUserState();
 const [canvas,setCanvas]=useState<CanvasMeta|null>(null);
 const [document,setDocument]=useState<CanvasDocument|null>(null);
 const [saved,setSaved]=useState("");
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [conflict,setConflict]=useState(false);
 const [saving,setSaving]=useState(false);
 const [directions,setDirections]=useState<Direction[]>([]);
 const [preparing,setPreparing]=useState(false);
 const [directionError,setDirectionError]=useState("");
 const [run,setRun]=useState<CanvasRun|null>(null);
 const [events,setEvents]=useState<CanvasEvent[]>([]);
 const [connection,setConnection]=useState(true);
 const [selection,setSelection]=useState("");
 const [boardId,setBoardId]=useState("");
 const [zoom,setZoom]=useState(.5);
 const [fitToken,setFitToken]=useState(0);
 const [tool,setTool]=useState<"select"|"pan">("select");
 const [preview,setPreview]=useState(false);
 const [previewWidth,setPreviewWidth]=useState(0);
 const [layers,setLayers]=useState(true);
 const [properties,setProperties]=useState(true);
 const [past,setPast]=useState<CanvasDocument[]>([]);
 const [future,setFuture]=useState<CanvasDocument[]>([]);
 const [showCms,setShowCms]=useState(false);
 const [showLibrary,setShowLibrary]=useState(false);
 const [showSources,setShowSources]=useState(()=>{
  try{return new URL(tab.url||location.href,location.origin).searchParams.get('library')==='sources';}catch{return false;}
 });
 useEffect(()=>{if(openSources)setShowSources(true);},[openSources]);
 const [library,setLibrary]=useState<CanvasMeta[]>([]);
 const [boot,setBoot]=useState(0);
 const [context,setContext]=useState("");
 const [insertOpen,setInsertOpen]=useState(false);
 const [recovery,setRecovery]=useState<CanvasDocument|null>(null);
 const current=useRef({document,canvas,saved});
 current.current={document,canvas,saved};
 const cursor=useRef(0);
 const created=useRef("");
 const executeAbort=useRef<AbortController|null>(null);
 const startRunRef=useRef<(instruction?:string,directionId?:string,attachments?:unknown[],selectionIds?:string[])=>Promise<void>>(async()=>{});
 const dirty=Boolean(document&&JSON.stringify(document)!==saved);
 const busy=Boolean(run&&!terminalRun(run.status));
 const modelRef=useRef(model);modelRef.current=model;
 const busyRef=useRef(busy);busyRef.current=busy;
 const recoveryKey=canvas?"agentsam.canvas.recovery."+canvas.id:"";

 function accept(result:CanvasResponse,reset=true) {
  setCanvas(result.canvas);setDocument(result.document);setSaved(JSON.stringify(result.document));setConflict(false);
  setDirections(result.document.directions?.length===4?result.document.directions:[]);
  if(reset){setPast([]);setFuture([]);}
  setBoardId(id=>result.document.artboards.some(b=>b.id===id)?id:result.document.artboards[0]?.id||"");
 }
 function route(id:string) {
  const next="/admin/canvas?canvas="+encodeURIComponent(id);
  setTabUrl(tab.id,next);
  if(location.pathname==="/admin/canvas")history.replaceState(history.state,"",next);
 }
 useEffect(()=>{
  let active=true;const abort=new AbortController();
  async function open() {
   setLoading(true);setError("");setConflict(false);setEvents([]);cursor.current=0;
   try {
    const fromUrl=idFromUrl(tab.url);
    let id=fromUrl;
    const key="agentsam.canvas.new."+tab.id;
    if(!id) {
     try{id=sessionStorage.getItem(key)||"";}catch{}
     if(!id) {id=makeId("canvas");try{sessionStorage.setItem(key,id);}catch{}}
    }
    const params=new URLSearchParams((tab.url||"").split("?")[1]||location.search);
    const host=params.get("host")||"design";
    const template=params.get("template");
    // A selected stock template is a creative brief, never an installed
    // theme ID or a prerequisite to opening Canvas.
    const brief=[template?"Design an editable "+template.replaceAll("-"," ")+" template":"",activeProject?.name?"Project: "+activeProject.name:""].filter(Boolean).join(" · ");
    const result=await canvasRequest<CanvasResponse>(API+(fromUrl?"/"+encodeURIComponent(id):""),fromUrl?{signal:abort.signal}:{
     method:"POST",body:JSON.stringify({id,document:blankDocument(host,brief)}),signal:abort.signal,
    });
    if(!active)return;
    created.current=id;accept(result);route(id);setContext(result.document.brief||"");
    try {
     const local=sessionStorage.getItem("agentsam.canvas.recovery."+id);
     if(local){const parsed=JSON.parse(local);if(parsed.document&&JSON.stringify(parsed.document)!==JSON.stringify(result.document))setRecovery(parsed.document);}
    }catch{}
   }catch(cause){if(active&&!abort.signal.aborted)setError(message(cause));}
   finally{if(active)setLoading(false);}
  }
  void open();
  return()=>{active=false;abort.abort();};
 // A server-confirmed id replaces the entry URL without creating another document.
 },[tab.id,boot]);
 useEffect(()=>{
  if(!canvas)return;
  const onBeforeUnload=(event:BeforeUnloadEvent)=>{if(current.current.document&&JSON.stringify(current.current.document)!==current.current.saved){event.preventDefault();event.returnValue="";}};
  window.addEventListener("beforeunload",onBeforeUnload);
  return()=>window.removeEventListener("beforeunload",onBeforeUnload);
 },[canvas?.id]);
 useEffect(()=>{
  if(!recoveryKey||!document)return;
  try{if(dirty)sessionStorage.setItem(recoveryKey,JSON.stringify({document,baseHash:canvas?.contentHash}));else sessionStorage.removeItem(recoveryKey);}catch{}
 },[document,dirty,recoveryKey]);
 useEffect(()=>{
  if(!canvas?.id)return;
  let active=true,timeout:ReturnType<typeof setTimeout>;
  const abort=new AbortController();
  async function poll() {
   try {
    const data=await canvasRequest<EventResponse>(API+"/"+encodeURIComponent(canvas!.id)+"/events?after="+cursor.current,{signal:abort.signal});
    if(!active)return;
    setConnection(true);
    if(data.events?.length){
     setEvents(previous=>[...previous,...data.events.filter(event=>!previous.some(p=>p.sequence===event.sequence))].slice(-240));
     cursor.current=data.cursor??Math.max(cursor.current,...data.events.map(event=>event.sequence));
    }
    setRun(data.run||null);
    if(data.canvas?.contentHash&&data.canvas.contentHash!==current.current.canvas?.contentHash) {
     const latest=await canvasRequest<CanvasResponse>(API+"/"+encodeURIComponent(canvas!.id),{signal:abort.signal});
     if(!active)return;
     const local=current.current;
     if(local.document&&JSON.stringify(local.document)!==local.saved)setConflict(true);
     else accept(latest,false);
    }
   }catch(cause){if(active&&!abort.signal.aborted)setConnection(false);}
   finally{if(active)timeout=setTimeout(()=>void poll(),1500);}
  }
  void poll();
  return()=>{active=false;abort.abort();clearTimeout(timeout);};
 },[canvas?.id]);
 async function prepareDirections() {
  if(!canvas||preparing)return;
  if(!model.provider||!model.model_id){setDirectionError("Choose an available model below to prepare your creative directions.");return;}
  setPreparing(true);setDirectionError("");
  try {
   const data=await canvasRequest<{directions:Direction[]}>(API+"/"+encodeURIComponent(canvas.id)+"/directions",{
    method:"POST",body:JSON.stringify({host:document?.host||"design",brief:context,...model}),
   });
   if(!Array.isArray(data.directions)||data.directions.length!==4)throw new Error("AgentSam did not return four complete directions. Try preparing them again.");
   const fresh=await canvasRequest<CanvasResponse>(API+"/"+encodeURIComponent(canvas.id));
   accept(fresh,false);setDirections(data.directions);
  }catch(cause){setDirectionError(message(cause));}
  finally{setPreparing(false);}
 }
 async function save():Promise<CanvasMeta|null> {
  const state=current.current;
  if(!state.canvas||!state.document)return null;
  if(JSON.stringify(state.document)===state.saved)return state.canvas;
  setSaving(true);setError("");
  try {
   const snapshot=state.document;
   const result=await canvasRequest<CanvasResponse>(API+"/"+encodeURIComponent(state.canvas.id),{
    method:"PUT",headers:{"If-Match":'"'+state.canvas.contentHash+'"'},body:JSON.stringify({document:snapshot}),
   });
   setCanvas(result.canvas);setSaved(JSON.stringify(snapshot));setConflict(false);
   return result.canvas;
  }catch(cause){if(cause instanceof CanvasApiError&&cause.status===409)setConflict(true);setError(message(cause));return null;}
  finally{setSaving(false);}
 }
 async function repairForCms():Promise<CanvasMeta|null> {
  const state=current.current;
  if(!state.canvas||!state.document)return null;
  const next=withStarterPages(state.document);
  if(!next)return state.canvas;
  setSaving(true);setError("");
  try {
   const result=await canvasRequest<CanvasResponse>(API+"/"+encodeURIComponent(state.canvas.id),{
    method:"PUT",headers:{"If-Match":'"'+state.canvas.contentHash+'"'},body:JSON.stringify({document:next}),
   });
   setPast(items=>[...items,copy(state.document!)].slice(-80));setFuture([]);
   setCanvas(result.canvas);setDocument(next);setSaved(JSON.stringify(next));setConflict(false);
   setBoardId(id=>next.artboards.some(b=>b.id===id)?id:next.artboards[0]?.id||"");setFitToken(n=>n+1);
   return result.canvas;
  }catch(cause){if(cause instanceof CanvasApiError&&cause.status===409)setConflict(true);setError(message(cause));return null;}
  finally{setSaving(false);}
 }
 async function reload() {
  if(!canvas)return;
  try{accept(await canvasRequest<CanvasResponse>(API+"/"+encodeURIComponent(canvas.id)));setError("");setRecovery(null);}
  catch(cause){setError(message(cause));}
 }
 async function execute(runId:string) {
  if(!canvas)return;
  executeAbort.current?.abort();const abort=new AbortController();executeAbort.current=abort;
  try {
   const response=await fetch(API+"/"+encodeURIComponent(canvas.id)+"/runs/"+encodeURIComponent(runId)+"/execute",{method:"POST",credentials:"same-origin",signal:abort.signal});
   if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.message||data.error||"Generation could not start.");}
   const reader=response.body?.getReader();
   if(reader)while(!(await reader.read()).done){/* Durable events drive the UI. */}
  }catch(cause){if(!abort.signal.aborted)setError(message(cause));}
  finally{if(!abort.signal.aborted){try{const latest=await canvasRequest<{run:CanvasRun}>(API+"/"+encodeURIComponent(canvas.id)+"/runs/"+encodeURIComponent(runId));setRun(latest.run);}catch{}}}
 }
 async function startRun(instruction="",directionId?:string,attachments:unknown[]=[],selectionIds:string[]=(selection?[selection]:[])) {
  if(!canvas)throw new Error("Canvas is not ready.");
  if(busy)throw new Error("A Canvas generation is already running.");
  setError("");
  if(!model.provider||!model.model_id)throw new Error("Select an available model before starting.");
  try {
   const base=await save();
   if(!base)throw new Error("Canvas could not be saved. Resolve the current error and try again.");
   const data=await canvasRequest<{run:CanvasRun}>(API+"/"+encodeURIComponent(canvas.id)+"/runs",{
    method:"POST",body:JSON.stringify({id:makeId("run"),direction_id:directionId,base_revision:base.revision,instruction,selection:selectionIds,attachments,...model}),
   });
   setRun(data.run);void execute(data.run.id);
  }catch(cause){setError(message(cause));throw cause;}
 }
 startRunRef.current=startRun;
 useEffect(()=>{
  const receive=(event:Event)=>{
   const request=(event as CustomEvent<DesignWorkspacePromptRequest>).detail;
   const state=current.current;
   if(!request||!state.canvas||!state.document||request.resourceId!==state.canvas.id)return;
   if(request.revision!==String(state.canvas.revision)){
    request.error="This Canvas changed after the element was selected. Select it again before applying the change.";
    setError(request.error);return;
   }
   const node=locateNode(state.document,request.selectionId)?.node;
   const board=state.document.artboards.find(item=>item.id===request.selectionId);
   const wholeDocument=request.selectionId===state.canvas.id;
   if(!node&&!board&&!wholeDocument){request.error="The selected Canvas element is no longer available. Select it again.";return;}
   if(board&&!board.nodes.length){
    request.error="This artboard is empty. Use the Canvas creation actions first, then annotate an element to make a targeted edit.";
    setError(request.error);return;
   }
   if(busyRef.current){request.error="A Canvas generation is already running. Wait for it to finish before sending another edit.";setError(request.error);return;}
   if(!modelRef.current.provider||!modelRef.current.model_id){request.error="Select an available model before starting.";setError(request.error);return;}
   request.handle=()=>{
    const selectionIds=node?[node.id]:board?[board.id]:[];
    if(node)setSelection(node.id);
    else if(board){setSelection("");setBoardId(board.id);}
    const instruction=board&&!node?request.prompt+"\n\nFocus on the artboard: "+board.name+".":request.prompt;
    return startRunRef.current(instruction,undefined,[],selectionIds);
   };
  };
  window.addEventListener(DESIGN_WORKSPACE_PROMPT_EVENT,receive);
  return()=>window.removeEventListener(DESIGN_WORKSPACE_PROMPT_EVENT,receive);
 },[]);
 function retryRun() {
  if(!run)return;
  const savedSelection=Array.isArray(run.selection)?run.selection.filter((id):id is string=>typeof id==="string"):selection?[selection]:[];
  const directionId=typeof run.direction_id==="string"?run.direction_id:undefined;
  const instruction=directionId?"":String(run.instruction||"Continue the current Canvas from its saved state.");
  void startRun(instruction,directionId,[],savedSelection).catch(()=>{});
 }
 async function cancelRun() {
  if(!canvas||!run)return;
  try{await canvasRequest(API+"/"+encodeURIComponent(canvas.id)+"/runs/"+encodeURIComponent(run.id)+"/cancel",{method:"POST"});executeAbort.current?.abort();setRun({...run,status:"canceled"});}
  catch(cause){setError(message(cause));}
 }
 function change(next:CanvasDocument) {
  if(!document||JSON.stringify(next)===JSON.stringify(document))return;
  setPast(items=>[...items,copy(document)].slice(-80));setFuture([]);setDocument(next);
 }
 function changeNode(id:string,patch:Partial<CanvasNode>){if(document)change(editNode(document,id,patch));}
 function undo(){if(!document||!past.length)return;setFuture(items=>[copy(document),...items]);setDocument(past[past.length-1]);setPast(items=>items.slice(0,-1));}
 function redo(){if(!document||!future.length)return;setPast(items=>[...items,copy(document)]);setDocument(future[0]);setFuture(items=>items.slice(1));}
 function select(id:string,board:string){setSelection(id);setBoardId(board);}
 function importSource({board,html,sourceBase}:ImportedSource) {
  if(!document)return;
  const next=copy(document),bounds=canvasBounds(next.artboards);
  const id=makeId('artboard'),nodeId=makeId('node');
  const width=Math.max(320,Math.min(2560,Number(board.width)||1200));
  const height=Math.max(320,Math.min(2560,Number(board.height)||900));
  next.artboards.push({id,name:board.title.slice(0,160),width,height,
    x:next.artboards.length?bounds.x+bounds.width+80:0,y:0,background:'#ffffff',
    nodes:[{id:nodeId,type:'html',name:board.filename.slice(0,160),x:0,y:0,width,height,sourceHtml:html,sourceBase}],
  });
  next.provenance={...next.provenance, sourceArtboards:[...(Array.isArray(next.provenance.sourceArtboards)?next.provenance.sourceArtboards:[]),
    {id,sourceId:board.id,family:board.family,filename:board.filename,importedAt:new Date().toISOString()}]};
  change(next);setBoardId(id);setSelection(nodeId);setFitToken(value=>value+1);
 }
 function addBoard() {
  if(!document)return;
  const next=copy(document),bounds=canvasBounds(next.artboards),id=makeId("artboard");
  next.artboards.push({id,name:"Page "+(next.artboards.length+1),width:1200,height:900,x:next.artboards.length?bounds.x+bounds.width+80:0,y:0,background:"#ffffff",nodes:[]});
  change(next);setBoardId(id);setSelection("");setFitToken(n=>n+1);
 }
 function insert(type:Exclude<CanvasNode["type"],"html">) {
  if(!document||!boardId)return;
  const node:CanvasNode={id:makeId("node"),type,name:{frame:"Frame",text:"Text",button:"Button",image:"Image",input:"Input",link:"Link"}[type],x:48,y:48,width:type==="frame"?400:type==="image"?320:200,height:type==="frame"?280:type==="image"?220:type==="text"?60:44,
   ...(type==="text"?{text:"Add your text"}:type==="button"?{text:"Button"}:type==="input"?{text:"Enter a value"}:type==="link"?{text:"Link"}:{}),
   style:type==="button"?{backgroundColor:"#22242a",color:"#ffffff",borderRadius:6,fontSize:14}:type==="frame"?{backgroundColor:"#f0f1f3"}:{color:"#24262d",fontSize:20},
  };
  change(insertNode(document,boardId,node));setSelection(node.id);setInsertOpen(false);
 }
 function duplicate() {
  if(!document)return;const found=locateNode(document,selection);if(!found)return;
  const node=cloneNode(found.node);node.x+=24;node.y+=24;change(insertNode(document,found.artboard.id,node));setSelection(node.id);
 }
 function makeComponent() {
  if(!document)return;const found=locateNode(document,selection);if(!found)return;
  const id=makeId("component"),next=editNode(document,selection,{componentId:id});
  next.components.push({id,name:found.node.name,node:copy(found.node)});change(next);
 }
 function insertComponent(id:string) {
  if(!document||!boardId)return;const component=document.components.find(item=>item.id===id);if(!component?.node)return;
  const node=cloneNode(component.node);node.componentId=id;change(insertNode(document,boardId,node));setSelection(node.id);
 }
 useEffect(()=>{
  const handler=(event:KeyboardEvent)=>{
   const target=event.target as HTMLElement;if(target.closest("input,textarea,select,[contenteditable=true]"))return;
   if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="s"){event.preventDefault();void save();}
   else if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="z"){event.preventDefault();event.shiftKey?redo():undo();}
   else if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="d"){event.preventDefault();duplicate();}
   else if(event.key==="Escape"){setSelection("");setPreview(false);setInsertOpen(false);}
   else if(event.key==="v")setTool("select");
   else if(event.key==="h")setTool("pan");
   else if(event.key==="1"){setFitToken(n=>n+1);}
   else if(!preview&&document&&selection&&["Delete","Backspace"].includes(event.key)){event.preventDefault();change(removeNode(document,selection));setSelection("");}
   else if(!preview&&document&&selection&&event.key.startsWith("Arrow")){
    const node=locateNode(document,selection)?.node;if(!node)return;
    const step=event.shiftKey?10:1;event.preventDefault();
    changeNode(selection,{x:node.x+(event.key==="ArrowLeft"?-step:event.key==="ArrowRight"?step:0),y:node.y+(event.key==="ArrowUp"?-step:event.key==="ArrowDown"?step:0)});
   }
  };
  window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler);
 });
 async function showCanvases() {
  setShowLibrary(true);
  try{const data=await canvasRequest<{canvases?:CanvasMeta[];items?:CanvasMeta[]}>(API);setLibrary(data.canvases||data.items||[]);}catch(cause){setError(message(cause));}
 }
 function switchDocument(id:string) {
  if(dirty&&!window.confirm("Leave unsaved changes? A recovery copy will stay in this browser."))return;
  setShowLibrary(false);setRecovery(null);route(id);setTabUrl(tab.id,"/admin/canvas?canvas="+encodeURIComponent(id));setBoot(n=>n+1);
 }
 function newDocument() {
  if(dirty&&!window.confirm("Create another Canvas? Your unsaved changes stay recoverable in this browser."))return;
  try{sessionStorage.removeItem("agentsam.canvas.new."+tab.id);}catch{}
  setTabUrl(tab.id,"");setCanvas(null);setDocument(null);setRecovery(null);setBoot(n=>n+1);
 }
 if(loading)return <WorkspaceOpeningField label="Opening Canvas" />;
 if(!canvas||!document)return <div className="cv-loading"><strong>Canvas couldn't open</strong><p role="alert">{error}</p><button className="cv-primary" onClick={()=>setBoot(n=>n+1)}>Try again</button></div>;
 const selectedNode=locateNode(document,selection)?.node;
 const snapshot:DesignWorkspaceSnapshot={contract:"agentsam.design-workspace.v1",resource:{id:canvas.id,kind:"design",appId:"agentsam-local-studio",title:document.name,href:"/admin/canvas?canvas="+canvas.id,accountId:user?.id||""},capabilities:["create","open","select","inspect","modify","preview","save","undo","redo","generate"],revision:String(canvas.revision),savedRevision:String(canvas.revision),dirty,selection:selection?[{id:selection,kind:selectedNode?.type||"element"}]:boardId?[{id:boardId,kind:"artboard"}]:[],status:"ready",...(busy?{activeRunId:run!.id}:{})};
 const selectedBoard=document.artboards.find(board=>board.id===boardId);
 const askAboutCanvas = () => askAgentSamAboutArtifact({
   kind: 'design', id: canvas.id, title: document.name, chatId: tab.parentChatId,
   ...(selectedNode ? { selection: { id: selectedNode.id, kind: selectedNode.type, label: selectedNode.name } }
     : selectedBoard ? { selection: { id: selectedBoard.id, kind: 'artboard', label: selectedBoard.name } } : {}),
 });
 const commands=<>
   <IconAction className="cv-icon-button" hint="Import source artboards" label="Source artboards" onClick={()=>setShowSources(true)}><FileCode2 size={15}/></IconAction>
   <IconAction className="cv-icon-button" hint="Saved Canvases" label="Saved Canvases" onClick={()=>void showCanvases()}><History size={15}/></IconAction>
   <IconAction className="cv-icon-button" hint="New Canvas" label="New Canvas" onClick={newDocument}><Plus size={15}/></IconAction>
   <span className="cv-command-divider"/>
   <IconAction className="cv-icon-button" hint="Undo (⌘Z)" label="Undo" disabled={!past.length} onClick={undo}><Undo2 size={15}/></IconAction>
   <IconAction className="cv-icon-button" hint="Redo (⇧⌘Z)" label="Redo" disabled={!future.length} onClick={redo}><Redo2 size={15}/></IconAction>
   <IconAction className="cv-icon-button cv-secondary-command" hint="Toggle layers" label="Toggle layers" aria-pressed={layers} onClick={()=>setLayers(v=>!v)}><PanelLeft size={15}/></IconAction>
   <IconAction className="cv-icon-button cv-secondary-command" hint="Toggle properties" label="Toggle properties" aria-pressed={properties} onClick={()=>setProperties(v=>!v)}><Settings2 size={15}/></IconAction>
   <button className={"cv-toolbar-button"+(preview?" active":"")} onClick={()=>{setPreview(v=>!v);setFitToken(n=>n+1);}}>{preview?"Edit":"Preview"}</button>
   <button className="cv-toolbar-button cv-secondary-command" onClick={async()=>{const savedCanvas=await save();if(savedCanvas)setShowCms(true);}}>Use in CMS</button>
   <button className="cv-primary" disabled={!dirty||saving} onClick={()=>void save()}>{saving?"Saving…":dirty?<><Save size={13}/> Save</>:<><Check size={13}/> Saved</>}</button>
 </>;
 return <div className="cv-root" data-agentsam-annotation-scope="">
  <DesignWorkspaceFrame snapshot={snapshot} className="cv-workspace" commands={commands}
   explorer={layers&&!preview?<CanvasLayers document={document} selected={selection} boardId={boardId} onSelect={select} onAdd={addBoard} onComponent={insertComponent}/>:undefined}
   inspector={properties&&!preview?<CanvasInspector document={document} selected={selection} boardId={boardId} onNode={patch=>changeNode(selection,patch)} onBoard={patch=>{const next=copy(document),board=next.artboards.find(b=>b.id===boardId);if(board){Object.assign(board,patch);change(next);}}} onDocument={change} onRemove={()=>{change(removeNode(document,selection));setSelection("");}} onDuplicate={duplicate} onComponent={makeComponent} events={events} run={run} onRetry={retryRun} onCancel={()=>void cancelRun()}/>:undefined}
   status={<div className="cv-status"><span>{connection?"Private Canvas":"Connection lost · retrying"}{conflict?" · remote revision changed":""}</span><span>{document.artboards.length} artboards · Revision {canvas.revision}</span></div>}>
   <CanvasStage document={document} selected={selection} boardId={boardId} preview={preview} width={previewWidth} resourceId={canvas.id} revision={String(canvas.revision)} zoom={zoom} onZoom={setZoom} onSelect={select} onChange={changeNode} fitToken={fitToken} tool={tool}/>
   <div className="cv-stage-toolbar" role="toolbar" aria-label="Canvas tools">
    <IconAction className={tool==="select"?"active":""} label="Select tool" hint="Select (V)" onClick={()=>setTool("select")}><MousePointer2 size={16}/></IconAction>
    <IconAction className={tool==="pan"?"active":""} label="Pan tool" hint="Pan (H)" onClick={()=>setTool("pan")}><Hand size={16}/></IconAction>
    {location.pathname.replace(/\/+$/, "")==="/admin/canvas"&&<AnnotationToggle className="cv-icon-button"/>}
    {!preview&&<><span/><div className="cv-insert-menu"><IconAction label="Insert element" hint="Insert element" disabled={!boardId} onClick={()=>setInsertOpen(v=>!v)}><Plus size={16}/><ChevronDown size={10}/></IconAction>{insertOpen&&<div className="cv-popover">{(["frame","text","button","image","input","link"] as const).map(type=><button key={type} onClick={()=>insert(type)}>{type[0].toUpperCase()+type.slice(1)}</button>)}</div>}</div><IconAction label="Add artboard" hint="Add artboard" onClick={addBoard}><Frame size={16}/></IconAction></>}
    <span/><IconAction label="Zoom out" onClick={()=>setZoom(z=>Math.max(.08,z/1.2))}><ZoomOut size={15}/></IconAction><button className="cv-zoom-value" title="Fit artboards (1)" onClick={()=>setFitToken(n=>n+1)}>{Math.round(zoom*100)}%</button><IconAction label="Zoom in" onClick={()=>setZoom(z=>Math.min(3,z*1.2))}><ZoomIn size={15}/></IconAction>
    {preview&&<select aria-label="Preview width" value={previewWidth} onChange={e=>setPreviewWidth(Number(e.target.value))}><option value={0}>Desktop</option><option value={768}>Tablet · 768</option><option value={390}>Phone · 390</option></select>}
    <AskAgentSamPill contextLabel={selectedNode?.name || document.name} onAsk={askAboutCanvas}/>
   </div>
   {!document.artboards.length&&<div className="cv-invitation"><div className="cv-invitation-heading"><span className="cv-eyebrow">Design Canvas</span><h1>Start with a blank artboard</h1><p>Author directly, import a source artboard, or optionally ask AgentSam to prepare creative directions.</p><div className="cv-entry-actions"><button type="button" className="cv-primary" disabled={busy||preparing} onClick={addBoard}>Create blank artboard</button><button type="button" className="cv-toolbar-button" disabled={busy||preparing} onClick={()=>setShowSources(true)}>Browse source artboards</button></div></div>
    {preparing?<div className="cv-preparing" role="status"><span className="cv-loading-mark"/><p>Preparing four creative directions from your context…</p></div>:directions.length===4?<div className="cv-directions">{directions.map((direction,index)=><button key={direction.id} disabled={busy} onClick={()=>void startRun("",direction.id).catch(()=>{})}><span className="cv-direction-number">0{index+1}</span><h2>{direction.title}</h2><p>{direction.description}</p><span className="cv-direction-go">Explore this direction <ArrowRight size={15}/></span></button>)}</div>:<div className="cv-directions-empty"><p>{directionError||"Optional: prepare creative directions with AgentSam."}</p><ModelSelect compact/><button className="cv-toolbar-button" disabled={preparing} onClick={()=>void prepareDirections()}>Prepare directions</button></div>}
    {directions.length===4&&<details className="cv-context-details"><summary>Add context or explore other directions</summary><textarea aria-label="Creative context" value={context} onChange={e=>setContext(e.target.value)} placeholder="A little about what you have in mind…" rows={2}/><div><ModelSelect compact/><button disabled={preparing||busy} onClick={()=>void prepareDirections()}><RefreshCw size={12}/> Prepare new directions</button></div></details>}
    {directionError&&directions.length===4&&<p role="alert" className="cv-error-text">{directionError}</p>}
   </div>}
   {busy&&<div className="cv-run-status" role="status"><span className="cv-loading-mark"/><span>{events.length?eventLabel(events[events.length-1]):"Starting creation"}</span><IconAction onClick={()=>void cancelRun()} label="Cancel creation"><Square size={12}/></IconAction></div>}
  </DesignWorkspaceFrame>
  {(error||conflict||recovery)&&<div className="cv-alert" role="alert"><div>{recovery?"An unsaved working copy is available from this browser.":conflict?"A newer revision was saved while you were editing. Your changes are still here.":error}</div>
   {recovery&&<><button onClick={()=>{change(recovery);setRecovery(null);}}>Restore changes</button><button onClick={()=>{setRecovery(null);try{sessionStorage.removeItem(recoveryKey);}catch{}}}>Dismiss</button></>}
   {conflict&&<><button onClick={()=>{const blob=new Blob([JSON.stringify(document,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob);const a=window.document.createElement("a");a.href=url;a.download="canvas-recovery.json";a.click();URL.revokeObjectURL(url);}}>Export my changes</button><button onClick={()=>void reload()}>Load saved revision</button></>}
   {!conflict&&!recovery&&<IconAction label="Dismiss error" onClick={()=>setError("")}><X size={14}/></IconAction>}
  </div>}
  {showCms&&<CanvasCmsHandoff canvas={canvas} onRepair={repairForCms} onClose={()=>setShowCms(false)}/>}
  <SourceArtboardLibrary open={showSources} onClose={()=>setShowSources(false)} onImport={importSource}/>
  {showLibrary&&<div className="cv-modal-backdrop"><section className="cv-modal" role="dialog" aria-modal="true" aria-labelledby="canvas-library-title"><header><h2 id="canvas-library-title">Your Canvases</h2><IconAction label="Close saved Canvases" onClick={()=>setShowLibrary(false)}><X size={18}/></IconAction></header><div className="cv-document-list">{library.map(item=><button key={item.id} onClick={()=>switchDocument(item.id)}><Frame size={16}/><span className="sr-only" aria-hidden="true">Open Canvas</span><span><strong>{item.name}</strong><small>Revision {item.revision}</small></span><ArrowRight size={14}/></button>)}{!library.length&&<p>No saved Canvases were returned.</p>}</div></section></div>}
 </div>;
}
function ExistingThemeCanvas({tab}:{tab:SideTab}) {
 const iframe=useRef<HTMLIFrameElement>(null),setTabUrl=useWorkStore(s=>s.setTabUrl);
 useEffect(()=>{
  const handler=(event:MessageEvent)=>{
   if(event.origin!==location.origin||event.source!==iframe.current?.contentWindow||event.data?.type!=="agentsam:cms-canvas:route")return;
   try{const next=new URL(event.data.href,location.origin);const match=next.pathname.match(/^\/admin\/sites\/([A-Za-z0-9_-]{1,160})\/themes\/([A-Za-z0-9_-]{1,160})\/editor(?:\/[A-Za-z0-9_-]{1,160})?$/);if(next.origin===location.origin&&match&&match[1]===event.data.siteId&&match[2]===event.data.projectId)setTabUrl(tab.id,next.pathname+next.search);}catch{}
  };window.addEventListener("message",handler);return()=>window.removeEventListener("message",handler);
 },[tab.id,setTabUrl]);
 return <div className="cv-existing-theme"><header><strong>Website draft</strong><a href={tab.url} target="_blank" rel="noopener noreferrer">Open Theme Editor <ExternalLink size={13}/></a></header><iframe ref={iframe} title="CMS Theme Editor" src={tab.url}/></div>;
}
