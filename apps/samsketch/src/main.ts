import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { createBooleanGLB, type CadParameters } from "./cad";
import { templateCatalog, findTemplate, getTemplateModel, instanceTemplateModel } from "./templates";
import { findInventoryEntry, modelLabel } from "./model-inventory";
import { icon, iconButton } from "./icons";
import { mountSettingsDrawer } from "./settings-drawer";
import { mountProgressiveStudio } from "./progressive";
import "./style.css";
import "./polish.css";
import "./studio-shell.css";
import "./embedded.css";

type Brand="agentsam"|"inneranimalmedia";
type Kind="desktop"|"phone"|"panel"|"orb"|"box"|"ring"|"cad"|"template";
type Look="clay"|"glass"|"metal";
type Vec3=[number,number,number];
interface Item { id:string; name:string; kind:Kind; position:Vec3; rotation:Vec3; scale:Vec3; color:string; material:Look; visible:boolean; cadParams?:CadParameters; templateId?:string; }
interface Document { version:1; name:string; brand:Brand; chapter:number; items:Item[]; }
const chapters=[
  ["The experience","Products with presence"],
  ["The composition","Everything is intentional"],
  ["The machinery","Complexity made understandable"],
  ["The ecosystem","Built to work together"]
] as const;
const brandInfo={
  agentsam:{name:"AgentSam",accent:"#4268f4",primary:"#293d88",background:"#eef2ff",sub:"Powerful systems. Native experiences."},
  inneranimalmedia:{name:"InnerAnimalMedia",accent:"#31886c",primary:"#182a45",background:"#eaf5f3",sub:"Systematically strategic software."}
};
function makeItem(kind:Kind,name:string,color:string,position:Vec3,scale:Vec3=[1,1,1]):Item{
 return {id:crypto.randomUUID(),name,kind,color,position,scale,rotation:[0,0,0],material:"clay",visible:true};
}
function freshDoc(brand:Brand):Document {
 const a=brandInfo[brand];
 return {version:1,name:brand==="agentsam"?"AgentSam Product World":"InnerAnimalMedia Digital World",brand,chapter:0,items:[
   makeItem("desktop","Desktop application",a.primary,[0,.1,0],[1,1,1]),
   makeItem("phone","Responsive mobile",a.accent,[-3,-.2,2],[.94,.94,.94]),
   makeItem("panel","Component library","#e9adbe",[3,1,-1.6],[1,1,1]),
   makeItem("orb","Infrastructure",a.accent,[2.9,-1,1.8],[.78,.78,.78]),
   makeItem("ring","Connected systems","#8ccfc4",[-3.3,1,-1.3],[.8,.8,.8])
 ]};
}
const storageKey="iam-showcase-studio-draft-v1";
let doc:Document;
try {
 const saved=JSON.parse(localStorage.getItem(storageKey)||"null");
 doc=saved?.version===1 && Array.isArray(saved.items)?saved:freshDoc("agentsam");
} catch{doc=freshDoc("agentsam");}
let selectedId=doc.items[0]?.id||"";
let showGrid=false,wireframe=false,inspectorOpen=false,layersOpen=false,mode:"orbit"|"select"|"story"="select";
let autoPlay:number|null=null;
let progressive:ReturnType<typeof mountProgressiveStudio>|null=null;
const history:string[]=[],future:string[]=[];
function snapshot(){history.push(JSON.stringify(doc)); if(history.length>40)history.shift(); future.length=0;}
function store(){localStorage.setItem(storageKey,JSON.stringify(doc));}
function sel(){return doc.items.find(x=>x.id===selectedId);}
function esc(s:string){return String(s).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]||ch));}
function num(n:number){return Math.round(n*100)/100;}
function download(blob:Blob,name:string){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}
function announce(t:string){const target=document.getElementById("notice");if(target)target.textContent=t;}
const app=document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML='<div class="app">'+
  '<header class="top"><div class="top-left"><span class="studio-app-mark">SamSketch</span><button class="project" id="project-name">AgentSam Product World ▾</button></div>'+
  '<div class="top-right">'+iconButton("layers-toggle","layers","Toggle model library")+iconButton("inspector-toggle","sliders","Toggle properties inspector")+iconButton("undo","undo","Undo")+iconButton("redo","redo","Redo")+iconButton("snapshot","capture","Capture PNG")+iconButton("export-json","export","Export scene JSON")+iconButton("settings-toggle","sliders","Scene settings")+'</div></header>'+
  '<aside class="left" id="left"><div class="section"><div class="section-title">Product identity</div><div class="brand-choice"><button id="brand-agentsam">AgentSam</button><button id="brand-inneranimalmedia">InnerAnimalMedia</button></div><p class="hint">Brand styling and story assets change together; geometry and authoring behavior remain shared.</p></div>'+
  '<div class="library-tabs" role="tablist" aria-label="Scene library"><button type="button" data-library="templates" role="tab">Models</button><button type="button" data-library="objects" role="tab">Objects</button><button type="button" data-library="shapes" role="tab">Shapes</button><button type="button" data-library="icons" role="tab">Icons</button></div>'+
  '<div id="templates-section" class="library-pane"><div class="library-intro"><div><strong>Model inventory</strong><span id="model-inventory-count">Reading source library…</span></div><button class="library-build-button" id="start-build" type="button">'+icon("sparkles",14)+' Let’s build</button></div><div class="build-starter"><strong>Start with a skill</strong><div class="skill-chips"><button type="button" data-build-skill="Sculpt">Sculpt</button><button type="button" data-build-skill="Draft">Draft</button><button type="button" data-build-skill="Model">Model</button><button type="button" data-build-skill="Animate">Animate</button><button type="button" data-build-skill="Vector">Vector</button><button type="button" data-build-skill="Scene">Scene</button></div></div><label class="search-shell">'+icon("search",15)+'<input id="template-search" type="search" placeholder="Search model, part, SKU…" aria-label="Search models and source parts"></label><div class="model-filters" role="group" aria-label="Filter model inventory"><button type="button" data-model-filter="all" class="active">All</button><button type="button" data-model-filter="composition">Compositions</button><button type="button" data-model-filter="source-part">Source parts</button></div><div class="inventory-summary" id="model-inventory-summary"></div><div class="template-catalog" id="template-catalog"></div><p class="library-footnote">Source geometry is read-only. Add an instance to the scene to transform, recolor, hide, duplicate or remove it without altering the source file.</p></div>'+
  '<div id="objects-section" class="library-pane" hidden><div class="section"><div class="section-title">Scene objects <button id="add-panel" aria-label="Add panel">'+icon("plus",14)+'</button></div><div id="layers"></div></div></div>'+
  '<div id="shapes-section" class="library-pane" hidden><div class="section"><div class="section-title">Create shape</div><div id="primitives"></div></div></div><div id="icons-section" class="library-pane" hidden><div class="library-intro"><div><strong>2D iconography</strong><span id="icon-count">85 semantic tools</span></div><button class="library-build-button" id="export-icon-pack" type="button">'+icon("download",14)+' Export SVG</button></div><label class="search-shell">'+icon("search",15)+'<input id="icon-search" type="search" placeholder="Search icon names…" aria-label="Search iconography"></label><div class="icon-library-selection" id="icon-selection">Choose a glyph to inspect its semantic name and family.</div><div class="icon-library" id="icon-catalog"></div></div></aside>'+
  '<main class="canvas-wrap"><div class="canvas-header"><div class="tag" id="chapter-label">Product World / 01</div><h1 id="stage-title">Products with presence</h1><p id="stage-subtitle">Examine every layer of the experience.</p></div>'+
  '<div class="canvas-tools" role="toolbar" aria-label="Scene tools">'+iconButton("mode-select","select","Select object")+iconButton("mode-orbit","orbit","Orbit camera")+iconButton("mode-story","story","Story navigation")+'<span class="toolbar-separator"></span>'+iconButton("frame","frame","Frame scene")+iconButton("grid","grid","Toggle grid")+iconButton("wireframe","cube","Toggle wireframe")+'</div>'+
  '<div class="canvas-status"><span class="dot"></span><span id="notice">Scene ready · edits saved in this browser</span></div><div class="view-gizmo" role="group" aria-label="Camera orientation and navigation"><div class="view-gizmo-orientation" aria-hidden="true"><svg viewBox="0 0 72 66" width="72" height="66"><path d="M36 5 58 17 36 29 14 17 36 5Z" fill="#eef3ff" stroke="#9aaed4" stroke-width="1.3"/><path d="M14 17v25l22 13V29L14 17Z" fill="#dfe8fa" stroke="#9aaed4" stroke-width="1.3"/><path d="M58 17v25L36 55V29l22-12Z" fill="#c8d8f3" stroke="#9aaed4" stroke-width="1.3"/><path d="M36 29v26" stroke="#9aaed4" stroke-width="1.3"/><circle cx="36" cy="29" r="3" fill="#5277d9"/></svg></div><div class="view-gizmo-presets"><button type="button" data-view="top" aria-pressed="false">Top</button><button type="button" data-view="front" aria-pressed="false">Front</button><button type="button" data-view="right" aria-pressed="false">Right</button><button type="button" data-view="iso" class="is-active" aria-pressed="true">Iso</button></div><div class="view-gizmo-zoom"><button type="button" data-camera-action="zoom-in" aria-label="Zoom in" title="Zoom in">+</button><button type="button" data-camera-action="zoom-out" aria-label="Zoom out" title="Zoom out">−</button><button type="button" data-camera-action="focus" aria-label="Focus selected object" title="Focus selection">Focus</button></div></div></main>'+
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
if(new URLSearchParams(location.search).get("presentation")==="embedded") appFrame.classList.add("is-embedded");
function studioContext(){
 const item=sel();
 return {id:item?.id||"studio-scene",label:item?item.name+" · "+item.kind:"Entire scene",page:"/samsketch",surface:"samsketch-studio",brand:doc.brand,chapter:doc.chapter,selectedItem:item?{id:item.id,name:item.name,kind:item.kind,position:item.position,rotation:item.rotation,scale:item.scale,color:item.color}:null};
}
function sendHostMessage(type:string,payload:Record<string,unknown>={}){
 if(window.parent===window)return;
 window.parent.postMessage({channel:"agentsam.samsketch.v1",version:1,type,...payload},window.location.origin);
}
window.addEventListener("message",(event:MessageEvent)=>{
 if(event.origin!==window.location.origin||event.source!==window.parent)return;
 const message=event.data as {channel?:string;version?:number;type?:string;mode?:string};
 if(message?.channel!=="agentsam.samsketch.v1"||message.version!==1)return;
 if(message.type==="host-mode"&&message.mode==="chat")settingsApi.close();
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
document.getElementById("settings-toggle")?.addEventListener("click",()=>{
 if(matchMedia("(max-width: 850px)").matches){leftPane.classList.remove("open");rightPane.classList.remove("open");layersOpen=false;inspectorOpen=false;}
 settingsApi.toggle("scene");
});
const viewport=document.querySelector<HTMLElement>(".canvas-wrap")!;
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.55;
viewport.insertBefore(renderer.domElement,viewport.firstChild);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(37,1,.1,100);
camera.position.set(11,6.2,13.5);
const controls=new OrbitControls(camera,renderer.domElement);
controls.target.set(0,0,0);controls.enableDamping=true;controls.dampingFactor=.07;controls.minDistance=4;controls.maxDistance=35;
const light=new THREE.DirectionalLight("#ffffff",3.5);light.position.set(-4,10,9);light.castShadow=true;light.shadow.mapSize.set(2048,2048);light.shadow.camera.left=-12;light.shadow.camera.right=12;light.shadow.camera.top=12;light.shadow.camera.bottom=-12;scene.add(light);
const fillLight=new THREE.DirectionalLight("#b1c9ff",1.4);fillLight.position.set(6,4,-5);scene.add(fillLight);
const ambientLight=new THREE.AmbientLight("#e8f1ff",2.1);scene.add(ambientLight);
const stage=new THREE.Group();scene.add(stage);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({color:"#8190ad",opacity:.13}));floor.rotation.x=-Math.PI/2;floor.position.y=-2.15;floor.receiveShadow=true;scene.add(floor);
const grid=new THREE.GridHelper(18,18,"#9caec9","#dbe3f0");grid.position.y=-2.13;grid.visible=false;scene.add(grid);
let selectedHelper:THREE.BoxHelper|null=null;
const roots=new Map<string,THREE.Object3D>();
let storyProgress=doc.chapter;
let storyTransition:{from:number;to:number;start:number;duration:number}|null=null;
let surfaceRoughness=.82,surfaceMetalness=0,sceneAutoRotate=false,rotationSpeed=.003;
let fogEnabled=false,fogDensity=.012,currentBackdrop="blue",shadowsEnabled=true;
let selectionOutlineEnabled=true,reducedMotionOverride=false;
const hitRay=new THREE.Raycaster(),hitPointer=new THREE.Vector2();
const tempCanvas=document.createElement("canvas");tempCanvas.width=1024;tempCanvas.height=640;

function rounded(width:number,height:number,radius:number,depth:number,color:string,look:Look="clay"):THREE.Mesh {
 const w=width/2,h=height/2,r=Math.min(radius,w,h);
 const sh=new THREE.Shape();
 sh.moveTo(-w+r,-h);sh.lineTo(w-r,-h);sh.quadraticCurveTo(w,-h,w,-h+r);sh.lineTo(w,h-r);sh.quadraticCurveTo(w,h,w-r,h);sh.lineTo(-w+r,h);sh.quadraticCurveTo(-w,h,-w,h-r);sh.lineTo(-w,-h+r);sh.quadraticCurveTo(-w,-h,-w+r,-h);
 const geometry=new THREE.ExtrudeGeometry(sh,{depth,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.035,bevelThickness:.035,curveSegments:10});
 geometry.center();
 return new THREE.Mesh(geometry,material(color,look));
}
function material(color:string,look:Look):THREE.MeshStandardMaterial|THREE.MeshPhysicalMaterial {
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
function buildRoot(item:Item):THREE.Object3D {
 const root=new THREE.Group();root.userData.itemId=item.id;
 let mesh:THREE.Object3D|undefined;
 if(item.kind==="desktop"){
  const rim=rounded(6.4,3.9,.24,.28,item.color,item.material);root.add(rim);
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(6.05,3.52),new THREE.MeshBasicMaterial({map:canvasCard(doc.brand),toneMapped:false}));
  screen.position.z=.19;root.add(screen);
  const neck=new THREE.Mesh(new THREE.BoxGeometry(.48,1.0,.28),material("#a9bad3","metal"));neck.position.y=-2.48;root.add(neck);
  const base=rounded(2.9,.33,.1,.15,"#cdd7e6");base.rotation.x=-Math.PI/2;base.position.y=-2.96;root.add(base);
 }else if(item.kind==="phone"){
  const body=rounded(1.57,3.13,.24,.19,item.color,item.material);root.add(body);
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(1.39,2.86),new THREE.MeshBasicMaterial({map:canvasCard(doc.brand,true),toneMapped:false}));
  screen.position.z=.14;root.add(screen);
  const cameraDot=new THREE.Mesh(new THREE.CircleGeometry(.065,16),new THREE.MeshBasicMaterial({color:"#273147"}));cameraDot.position.set(0,1.47,.151);root.add(cameraDot);
 }else if(item.kind==="panel"){
  const backing=rounded(2.55,2.05,.22,.11,item.color,item.material);root.add(backing);
  for(let i=0;i<4;i++){const pill=rounded(1.9-i*.18,.13,.06,.02,["#ffffff","#c3e7ef","#e6f2ff","#ffd7dc"][i]);pill.position.set(-.14,i*.34-.52,.18+i*.003);root.add(pill);}
  const dot=new THREE.Mesh(new THREE.SphereGeometry(.22,24,16),material("#ffffff","clay"));dot.position.set(-.65,.62,.26);root.add(dot);
 }else if(item.kind==="orb"){
  mesh=new THREE.Mesh(new THREE.SphereGeometry(.85,48,32),material(item.color,item.material));
 }else if(item.kind==="box"){
  mesh=rounded(1.65,1.65,.35,1.0,item.color,item.material);
 }else if(item.kind==="ring"){
  mesh=new THREE.Mesh(new THREE.TorusGeometry(.87,.18,24,64),material(item.color,item.material));mesh.rotation.set(.4,.5,0);
 }else if(item.kind==="template"){
  const key=item.templateId||"";
  const loaded=instanceTemplateModel(key,item.color==="#ffffff"?undefined:item.color,wireframe,item.material);
  if(loaded)root.add(loaded);
  else if(key)void getTemplateModel(key).then(()=>{redraw();announce("3D source mesh loaded: "+modelLabel(key));}).catch(e=>announce("Template load failed: "+(e instanceof Error?e.message:String(e))));
 }else if(item.kind==="cad"){
  const stored=generatedCad.get(item.id);
  mesh=stored ? stored.clone(true) : new THREE.Mesh(new THREE.SphereGeometry(.8,42,32),material(item.color,item.material));
  if(stored)mesh.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry=o.geometry.clone();o.material=material(item.color,item.material);}});
 }
 if(mesh){mesh.userData.itemId=item.id;root.add(mesh);}
 root.traverse(o=>{o.userData.itemId=item.id;if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;if(o.material instanceof THREE.MeshStandardMaterial){o.material.wireframe=wireframe;}}});
 const pose=poseFor(item,doc.chapter);root.position.set(...pose);root.rotation.set(...item.rotation.map(a=>a*Math.PI/180) as Vec3);root.scale.set(...item.scale);root.visible=item.visible;
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
function redraw(){
 clearStage();for(const item of doc.items){const root=buildRoot(item);stage.add(root);roots.set(item.id,root);}
 applyProgress(storyProgress);refreshSelection();store();
}
function refreshSelection(){
 if(selectedHelper){scene.remove(selectedHelper);selectedHelper.dispose();selectedHelper=null;}
 const item=sel();const root=item&&roots.get(item.id);
 if(root && root.visible && selectionOutlineEnabled){selectedHelper=new THREE.BoxHelper(root,0x6185ed);scene.add(selectedHelper);}
}
const resize=new ResizeObserver(()=>{
 const width=viewport.clientWidth,height=viewport.clientHeight;
 if(width&&height){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
});resize.observe(viewport);
let pressed:Vec3|null=null;
renderer.domElement.addEventListener("pointerdown",e=>{pressed=[e.clientX,e.clientY,0]});
renderer.domElement.addEventListener("pointerup",e=>{
 if(mode!=="select"||!pressed||Math.hypot(e.clientX-pressed[0],e.clientY-pressed[1])>6)return;
 const bounds=renderer.domElement.getBoundingClientRect();
 hitPointer.set((e.clientX-bounds.left)/bounds.width*2-1,-(e.clientY-bounds.top)/bounds.height*2+1);
 hitRay.setFromCamera(hitPointer,camera);
 const hits=hitRay.intersectObjects(stage.children,true);
 const id=hits.find(hit=>hit.object.userData.itemId)?.object.userData.itemId;
 if(id){selectedId=id;refreshSelection();renderInspector();renderLayers();progressive?.refreshContext();}
});
function frame(){controls.target.set(0,0,0);camera.up.set(0,1,0);camera.position.set(11,6.2,13.5);camera.lookAt(0,0,0);controls.update();}
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
 const item=sel();const selectedRoot=item?roots.get(item.id):undefined;
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
 for(const item of doc.items){const object=roots.get(item.id);if(!object)continue;const a=poseFor(item,from),b=poseFor(item,to);object.position.set(a[0]+(b[0]-a[0])*blend,a[1]+(b[1]-a[1])*blend,a[2]+(b[2]-a[2])*blend);}
}
renderer.domElement.addEventListener("wheel",e=>{
 if(mode!=="story")return;e.preventDefault();storyTransition=null;applyProgress(storyProgress+e.deltaY/560);
 const index=Math.round(storyProgress);if(index!==doc.chapter){doc.chapter=index;renderChapters();store();}
},{passive:false});
function animate(){requestAnimationFrame(animate);if(storyTransition){const t=Math.min(1,(performance.now()-storyTransition.start)/storyTransition.duration);const smooth=t*t*(3-2*t);applyProgress(storyTransition.from+(storyTransition.to-storyTransition.from)*smooth);if(t>=1)storyTransition=null;}if(sceneAutoRotate&&!reducedMotionOverride&&!matchMedia("(prefers-reduced-motion: reduce)").matches)stage.rotation.y+=rotationSpeed;controls.update();selectedHelper?.update();renderer.render(scene,camera);}
animate();

