import {observeShellAppearance} from '../../../packages/agentsam-settings/src/appearance';
import '../../../packages/agentsam-nav/src/shell.css';
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { createThreeViewport } from "@inneranimalmedia/agentsam-3d-viewer";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { createBooleanGLB, type CadParameters } from "./cad";
import { templateCatalog, findTemplate, getTemplateModel, instanceTemplateModel } from "./templates";
import { findInventoryEntry, modelLabel } from "./model-inventory";
import { icon, iconButton } from "./icons";
import { mountSettingsDrawer } from "./settings-drawer";
import { CAMERA_SHOTS, DEFAULT_SCENE_SETTINGS, DEFAULT_STORYBOARD, FINISHES, MOODS, SCENE_PROFILES, SCENERY_PROPS, TRANSITIONS, type BrushStroke, type CameraShotId, type FinishId, type MoodId, type SceneProfileId, type SceneSettings, type SceneryPropId, type StoryBeat, type TransitionId } from "./samspeaks-controls";
import { mountProgressiveStudio } from "./progressive";
import { mountSketchGallery, type SketchProjectCategory } from "./gallery";
import { listScenes, openScene, createScene, updateScene, removeScene, type SceneSummary } from "./scene-api";
import { mountNativeSceneEditor, type NativeSceneEditorHandle } from "./native-scene-editor";
import type { SceneDocument as NativeSceneDocument } from "../../../packages/iamscene/src/types";
import { resolveSceneHit, exactSelectionRoot } from "./scene-selection";
import { createSamSketchDesignAdapter } from "./design-adapter";
import { installDesignWorkspaceGuest, resolveHostedDesignScope } from "../../../packages/agentsam-contracts/src/design-workspace-bridge";
import "./style.css";
import "./polish.css";
import "./studio-shell.css";
import "./embedded.css";
import "./precision-studio.css";

type Brand="agentsam"|"inneranimalmedia";
type Kind="desktop"|"phone"|"panel"|"orb"|"box"|"ring"|"cad"|"template"|"prop";
type Look="clay"|"glass"|"metal";
type Vec3=[number,number,number];
type PartOverride={position?:Vec3;rotation?:Vec3;scale?:Vec3;color?:string;visible?:boolean};
interface Item { id:string; name:string; kind:Kind; position:Vec3; rotation:Vec3; scale:Vec3; color:string; material:Look; visible:boolean; cadParams?:CadParameters; templateId?:string; partOverrides?:Record<string,PartOverride>; finish?:FinishId; propType?:SceneryPropId; }
interface Document { version:1; name:string; brand:Brand; chapter:number; items:Item[]; sceneSettings?:SceneSettings; storyboard?:StoryBeat[]; brushStrokes?:BrushStroke[]; }
const chapters=[
  ["The experience","Products with presence"],
  ["The composition","Everything is intentional"],
  ["The machinery","Complexity made understandable"],
  ["The ecosystem","Built to work together"]
] as const;
// WIP: hardcoded founding brands only. Preserve presentation bindings; generalize to BrandContract
// (see docs/architecture/brand-presentation-context-discovery-2026-11-01.md). Not app chrome.
const brandInfo={
  agentsam:{name:"AgentSam",accent:"#4268f4",primary:"#293d88",background:"#eef2ff",sub:"Powerful systems. Native experiences."},
  inneranimalmedia:{name:"InnerAnimalMedia",accent:"#31886c",primary:"#182a45",background:"#eaf5f3",sub:"Systematically strategic software."}
};
function makeItem(kind:Kind,name:string,color:string,position:Vec3,scale:Vec3=[1,1,1]):Item{
 const treatment=doc?.sceneSettings?.surfaceTreatment||"clay";
 return {id:crypto.randomUUID(),name,kind,color,position,scale,rotation:[0,0,0],material:treatment,visible:true,finish:treatment==="metal"?doc?.sceneSettings?.finish:undefined};
}
// An empty scene must genuinely be empty. Authored examples are inserted only on request.
function freshDoc(brand:Brand):Document {
 return {version:1,name:"Untitled scene",brand,chapter:0,items:[],sceneSettings:{...DEFAULT_SCENE_SETTINGS},storyboard:structuredClone(DEFAULT_STORYBOARD),brushStrokes:[]};
}
function normalizeDocument(value:Document):Document {
 return {...value,sceneSettings:{...DEFAULT_SCENE_SETTINGS,...(value.sceneSettings||{})},storyboard:Array.isArray(value.storyboard)&&value.storyboard.length?value.storyboard:structuredClone(DEFAULT_STORYBOARD),brushStrokes:Array.isArray(value.brushStrokes)?value.brushStrokes:[]};
}
const storageKey="iam-showcase-studio-draft-v1";
const projectsKey="iam-samsketch-projects-v1";
type SavedSketchProject={id:string;name:string;category:SketchProjectCategory;itemCount:number;updatedAt:string;preview?:string|null;document:Document};
function readSavedProjects():SavedSketchProject[]{
 try{const raw=JSON.parse(localStorage.getItem(projectsKey)||"[]");return Array.isArray(raw)?raw.filter((entry)=>entry?.document?.version===1&&Array.isArray(entry.document.items)):[] }
 catch{return[];}
}
function writeSavedProjects(projects:SavedSketchProject[]){localStorage.setItem(projectsKey,JSON.stringify(projects.slice(0,24)));}
let doc:Document;
try {
 const saved=JSON.parse(localStorage.getItem(storageKey)||"null");
 doc=saved?.version===1 && Array.isArray(saved.items)?normalizeDocument(saved as Document):freshDoc("agentsam");
} catch{doc=freshDoc("agentsam");}
let selectedId=doc.items[0]?.id||"";
let selectedPartId:string|null=null;
let hostedScenes:SceneSummary[]=[];
const activeKey="iam-samsketch-active-scene-id";
const hashKey="iam-samsketch-active-scene-hash";
let activeSceneId=localStorage.getItem(activeKey);
let activeSceneHash=localStorage.getItem(hashKey);
let lastCloudDocument:string|null=null;
let saveTimer:number|null=null,saveInFlight:Promise<void>|null=null,sceneGeneration=0;
let cloudSaveFailed=false;
let restoreInspectorAfterAssistant=false;
let showGrid=doc.sceneSettings?.showGrid??false,wireframe=doc.sceneSettings?.wireframe??false,inspectorOpen=false,layersOpen=false,mode:"orbit"|"select"|"story"="select";
let autoPlay:number|null=null;
let progressive:ReturnType<typeof mountProgressiveStudio>|null=null;
let gallery:ReturnType<typeof mountSketchGallery>|null=null;
let nativeSceneEditor:NativeSceneEditorHandle|null=null;
const history:string[]=[],future:string[]=[];
function snapshot(){history.push(JSON.stringify(doc)); if(history.length>40)history.shift(); future.length=0;}
function store(){
 localStorage.setItem(storageKey,JSON.stringify(doc));
 localStorage.setItem(storageKey+":meta",JSON.stringify({updatedAt:new Date().toISOString(),name:doc.name,brand:doc.brand,itemCount:doc.items.length}));
 scheduleCloudSave();
}
function cloudState(text:string){
 const target=document.getElementById("save-state");
 if(target)target.textContent=text;
}
function forgetCurrentScene(){
 sceneGeneration++;if(saveTimer!==null){clearTimeout(saveTimer);saveTimer=null;}
 activeSceneId=null;activeSceneHash=null;lastCloudDocument=null;cloudSaveFailed=false;
 localStorage.removeItem(activeKey);localStorage.removeItem(hashKey);
 cloudState("Not saved");
}
function scheduleCloudSave(){
 if(!activeSceneId)return;
 cloudSaveFailed=false;
 if(saveTimer!==null)clearTimeout(saveTimer);
 if(JSON.stringify(doc)===lastCloudDocument)return;
 cloudState("Unsaved changes");
 saveTimer=window.setTimeout(()=>{saveTimer=null;void saveToCloud(true);},1200);
}
function sel(){return doc.items.find(x=>x.id===selectedId);}
function esc(s:string){return String(s).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]||ch));}
function num(n:number){return Math.round(n*100)/100;}
function download(blob:Blob,name:string){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}
function announce(t:string){const target=document.getElementById("notice");if(target)target.textContent=t;}
const app=document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML='<div class="app">'+
  '<header class="top"><div class="top-left">'+iconButton("gallery-home","house","Back to SamSketch gallery")+'<span class="studio-app-mark">SamSketch</span><button class="project" id="project-name">Untitled scene</button><span class="studio-save-state" id="save-state" role="status">Draft in browser</span></div>'+
  '<div class="top-right">'+iconButton("layers-toggle","layers","Toggle model library")+iconButton("inspector-toggle","sliders","Toggle properties inspector")+iconButton("undo","undo","Undo")+iconButton("redo","redo","Redo")+iconButton("snapshot","capture","Capture PNG")+iconButton("export-json","export","Export scene JSON")+iconButton("save-project","save","Save scene to account")+iconButton("settings-toggle","sliders","Scene settings")+'</div></header>'+
  '<aside class="left" id="left">'+
  '<div class="library-tabs" role="tablist" aria-label="Scene library"><button type="button" data-library="templates" role="tab">Models</button><button type="button" data-library="objects" role="tab">Objects</button><button type="button" data-library="shapes" role="tab">Shapes</button><button type="button" data-library="icons" role="tab">Icons</button></div>'+
  '<div id="templates-section" class="library-pane"><div class="library-intro"><div><strong>Model inventory</strong><span id="model-inventory-count">Reading source library…</span></div><button class="library-build-button" id="start-build" type="button">'+icon("sparkles",14)+' Let’s build</button></div><div class="build-starter"><strong>Start with a skill</strong><div class="skill-chips"><button type="button" data-build-skill="Sculpt">Sculpt</button><button type="button" data-build-skill="Draft">Draft</button><button type="button" data-build-skill="Model">Model</button><button type="button" data-build-skill="Animate">Animate</button><button type="button" data-build-skill="Vector">Vector</button><button type="button" data-build-skill="Scene">Scene</button></div></div><label class="search-shell">'+icon("search",15)+'<input id="template-search" type="search" placeholder="Search model, part, SKU…" aria-label="Search models and source parts"></label><div class="model-filters" role="group" aria-label="Filter model inventory"><button type="button" data-model-filter="all" class="active">All</button><button type="button" data-model-filter="composition">Compositions</button><button type="button" data-model-filter="source-part">Source parts</button></div><div class="inventory-summary" id="model-inventory-summary"></div><div class="template-catalog" id="template-catalog"></div><p class="library-footnote">Source geometry is read-only. Add an instance to the scene to transform, recolor, hide, duplicate or remove it without altering the source file.</p></div>'+
  '<div id="objects-section" class="library-pane" hidden><div class="section"><div class="section-title">Scene objects <button id="add-panel" aria-label="Add panel">'+icon("plus",14)+'</button></div><div id="layers"></div></div></div>'+
  '<div id="shapes-section" class="library-pane" hidden><div class="section"><div class="section-title">Create shape</div><div id="primitives"></div></div></div><div id="icons-section" class="library-pane" hidden><div class="library-intro"><div><strong>2D iconography</strong><span id="icon-count">85 semantic tools</span></div><button class="library-build-button" id="export-icon-pack" type="button">'+icon("download",14)+' Export SVG</button></div><label class="search-shell">'+icon("search",15)+'<input id="icon-search" type="search" placeholder="Search icon names…" aria-label="Search iconography"></label><div class="icon-library-selection" id="icon-selection">Icon reference · choose a glyph to inspect. Only tools wired into the editor perform modeling actions.</div><div class="icon-library" id="icon-catalog"></div></div></aside>'+
  '<main class="canvas-wrap"><div class="canvas-header"><div class="tag" id="chapter-label">Product World / 01</div><h1 id="stage-title">Products with presence</h1><p id="stage-subtitle">Examine every layer of the experience.</p></div>'+
  '<div class="canvas-tools" role="toolbar" aria-label="Drawing and scene tools"><span class="tool-cluster" data-cluster="Navigate">'+iconButton("mode-select","select","Select exact object or source part (Q)")+iconButton("transform-move","move","Move selected object (W)")+iconButton("transform-rotate","rotate","Rotate selected object (E)")+iconButton("transform-scale","scale","Scale selected object (R)")+iconButton("mode-orbit","orbit","Orbit camera")+iconButton("mode-story","story","Story navigation")+'</span><span class="toolbar-separator" aria-hidden="true"></span><span class="tool-cluster" data-cluster="Canvas">'+iconButton("frame","frame","Frame scene")+iconButton("grid","grid","Toggle grid")+iconButton("wireframe","cube","Toggle wireframe")+'</span></div>'+
  '<div class="canvas-status"><span class="dot"></span><span id="notice">Scene ready</span></div><div class="view-gizmo" role="group" aria-label="Camera orientation and navigation"><div class="view-gizmo-orientation" aria-hidden="true"><svg viewBox="0 0 72 66" width="72" height="66"><path d="M36 5 58 17 36 29 14 17 36 5Z" fill="#eef3ff" stroke="#9aaed4" stroke-width="1.3"/><path d="M14 17v25l22 13V29L14 17Z" fill="#dfe8fa" stroke="#9aaed4" stroke-width="1.3"/><path d="M58 17v25L36 55V29l22-12Z" fill="#c8d8f3" stroke="#9aaed4" stroke-width="1.3"/><path d="M36 29v26" stroke="#9aaed4" stroke-width="1.3"/><circle cx="36" cy="29" r="3" fill="#5277d9"/></svg></div><div class="view-gizmo-copy"><span class="view-gizmo-label">View</span><div class="view-gizmo-presets"><button type="button" data-view="top" aria-pressed="false">Top</button><button type="button" data-view="front" aria-pressed="false">Front</button><button type="button" data-view="right" aria-pressed="false">Right</button><button type="button" data-view="iso" class="is-active" aria-pressed="true">Iso</button></div><div class="view-gizmo-zoom"><button type="button" data-camera-action="zoom-in" aria-label="Zoom in" title="Zoom in">+</button><button type="button" data-camera-action="zoom-out" aria-label="Zoom out" title="Zoom out">−</button><button type="button" data-camera-action="focus" aria-label="Focus selected object" title="Focus selection">Focus</button></div></div></div></main>'+
  '<section class="timeline" id="timeline-dock"><div class="studio-timeline-resize" id="timeline-resize" role="separator" aria-orientation="horizontal" aria-label="Resize scene timeline" tabindex="0"></div><div class="timeline-top"><span class="tag">Story chapters / scroll scenes</span><div class="btn-group"><button class="pill" id="timeline-collapse" type="button" aria-label="Collapse timeline" title="Collapse timeline">'+icon("chevron",13)+'</button><button class="pill" id="stop-story">Stop</button><button class="pill" id="play-story">Play story ▶</button></div></div><div class="timeline-strip" id="chapters"></div></section>'+
  '<aside class="right" id="right"><div class="inspector-heading">Properties</div><div id="inspector"></div></aside></div>';