function renderLayers(){
 const host=document.getElementById("layers")!;
 host.innerHTML=doc.items.map(i=>'<div class="layer '+(i.id===selectedId?'selected':'')+'" data-select="'+esc(i.id)+'"><span class="layer-icon">'+icon(i.kind==="template"?"cube":i.kind==="desktop"?"panel":i.kind==="orb"?"orbit":"cube",16)+'</span><span class="layer-name">'+esc(i.name)+'</span><button class="layer-eye" data-visibility="'+esc(i.id)+'" title="Toggle visibility" aria-label="Toggle visibility">'+icon(i.visible?'eye':'eyeoff',15)+'</button></div>').join('');
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
function triplet(prop:"position"|"rotation"|"scale",v:Vec3){
 return '<div class="field"><label>'+prop[0].toUpperCase()+prop.slice(1)+(prop==="rotation"?" (degrees)":"")+'</label><div class="triplet">'+v.map((val,index)=>'<input type="number" step="'+(prop==="rotation"?1:.1)+'" data-prop="'+prop+'" data-axis="'+index+'" value="'+num(val)+'" aria-label="'+prop+' '+["X","Y","Z"][index]+'"/>').join('')+'</div></div>';
}
function renderInspector(){
 const host=document.getElementById("inspector")!;
 const it=sel();
 if(!it){host.innerHTML='<div class="section"><span class="tag">Inspector</span><p>Select a scene object.</p></div>';return;}
 const colors=[brandInfo[doc.brand].accent,"#e9adbe","#88c7cf","#d6e0fa","#a6a8cf","#2d3650"];
 host.innerHTML=
 '<div class="section"><div class="section-title">Selected object <span class="mini-badge">Editable</span></div><div class="field"><label>Object name</label><input id="name" type="text" value="'+esc(it.name)+'"/></div><div class="small">ID · '+esc(it.id.slice(0,13))+'</div><div class="btn-group" style="margin-top:13px"><button class="pill" id="duplicate">Duplicate</button><button class="pill" id="delete">Remove</button></div></div>'+
 '<div class="section"><div class="section-title">Transform · 3D</div>'+triplet("position",it.position)+triplet("rotation",it.rotation)+triplet("scale",it.scale)+'<div class="btn-group"><button class="pill" id="reset-object">Reset transform</button><button class="pill" id="focus-object">Focus</button></div></div>'+
 '<div class="section"><div class="section-title">Material refinement</div><div class="field"><label>Surface</label><select id="material"><option value="clay" '+(it.material==="clay"?"selected":"")+'>Clay / matte</option><option value="glass" '+(it.material==="glass"?"selected":"")+'>Frosted glass</option><option value="metal" '+(it.material==="metal"?"selected":"")+'>Machined metal</option></select></div><div class="field"><label>Color</label><div class="row"><input id="color" type="color" value="'+esc(it.color)+'" style="width:48px;height:33px;border:0;background:none"/><span class="small">'+esc(it.color.toUpperCase())+'</span></div></div><div class="swatches">'+colors.map(c=>'<button aria-label="Use '+c+'" data-color="'+c+'" class="swatch '+(it.color.toLowerCase()===c.toLowerCase()?'active':'')+'" style="background:'+c+'"></button>').join('')+'</div><label class="toggle-row">Visible in scene <input id="visible" type="checkbox" '+(it.visible?"checked":"")+'/></label></div>'+
 (it.kind==="cad"?'<div class="section"><div class="section-title">CAD / geometry authoring</div><p class="help">OpenCascade.js performs actual BRep Boolean operations when you choose Generate. The result is meshed for the Three.js viewer. The marketing renderer does not load the CAD kernel.</p>'+
 '<button class="pill accent" id="generate-cad" style="width:100%;margin:12px 0">Generate Boolean-cut solid</button>'+
 '<div class="field"><label>Sphere radius</label><input id="outer-radius" type="number" min=".1" step=".1" value="'+(it.cadParams?.outerRadius??1.2)+'"/></div>'+
 '<div class="field"><label>Cut radius</label><input id="cut-radius" type="number" min=".1" step=".1" value="'+(it.cadParams?.cutterRadius??.78)+'"/></div>'+
 '<div class="field"><label>Cutter offset (X)</label><input id="cut-x" type="number" step=".1" value="'+(it.cadParams?.cutX??.65)+'"/></div>'+
 '<p class="hint">Change the dimensions and regenerate the selected CAD object. Its parameters are serialized with the scene. This is not a complete BRep feature-history editor.</p></div>':it.kind==="template"?'<div class="section"><div class="section-title">Source-backed model</div><p class="help">'+(it.templateId?.startsWith("part:")?"Single STL source part.":"Authored composition assembled from source meshes.")+' Position, orientation, scale, visibility and presentation materials are editable on this scene instance. The original source file is never modified.</p><p class="hint">Source reference: '+esc(it.templateId||'')+'</p></div>':'')+
 '<div class="section"><div class="section-title">Export & inspect</div><div class="btn-group"><button class="pill" id="export-glb">Export GLB</button><button class="pill" id="import-json">Import JSON</button><button class="pill" id="export-json-inspector">Export JSON</button><button class="pill" id="snapshot-inspector">Capture PNG</button></div><p class="hint">JSON captures the scene document. GLB captures the visible geometric assembly. Both are locally downloaded files. Browser draft storage is not device filesystem storage.</p></div>';
}
function renderBrand(){
 (["agentsam","inneranimalmedia"] as const).forEach(b=>document.getElementById("brand-"+b)!.classList.toggle("active",doc.brand===b));
 document.documentElement.style.setProperty("--accent",brandInfo[doc.brand].accent);
 document.getElementById("project-name")!.textContent=doc.name+" ▾";
}
function renderAll(){renderBrand();renderPrimitives();renderLayers();renderInspector();renderChapters();redraw();progressive?.refreshContext();sendHostMessage("selection",{selection:studioContext()});}
function setBackdrop(preset:string){
 const colors:Record<string,string>={blue:"#e8effb",studio:"#e8effb",neutral:"#e9e4dd",slate:"#252d3d",paper:"#f7f4ee",daylight:"#e7eff7",overcast:"#d8dfe8",night:"#242b3a"};
 const color=colors[preset]||preset||colors.blue;currentBackdrop=preset;
 const dark=document.documentElement.dataset.samsketchTheme==="dark";
 viewport.style.background=dark
  ?"radial-gradient(ellipse at 52% 25%,#27354a 0%,#1a2230 60%,#131923 100%)"
  :`radial-gradient(ellipse at 52% 25%,${color} 0%,#edf2fc 68%,#dfe8f6 100%)`;
 scene.fog=fogEnabled?new THREE.FogExp2(new THREE.Color(color),fogDensity):null;
}
function applyWorkspaceTheme(theme:"light"|"dark"){
 document.documentElement.dataset.samsketchTheme=theme;
 setBackdrop(currentBackdrop);
}
function stopStoryPlayback(){if(autoPlay!==null){window.clearInterval(autoPlay);autoPlay=null;}}
function startStoryPlayback(){
 stopStoryPlayback();
 if(reducedMotionOverride||matchMedia("(prefers-reduced-motion: reduce)").matches){announce("Reduced motion is enabled; select a chapter manually.");return;}
 setChapter(0);
 autoPlay=window.setInterval(()=>{if(doc.chapter>=3){stopStoryPlayback();return;}setChapter(doc.chapter+1);},2200);
}
function resetStudioSettings(){
 stopStoryPlayback();surfaceRoughness=.82;surfaceMetalness=.08;sceneAutoRotate=false;rotationSpeed=.003;
 fogEnabled=false;fogDensity=.012;currentBackdrop="blue";shadowsEnabled=true;selectionOutlineEnabled=true;reducedMotionOverride=false;
 wireframe=false;showGrid=false;grid.visible=false;renderer.shadowMap.enabled=true;light.castShadow=true;fillLight.castShadow=true;
 light.intensity=3.5;light.color.set("#ffffff");fillLight.intensity=2.1;fillLight.color.set("#b1c9ff");ambientLight.intensity=2.1;
 floor.visible=true;floor.receiveShadow=true;floor.material.opacity=.13;renderer.toneMappingExposure=1.55;
 controls.enabled=true;controls.enableRotate=true;controls.enableZoom=true;controls.enablePan=true;
 doc.items.forEach(item=>item.material="clay");redraw();frame();applyWorkspaceTheme("light");setBackdrop("blue");
 timelinePane.hidden=false;appFrame.dataset.timelineHidden="false";appFrame.dataset.libraryHidden="false";appFrame.dataset.inspectorHidden="false";
 appFrame.style.removeProperty("--library-width");appFrame.style.removeProperty("--inspector-width");appFrame.style.removeProperty("--timeline-height");
 toggleTimeline(false);
}
function applyStudioSetting(key:string,value:string|number|boolean){
 switch(key){
  case "scene.chapter":setChapter(Number(value));break;
  case "scene.autoplay":case "simulation.autoplay":if(Boolean(value))startStoryPlayback();else stopStoryPlayback();break;
  case "scene.autorotate":sceneAutoRotate=Boolean(value);break;
  case "styles.material":if(String(value)==="source")break;snapshot();doc.items.forEach(item=>item.material=String(value) as Look);redraw();renderInspector();break;
  case "styles.backdrop":setBackdrop(String(value));break;
  case "styles.roughness":surfaceRoughness=Number(value);redraw();break;
  case "styles.metalness":surfaceMetalness=Number(value);redraw();break;
  case "camera.distance":{const distance=Math.max(4,Math.min(35,Number(value)));camera.position.sub(controls.target).setLength(distance).add(controls.target);controls.update();break;}
  case "camera.fov":camera.fov=Number(value);camera.updateProjectionMatrix();break;
  case "camera.orbit":controls.enabled=Boolean(value);controls.enableRotate=Boolean(value);controls.enableZoom=Boolean(value);controls.enablePan=Boolean(value);break;
  case "light.key":light.intensity=Number(value);break;
  case "light.fill":fillLight.intensity=Number(value);break;
  case "light.temperature":{
   const keyColor=value==="warm"?"#ffe1bf":value==="cool"?"#c9ddff":"#ffffff";
   const fillColor=value==="warm"?"#ffcfa0":value==="cool"?"#a8c5ff":"#b1c9ff";
   light.color.set(keyColor);fillLight.color.set(fillColor);ambientLight.color.set(value==="warm"?"#fff0dc":value==="cool"?"#d7e5ff":"#e8f1ff");break;
  }
  case "light.shadows":case "effects.shadows":shadowsEnabled=Boolean(value);renderer.shadowMap.enabled=shadowsEnabled;light.castShadow=shadowsEnabled;fillLight.castShadow=shadowsEnabled;floor.receiveShadow=shadowsEnabled;break;
  case "simulation.speed":rotationSpeed=Number(value);break;
  case "effects.wireframe":wireframe=Boolean(value);redraw();break;
  case "effects.grid":case "sky.horizon":showGrid=Boolean(value);grid.visible=showGrid;break;
  case "effects.selection":selectionOutlineEnabled=Boolean(value);refreshSelection();break;
  case "fog.enabled":fogEnabled=Boolean(value);setBackdrop(currentBackdrop);break;
  case "fog.density":fogDensity=Number(value);setBackdrop(currentBackdrop);break;
  case "fog.color":setBackdrop(String(value)==="backdrop"?currentBackdrop:String(value));break;
  case "sky.environment":setBackdrop(String(value)==="studio"?"blue":String(value));break;
  case "sky.brightness":renderer.toneMappingExposure=Number(value);break;
  case "shadows.ambient":floor.material.opacity=Number(value);break;
  case "shadows.softness":light.shadow.radius=Number(value);break;
  case "shadows.ground":case "shadows.contact":floor.visible=Boolean(value)&&shadowsEnabled;floor.receiveShadow=Boolean(value)&&shadowsEnabled;break;
  case "global.reducedMotion":reducedMotionOverride=Boolean(value);if(reducedMotionOverride)stopStoryPlayback();break;
  case "global.properties":{const inspector=document.getElementById("inspector");if(inspector)inspector.hidden=!Boolean(value);break;}
  case "global.timeline":timelinePane.hidden=!Boolean(value);appFrame.dataset.timelineHidden=String(!Boolean(value));break;
  case "global.theme":applyWorkspaceTheme(String(value)==="dark"?"dark":"light");break;
 }
}
window.addEventListener("samsketch:settings.change",event=>{
 const detail=(event as CustomEvent<{key:string;value:string|number|boolean}>).detail;
 if(detail)applyStudioSetting(detail.key,detail.value);
});
window.addEventListener("samsketch:settings.action",event=>{
 const action=(event as CustomEvent<{action:string}>).detail?.action;
 switch(action){
  case "camera.frame":case "camera.reset":frame();break;
  case "scene.reset":stopStoryPlayback();doc.chapter=0;stage.rotation.set(0,0,0);setChapter(0);resetStudioSettings();break;
  case "styles.reset":snapshot();surfaceRoughness=.82;surfaceMetalness=.08;doc.items.forEach(item=>item.material="clay");redraw();setBackdrop("blue");break;
  case "light.reset":light.intensity=3.5;light.color.set("#ffffff");fillLight.intensity=2.1;fillLight.color.set("#b1c9ff");ambientLight.intensity=2.1;break;
  case "simulation.play":startStoryPlayback();break;
  case "simulation.pause":stopStoryPlayback();break;
  case "effects.reset":wireframe=false;showGrid=false;grid.visible=false;shadowsEnabled=true;renderer.shadowMap.enabled=true;light.castShadow=true;floor.visible=true;selectionOutlineEnabled=true;redraw();break;
  case "global.resetLayout":appFrame.style.removeProperty("--library-width");appFrame.style.removeProperty("--inspector-width");appFrame.style.removeProperty("--timeline-height");timelinePane.hidden=false;appFrame.dataset.timelineHidden="false";appFrame.dataset.libraryHidden="false";appFrame.dataset.inspectorHidden="false";toggleTimeline(false);break;
  case "global.reset":resetStudioSettings();break;
 }
});
function mutate(fn:()=>void,rerender=true){snapshot();fn();if(rerender)renderAll();else{redraw();renderLayers();}store();}
function setChapter(index:number){if(index<0||index>3)return;const before=storyProgress;doc.chapter=index;renderChapters();store();if(matchMedia("(prefers-reduced-motion: reduce)").matches){storyTransition=null;applyProgress(index);}else storyTransition={from:before,to:index,start:performance.now(),duration:750};}
function addTemplate(ref:string){
 const key=ref.startsWith("part:")?"part:"+ref.slice(5):"composition:"+ref;
 const entry=findInventoryEntry(key);if(!entry)return;
 const templateRef=ref.startsWith("part:")?ref:entry.id;
 snapshot();
 const item=makeItem("template",entry.name,"#ffffff",[((doc.items.length%5)-2)*1.15,.15,0]);
 item.templateId=templateRef;doc.items.push(item);selectedId=item.id;
 renderAll();store();
 announce(entry.kind==="source-part"?"Loading source STL instance: "+entry.name:"Loading authored composition: "+entry.name);
 void getTemplateModel(templateRef).then(()=>{redraw();announce("Inserted source-backed model · "+entry.name);}).catch(error=>announce("Model unavailable: "+String(error)));
}
function addItem(kind:Kind){
 const colors:{[key in Kind]:string}={desktop:"#2c3a57",phone:"#477ae5",panel:"#e9adbe",orb:"#86c4dc",box:"#95b4e6",ring:"#91d7cf",cad:"#f0d2ad",template:"#ffffff"};
 mutate(()=>{const i=makeItem(kind,kind==="cad"?"CAD Boolean solid":kind.charAt(0).toUpperCase()+kind.slice(1),colors[kind],[((doc.items.length%4)-1.5)*1.4,.15,(Math.floor(doc.items.length/4)-.5)*1.5]);doc.items.push(i);selectedId=i.id;});
}
function undo(){if(!history.length)return;future.push(JSON.stringify(doc));doc=JSON.parse(history.pop()!) as Document;selectedId=doc.items.find(x=>x.id===selectedId)?.id||doc.items[0]?.id||"";renderAll();}
function redo(){if(!future.length)return;history.push(JSON.stringify(doc));doc=JSON.parse(future.pop()!) as Document;selectedId=doc.items[0]?.id||"";renderAll();}
async function exportGLB(){
 announce("Preparing scene GLB...");
 try{const exporter=new GLTFExporter();const output=await exporter.parseAsync(stage,{binary:true,onlyVisible:true});const bytes=output as ArrayBuffer;download(new Blob([bytes],{type:"model/gltf-binary"}),"iam-showcase-scene.glb");announce("Visible geometry exported as GLB.");}
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
  mutate(()=>{item.kind="cad";item.name="OCC Boolean solid";item.material="clay";item.cadParams=structuredClone(params);generatedCad.set(item.id,parsed.scene);});
  announce("OpenCascade Boolean complete · geometry regenerated; source parameters saved in scene manifest.");
 }catch(e){announce("CAD generation error: "+(e instanceof Error?e.message:String(e)));console.error(e);}
 finally{if(button)button.disabled=false;}
}
function exportScene(){const payload={...doc,source:"agentsam-3d-studio",schema:"showcase-document-v1"};download(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),"showcase-"+doc.brand+".json");announce("Scene manifest exported.");}
function importScene(){
 const picker=document.createElement("input");picker.type="file";picker.accept=".json,application/json";
 picker.addEventListener("change",async()=>{const file=picker.files?.[0];if(!file)return;
 try{const data=JSON.parse(await file.text());if(data.version!==1||!Array.isArray(data.items)||!["agentsam","inneranimalmedia"].includes(data.brand))throw Error("Unsupported manifest");
 snapshot();doc=data as Document;selectedId=doc.items[0]?.id||"";renderAll();announce("Manifest imported. Rebuild external CAD meshes from their source if needed.");
 }catch(e){announce("Import failed: "+(e instanceof Error?e.message:String(e)));}});
 picker.click();
}