const appFrame=app.querySelector<HTMLElement>(".app")!;
const topbar=appFrame.querySelector<HTMLElement>(".top")!;
const projectButton=appFrame.querySelector<HTMLButtonElement>("#project-name")!;
projectButton.className="studio-project-chip";
projectButton.title="Rename scene document";
const shell=document.createElement("div");
shell.className="studio-shell";
shell.append(appFrame);
app.replaceChildren(shell);
const settingsHost=document.createElement("div");
settingsHost.id="settings-root";
app.append(settingsHost);
const settingsApi=mountSettingsDrawer(settingsHost);
const bootParams=new URLSearchParams(location.search);
if(bootParams.get("presentation")==="embedded") appFrame.classList.add("is-embedded");
function enterStudio(){gallery?.hide();shell.dataset.ssSurface="studio";announce("Editing · "+doc.name);sendHostMessage("surface",{surface:"studio"});sendHostMessage("selection",{selection:studioContext()});}
function showGallery(){nativeSceneEditor?.dispose();nativeSceneEditor=null;settingsApi.close();gallery?.show();sendHostMessage("surface",{surface:"gallery"});announce("SamSketch gallery");}
function loadDocument(next:Document){
 stopStoryPlayback();stopStoryboardPlayback();
 mode="select";transformMode="off";storyTransition=null;cameraTransition=null;toggleTimeline(true);
 document.querySelectorAll(".canvas-tools .icon-control").forEach(button=>button.classList.remove("active"));
 document.getElementById("mode-select")?.classList.add("active");
 snapshot();
 doc=normalizeDocument(next);
 selectedId=doc.items[0]?.id||"";selectedPartId=null;
 surfaceRoughness=doc.sceneSettings!.roughness;surfaceMetalness=doc.sceneSettings!.metalness;
 sceneAutoRotate=doc.sceneSettings!.autoTour;rotationSpeed=doc.sceneSettings!.spinSpeed*.01;
 fogEnabled=doc.sceneSettings!.fogEnabled;fogDensity=doc.sceneSettings!.fogDensity;
 shadowsEnabled=doc.sceneSettings!.shadowsEnabled;selectionOutlineEnabled=doc.sceneSettings!.selectionOutline;
 wireframe=doc.sceneSettings!.wireframe;showGrid=doc.sceneSettings!.showGrid;grid.visible=showGrid;
 brushEnabled=doc.sceneSettings!.brushEnabled;reducedMotionOverride=doc.sceneSettings!.reducedMotion;
 settingsApi.sync({sceneSettings:doc.sceneSettings,storyboard:doc.storyboard,chapter:doc.chapter});
 history.length=0;future.length=0;
 store();renderAll();applyMood(doc.sceneSettings!.mood,false,false);setBackdrop(doc.sceneSettings!.environment==="studio"?"#202c40":doc.sceneSettings!.environment);
 camera.fov=doc.sceneSettings!.fieldOfView;camera.updateProjectionMatrix();renderer.toneMappingExposure=doc.sceneSettings!.horizonBrightness;
 floor.material.opacity=doc.sceneSettings!.ambientShadowOpacity;light.shadow.radius=doc.sceneSettings!.shadowSoftness;
 ambientLight.color.setHSL(doc.sceneSettings!.ambientHue/360,doc.sceneSettings!.ambientSaturation/100,.72);
 light.position.set(Math.cos(doc.sceneSettings!.keyLightAngle)*11,10,Math.sin(doc.sceneSettings!.keyLightAngle)*11);
 renderer.shadowMap.enabled=shadowsEnabled;light.castShadow=shadowsEnabled;fillLight.castShadow=shadowsEnabled;floor.receiveShadow=shadowsEnabled;
 applyCameraShot(doc.sceneSettings!.cameraShot,"cut",false);
}
function renderScenePreview():string|undefined{
 try{
  const selectedVisible=selectedHelper?.visible;
  const gizmo=transformControls.getHelper(),gizmoVisible=gizmo.visible;
  if(selectedHelper)selectedHelper.visible=false;
  gizmo.visible=false;
  renderer.render(scene,camera);
  if(selectedHelper&&selectedVisible!==undefined)selectedHelper.visible=selectedVisible;
  gizmo.visible=gizmoVisible;
  const c=document.createElement("canvas");c.width=400;c.height=240;
  const g=c.getContext("2d");if(!g)return;
  const gradient=g.createLinearGradient(0,0,400,240);gradient.addColorStop(0,"#eff4fc");gradient.addColorStop(1,"#d9e5f6");
  g.fillStyle=gradient;g.fillRect(0,0,400,240);
  const canvas=renderer.domElement,ratio=Math.min(400/canvas.width,240/canvas.height);
  const w=canvas.width*ratio,h=canvas.height*ratio;
  g.drawImage(canvas,(400-w)/2,(240-h)/2,w,h);
  return c.toDataURL("image/webp",0.72);
 }catch{return undefined;}
}
async function refreshHostedScenes(){
 try{
  const result=await listScenes();hostedScenes=result.scenes;
  gallery?.refresh();
 }catch{
  // Never make offline, browser-only drafts appear to be cloud documents.
  cloudState("Account storage unavailable");
 }
}
async function saveToCloud(withPreview=true):Promise<void>{
 if(saveInFlight){await saveInFlight;return saveToCloud(withPreview);}
 if(!activeSceneId){activeSceneId="sketch_"+crypto.randomUUID();localStorage.setItem(activeKey,activeSceneId);}
 const id=activeSceneId,run=sceneGeneration;
 const snapshot=structuredClone(doc),serialized=JSON.stringify(snapshot);
 if(serialized===lastCloudDocument)return;
 const preview=withPreview?renderScenePreview():undefined;
 cloudState("Saving…");
 const task=(async()=>{
  try{
   const result=activeSceneHash?await updateScene(id,activeSceneHash,snapshot,preview):await createScene(id,snapshot,preview);
   if(run!==sceneGeneration)return;
   activeSceneHash=result.scene.contentHash;
   lastCloudDocument=serialized;cloudSaveFailed=false;
   localStorage.setItem(activeKey,id);localStorage.setItem(hashKey,result.scene.contentHash);
   cloudState("Saved to account");
   sendHostMessage("selection",{selection:studioContext()});
   const index=hostedScenes.findIndex(item=>item.id===id);
   if(index>=0)hostedScenes[index]=result.scene;else hostedScenes.unshift(result.scene);
   gallery?.refresh();
  }catch(error){
   if(run===sceneGeneration){
    const message=error instanceof Error?error.message:String(error);
    cloudSaveFailed=true;
    cloudState(message==="revision_conflict"?"Save conflict":"Saved in this browser only");
    announce("Scene account save failed: "+message+". Your local draft remains available.");
   }
  }
 })();
 saveInFlight=task;
 try{await task;}finally{
  saveInFlight=null;
  if(run===sceneGeneration&&!cloudSaveFailed&&lastCloudDocument!==JSON.stringify(doc))scheduleCloudSave();
 }
}
function saveCurrentToGallery(){
 void saveToCloud(true);
}
function newHostedScene(next:Document){
 forgetCurrentScene();
 loadDocument(next);
 enterStudio();
 void saveToCloud(true);
}
gallery=mountSketchGallery({
 host:shell,
 getActiveDraft:()=>{
  let updatedAt:string|undefined;
  try{updatedAt=JSON.parse(localStorage.getItem(storageKey+":meta")||"null")?.updatedAt;}catch{/* ignore */}
  return {name:doc.name,brand:doc.brand,itemCount:doc.items.length,updatedAt:doc.items.length>0&&!activeSceneHash?updatedAt:undefined};
 },
 listSaved:()=>[
  ...hostedScenes.map(scene=>({id:scene.id,name:scene.name,category:"Scene" as const,itemCount:scene.itemCount,updatedAt:scene.updatedAt,preview:scene.preview})),
  ...readSavedProjects().map(({id,name,category,itemCount,updatedAt,preview})=>({id,name,category,itemCount,updatedAt,preview})),
 ],
 onOpenDraft:()=>{enterStudio();cloudState(activeSceneHash?"Draft in browser · cloud revision known":"Draft in browser");},
 onOpenBlank:()=>newHostedScene(freshDoc(doc.brand)),
 onOpenSaved:(id)=>{
  if(id.startsWith("sketch_")){
   const run=++sceneGeneration;
   if(saveTimer!==null){clearTimeout(saveTimer);saveTimer=null;}
   void openScene(id).then(result=>{
    if(run!==sceneGeneration)return;
    activeSceneId=null;activeSceneHash=null;lastCloudDocument=null;
    localStorage.removeItem(activeKey);localStorage.removeItem(hashKey);
    if((result.document as NativeSceneDocument)?.format==='iamscene'){
     const native=result.document as NativeSceneDocument;
     nativeSceneEditor?.dispose();
     gallery?.hide();
     nativeSceneEditor=mountNativeSceneEditor({
      host:shell,sceneId:result.scene.id,document:native,contentHash:result.scene.contentHash,
      onBack:()=>showGallery(),
      onSaved:()=>{void refreshHostedScenes();gallery?.refresh();},
     });
     sendHostMessage("surface",{surface:"studio"});
     cloudState("Native scene · account owned");
     return;
    }
    loadDocument(result.document as Document);
    activeSceneId=result.scene.id;activeSceneHash=result.scene.contentHash;
    lastCloudDocument=JSON.stringify(doc);
    localStorage.setItem(activeKey,activeSceneId);localStorage.setItem(hashKey,activeSceneHash);
    cloudState("Saved to account");enterStudio();
   }).catch(error=>announce("Cannot open scene: "+String(error)));
   return;
  }
  const saved=readSavedProjects().find(project=>project.id===id);if(!saved)return;
  forgetCurrentScene();loadDocument(structuredClone(saved.document));enterStudio();cloudState("Legacy browser draft · save to account");
 },
 onOpenStarter:(starterId,name)=>{
  forgetCurrentScene();loadDocument(freshDoc(doc.brand));doc.name=name;store();enterStudio();
  addTemplate(starterId);void saveToCloud(true);
 },
 onDeleteSaved:(id)=>{
  if(id.startsWith("sketch_")){
   void removeScene(id).then(()=>{hostedScenes=hostedScenes.filter(scene=>scene.id!==id);gallery?.refresh();if(activeSceneId===id)forgetCurrentScene();})
    .catch(error=>announce("Cannot remove scene: "+String(error)));
  }else{writeSavedProjects(readSavedProjects().filter(project=>project.id!==id));gallery?.refresh();}
 },
});
function studioContext(){
 const item=sel();const part=selectedPartId?item?.partOverrides?.[selectedPartId]:undefined;
 return {id:item?.id||"studio-scene",documentId:activeSceneId,revisionHash:activeSceneHash,label:item?(selectedPartId?item.name+" / "+selectedPartId:item.name+" · "+item.kind):"Entire scene",page:"/samsketch",surface:"samsketch-studio",brand:doc.brand,chapter:doc.chapter,selectedItem:item?{id:item.id,name:selectedPartId||item.name,kind:selectedPartId?"source-part":item.kind,partId:selectedPartId,position:part?.position||item.position,rotation:part?.rotation||item.rotation,scale:part?.scale||item.scale,color:part?.color||item.color}:null};
}
function sendHostMessage(type:string,payload:Record<string,unknown>={}){
 if(window.parent===window)return;
 window.parent.postMessage({channel:"agentsam.samsketch.v1",version:1,type,...payload},window.location.origin);
}
window.addEventListener("message",(event:MessageEvent)=>{
 if(event.origin!==window.location.origin||event.source!==window.parent)return;
 const message=event.data as {channel?:string;version?:number;type?:string;mode?:string;theme?:string;accent?:string;open?:boolean};
 if(message?.channel!=="agentsam.samsketch.v1"||message.version!==1)return;
 if(message.type==="host-mode"&&message.mode==="chat")settingsApi.close();
 if(message.type==="assistant-visibility"){
  if(message.open){
   const inspectorShown=matchMedia("(max-width: 850px)").matches?rightPane.classList.contains("open"):appFrame.dataset.inspectorHidden!=="true";
   if(inspectorShown){restoreInspectorAfterAssistant=true;toggleInspectorPanel();}
  }else if(restoreInspectorAfterAssistant){restoreInspectorAfterAssistant=false;toggleInspectorPanel();}
 }
 if(message.type==='set-theme'&&(message.theme==='light'||message.theme==='dark')) {
  applyWorkspaceTheme(message.theme);
  if(/^#[0-9a-f]{6}$/i.test(message.accent||''))document.documentElement.style.setProperty('--nav-accent',message.accent!);
 }
});
const leftPane=appFrame.querySelector<HTMLElement>("#left")!;
const rightPane=appFrame.querySelector<HTMLElement>("#right")!;
const timelinePane=appFrame.querySelector<HTMLElement>("#timeline-dock")!;
function syncDrawerBounds(){
 const topHeight=topbar.getBoundingClientRect().height||60;
 const bottomHeight=timelinePane.hidden?0:timelinePane.getBoundingClientRect().height;
 document.documentElement.style.setProperty("--studio-drawer-top",topHeight+"px");
 document.documentElement.style.setProperty("--studio-drawer-bottom",bottomHeight+"px");
}
const drawerBoundsObserver=new ResizeObserver(syncDrawerBounds);
drawerBoundsObserver.observe(topbar);drawerBoundsObserver.observe(timelinePane);
window.addEventListener("resize",syncDrawerBounds);syncDrawerBounds();
const leftResize=document.createElement("div");leftResize.className="studio-panel-resize library-resize";leftResize.role="separator";leftResize.tabIndex=0;leftResize.setAttribute("aria-orientation","vertical");leftResize.setAttribute("aria-label","Resize template and object library");appFrame.append(leftResize);
const rightResize=document.createElement("div");rightResize.className="studio-panel-resize inspector-resize";rightResize.role="separator";rightResize.tabIndex=0;rightResize.setAttribute("aria-orientation","vertical");rightResize.setAttribute("aria-label","Resize properties inspector");appFrame.append(rightResize);
function bindColumnResize(handle:HTMLElement,side:"left"|"right",property:"--library-width"|"--inspector-width",min:number,max:number){
 let start:{x:number;width:number}|null=null;
 const readWidth=()=>Number.parseFloat(getComputedStyle(appFrame).getPropertyValue(property))|| (side==="left"?290:310);
 const apply=(width:number)=>{const next=Math.max(min,Math.min(Math.min(max,window.innerWidth*.48),width));appFrame.style.setProperty(property,next+"px");handle.setAttribute("aria-valuenow",String(Math.round(next)));};
 handle.addEventListener("pointerdown",event=>{event.preventDefault();start={x:event.clientX,width:readWidth()};handle.classList.add("is-dragging");handle.setPointerCapture(event.pointerId);document.body.style.userSelect="none";});
 handle.addEventListener("pointermove",event=>{if(!start)return;const delta=event.clientX-start.x;apply(start.width+(side==="left"?delta:-delta));});
 const stop=()=>{start=null;handle.classList.remove("is-dragging");document.body.style.userSelect="";};
 handle.addEventListener("pointerup",stop);handle.addEventListener("pointercancel",stop);
 handle.addEventListener("keydown",event=>{if(event.key!=="ArrowLeft"&&event.key!=="ArrowRight")return;event.preventDefault();const delta=event.key==="ArrowRight"?24:-24;apply(readWidth()+(side==="left"?delta:-delta));});
}
bindColumnResize(leftResize,"left","--library-width",220,440);
bindColumnResize(rightResize,"right","--inspector-width",260,480);
const timelineResize=appFrame.querySelector<HTMLElement>("#timeline-resize")!;
let timelineStart:{y:number;height:number}|null=null,lastTimelineHeight=112;
timelineResize.addEventListener("pointerdown",event=>{event.preventDefault();timelineStart={y:event.clientY,height:timelinePane.getBoundingClientRect().height};lastTimelineHeight=timelineStart.height;timelinePane.dataset.collapsed="false";appFrame.dataset.timelineCollapsed="false";timelineResize.classList.add("is-dragging");timelineResize.setPointerCapture(event.pointerId);document.body.style.userSelect="none";});
timelineResize.addEventListener("pointermove",event=>{if(!timelineStart)return;lastTimelineHeight=Math.max(84,Math.min(Math.min(window.innerHeight*.45,360),timelineStart.height+timelineStart.y-event.clientY));appFrame.style.setProperty("--timeline-height",lastTimelineHeight+"px");});
const stopTimelineResize=()=>{timelineStart=null;timelineResize.classList.remove("is-dragging");document.body.style.userSelect="";};
timelineResize.addEventListener("pointerup",stopTimelineResize);timelineResize.addEventListener("pointercancel",stopTimelineResize);
timelineResize.addEventListener("keydown",event=>{if(event.key==="ArrowUp")lastTimelineHeight=Math.min(Math.min(window.innerHeight*.45,360),lastTimelineHeight+18);else if(event.key==="ArrowDown")lastTimelineHeight=Math.max(84,lastTimelineHeight-18);else return;event.preventDefault();appFrame.style.setProperty("--timeline-height",lastTimelineHeight+"px");});
function toggleTimeline(collapsed?:boolean){
 const next=collapsed===undefined?appFrame.dataset.timelineCollapsed!=="true":collapsed;
 appFrame.dataset.timelineCollapsed=String(next);timelinePane.dataset.collapsed=String(next);
 const button=document.getElementById("timeline-collapse");if(button){button.setAttribute("aria-label",next?"Expand timeline":"Collapse timeline");button.title=next?"Expand timeline":"Collapse timeline";button.innerHTML=icon("chevron",13);}
}
function toggleLibraryPanel(){
 settingsApi.close();
 if(matchMedia("(max-width: 850px)").matches){
  layersOpen=!leftPane.classList.contains("open");leftPane.classList.toggle("open",layersOpen);
  if(layersOpen){rightPane.classList.remove("open");inspectorOpen=false;settingsApi.close();}
 }else{
  const hidden=appFrame.dataset.libraryHidden==="true";appFrame.dataset.libraryHidden=String(!hidden);
 }
 appFrame.querySelector<HTMLButtonElement>("#layers-toggle")?.setAttribute("aria-pressed",String(layersOpen||appFrame.dataset.libraryHidden!=="true"));
}
function toggleInspectorPanel(){
 settingsApi.close();
 if(matchMedia("(max-width: 850px)").matches){
  inspectorOpen=!rightPane.classList.contains("open");rightPane.classList.toggle("open",inspectorOpen);
  if(inspectorOpen){leftPane.classList.remove("open");layersOpen=false;}
 }else{
  const hidden=appFrame.dataset.inspectorHidden==="true";appFrame.dataset.inspectorHidden=String(!hidden);
  inspectorOpen=hidden;
 }
 appFrame.querySelector<HTMLButtonElement>("#inspector-toggle")?.setAttribute("aria-pressed",String(inspectorOpen||appFrame.dataset.inspectorHidden!=="true"));
}
document.getElementById("timeline-collapse")?.addEventListener("click",()=>toggleTimeline());
// Authoring opens on the model, not the story presentation. Timeline remains one click away.
appFrame.dataset.sceneMode="select";
toggleTimeline(true);
document.getElementById("settings-toggle")?.addEventListener("click",()=>{
 if(matchMedia("(max-width: 850px)").matches){leftPane.classList.remove("open");rightPane.classList.remove("open");layersOpen=false;inspectorOpen=false;}
 settingsApi.toggle("scene");
});
const viewport=document.querySelector<HTMLElement>(".canvas-wrap")!;
const sharedViewport=createThreeViewport(viewport,{THREE,OrbitControls},{
 ariaLabel:"SamSketch interactive 3D scene",
 background:"transparent",
 wrapper:false,
 insertCanvasFirst:true,
 minHeight:"0px",
 fov:37,near:.1,far:100,
 maxPixelRatio:2,
 autoRender:false,
 lights:false,
 preserveDrawingBuffer:true,
 shadowMap:{enabled:true,type:THREE.PCFSoftShadowMap},
 toneMapping:THREE.ACESFilmicToneMapping,
 toneMappingExposure:1.55,
 enableDamping:true,dampingFactor:.07,minDistance:4,maxDistance:35,
});
const {renderer,scene,camera,controls}=sharedViewport;
const transformControls=new TransformControls(camera,renderer.domElement);
scene.add(transformControls.getHelper());
let transformMode:"off"|"translate"|"rotate"|"scale"="off";
camera.position.set(11,6.2,13.5);
controls.target.set(0,0,0);
const light=new THREE.DirectionalLight("#ffffff",3.5);light.position.set(-4,10,9);light.castShadow=true;light.shadow.mapSize.set(2048,2048);light.shadow.camera.left=-12;light.shadow.camera.right=12;light.shadow.camera.top=12;light.shadow.camera.bottom=-12;scene.add(light);
const fillLight=new THREE.DirectionalLight("#b1c9ff",1.4);fillLight.position.set(6,4,-5);scene.add(fillLight);
const ambientLight=new THREE.AmbientLight("#e8f1ff",2.1);scene.add(ambientLight);
const stage=new THREE.Group();scene.add(stage);
const brushGroup=new THREE.Group();brushGroup.name="SamSpeaks 3D Brush";scene.add(brushGroup);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({color:"#8190ad",opacity:.13}));floor.rotation.x=-Math.PI/2;floor.position.y=-2.15;floor.receiveShadow=true;scene.add(floor);
const grid=new THREE.GridHelper(18,18,"#9caec9","#dbe3f0");grid.position.y=-2.13;grid.visible=false;scene.add(grid);
let selectedHelper:THREE.BoxHelper|null=null;
const roots=new Map<string,THREE.Object3D>();
let storyProgress=doc.chapter;
let storyTransition:{from:number;to:number;start:number;duration:number}|null=null;
let surfaceRoughness=doc.sceneSettings?.roughness??.82,surfaceMetalness=doc.sceneSettings?.metalness??0,sceneAutoRotate=doc.sceneSettings?.autoTour??false,rotationSpeed=doc.sceneSettings?.spinSpeed??.003;
let fogEnabled=doc.sceneSettings?.fogEnabled??false,fogDensity=doc.sceneSettings?.fogDensity??.012,currentBackdrop="blue",shadowsEnabled=doc.sceneSettings?.shadowsEnabled??true;
let selectionOutlineEnabled=doc.sceneSettings?.selectionOutline??true,reducedMotionOverride=doc.sceneSettings?.reducedMotion??false;
let brushEnabled=doc.sceneSettings?.brushEnabled??false;
let cameraTransition:{fromPosition:THREE.Vector3;toPosition:THREE.Vector3;fromTarget:THREE.Vector3;toTarget:THREE.Vector3;start:number;duration:number}|null=null;
let storyboardTimer:number|null=null,storyboardRun=0;
const hitRay=new THREE.Raycaster(),hitPointer=new THREE.Vector2();
const tempCanvas=document.createElement("canvas");tempCanvas.width=1024;tempCanvas.height=640;

function rounded(width:number,height:number,radius:number,depth:number,color:string,look:Look="clay",finish?:FinishId):THREE.Mesh {
 const w=width/2,h=height/2,r=Math.min(radius,w,h);
 const sh=new THREE.Shape();
 sh.moveTo(-w+r,-h);sh.lineTo(w-r,-h);sh.quadraticCurveTo(w,-h,w,-h+r);sh.lineTo(w,h-r);sh.quadraticCurveTo(w,h,w-r,h);sh.lineTo(-w+r,h);sh.quadraticCurveTo(-w,h,-w,h-r);sh.lineTo(-w,-h+r);sh.quadraticCurveTo(-w,-h,-w+r,-h);
 const geometry=new THREE.ExtrudeGeometry(sh,{depth,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.035,bevelThickness:.035,curveSegments:10});
 geometry.center();
 return new THREE.Mesh(geometry,material(color,look,finish));
}
function material(color:string,look:Look,finish?:FinishId):THREE.MeshStandardMaterial|THREE.MeshPhysicalMaterial {
 const preset=finish?FINISHES.find(item=>item.id===finish):undefined;
 if(preset)return new THREE.MeshPhysicalMaterial({color,roughness:surfaceRoughness,metalness:surfaceMetalness,iridescence:preset.iridescence,iridescenceIOR:1.3,clearcoat:.28,clearcoatRoughness:Math.max(.05,preset.roughness),emissive:preset.emissive,emissiveIntensity:preset.emissiveIntensity,side:THREE.DoubleSide});
 if(look==="glass")return new THREE.MeshPhysicalMaterial({color,roughness:Math.max(.04,surfaceRoughness*.15),metalness:surfaceMetalness*.25,transmission:.6,thickness:.6,transparent:true,opacity:.88,side:THREE.DoubleSide});
 if(look==="metal")return new THREE.MeshStandardMaterial({color,roughness:Math.max(.04,Math.min(.35,surfaceRoughness*.26)),metalness:Math.max(.6,surfaceMetalness)});
 return new THREE.MeshStandardMaterial({color,roughness:surfaceRoughness,metalness:surfaceMetalness*.15});
}
function canvasCard(brand:Brand,mobile=false):THREE.CanvasTexture {
 const c=document.createElement("canvas");c.width=mobile?520:1200;c.height=mobile?900:690;
 const g=c.getContext("2d")!,w=c.width,h=c.height,b=brandInfo[brand];
 g.fillStyle="#f9fbff";g.fillRect(0,0,w,h);
 g.fillStyle=b.primary;g.fillRect(0,0,w,mobile?92:76);
 g.fillStyle="#ffffff";g.font=(mobile?38:27)+"px sans-serif";g.fillText("/A  "+b.name,mobile?30:36,mobile?60:49);
 if(!mobile){g.fillStyle="#f0f3f9";g.fillRect(0,76,225,h-76);g.fillStyle="#354765";g.font="bold 20px sans-serif";["Overview","Projects","Components","Analytics","Settings"].forEach((s,i)=>g.fillText(s,35,135+i*70));}
 const x=mobile?35:267,left=w-x-35;
 g.fillStyle="#1f2940";g.font="bold "+(mobile?34:42)+"px sans-serif";g.fillText(mobile?"Overview":"Design, systems and capability",x,mobile?157:153);
 g.fillStyle="#708098";g.font=(mobile?22:25)+"px sans-serif";g.fillText("Every detail designed to work.",x,mobile?200:200);
 const top=mobile?238:240,gap=mobile?16:22,count=mobile?1:3,cw=(left-gap*(count-1))/count,ch=mobile?134:175;
 for(let i=0;i< (mobile?3:3);i++){
  const px=x+(i%count)*(cw+gap),py=top+Math.floor(i/count)*(ch+gap);
  g.fillStyle="#ffffff";g.shadowColor="#b2c5e0";g.shadowBlur=15;g.shadowOffsetY=8;g.fillRect(px,py,cw,ch);g.shadowBlur=0;g.shadowOffsetY=0;
  g.fillStyle=b.accent;g.fillRect(px+19,py+20,44,6);
  g.fillStyle="#2c3950";g.font=(mobile?19:20)+"px sans-serif";g.fillText(["Component library","Cross-platform UX","Delivery systems"][i],px+19,py+65);
  g.fillStyle="#99adcd";g.fillRect(px+19,py+86,cw-38,8);g.fillStyle="#d8e2f3";g.fillRect(px+19,py+105,(cw-38)*.68,8);
 }
 if(!mobile){g.fillStyle="#edf3ff";g.fillRect(x,455,left,167);g.strokeStyle=b.accent;g.lineWidth=5;g.beginPath();for(let i=0;i<18;i++){const px=x+22+i*(left-44)/17,py=562-45*Math.sin(i*.48)-i*1.3;i?g.lineTo(px,py):g.moveTo(px,py)}g.stroke();}
 const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();return texture;
}
const generatedCad=new Map<string,THREE.Object3D>();
const generatedCadParams=new Map<string,string>();
const cadLoads=new Map<string,Promise<void>>();
const failedCad=new Set<string>();
function ensureCadGeometry(item:Item){
 if(!item.cadParams)return;
 const identity=JSON.stringify(item.cadParams),existing=generatedCadParams.get(item.id);
 if(existing===identity&&generatedCad.has(item.id))return;
 if(cadLoads.has(item.id)||failedCad.has(item.id+identity))return;
 generatedCad.delete(item.id);
 const run=createBooleanGLB(item.cadParams).then(async binary=>{
  const parsed=await new GLTFLoader().parseAsync(binary,"");
  const current=doc.items.find(candidate=>candidate.id===item.id);
  if(!current||JSON.stringify(current.cadParams)!==identity)return;
  generatedCad.set(item.id,parsed.scene);
  generatedCadParams.set(item.id,identity);
  redraw();
  announce("Restored CAD geometry · "+item.name);
 }).catch(error=>{
  failedCad.add(item.id+identity);
  announce("Saved CAD parameters could not regenerate geometry: "+String(error));
 }).finally(()=>cadLoads.delete(item.id));
 cadLoads.set(item.id,run);
}
function buildRoot(item:Item):THREE.Object3D {
 const root=new THREE.Group();root.userData.itemId=item.id;
 let mesh:THREE.Object3D|undefined;
 if(item.kind==="desktop"){
  const rim=rounded(6.4,3.9,.24,.28,item.color,item.material,item.finish);root.add(rim);
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(6.05,3.52),new THREE.MeshBasicMaterial({map:canvasCard(doc.brand),toneMapped:false}));
  screen.position.z=.19;root.add(screen);
  const neck=new THREE.Mesh(new THREE.BoxGeometry(.48,1.0,.28),material("#a9bad3","metal"));neck.position.y=-2.48;root.add(neck);
  const base=rounded(2.9,.33,.1,.15,"#cdd7e6");base.rotation.x=-Math.PI/2;base.position.y=-2.96;root.add(base);
 }else if(item.kind==="phone"){
  const body=rounded(1.57,3.13,.24,.19,item.color,item.material,item.finish);root.add(body);
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(1.39,2.86),new THREE.MeshBasicMaterial({map:canvasCard(doc.brand,true),toneMapped:false}));
  screen.position.z=.14;root.add(screen);
  const cameraDot=new THREE.Mesh(new THREE.CircleGeometry(.065,16),new THREE.MeshBasicMaterial({color:"#273147"}));cameraDot.position.set(0,1.47,.151);root.add(cameraDot);
 }else if(item.kind==="panel"){
  const backing=rounded(2.55,2.05,.22,.11,item.color,item.material,item.finish);root.add(backing);
  for(let i=0;i<4;i++){const pill=rounded(1.9-i*.18,.13,.06,.02,["#ffffff","#c3e7ef","#e6f2ff","#ffd7dc"][i]);pill.position.set(-.14,i*.34-.52,.18+i*.003);root.add(pill);}
  const dot=new THREE.Mesh(new THREE.SphereGeometry(.22,24,16),material("#ffffff","clay"));dot.position.set(-.65,.62,.26);root.add(dot);
 }else if(item.kind==="orb"){
  mesh=new THREE.Mesh(new THREE.SphereGeometry(.85,48,32),material(item.color,item.material,item.finish));
 }else if(item.kind==="box"){
  mesh=rounded(1.65,1.65,.35,1.0,item.color,item.material,item.finish);
 }else if(item.kind==="ring"){
  mesh=new THREE.Mesh(new THREE.TorusGeometry(.87,.18,24,64),material(item.color,item.material,item.finish));mesh.rotation.set(.4,.5,0);
 }else if(item.kind==="prop"){
  const group=new THREE.Group(),finish=item.finish;
  const part=(geometry:THREE.BufferGeometry,color:string,position:Vec3,scale:Vec3=[1,1,1])=>{
   const mesh=new THREE.Mesh(geometry,material(color,item.material,finish));mesh.position.set(...position);mesh.scale.set(...scale);group.add(mesh);return mesh;
  };
  if(item.propType==="pine"){
   part(new THREE.CylinderGeometry(.09,.14,1.15,9),"#76553b",[0,-.1,0]);
   part(new THREE.ConeGeometry(.62,1.25,9),item.color,[0,.45,0]);
   part(new THREE.ConeGeometry(.48,1.05,9),item.color,[0,1.05,0]);
   part(new THREE.ConeGeometry(.34,.82,9),item.color,[0,1.55,0]);
  }else if(item.propType==="boulders"){
   part(new THREE.IcosahedronGeometry(.58,1),item.color,[-.48,0,0],[1.15,.8,1]);
   part(new THREE.IcosahedronGeometry(.48,1),item.color,[.38,-.08,-.12],[1,.76,.9]);
   part(new THREE.IcosahedronGeometry(.32,1),item.color,[.05,.36,.12],[1,.9,.95]);
  }else if(item.propType==="lantern"){
   part(new THREE.CylinderGeometry(.055,.075,1.7,12),"#78644c",[0,.15,0]);
   part(new THREE.CylinderGeometry(.3,.26,.12,16),"#8c704d",[0,-.72,0]);
   part(new THREE.SphereGeometry(.24,24,16),"#f5c77c",[0,.72,0],[.78,1.2,.78]);
   part(new THREE.CylinderGeometry(.32,.32,.09,16),"#8c704d",[0,1.02,0]);
  }else{
   const arch=part(new THREE.TorusGeometry(.88,.1,16,40,Math.PI),item.color,[0,.2,0]);
   arch.rotation.z=Math.PI;
   part(new THREE.CylinderGeometry(.1,.12,1.95,12),item.color,[-.88,-.76,0]);
   part(new THREE.CylinderGeometry(.1,.12,1.95,12),item.color,[.88,-.76,0]);
  }
  mesh=group;
 }else if(item.kind==="template"){
  const key=item.templateId||"";
  const loaded=instanceTemplateModel(key,item.color==="#ffffff"?undefined:item.color,wireframe,item.material,item.finish,surfaceRoughness,surfaceMetalness);
  if(loaded){
   // Every source part remains addressable within its editable scene instance.
   loaded.traverse(node=>{
    if(!(node instanceof THREE.Mesh))return;
    node.userData.partId=node.name;
    const override=item.partOverrides?.[node.name];
    if(!override)return;
    if(override.position)node.position.set(...override.position);
    if(override.rotation)node.rotation.set(...override.rotation.map(v=>v*Math.PI/180) as Vec3);
    if(override.scale)node.scale.set(...override.scale);
    if(override.visible!==undefined)node.visible=override.visible;
    if(override.color && node.material instanceof THREE.MeshStandardMaterial)node.material.color.set(override.color);
   });
   root.add(loaded);
  }
  else if(key)void getTemplateModel(key).then(()=>{redraw();announce("3D source mesh loaded: "+modelLabel(key));}).catch(e=>announce("Template load failed: "+(e instanceof Error?e.message:String(e))));
 }else if(item.kind==="cad"){
  const stored=generatedCad.get(item.id);
  const identity=item.cadParams?JSON.stringify(item.cadParams):"";
  const valid=stored&&generatedCadParams.get(item.id)===identity;
  if(valid){
   mesh=stored.clone(true);
   mesh.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry=o.geometry.clone();o.material=material(item.color,item.material,item.finish);}});
  }else if(item.cadParams){
   // A saved CAD object must never masquerade as a generated solid while restoring.
   ensureCadGeometry(item);
  }else{
   // An ungenerated draft primitive is only an editable starting point.
   mesh=new THREE.Mesh(new THREE.SphereGeometry(.8,42,32),material(item.color,item.material,item.finish));
  }
 }
 if(mesh){mesh.userData.itemId=item.id;root.add(mesh);}
 root.traverse(o=>{o.userData.itemId=item.id;if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;if(o.material instanceof THREE.MeshStandardMaterial){o.material.wireframe=wireframe;}}});
 const pose=poseFor(item,mode==="story"?doc.chapter:0);root.position.set(...pose);root.rotation.set(...item.rotation.map(a=>a*Math.PI/180) as Vec3);root.scale.set(...item.scale);root.visible=item.visible;
 return root;
}
function poseFor(item:Item,chapter:number):Vec3 {
 const [x,y,z]=item.position;
 if(chapter===1)return [x*1.3,y+(item.kind==="panel"?1:0),z*1.1];
 if(chapter===2)return [x*.95,y+(item.kind==="orb"?2:item.kind==="ring"?-.5:0),z*1.5];
 if(chapter===3)return [x*.8,y*.8,z*.7];
 return [x,y,z];
}
function clearStage(){
 stage.traverse(o=>{if(o instanceof THREE.Mesh){if(!o.userData.sharedTemplateGeometry)o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){if(m instanceof THREE.Material){const tex=(m as THREE.MeshBasicMaterial).map;if(tex)tex.dispose();m.dispose();}}}});
 stage.clear();roots.clear();
}
function renderBrushStrokes(){
 brushGroup.traverse(object=>{if(object instanceof THREE.Line){object.geometry.dispose();const material=object.material;if(material instanceof THREE.Material)material.dispose();}});
 brushGroup.clear();
 for(const stroke of doc.brushStrokes||[]){
  if(stroke.points.length<2)continue;
  const geometry=new THREE.BufferGeometry().setFromPoints(stroke.points.map(point=>new THREE.Vector3(...point)));
  const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:stroke.color,linewidth:stroke.width,transparent:true,opacity:.92}));
  line.name="Brush stroke · "+stroke.id;brushGroup.add(line);
 }
}
function redraw(){
 transformControls.detach();
 clearStage();for(const item of doc.items){const root=buildRoot(item);stage.add(root);roots.set(item.id,root);}
 renderBrushStrokes();applyProgress(mode==="story"?storyProgress:0);refreshSelection();store();
}
function selectedSceneObject():THREE.Object3D|null {
 return exactSelectionRoot(roots.get(selectedId)||null,selectedPartId);
}
function refreshSelection(){
 if(selectedHelper){scene.remove(selectedHelper);selectedHelper.dispose();selectedHelper=null;}
 transformControls.detach();
 const target=selectedSceneObject();
 if(target && target.visible){
  if(selectionOutlineEnabled){selectedHelper=new THREE.BoxHelper(target,0x6185ed);scene.add(selectedHelper);}
  if(transformMode!=="off"){transformControls.setMode(transformMode);transformControls.attach(target);}
 }
}
let pressed:Vec3|null=null;
let activeBrushStroke:BrushStroke|null=null;
function brushPointFromEvent(event:PointerEvent):Vec3|null{
 const bounds=renderer.domElement.getBoundingClientRect();
 hitPointer.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);
 hitRay.setFromCamera(hitPointer,camera);
 const point=new THREE.Vector3();
 const plane=new THREE.Plane(new THREE.Vector3(0,1,0),2.05);
 const hit=hitRay.ray.intersectPlane(plane,point);
 return hit?[point.x,point.y,point.z]:null;
}
function finishBrushStroke(){
 if(!activeBrushStroke)return;
 if(activeBrushStroke.points.length>1){doc.brushStrokes=[...(doc.brushStrokes||[]),activeBrushStroke].slice(-500);renderBrushStrokes();store();announce("3D brush stroke saved to this scene.");}
 activeBrushStroke=null;controls.enabled=true;
}
renderer.domElement.addEventListener("pointerdown",e=>{
 if(brushEnabled){
  pressed=null;controls.enabled=false;
  activeBrushStroke={id:crypto.randomUUID(),points:[],color:"#8d7eff",width:3};
  const point=brushPointFromEvent(e);if(point)activeBrushStroke.points.push(point);
  renderer.domElement.setPointerCapture(e.pointerId);return;
 }
 pressed=transformControls.axis?null:[e.clientX,e.clientY,0];
});
renderer.domElement.addEventListener("pointermove",e=>{
 if(!activeBrushStroke)return;
 const point=brushPointFromEvent(e);if(!point)return;
 const previous=activeBrushStroke.points[activeBrushStroke.points.length-1];
 if(!previous||new THREE.Vector3(...previous).distanceTo(new THREE.Vector3(...point))>.045){
  activeBrushStroke.points.push(point);
  const temporary=[...(doc.brushStrokes||[]),activeBrushStroke];const prior=doc.brushStrokes;doc.brushStrokes=temporary;renderBrushStrokes();doc.brushStrokes=prior;
 }
});
renderer.domElement.addEventListener("pointercancel",finishBrushStroke);
renderer.domElement.addEventListener("pointerup",e=>{
 if(activeBrushStroke){const point=brushPointFromEvent(e);if(point)activeBrushStroke.points.push(point);finishBrushStroke();return;}
 if(!pressed||Math.hypot(e.clientX-pressed[0],e.clientY-pressed[1])>6)return;
 if(mode==="story")setManipulationMode("off");
 if(mode!=="select")return;
 sceneAutoRotate=false;
 const bounds=renderer.domElement.getBoundingClientRect();
 hitPointer.set((e.clientX-bounds.left)/bounds.width*2-1,-(e.clientY-bounds.top)/bounds.height*2+1);
 hitRay.setFromCamera(hitPointer,camera);
 const hit=resolveSceneHit(hitRay.intersectObjects(stage.children,true));
 selectedId=hit?.itemId||"";
 selectedPartId=hit?.partId||null;
 refreshSelection();renderInspector();renderLayers();progressive?.refreshContext();
 sendHostMessage("selection",{selection:studioContext()});
});
function frame(){controls.target.set(0,0,0);camera.up.set(0,1,0);camera.position.set(11,6.2,13.5);camera.lookAt(0,0,0);controls.update();}
function setManipulationMode(next:"off"|"translate"|"rotate"|"scale"){
 mode="select";stopStoryPlayback();storyTransition=null;applyProgress(0);controls.enabled=true;
 transformMode=next;appFrame.dataset.sceneMode="select";
 document.querySelectorAll<HTMLButtonElement>("#mode-select,#transform-move,#transform-rotate,#transform-scale,#mode-orbit,#mode-story").forEach(button=>button.classList.remove("active"));
 document.getElementById(next==="off"?"mode-select":next==="translate"?"transform-move":next==="rotate"?"transform-rotate":"transform-scale")?.classList.add("active");
 refreshSelection();
}
function vector3(node:THREE.Vector3):Vec3{return [node.x,node.y,node.z].map(v=>Math.round(v*10000)/10000) as Vec3;}
let transformStarted=false;
transformControls.addEventListener("dragging-changed",event=>{
 controls.enabled=!event.value;
 if(event.value){pressed=null;sceneAutoRotate=false;stopStoryPlayback();storyTransition=null;}
});
transformControls.addEventListener("mouseDown",()=>{snapshot();transformStarted=true;});
transformControls.addEventListener("objectChange",()=>{
 const target=transformControls.object;
 const item=sel();if(!target||!item)return;
 if(selectedPartId){
  const override=item.partOverrides??={};
  const part=override[selectedPartId]??={};
  part.position=vector3(target.position);
  part.rotation=vector3(new THREE.Vector3(THREE.MathUtils.radToDeg(target.rotation.x),THREE.MathUtils.radToDeg(target.rotation.y),THREE.MathUtils.radToDeg(target.rotation.z)));
  part.scale=vector3(target.scale);
 }else{
  item.position=vector3(target.position);
  item.rotation=vector3(new THREE.Vector3(THREE.MathUtils.radToDeg(target.rotation.x),THREE.MathUtils.radToDeg(target.rotation.y),THREE.MathUtils.radToDeg(target.rotation.z)));
  item.scale=vector3(target.scale);
 }
 selectedHelper?.update();
});
transformControls.addEventListener("mouseUp",()=>{
 if(!transformStarted)return;transformStarted=false;
 store();renderInspector();renderLayers();sendHostMessage("selection",{selection:studioContext()});
});
function setCameraView(viewName:string){
 const item=sel();const selectedRoot=item?roots.get(item.id):undefined;
 const target=selectedRoot?new THREE.Box3().setFromObject(selectedRoot).getCenter(new THREE.Vector3()):new THREE.Vector3(0,0,0);
 const distance=Math.max(8,Math.min(35,camera.position.distanceTo(controls.target)));
 const directions:Record<string,Vec3>={iso:[1,.58,1.2],top:[0,1,0],front:[0,.04,1],right:[1,.04,0]};
 const direction=new THREE.Vector3(...(directions[viewName]||directions.iso)).normalize();
 camera.up.set(0,1,0);if(viewName==="top")camera.up.set(0,0,-1);
 controls.target.copy(target);camera.position.copy(target).add(direction.multiplyScalar(distance));camera.lookAt(target);controls.update();
 document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(button=>{const active=button.dataset.view===viewName;button.classList.toggle("is-active",active);button.setAttribute("aria-pressed",String(active));});
}
function focusSelected(){
 const selectedRoot=selectedSceneObject()||undefined;
 if(!selectedRoot){frame();return;}
 selectedRoot.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(selectedRoot),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
 const direction=camera.position.clone().sub(controls.target).normalize();if(direction.lengthSq()<.01)direction.set(1,.65,1);
 const distance=Math.max(8,size.length()*3.2);
 controls.target.copy(center);camera.position.copy(center).add(direction.multiplyScalar(distance));camera.lookAt(center);controls.update();
}
function zoomCamera(factor:number){
 const offset=camera.position.clone().sub(controls.target);const distance=Math.max(3,Math.min(50,offset.length()*factor));
 camera.position.copy(controls.target).add(offset.setLength(distance));controls.update();
}
function applyProgress(progress:number){
 storyProgress=Math.max(0,Math.min(3,progress));const from=Math.floor(storyProgress),to=Math.ceil(storyProgress),blend=storyProgress-from;
 const explode=Math.max(0,Math.min(1,doc.sceneSettings?.explodeAmount??0));
 doc.items.forEach((item,index)=>{
  const object=roots.get(item.id);if(!object)return;
  const a=poseFor(item,from),b=poseFor(item,to);
  const direction=new THREE.Vector3(item.position[0],item.position[1]+.25,item.position[2]);
  if(direction.lengthSq()<.001)direction.set(index%2?1:-1,.25,index%3?1:-1);
  direction.normalize().multiplyScalar(explode*2.2);
  object.position.set(a[0]+(b[0]-a[0])*blend+direction.x,a[1]+(b[1]-a[1])*blend+direction.y,a[2]+(b[2]-a[2])*blend+direction.z);
 });
}
renderer.domElement.addEventListener("wheel",e=>{
 if(mode!=="story")return;e.preventDefault();storyTransition=null;applyProgress(storyProgress+e.deltaY/560);
 const index=Math.round(storyProgress);if(index!==doc.chapter){doc.chapter=index;renderChapters();store();}
},{passive:false});
function animate(){requestAnimationFrame(animate);if(storyTransition){const t=Math.min(1,(performance.now()-storyTransition.start)/storyTransition.duration);const smooth=t*t*(3-2*t);applyProgress(storyTransition.from+(storyTransition.to-storyTransition.from)*smooth);if(t>=1)storyTransition=null;}if(cameraTransition){const t=Math.min(1,(performance.now()-cameraTransition.start)/cameraTransition.duration);const smooth=t*t*(3-2*t);camera.position.lerpVectors(cameraTransition.fromPosition,cameraTransition.toPosition,smooth);controls.target.lerpVectors(cameraTransition.fromTarget,cameraTransition.toTarget,smooth);camera.lookAt(controls.target);if(t>=1)cameraTransition=null;}if(sceneAutoRotate&&!reducedMotionOverride&&!matchMedia("(prefers-reduced-motion: reduce)").matches)stage.rotation.y+=rotationSpeed;controls.update();selectedHelper?.update();renderer.render(scene,camera);}
animate();