document.addEventListener("click",e=>{
 const target=e.target as HTMLElement;
 const layer=target.closest<HTMLElement>("[data-select]");
 if(layer&&!target.closest("[data-visibility]")){selectedId=layer.dataset.select||"";refreshSelection();renderLayers();renderInspector();progressive?.refreshContext();sendHostMessage("selection",{selection:studioContext()});return;}
 const button=target.closest<HTMLButtonElement>("button");if(!button)return;
 const id=button.id,add=button.dataset.add,chapter=button.dataset.chapter,selection=button.closest<HTMLElement>("[data-select]")?.dataset.select;
 if(add){addItem(add as Kind);announce("Primitive created. Select, transform and refine in the inspector.");return;}
 if(chapter){setChapter(Number(chapter));return;}
 if(button.dataset.visibility){e.stopPropagation();const it=doc.items.find(x=>x.id===button.dataset.visibility);if(it)mutate(()=>{it.visible=!it.visible});return;}
 if(button.dataset.color){const it=sel();if(it)mutate(()=>{it.color=button.dataset.color!});return;}
 if(selection){selectedId=selection;refreshSelection();renderLayers();renderInspector();return;}
 if(id==="brand-agentsam"||id==="brand-inneranimalmedia"){
  const brand=id==="brand-agentsam"?"agentsam":"inneranimalmedia";
  if(doc.brand!==brand)mutate(()=>{doc.brand=brand;doc.name=brand==="agentsam"?"AgentSam Product World":"InnerAnimalMedia Digital World";doc.items.forEach(i=>{if(i.kind==="desktop")i.color=brandInfo[brand].primary;if(i.kind==="orb")i.color=brandInfo[brand].accent;});});
  return;
 }
 if(id==="add-panel"){addItem("panel");return;}
 if(id==="duplicate"){const it=sel();if(it)mutate(()=>{const copy=structuredClone(it);copy.id=crypto.randomUUID();copy.name+=" copy";copy.position=[it.position[0]+.6,it.position[1]+.4,it.position[2]+.2];doc.items.push(copy);selectedId=copy.id;});return;}
 if(id==="delete"){const it=sel();if(it)mutate(()=>{doc.items=doc.items.filter(x=>x.id!==it.id);selectedId=doc.items[0]?.id||"";});return;}
 if(id==="reset-object"){const it=sel();if(it)mutate(()=>{it.rotation=[0,0,0];it.scale=[1,1,1];});return;}
 if(id==="focus-object"){focusSelected();return;}
 if(id==="mode-select"||id==="mode-orbit"||id==="mode-story"){mode=id==="mode-select"?"select":id==="mode-orbit"?"orbit":"story";for(const v of ["select","orbit","story"])document.getElementById("mode-"+v)!.classList.toggle("active",mode===v);controls.enableZoom=mode!=="story";controls.enableRotate=mode!=="story";announce(mode==="story"?"Story mode · scroll over the stage to scrub through four chapters.":"Canvas mode · "+mode);return;}
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
 if(target.id==="name"){const value=target.value.trim().slice(0,90);if(value)mutate(()=>{it.name=value});return;}
 if(target.id==="material"){mutate(()=>{it.material=target.value as Look});return;}
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
renderAll();
announce("SamSketch ready · 20 compositions · 47 source parts · CAD kernel on demand");
sendHostMessage("ready",{context:studioContext()});