function sourceParts(item:Item):string[]{
 if(item.kind!=="template"||!item.templateId)return [];
 if(item.templateId.startsWith("part:"))return [item.templateId.slice(5)];
 return findTemplate(item.templateId)?.parts||[];
}
function renderLayers(){
 const host=document.getElementById("layers")!;
 host.innerHTML=doc.items.map(item=>{
  const active=item.id===selectedId;
  const parts=sourceParts(item);
  const assembly='<div class="layer '+(active&&!selectedPartId?"selected":"")+'" data-select="'+esc(item.id)+'"><span class="layer-icon">'+icon("cube",16)+'</span><span class="layer-name">'+esc(item.name)+'</span>'+(parts.length?'<small class="ss-part-count">'+parts.length+' parts</small>':'')+'<button class="layer-eye" data-visibility="'+esc(item.id)+'" aria-label="Toggle assembly visibility">'+icon(item.visible?"eye":"eyeoff",15)+'</button></div>';
  const partRows=parts.map(part=>{
   const partVisible=item.partOverrides?.[part]?.visible!==false;
   return '<div class="layer ss-part-row '+(active&&selectedPartId===part?"selected":"")+'" data-select="'+esc(item.id)+'" data-part="'+esc(part)+'"><span class="layer-icon">'+icon("cube",13)+'</span><span class="layer-name">'+esc(part)+'</span><button class="layer-eye" data-part-visibility="'+esc(part)+'" data-parent-id="'+esc(item.id)+'" aria-label="Toggle source part visibility">'+icon(partVisible?"eye":"eyeoff",14)+'</button></div>';
  }).join("");
  return '<div class="ss-assembly">'+assembly+partRows+'</div>';
 }).join("")||'<div class="ss-empty-hierarchy">No objects in this scene. Add a model or shape to begin.</div>';
}
function renderPrimitives(){
 const choices:[Kind,string,string][]=[["desktop","Desktop display","Screen + stand"],["phone","Mobile device","Responsive proof"],["panel","Component panel","UI and design tokens"],["orb","Clay sphere","Soft geometry"],["box","Beveled solid","CAD-ready object"],["ring","Connected ring","Spatial symbolism"],["cad","Boolean solid","OpenCascade geometry"]];
 document.getElementById("primitives")!.innerHTML=choices.map(([kind,title,description])=>
 '<button class="preset" data-add="'+kind+'"><span class="preset-icon">'+icon(kind==="desktop"?"panel":kind==="orb"?"orbit":"cube",18)+'</span><span><strong>'+title+'</strong><small>'+description+'</small></span></button>').join('');
}
function renderChapters(){
 document.getElementById("chapters")!.innerHTML=chapters.map(([title,sub],index)=>
 '<button class="chapter '+(doc.chapter===index?'active':'')+'" data-chapter="'+index+'"><span class="tag">0'+(index+1)+' / '+(index===0?'Encounter':index===1?'Unfold':index===2?'Discover':'Experience')+'</span><b>'+title+'</b><small>'+sub+'</small></button>').join('');
 document.getElementById("chapter-label")!.textContent=(doc.brand==="agentsam"?"AgentSam":"InnerAnimalMedia")+" / 0"+(doc.chapter+1);
 document.getElementById("stage-title")!.textContent=chapters[doc.chapter][1];
 document.getElementById("stage-subtitle")!.textContent=brandInfo[doc.brand].sub+" Select a 3D object to inspect and revise it.";
}
function triplet(prop:"position"|"rotation"|"scale",v:Vec3,scope:"object"|"part"="object"){
 const attr=scope==="part"?"part-prop":"prop";
 return '<div class="field"><label>'+prop[0].toUpperCase()+prop.slice(1)+(prop==="rotation"?" (degrees)":"")+'</label><div class="triplet">'+v.map((val,index)=>'<input type="number" step="'+(prop==="rotation"?1:.1)+'" data-'+attr+'="'+prop+'" data-axis="'+index+'" value="'+num(val)+'" aria-label="'+prop+' '+["X","Y","Z"][index]+'"/>').join('')+'</div></div>';
}
function renderInspector(){
 const host=document.getElementById("inspector")!;
 const it=sel();
 if(!it){host.innerHTML='<div class="section"><span class="tag">Scene</span><p>No object selected. Select a mesh or insert an object to edit it.</p></div>';return;}
 if(selectedPartId && it.kind==="template"){
  const part=selectedPartId;
  const override=it.partOverrides?.[part]||{};
  host.innerHTML='<div class="section"><div class="section-title">Source mesh instance</div><strong>'+esc(part)+'</strong><p class="hint">Editing this part in '+esc(it.name)+'. The source STL stays unchanged.</p><button class="pill" id="select-assembly">Select parent assembly</button></div>'+
   '<div class="section"><div class="section-title">Part transform</div>'+
   triplet("position",override.position||[0,0,0],"part")+
   triplet("rotation",override.rotation||[0,0,0],"part")+
   triplet("scale",override.scale||[1,1,1],"part")+
   '<button class="pill" id="reset-part">Reset this part</button><button class="pill" id="focus-object">Focus part</button></div>'+
   '<div class="section"><div class="section-title">Appearance</div><div class="field"><label>Part color</label><input id="part-color" type="color" value="'+esc(override.color||"#ffffff")+'"/></div><label class="toggle-row">Part visible <input id="part-visible" type="checkbox" '+(override.visible!==false?"checked":"")+'/></label></div>';
  return;
 }
 const colors=[brandInfo[doc.brand].accent,"#e9adbe","#88c7cf","#d6e0fa","#a6a8cf","#2d3650"];
 host.innerHTML=
 '<div class="section"><div class="section-title">Selected object <span class="mini-badge">Editable</span></div><div class="field"><label>Object name</label><input id="name" type="text" value="'+esc(it.name)+'"/></div><div class="small">ID · '+esc(it.id.slice(0,13))+'</div><div class="btn-group" style="margin-top:13px"><button class="pill" id="duplicate">Duplicate</button><button class="pill" id="delete">Remove</button></div></div>'+
 '<div class="section"><div class="section-title">Transform · 3D</div>'+triplet("position",it.position)+triplet("rotation",it.rotation)+triplet("scale",it.scale)+'<div class="btn-group"><button class="pill" id="reset-object">Reset transform</button><button class="pill" id="focus-object">Focus</button></div></div>'+
 '<div class="section"><div class="section-title">Material refinement</div><div class="field"><label>Surface</label><select id="material"><option value="clay" '+(it.material==="clay"?"selected":"")+'>Clay / matte</option><option value="glass" '+(it.material==="glass"?"selected":"")+'>Optical glass</option><option value="metal" '+(it.material==="metal"?"selected":"")+'>Machined metal</option></select></div><div class="field"><label>PBR finish</label><select id="finish"><option value="" '+(!it.finish?"selected":"")+'>Custom / none</option>'+FINISHES.map(f=>'<option value="'+f.id+'" '+(it.finish===f.id?"selected":"")+'>'+f.label+'</option>').join("")+'</select></div><div class="field"><label>Color</label><div class="row"><input id="color" type="color" value="'+esc(it.color)+'" style="width:48px;height:33px;border:0;background:none"/><span class="small">'+esc(it.color.toUpperCase())+'</span></div></div><div class="swatches">'+colors.map(c=>'<button aria-label="Use '+c+'" data-color="'+c+'" class="swatch '+(it.color.toLowerCase()===c.toLowerCase()?'active':'')+'" style="background:'+c+'"></button>').join('')+'</div><label class="toggle-row">Visible in scene <input id="visible" type="checkbox" '+(it.visible?"checked":"")+'/></label></div>'+
 (it.kind==="cad"?'<div class="section"><div class="section-title">CAD / geometry authoring</div><p class="help">OpenCascade.js performs actual BRep Boolean operations when you choose Generate. The result is meshed for the Three.js viewer. The marketing renderer does not load the CAD kernel.</p>'+
 '<button class="pill accent" id="generate-cad" style="width:100%;margin:12px 0">Generate Boolean-cut solid</button>'+
 '<div class="field"><label>Sphere radius</label><input id="outer-radius" type="number" min=".1" step=".1" value="'+(it.cadParams?.outerRadius??1.2)+'"/></div>'+
 '<div class="field"><label>Cut radius</label><input id="cut-radius" type="number" min=".1" step=".1" value="'+(it.cadParams?.cutterRadius??.78)+'"/></div>'+
 '<div class="field"><label>Cutter offset (X)</label><input id="cut-x" type="number" step=".1" value="'+(it.cadParams?.cutX??.65)+'"/></div>'+
 '<p class="hint">Change the dimensions and regenerate the selected CAD object. Its parameters are serialized with the scene. This is not a complete BRep feature-history editor.</p></div>':it.kind==="template"?'<div class="section"><div class="section-title">Source-backed model</div><p class="help">'+(it.templateId?.startsWith("part:")?"Single STL source part.":"Authored composition assembled from source meshes.")+' Position, orientation, scale, visibility and presentation materials are editable on this scene instance. The original source file is never modified.</p><p class="hint">Source reference: '+esc(it.templateId||'')+'</p></div>':'')+
 '<div class="section"><div class="section-title">Export & inspect</div><div class="btn-group"><button class="pill" id="export-glb">Export GLB</button><button class="pill" id="import-json">Import JSON</button><button class="pill" id="export-json-inspector">Export JSON</button><button class="pill" id="snapshot-inspector">Capture PNG</button></div><p class="hint">JSON captures the scene document. GLB captures the visible geometric assembly. Both are locally downloaded files. Browser draft storage is not device filesystem storage.</p></div>';
}
function renderBrand(){
 (["agentsam","inneranimalmedia"] as const).forEach(b=>document.getElementById("brand-"+b)?.classList.toggle("active",doc.brand===b));
 document.documentElement.style.setProperty("--accent",brandInfo[doc.brand].accent);
 document.getElementById("project-name")!.textContent=doc.name+" ▾";
}
function renderAll(){renderBrand();renderPrimitives();renderInspector();renderChapters();redraw();renderLayers();progressive?.refreshContext();sendHostMessage("selection",{selection:studioContext()});}
function setBackdrop(preset:string){
 const colors:Record<string,string>={blue:"#e8effb",studio:"#202c40",neutral:"#e9e4dd",slate:"#252d3d",paper:"#f7f4ee",daylight:"#e7eff7",overcast:"#d8dfe8",night:"#242b3a"};
 const color=colors[preset]||preset||colors.blue;currentBackdrop=preset;
 const dark=document.documentElement.dataset.samsketchTheme==="dark";
 viewport.style.background=dark
  ?`radial-gradient(ellipse at 52% 25%,${color} 0%,#1a2230 65%,#131923 100%)`
  :`radial-gradient(ellipse at 52% 25%,${color} 0%,#edf2fc 68%,#dfe8f6 100%)`;
 scene.fog=fogEnabled?new THREE.FogExp2(new THREE.Color(MOODS.find(m=>m.id===doc.sceneSettings?.mood)?.fogColor||color),fogDensity):null;
}
function applyMood(id:MoodId,persist=true,applyDefaults=true){
 const mood=MOODS.find(item=>item.id===id);if(!mood)return;
 if(persist)snapshot();
 const previous={...DEFAULT_SCENE_SETTINGS,...doc.sceneSettings};
 doc.sceneSettings={...previous,mood:id,...(applyDefaults?{keyIntensity:mood.keyIntensity,ambientIntensity:mood.ambientIntensity,fogDensity:mood.fogDensity}:{})};
 light.color.set(mood.keyColor);light.intensity=doc.sceneSettings.keyIntensity;
 fillLight.color.set(mood.fillColor);fillLight.intensity=mood.fillIntensity;
 ambientLight.color.set(mood.ambientColor);ambientLight.intensity=doc.sceneSettings.ambientIntensity;
 renderer.toneMappingExposure=mood.exposure;
 fogDensity=doc.sceneSettings.fogDensity;
 setBackdrop(mood.backdrop);
 if(persist)store();
}
function applyFinish(id:FinishId,persist=true){
 const preset=FINISHES.find(item=>item.id===id);if(!preset)return;
 if(persist)snapshot();
 doc.sceneSettings={...DEFAULT_SCENE_SETTINGS,...doc.sceneSettings,finish:id,roughness:preset.roughness,metalness:preset.metalness,surfaceTreatment:"metal"};
 surfaceRoughness=preset.roughness;surfaceMetalness=preset.metalness;
 const targets=sel()?[sel()!]:doc.items;
 targets.forEach(item=>{item.finish=id;item.material="metal";item.color=preset.swatchHex;});
 redraw();renderInspector();renderLayers();if(persist)store();
}
function applySceneProfile(id:SceneProfileId){
 const profile=SCENE_PROFILES.find(item=>item.id===id);if(!profile)return;
 snapshot();
 doc.sceneSettings={...DEFAULT_SCENE_SETTINGS,...doc.sceneSettings,profile:id,finish:profile.finish,mood:profile.mood};
 applyFinish(profile.finish,false);applyMood(profile.mood,false);store();
 announce("SamSpeaks scene profile · "+profile.label);
}
function applyCameraShot(id:CameraShotId,transition?:TransitionId,persist=true){
 const shot=CAMERA_SHOTS.find(item=>item.id===id);if(!shot)return;
 if(persist){snapshot();doc.sceneSettings={...DEFAULT_SCENE_SETTINGS,...doc.sceneSettings,cameraShot:id,cameraDistance:shot.distance};}
 const selected=selectedSceneObject();
 const target=selected?new THREE.Box3().setFromObject(selected).getCenter(new THREE.Vector3()):new THREE.Vector3(0,0,0);
 const direction=new THREE.Vector3(...shot.direction).normalize();
 const distance=persist?shot.distance:(doc.sceneSettings?.cameraDistance??shot.distance);
 const toPosition=target.clone().add(direction.multiplyScalar(distance));
 const toTarget=target.clone();
 const mode=transition||doc.sceneSettings?.transitionType||"glide";
 const duration=TRANSITIONS.find(item=>item.id===mode)?.duration||0;
 if(duration===0||reducedMotionOverride||matchMedia("(prefers-reduced-motion: reduce)").matches){
  cameraTransition=null;camera.position.copy(toPosition);controls.target.copy(toTarget);camera.lookAt(toTarget);controls.update();
 }else{
  cameraTransition={fromPosition:camera.position.clone(),toPosition,fromTarget:controls.target.clone(),toTarget,start:performance.now(),duration};
 }
 if(persist)store();
}
function speakScript(script:string,voiceName="Kore",voiceStyle=""){
 if(!script.trim())return Promise.resolve();
 if(!("speechSynthesis" in window)||!("SpeechSynthesisUtterance" in window)){
  announce("Narration preview is unavailable in this browser.");return Promise.resolve();
 }
 window.speechSynthesis.cancel();
 const utterance=new SpeechSynthesisUtterance(script.replace(/<[^>]+>/g,"").replace(/\|yeah\||\|mhm\|/g,""));
 const voice=window.speechSynthesis.getVoices().find(item=>item.name.toLowerCase().includes(voiceName.toLowerCase()));
 if(voice)utterance.voice=voice;
 utterance.rate=voiceStyle.toLowerCase().includes("slow") ? 0.88 : 1;
 utterance.pitch=voiceStyle.toLowerCase().includes("bright")?1.08:1;
 return new Promise<void>(resolve=>{
  utterance.onend=()=>resolve();utterance.onerror=()=>resolve();window.speechSynthesis.speak(utterance);
 });
}
function applyStoryboardBeat(beat:StoryBeat){
 applyMood(beat.mood,false);doc.sceneSettings={...DEFAULT_SCENE_SETTINGS,...doc.sceneSettings,explodeAmount:beat.explodeAmount};
 applyProgress(storyProgress);applyCameraShot(beat.cameraShot,beat.transitionType,false);
 announce("SamSpeaks · "+beat.title);
}
function stopStoryboardPlayback(){
 storyboardRun++;if(storyboardTimer!==null){window.clearTimeout(storyboardTimer);storyboardTimer=null;}
 if("speechSynthesis" in window)window.speechSynthesis.cancel();
}
function playStoryboard(){
 stopStoryboardPlayback();const token=++storyboardRun;const beats=doc.storyboard||[];
 if(!beats.length){announce("Add a storyboard beat before playing the flow.");return;}
 let index=0;
 const next=async()=>{
  if(token!==storyboardRun)return;
  const beat=beats[index];if(!beat){stopStoryboardPlayback();announce("SamSpeaks flow complete.");return;}
  applyStoryboardBeat(beat);await speakScript(beat.script,beat.voiceName,beat.voiceStyle);
  if(token!==storyboardRun)return;
  index++;storyboardTimer=window.setTimeout(()=>{void next();},450);
 };
 void next();
}
function applyWorkspaceTheme(theme:"light"|"dark"){
 document.documentElement.dataset.samsketchTheme=theme;
 document.documentElement.classList.add('as-nav-scope');
 document.documentElement.dataset.navTheme=theme;
 setBackdrop(currentBackdrop);
}
function stopStoryPlayback(){if(autoPlay!==null){window.clearInterval(autoPlay);autoPlay=null;}}
function startStoryPlayback(){
 stopStoryPlayback();
 mode="story";appFrame.dataset.sceneMode="story";toggleTimeline(false);
 for(const v of ["select","orbit","story"])document.getElementById("mode-"+v)?.classList.toggle("active",v==="story");
 if(reducedMotionOverride||matchMedia("(prefers-reduced-motion: reduce)").matches){announce("Reduced motion is enabled; select a chapter manually.");return;}
 setChapter(0);
 autoPlay=window.setInterval(()=>{if(doc.chapter>=3){if(doc.sceneSettings?.loopPresentation)setChapter(0);else stopStoryPlayback();return;}setChapter(doc.chapter+1);},2200);
}
function resetStudioSettings(){
 stopStoryPlayback();stopStoryboardPlayback();surfaceRoughness=.82;surfaceMetalness=.08;sceneAutoRotate=false;rotationSpeed=.003;
 fogEnabled=false;fogDensity=.012;currentBackdrop="blue";shadowsEnabled=true;selectionOutlineEnabled=true;reducedMotionOverride=false;brushEnabled=false;
 wireframe=false;showGrid=false;grid.visible=false;renderer.shadowMap.enabled=true;light.castShadow=true;fillLight.castShadow=true;
 light.intensity=2.6;light.color.set("#fff0da");fillLight.intensity=1.35;fillLight.color.set("#409cff");ambientLight.intensity=1.15;ambientLight.color.set("#d0e2ff");
 floor.visible=true;floor.receiveShadow=true;floor.material.opacity=.23;light.shadow.radius=3;renderer.toneMappingExposure=1.12;
 controls.enabled=true;controls.enableRotate=true;controls.enableZoom=true;controls.enablePan=true;cameraTransition=null;
 doc.sceneSettings={...DEFAULT_SCENE_SETTINGS};doc.brushStrokes=[];
 doc.items.forEach(item=>{item.material="clay";item.finish=undefined;});
 applyMood("studio",false);redraw();frame();setBackdrop("#202c40");
 timelinePane.hidden=false;appFrame.dataset.timelineHidden="false";appFrame.dataset.libraryHidden="false";appFrame.dataset.inspectorHidden="false";
 appFrame.style.removeProperty("--library-width");appFrame.style.removeProperty("--inspector-width");appFrame.style.removeProperty("--timeline-height");
 toggleTimeline(false);settingsApi.sync({sceneSettings:doc.sceneSettings,storyboard:doc.storyboard,chapter:doc.chapter});store();
}
function applyStudioSetting(key:string,value:string|number|boolean){
 const settings=doc.sceneSettings={...DEFAULT_SCENE_SETTINGS,...doc.sceneSettings};
 const persist=()=>store();
 switch(key){
  case "scene.chapter":setChapter(Number(value));break;
  case "scene.profile":applySceneProfile(String(value) as SceneProfileId);break;
  case "scene.autoplay":case "simulation.autoplay":settings.loopPresentation=Boolean(value);persist();break;
  case "scene.autorotate":case "camera.autoTour":settings.autoTour=Boolean(value);if(settings.autoTour&&settings.spinSpeed<=0)settings.spinSpeed=DEFAULT_SCENE_SETTINGS.spinSpeed;sceneAutoRotate=settings.autoTour;rotationSpeed=settings.spinSpeed*.01;persist();break;
  case "styles.finish":applyFinish(String(value) as FinishId);break;
  case "styles.mood":applyMood(String(value) as MoodId);break;
  case "styles.material":{
   settings.surfaceTreatment=String(value) as Look;
   const targets=sel()?[sel()!]:doc.items;
   targets.forEach(item=>{item.material=settings.surfaceTreatment;item.finish=undefined;});
   redraw();renderInspector();persist();break;
  }
  case "styles.backdrop":setBackdrop(String(value));persist();break;
  case "styles.roughness":settings.roughness=surfaceRoughness=Number(value);redraw();persist();break;
  case "styles.metalness":settings.metalness=surfaceMetalness=Number(value);redraw();persist();break;
  case "camera.shot":settings.cameraShot=String(value) as CameraShotId;applyCameraShot(settings.cameraShot,settings.transitionType);break;
  case "camera.transition":settings.transitionType=String(value) as TransitionId;persist();break;
  case "camera.distance":{
   settings.cameraDistance=Math.max(4,Math.min(35,Number(value)));
   const offset=camera.position.clone().sub(controls.target).normalize().multiplyScalar(settings.cameraDistance);
   camera.position.copy(controls.target).add(offset);controls.update();persist();break;
  }
  case "camera.fov":settings.fieldOfView=Number(value);camera.fov=settings.fieldOfView;camera.updateProjectionMatrix();persist();break;
  case "camera.orbit":controls.enabled=Boolean(value);controls.enableRotate=Boolean(value);controls.enableZoom=Boolean(value);controls.enablePan=Boolean(value);persist();break;
  case "stage.explode":settings.explodeAmount=Number(value);applyProgress(storyProgress);persist();break;
  case "stage.spin":settings.spinSpeed=Number(value);rotationSpeed=settings.spinSpeed*.01;sceneAutoRotate=settings.spinSpeed>0;settings.autoTour=sceneAutoRotate;persist();break;
  case "stage.lightAngle":case "light.angle":{
   settings.keyLightAngle=Number(value);const radius=11;
   light.position.set(Math.cos(settings.keyLightAngle)*radius,10,Math.sin(settings.keyLightAngle)*radius);persist();break;
  }
  case "stage.brush":settings.brushEnabled=Boolean(value);brushEnabled=settings.brushEnabled;persist();announce(brushEnabled?"3D brush enabled · drag across the stage to draw":"3D brush disabled");break;
  case "light.key":settings.keyIntensity=Number(value);light.intensity=settings.keyIntensity;persist();break;
  case "light.fill":fillLight.intensity=Number(value);persist();break;
  case "light.temperature":{
   const keyColor=value==="warm"?"#ffe1bf":value==="cool"?"#c9ddff":"#ffffff";
   const fillColor=value==="warm"?"#ffcfa0":value==="cool"?"#a8c5ff":"#b1c9ff";
   light.color.set(keyColor);fillLight.color.set(fillColor);ambientLight.color.set(value==="warm"?"#fff0dc":value==="cool"?"#d7e5ff":"#e8f1ff");persist();break;
  }
  case "light.ambientHue":settings.ambientHue=Number(value);ambientLight.color.setHSL(settings.ambientHue/360,settings.ambientSaturation/100,.72);persist();break;
  case "light.ambientSaturation":settings.ambientSaturation=Number(value);ambientLight.color.setHSL(settings.ambientHue/360,settings.ambientSaturation/100,.72);persist();break;
  case "light.ambientFill":settings.ambientIntensity=Number(value);ambientLight.intensity=settings.ambientIntensity;persist();break;
  case "light.shadowSoftness":settings.shadowSoftness=Number(value);light.shadow.radius=settings.shadowSoftness;persist();break;
  case "light.shadows":case "effects.shadows":settings.shadowsEnabled=shadowsEnabled=Boolean(value);renderer.shadowMap.enabled=shadowsEnabled;light.castShadow=shadowsEnabled;fillLight.castShadow=shadowsEnabled;floor.receiveShadow=shadowsEnabled;persist();break;
  case "effects.wireframe":settings.wireframe=wireframe=Boolean(value);redraw();persist();break;
  case "effects.grid":case "sky.horizon":settings.showGrid=showGrid=Boolean(value);grid.visible=showGrid;persist();break;
  case "effects.selection":settings.selectionOutline=selectionOutlineEnabled=Boolean(value);refreshSelection();persist();break;
  case "fog.enabled":settings.fogEnabled=fogEnabled=Boolean(value);setBackdrop(currentBackdrop);persist();break;
  case "fog.density":settings.fogDensity=fogDensity=Number(value);setBackdrop(currentBackdrop);persist();break;
  case "fog.color":setBackdrop(String(value)==="backdrop"?currentBackdrop:String(value));persist();break;
  case "sky.environment":settings.environment=String(value);setBackdrop(String(value)==="studio"?"#202c40":String(value));persist();break;
  case "sky.brightness":settings.horizonBrightness=Number(value);renderer.toneMappingExposure=settings.horizonBrightness;persist();break;
  case "shadows.ambient":settings.ambientShadowOpacity=Number(value);floor.material.opacity=settings.ambientShadowOpacity;persist();break;
  case "shadows.softness":settings.shadowSoftness=Number(value);light.shadow.radius=settings.shadowSoftness;persist();break;
  case "shadows.ground":case "shadows.contact":floor.visible=Boolean(value)&&shadowsEnabled;floor.receiveShadow=Boolean(value)&&shadowsEnabled;persist();break;
  case "global.reducedMotion":settings.reducedMotion=reducedMotionOverride=Boolean(value);if(reducedMotionOverride){stopStoryPlayback();stopStoryboardPlayback();}persist();break;
  case "global.properties":settings.showProperties=Boolean(value);{const inspector=document.getElementById("inspector");if(inspector)inspector.hidden=!settings.showProperties;}persist();break;
  case "global.timeline":settings.keepTimeline=Boolean(value);timelinePane.hidden=!settings.keepTimeline;appFrame.dataset.timelineHidden=String(!settings.keepTimeline);persist();break;
  case "direct.voiceMode":settings.voiceMode=String(value) as "single"|"dual";persist();break;
  case "direct.voiceName":settings.voiceName=String(value) as SceneSettings["voiceName"];persist();break;
  case "direct.voicePreset":settings.voiceStyle=String(value);persist();break;
 }
}
window.addEventListener("samsketch:settings.change",event=>{
 const detail=(event as CustomEvent<{key:string;value:string|number|boolean}>).detail;
 if(detail)applyStudioSetting(detail.key,detail.value);
});
window.addEventListener("samsketch:storyboard.change",event=>{
 const beats=(event as CustomEvent<{beats:StoryBeat[]}>).detail?.beats;
 if(!Array.isArray(beats))return;
 doc.storyboard=beats.slice(0,100);store();
});
window.addEventListener("samsketch:storyboard.preview",event=>{
 const beat=(event as CustomEvent<{beat:StoryBeat}>).detail?.beat;
 if(beat)applyStoryboardBeat(beat);
});
window.addEventListener("samsketch:settings.action",event=>{
 const detail=(event as CustomEvent<{action:string;prompt?:string;script?:string;voiceName?:string;voiceStyle?:string;voiceMode?:string;images?:string[];prop?:string;beat?:StoryBeat}>).detail;
 const action=detail?.action;
 switch(action){
  case "camera.frame":frame();break;
  case "camera.reset":frame();break;
  case "scene.reset":
   stopStoryPlayback();stopStoryboardPlayback();doc.chapter=0;doc.sceneSettings={...DEFAULT_SCENE_SETTINGS};
   surfaceRoughness=doc.sceneSettings.roughness;surfaceMetalness=doc.sceneSettings.metalness;
   sceneAutoRotate=doc.sceneSettings.autoTour;rotationSpeed=doc.sceneSettings.spinSpeed*.01;
   fogEnabled=doc.sceneSettings.fogEnabled;fogDensity=doc.sceneSettings.fogDensity;
   wireframe=doc.sceneSettings.wireframe;showGrid=doc.sceneSettings.showGrid;grid.visible=showGrid;
   shadowsEnabled=doc.sceneSettings.shadowsEnabled;selectionOutlineEnabled=doc.sceneSettings.selectionOutline;
   brushEnabled=doc.sceneSettings.brushEnabled;reducedMotionOverride=doc.sceneSettings.reducedMotion;
   renderer.shadowMap.enabled=shadowsEnabled;light.castShadow=shadowsEnabled;fillLight.castShadow=shadowsEnabled;floor.receiveShadow=shadowsEnabled;
   floor.material.opacity=doc.sceneSettings.ambientShadowOpacity;light.shadow.radius=doc.sceneSettings.shadowSoftness;
   ambientLight.color.setHSL(doc.sceneSettings.ambientHue/360,doc.sceneSettings.ambientSaturation/100,.72);
   light.position.set(Math.cos(doc.sceneSettings.keyLightAngle)*11,10,Math.sin(doc.sceneSettings.keyLightAngle)*11);
   applyMood("studio",false);redraw();frame();store();settingsApi.sync({sceneSettings:doc.sceneSettings,storyboard:doc.storyboard,chapter:doc.chapter});break;
  case "styles.reset":{
   snapshot();surfaceRoughness=.82;surfaceMetalness=.08;doc.sceneSettings={...DEFAULT_SCENE_SETTINGS,surfaceTreatment:"clay",roughness:.82,metalness:.08};
   doc.items.forEach(item=>{item.material="clay";item.finish=undefined;});
   applyMood("studio",false);redraw();store();settingsApi.sync({sceneSettings:doc.sceneSettings,storyboard:doc.storyboard,chapter:doc.chapter});break;
  }
  case "light.reset":
   snapshot();doc.sceneSettings={...DEFAULT_SCENE_SETTINGS,...doc.sceneSettings,keyLightAngle:DEFAULT_SCENE_SETTINGS.keyLightAngle,keyIntensity:DEFAULT_SCENE_SETTINGS.keyIntensity,ambientHue:DEFAULT_SCENE_SETTINGS.ambientHue,ambientSaturation:DEFAULT_SCENE_SETTINGS.ambientSaturation,ambientIntensity:DEFAULT_SCENE_SETTINGS.ambientIntensity,shadowSoftness:DEFAULT_SCENE_SETTINGS.shadowSoftness,fogEnabled:false,fogDensity:DEFAULT_SCENE_SETTINGS.fogDensity};
   fogEnabled=false;fogDensity=doc.sceneSettings.fogDensity;light.position.set(Math.cos(doc.sceneSettings.keyLightAngle)*11,10,Math.sin(doc.sceneSettings.keyLightAngle)*11);
   light.shadow.radius=doc.sceneSettings.shadowSoftness;ambientLight.color.setHSL(doc.sceneSettings.ambientHue/360,doc.sceneSettings.ambientSaturation/100,.72);
   applyMood("studio",false);setBackdrop("studio");store();settingsApi.sync({sceneSettings:doc.sceneSettings});break;
  case "story.add":break;
  case "story.play":playStoryboard();break;
  case "story.stop":stopStoryboardPlayback();announce("SamSpeaks flow stopped.");break;
  case "story.speak":if(detail.beat)void speakScript(detail.beat.script,detail.beat.voiceName,detail.beat.voiceStyle);break;
  case "story.compose":{
   const prompt=(detail.prompt||"").trim();
   if(!prompt){announce("Describe the story you want SamSpeaks to compose.");break;}
   sendHostMessage("assistant.request",{prompt:"Compose a SamSpeaks scene storyboard with clear camera shots, transitions, atmosphere changes and concise narration. "+prompt,skill:"Scene",context:studioContext()});
   announce("Sent the SamSpeaks storyboard brief to AgentSam.");break;
  }
  case "direct.draft":{
   const prompt="Draft a concise SamSpeaks voiceover for the current scene. Voice direction: "+(detail.voiceStyle||"Warm cinematic narrator")+". Mode: "+(detail.voiceMode||"single")+". Existing script: "+(detail.script||"Create a new script.")+". Return the script only.";
   sendHostMessage("assistant.request",{prompt,skill:"Write",context:studioContext()});announce("Voiceover brief sent to AgentSam.");break;
  }
  case "direct.speak":void speakScript(detail.script||"",detail.voiceName||"Kore",detail.voiceStyle||"");break;
  case "direct.stop":if("speechSynthesis" in window)window.speechSynthesis.cancel();break;
  case "inspo.attach":{
   const names=(detail.images||[]).join(", ");
   sendHostMessage("assistant.request",{prompt:"Use these local visual reference filenames as creative direction for the current SamSketch scene: "+names+". Ask me for the images if visual inspection is needed.",skill:"Scene",context:studioContext()});
   announce("Reference notes sent to AgentSam; image files remain local to this browser session.");break;
  }
  case "stage.addProp":addSceneryProp(String(detail.prop) as SceneryPropId);break;
  case "stage.brush":applyStudioSetting("stage.brush",!brushEnabled);settingsApi.sync({sceneSettings:doc.sceneSettings});break;
  case "stage.clearBrush":doc.brushStrokes=[];redraw();store();announce("3D brush strokes cleared.");break;
  case "simulation.play":startStoryPlayback();break;
  case "simulation.pause":stopStoryPlayback();break;
  case "effects.reset":wireframe=false;showGrid=false;grid.visible=false;shadowsEnabled=true;renderer.shadowMap.enabled=true;light.castShadow=true;floor.visible=true;selectionOutlineEnabled=true;doc.sceneSettings={...DEFAULT_SCENE_SETTINGS,...doc.sceneSettings,wireframe:false,showGrid:false,shadowsEnabled:true,selectionOutline:true};redraw();store();settingsApi.sync({sceneSettings:doc.sceneSettings});break;
  case "global.resetLayout":appFrame.style.removeProperty("--library-width");appFrame.style.removeProperty("--inspector-width");appFrame.style.removeProperty("--timeline-height");timelinePane.hidden=false;appFrame.dataset.timelineHidden="false";appFrame.dataset.libraryHidden="false";appFrame.dataset.inspectorHidden="false";toggleTimeline(false);break;
  case "global.reset":resetStudioSettings();break;
 }
});function mutate(fn:()=>void,rerender=true){snapshot();fn();if(rerender)renderAll();else{redraw();renderLayers();}store();}
function setChapter(index:number){if(index<0||index>3)return;const before=storyProgress;doc.chapter=index;renderChapters();settingsApi.sync({chapter:doc.chapter});store();if(matchMedia("(prefers-reduced-motion: reduce)").matches){storyTransition=null;applyProgress(index);}else storyTransition={from:before,to:index,start:performance.now(),duration:750};}
function addTemplate(ref:string){
 const key=ref.startsWith("part:")?"part:"+ref.slice(5):"composition:"+ref;
 const entry=findInventoryEntry(key);if(!entry)return;
 const templateRef=ref.startsWith("part:")?ref:entry.id;
 snapshot();
 const item=makeItem("template",entry.name,"#ffffff",[((doc.items.length%5)-2)*1.15,.15,0]);
 item.templateId=templateRef;doc.items.push(item);selectedId=item.id;selectedPartId=null;
 renderAll();store();
 announce(entry.kind==="source-part"?"Loading source STL instance: "+entry.name:"Loading authored composition: "+entry.name);
 void getTemplateModel(templateRef).then(()=>{redraw();renderLayers();announce("Inserted source-backed model · "+entry.name);}).catch(error=>announce("Model unavailable: "+String(error)));
}
function addItem(kind:Kind){
 const colors:{[key in Kind]:string}={desktop:"#2c3a57",phone:"#477ae5",panel:"#e9adbe",orb:"#86c4dc",box:"#95b4e6",ring:"#91d7cf",cad:"#f0d2ad",template:"#ffffff",prop:"#8a9dd6"};
 mutate(()=>{const i=makeItem(kind,kind==="cad"?"CAD Boolean solid":kind.charAt(0).toUpperCase()+kind.slice(1),colors[kind],[((doc.items.length%4)-1.5)*1.4,.15,(Math.floor(doc.items.length/4)-.5)*1.5]);doc.items.push(i);selectedId=i.id;selectedPartId=null;});
}
function addSceneryProp(type:SceneryPropId){
 const preset=SCENERY_PROPS.find(item=>item.id===type);if(!preset)return;
 snapshot();
 const item=makeItem("prop",preset.label,preset.color,[((doc.items.length%4)-1.5)*1.5,.15,(Math.floor(doc.items.length/4)-.5)*1.5]);
 item.propType=type;doc.items.push(item);selectedId=item.id;selectedPartId=null;
 renderAll();store();announce("Added SamSpeaks scenery prop · "+preset.label);
}
function undo(){if(!history.length)return;future.push(JSON.stringify(doc));doc=normalizeDocument(JSON.parse(history.pop()!) as Document);selectedId=doc.items.find(x=>x.id===selectedId)?.id||doc.items[0]?.id||"";selectedPartId=null;renderAll();settingsApi.sync({sceneSettings:doc.sceneSettings,storyboard:doc.storyboard,chapter:doc.chapter});}
function redo(){if(!future.length)return;history.push(JSON.stringify(doc));doc=JSON.parse(future.pop()!) as Document;selectedId=doc.items[0]?.id||"";selectedPartId=null;renderAll();}
async function exportGLB(){
 announce("Preparing scene GLB...");
 try{const exporter=new GLTFExporter();const brushParent=brushGroup.parent;stage.add(brushGroup);
 let output:ArrayBuffer;
 try{output=await exporter.parseAsync(stage,{binary:true,onlyVisible:true}) as ArrayBuffer;}
 finally{if(brushParent)brushParent.add(brushGroup);else stage.remove(brushGroup);}const bytes=output as ArrayBuffer;download(new Blob([bytes],{type:"model/gltf-binary"}),"iam-showcase-scene.glb");announce("Visible geometry exported as GLB.");}
 catch(e){announce("GLB export failed: "+(e instanceof Error?e.message:String(e)));}
}
async function generateCAD(){
 const button=document.getElementById("generate-cad") as HTMLButtonElement|null;
 if(button)button.disabled=true;
 announce("Initializing OpenCascade.js and generating real BRep geometry...");
 try{
  const val=(id:string,fallback:number)=>{const n=Number((document.getElementById(id) as HTMLInputElement|null)?.value);return Number.isFinite(n)?n:fallback};
  const params:CadParameters={outerRadius:Math.max(.1,val("outer-radius",1.2)),cutterRadius:Math.max(.1,val("cut-radius",.78)),cutX:val("cut-x",.65),cutY:0,cutZ:.2};
  const binary=await createBooleanGLB(params);
  const parsed=await new GLTFLoader().parseAsync(binary,"");
  let target=sel();
  if(!target||target.kind!=="cad"){addItem("cad");target=sel();}
  const item=target!;
  mutate(()=>{item.kind="cad";item.name="OCC Boolean solid";item.material="clay";item.cadParams=structuredClone(params);generatedCad.set(item.id,parsed.scene);generatedCadParams.set(item.id,JSON.stringify(params));});
  announce("OpenCascade Boolean complete · geometry regenerated; source parameters saved in scene manifest.");
 }catch(e){announce("CAD generation error: "+(e instanceof Error?e.message:String(e)));console.error(e);}
 finally{if(button)button.disabled=false;}
}
function exportScene(){const payload={...doc,source:"agentsam-3d-studio",schema:"showcase-document-v1"};download(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),"showcase-"+doc.brand+".json");announce("Scene manifest exported.");}
function importScene(){
 const picker=document.createElement("input");picker.type="file";picker.accept=".json,application/json";
 picker.addEventListener("change",async()=>{const file=picker.files?.[0];if(!file)return;
 try{const data=JSON.parse(await file.text());if(data.version!==1||!Array.isArray(data.items)||!["agentsam","inneranimalmedia"].includes(data.brand))throw Error("Unsupported manifest");
 newHostedScene(data as Document);
 announce("Scene imported as a separate document; source assets remain unchanged.");
 }catch(e){announce("Import failed: "+(e instanceof Error?e.message:String(e)));}});
 picker.click();
}

document.addEventListener("click",e=>{
 const target=e.target as HTMLElement;
 const layer=target.closest<HTMLElement>("[data-select]");
 if(layer&&!target.closest("[data-visibility],[data-part-visibility]")){
  selectedId=layer.dataset.select||"";selectedPartId=layer.dataset.part||null;
  refreshSelection();renderLayers();renderInspector();progressive?.refreshContext();
  sendHostMessage("selection",{selection:studioContext()});return;
 }
 const button=target.closest<HTMLButtonElement>("button");if(!button)return;
 const id=button.id,add=button.dataset.add,chapter=button.dataset.chapter,selection=button.closest<HTMLElement>("[data-select]")?.dataset.select;
 if(add){addItem(add as Kind);announce("Primitive created. Select, transform and refine in the inspector.");return;}
 if(chapter){setChapter(Number(chapter));return;}
 if(button.dataset.partVisibility && button.dataset.parentId){
  e.stopPropagation();const it=doc.items.find(x=>x.id===button.dataset.parentId);
  const part=button.dataset.partVisibility;
  if(it)mutate(()=>{const overrides=it.partOverrides??={};const value=overrides[part]??={};value.visible=value.visible===false;});
  return;
 }
 if(button.dataset.visibility){e.stopPropagation();const it=doc.items.find(x=>x.id===button.dataset.visibility);if(it)mutate(()=>{it.visible=!it.visible});return;}
 if(button.dataset.color){const it=sel();if(it)mutate(()=>{it.color=button.dataset.color!});return;}
 if(selection){selectedId=selection;refreshSelection();renderLayers();renderInspector();return;}
 if(id==="brand-agentsam"||id==="brand-inneranimalmedia"){
  const brand=id==="brand-agentsam"?"agentsam":"inneranimalmedia";
  if(doc.brand!==brand)mutate(()=>{doc.brand=brand;doc.name=brand==="agentsam"?"AgentSam Product World":"InnerAnimalMedia Digital World";doc.items.forEach(i=>{if(i.kind==="desktop")i.color=brandInfo[brand].primary;if(i.kind==="orb")i.color=brandInfo[brand].accent;});});
  return;
 }
 if(id==="select-assembly"){selectedPartId=null;refreshSelection();renderInspector();renderLayers();sendHostMessage("selection",{selection:studioContext()});return;}
 if(id==="reset-part"){const it=sel();if(it&&selectedPartId){const part=selectedPartId;mutate(()=>{if(it.partOverrides)delete it.partOverrides[part];});}return;}
 if(id==="add-panel"){addItem("panel");return;}
 if(id==="duplicate"){const it=sel();if(it)mutate(()=>{selectedPartId=null;const copy=structuredClone(it);copy.id=crypto.randomUUID();copy.name+=" copy";copy.position=[it.position[0]+.6,it.position[1]+.4,it.position[2]+.2];doc.items.push(copy);selectedId=copy.id;});return;}
 if(id==="delete"){const it=sel();if(it)mutate(()=>{selectedPartId=null;doc.items=doc.items.filter(x=>x.id!==it.id);selectedId=doc.items[0]?.id||"";});return;}
 if(id==="reset-object"){const it=sel();if(it)mutate(()=>{it.rotation=[0,0,0];it.scale=[1,1,1];});return;}
 if(id==="focus-object"){focusSelected();return;}
 if(id==="mode-select"){setManipulationMode("off");return;}
 if(id==="transform-move"||id==="transform-rotate"||id==="transform-scale"){setManipulationMode(id==="transform-move"?"translate":id==="transform-rotate"?"rotate":"scale");return;}
 if(id==="mode-orbit"){setManipulationMode("off");mode="orbit";appFrame.dataset.sceneMode=mode;document.getElementById("mode-select")?.classList.remove("active");button.classList.add("active");return;}
 if(id==="mode-story"){stopStoryPlayback();mode="story";transformMode="off";refreshSelection();appFrame.dataset.sceneMode=mode;toggleTimeline(false);document.getElementById("mode-select")?.classList.remove("active");document.getElementById("mode-orbit")?.classList.remove("active");button.classList.add("active");return;}
 if(id==="frame"){frame();return;}
 if(id==="grid"){grid.visible=showGrid=!showGrid;button.classList.toggle("active",showGrid);return;}
 if(id==="wireframe"){wireframe=!wireframe;button.classList.toggle("active",wireframe);redraw();return;}
 if(id==="undo"){undo();return;}if(id==="redo"){redo();return;}
 if(id==="snapshot"){
  renderer.render(scene,camera);
  const base=document.createElement("canvas");base.width=renderer.domElement.width;base.height=renderer.domElement.height;
  const ctx=base.getContext("2d")!;const gradient=ctx.createLinearGradient(0,0,base.width,base.height);gradient.addColorStop(0,"#fbfcff");gradient.addColorStop(1,"#dbe6f5");ctx.fillStyle=gradient;ctx.fillRect(0,0,base.width,base.height);ctx.drawImage(renderer.domElement,0,0);
  base.toBlob(b=>{if(b)download(b,"showcase-"+doc.brand+"-capture.png");},"image/png");announce("Snapshot exported.");return;
 }
 if(id==="export-json"||id==="export-json-inspector"){exportScene();return;}
 if(id==="snapshot-inspector"){document.getElementById("snapshot")?.click();return;}if(id==="export-glb"){void exportGLB();return;}if(id==="import-json"){importScene();return;}
 if(id==="generate-cad"){void generateCAD();return;}
 if(id==="inspector-toggle"){toggleInspectorPanel();return;}
 if(id==="layers-toggle"){toggleLibraryPanel();return;}
 if(id==="gallery-home"){showGallery();return;}
 if(id==="save-project"){saveCurrentToGallery();return;}
 if(id==="play-story"){
  if(autoPlay!==null)window.clearInterval(autoPlay);
  setChapter(0);const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(reduce){announce("Reduced-motion preference active: select chapters manually.");return;}
  autoPlay=window.setInterval(()=>{if(doc.chapter>=3){window.clearInterval(autoPlay!);autoPlay=null;return;}setChapter(doc.chapter+1);},2200);
  announce("Playing chapters · Stop to remain in editor.");return;
 }
 if(id==="stop-story"){if(autoPlay!==null){window.clearInterval(autoPlay);autoPlay=null;}announce("Story playback stopped.");return;}
 if(id==="project-name"){const next=prompt("Presentation title",doc.name);if(next&&next.trim())mutate(()=>{doc.name=next.trim().slice(0,100);});}
});
document.addEventListener("change",e=>{
 const target=e.target as HTMLInputElement;
 const it=sel();if(!it)return;
 if(selectedPartId){
  const part=selectedPartId;
  const prop=target.dataset.partProp as "position"|"rotation"|"scale"|undefined;
  const axis=Number(target.dataset.axis);
  if(prop&&Number.isInteger(axis)&&axis>=0&&axis<=2){
   const value=Number(target.value);if(!Number.isFinite(value))return;
   mutate(()=>{const parts=it.partOverrides??={};const override=parts[part]??={};const tuple=override[prop]??(prop==="scale"?[1,1,1]:[0,0,0]);tuple[axis]=prop==="scale"?Math.max(.05,Math.min(15,value)):Math.max(-999,Math.min(999,value));override[prop]=tuple;});return;
  }
  if(target.id==="part-visible"||target.id==="part-color"){
   mutate(()=>{const parts=it.partOverrides??={};const override=parts[part]??={};
    if(target.id==="part-visible")override.visible=target.checked;
    else override.color=target.value;
   });return;
  }
 }
 if(target.id==="name"){const value=target.value.trim().slice(0,90);if(value)mutate(()=>{it.name=value});return;}
 if(target.id==="material"){mutate(()=>{it.material=target.value as Look;it.finish=undefined;});return;}
 if(target.id==="finish"){
  const value=target.value as FinishId|"";mutate(()=>{it.finish=value||undefined;if(value){const preset=FINISHES.find(item=>item.id===value);if(preset){it.material="metal";it.color=preset.swatchHex;}}});return;
 }
 if(target.id==="color"){mutate(()=>{it.color=target.value});return;}
 if(target.id==="visible"){mutate(()=>{it.visible=target.checked});return;}
 if(target.dataset.prop && target.dataset.axis){
  const property=target.dataset.prop as "position"|"rotation"|"scale",axis=Number(target.dataset.axis) as 0|1|2;
  const value=Number(target.value);if(!Number.isFinite(value))return;
  mutate(()=>{it[property][axis]=property==="scale"?Math.max(.05,Math.min(15,value)):Math.max(-999,Math.min(999,value));});return;
 }
});
document.addEventListener("keydown",e=>{
 const active=document.activeElement as HTMLElement|null;if(active&&["INPUT","TEXTAREA","SELECT"].includes(active.tagName))return;
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="z"){e.preventDefault();e.shiftKey?redo():undo();}
 if(!e.metaKey&&!e.ctrlKey&&!e.altKey&&["q","w","e","r"].includes(e.key.toLowerCase())){
  const modeKey=e.key.toLowerCase();setManipulationMode(modeKey==="q"?"off":modeKey==="w"?"translate":modeKey==="e"?"rotate":"scale");return;
 }
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="d"){e.preventDefault();(document.getElementById("duplicate") as HTMLButtonElement|null)?.click();}
 if(e.key==="Delete"||e.key==="Backspace"){e.preventDefault();(document.getElementById("delete") as HTMLButtonElement|null)?.click();}
 if(e.key==="Escape"&&autoPlay!==null){window.clearInterval(autoPlay);autoPlay=null;}
});
document.getElementById("mode-select")!.classList.add("active");
document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(button=>button.addEventListener("click",()=>setCameraView(button.dataset.view||"iso")));
document.querySelectorAll<HTMLButtonElement>("[data-camera-action]").forEach(button=>button.addEventListener("click",()=>{
 const action=button.dataset.cameraAction;
 if(action==="zoom-in")zoomCamera(.82);
 if(action==="zoom-out")zoomCamera(1.22);
 if(action==="focus")focusSelected();
}));
progressive=mountProgressiveStudio({
 insertTemplate:addTemplate,
 context:()=>sel()?.name||"Entire scene",
 startBuild:(prompt,skill)=>{
  settingsApi.close();
  const context=studioContext();
  sendHostMessage("assistant.request",{prompt,skill,context});
  announce("Sent to AgentSam with the current scene context.");
 },
 localAction:input=>{
  const query=input.trim().toLowerCase();
  const match=query.match(/^(?:\/add|add)\s+([a-z0-9 -]+)$/);
  if(match){const entry=templateCatalog.find(t=>t.id===match[1].trim().replaceAll(" ","-")||t.name.toLowerCase()===match[1].trim());
   if(entry){addTemplate(entry.id);return "Local prototype action: added "+entry.name+" using source mesh geometry. This was not an AI-generated edit.";}}
  if(query==="frame scene"||query==="/frame"){frame();return "Local prototype action: framed the current scene.";}
  return null;
 }
});
const designAdapter=createSamSketchDesignAdapter({
 document:()=>doc,id:()=>activeSceneId,savedHash:()=>activeSceneHash,
 selection:()=>selectedId?[selectedPartId?{id:selectedPartId,kind:"source-part",parentId:selectedId}:{id:selectedId,kind:sel()?.kind||"object"}]:[],
 parts:id=>{const item=doc.items.find(row=>row.id===id);return item?sourceParts(item):[];},
 load:(id,hash,value)=>{
  forgetCurrentScene();loadDocument(value as Document);
  activeSceneId=id;activeSceneHash=hash;lastCloudDocument=JSON.stringify(doc);
  localStorage.setItem(activeKey,id);localStorage.setItem(hashKey,hash);
  cloudState("Saved to account");enterStudio();
 },
 select:targets=>{
  if(targets.length>1)throw new Error("design_exact_selection_required");
  const target=targets[0];selectedId=target?.parentId||target?.id||"";selectedPartId=target?.parentId?target.id:null;
  refreshSelection();renderInspector();renderLayers();sendHostMessage("selection",{selection:studioContext()});
 },
 modify:(id,partId,patch)=>mutate(()=>{
  const item=doc.items.find(row=>row.id===id)!;
  if(partId){item.partOverrides??={};item.partOverrides[partId]={...item.partOverrides[partId],...patch};}
  else Object.assign(item,patch);
 }),
 undo,redo,
 save:async()=>{await saveToCloud(true);if(cloudSaveFailed||JSON.stringify(doc)!==lastCloudDocument)throw new Error("design_save_not_confirmed");},
});
installDesignWorkspaceGuest({adapter:designAdapter,resolveScope:resolveHostedDesignScope,currentResourceId:()=>activeSceneId});
const requestedDocument=bootParams.get("document");
if(requestedDocument&&/^sketch_[a-z0-9-]{12,80}$/.test(requestedDocument)){
 void resolveHostedDesignScope().then(scope=>designAdapter.open(scope,requestedDocument)).catch(error=>announce("Cannot open scene: "+String(error)));
}
renderAll();
settingsApi.sync({sceneSettings:doc.sceneSettings,storyboard:doc.storyboard,chapter:doc.chapter});
applyMood(doc.sceneSettings!.mood,false,false);setBackdrop(doc.sceneSettings!.environment==="studio"?"#202c40":doc.sceneSettings!.environment);
camera.fov=doc.sceneSettings!.fieldOfView;camera.updateProjectionMatrix();renderer.toneMappingExposure=doc.sceneSettings!.horizonBrightness;
floor.material.opacity=doc.sceneSettings!.ambientShadowOpacity;light.shadow.radius=doc.sceneSettings!.shadowSoftness;
ambientLight.color.setHSL(doc.sceneSettings!.ambientHue/360,doc.sceneSettings!.ambientSaturation/100,.72);
light.position.set(Math.cos(doc.sceneSettings!.keyLightAngle)*11,10,Math.sin(doc.sceneSettings!.keyLightAngle)*11);
renderer.shadowMap.enabled=shadowsEnabled;light.castShadow=shadowsEnabled;fillLight.castShadow=shadowsEnabled;floor.receiveShadow=shadowsEnabled;grid.visible=showGrid;
applyCameraShot(doc.sceneSettings!.cameraShot,"cut",false);
const preferWorkspace=bootParams.get("workspace")==="1"||bootParams.get("surface")==="studio";
if(preferWorkspace){enterStudio();announce("SamSketch ready · 20 compositions · 47 source parts · CAD kernel on demand");}
else{showGallery();announce("SamSketch gallery · open a canvas to begin");}
void refreshHostedScenes();
sendHostMessage("ready",{context:studioContext(),surface:gallery?.isVisible()?"gallery":"studio"});

observeShellAppearance(({theme,accent})=>{applyWorkspaceTheme(theme);document.documentElement.style.setProperty('--nav-accent',accent);});
