import {trackCadRenderer} from '../lib/cad/scene-performance';
import {readCadTheme} from '../lib/cad-theme';
import {nativePlanLayer,disposeNativeLayer} from '../lib/native-mesh-three';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {createThreeViewport,createConfiguredGLTFLoader,createStudioTextures,createProceduralPbrMaterial,PROCEDURAL_PBR_MATERIAL_MAP,isSoftwareWebGLRenderer} from '@inneranimalmedia/agentsam-3d-viewer';
import {Sky} from 'three/addons/objects/Sky.js';
import {createPortal} from 'react-dom';
import {TerrainEditorPanel} from './TerrainEditorPanel';
import {createTerrainDocument,addSculptStroke,validateTerrainDocument,type TerrainDocument,type SculptMode} from '../lib/world-terrain';
import {ViewCube} from './ViewCube';
import {publishWorldView,registerWorldView,WORLD_ENVIRONMENT_PRESETS,type WorldEnvironmentPresetId,type WorldViewCommands} from '../lib/world-view-store';
import {createTerrainProjection,type TerrainProjection} from '../lib/world-terrain-three';
import type {CadSceneElement,CadSceneSettings,CadShadowQuality,CadToneMapping,ProjectState} from '@inneranimalmedia/agentsam-cad-shared';
import {DEFAULT_CAD_LIGHTING,resolveCadLighting,type ResolvedCadLighting} from '@inneranimalmedia/agentsam-cad-shared';
import {indexSceneElements,applySceneElementEdits,sceneElementBounds,type SceneBinding} from '../lib/scene-elements-three';

type Zone={roomId:string;label:string;candidateCameraBlenderXYZMetres?:number[];anchorStatus?:string};
type Handoff={projectId:string;sceneRevision:string;scene:{nodeCount:number;architectureNodeCount:number;glbSha256:string};zones:Zone[]};
type Selected={designId:string;category:string;nodeName:string;source:string};
type CameraMode='orbit'|'walk';
type ViewPreset='iso'|'plan'|'front'|'side';
export type CadSceneInventoryGroup = {category:string; count:number};
const POSKEY='agentsam.dreamhouse.camera.v1.1';
const ORBIT_SPEED=0.007;

const fitDistance=(size:THREE.Vector3,camera:THREE.PerspectiveCamera|null)=>{
 const halfVertical=THREE.MathUtils.degToRad((camera?.fov||56)/2);
 const halfLimit=Math.atan(Math.tan(halfVertical)*Math.min(1,camera?.aspect||1));
 return Math.max(4,size.length()*.56/Math.sin(halfLimit));
};

export interface CadWorldViewportProps {
 terrainHost?: HTMLDivElement|null;
 modelUrl:string;
 manifestUrl?:string;
 sceneLabel:string;
 revision:string;
 readOnly?:boolean;
 /** Site terrain and scenery editing; defaults to !readOnly. Stored on this device per project revision. */
 siteEditable?:boolean;
 onSelect?:(s:Selected, anchor?:{x:number;y:number})=>void;
 onSceneInventory?:(groups:CadSceneInventoryGroup[])=>void;
 onSceneElements?:(elements:CadSceneElement[])=>void;
 sceneElements?:CadSceneElement[];
 selectedElementId?:string;
 layoutProject?:ProjectState;
 onSceneSettings?:(updates:Partial<CadSceneSettings>)=>void;
 onLightingChange?:(updates:Partial<ResolvedCadLighting>)=>void;
}
export function CadWorldViewport({terrainHost,modelUrl,manifestUrl,sceneLabel,revision,readOnly=true,siteEditable=!readOnly,onSelect,onSceneInventory,onSceneElements,sceneElements=[],selectedElementId,layoutProject,onSceneSettings,onLightingChange}:CadWorldViewportProps) {
 const mount=useRef<HTMLDivElement>(null),renderer=useRef<THREE.WebGLRenderer|null>(null),
 sceneRef=useRef<THREE.Scene|null>(null),cameraRef=useRef<THREE.PerspectiveCamera|null>(null);
 const renderCamera=useRef<THREE.PerspectiveCamera|THREE.OrthographicCamera|null>(null);
 const assetRef=useRef<THREE.Object3D|null>(null),collidersRef=useRef<THREE.Object3D[]>([]);
 const target=useRef(new THREE.Vector3()),orbit=useRef({az:0.9,el:0.65,distance:65});
 const glide=useRef<{start:number;duration:number;from:typeof orbit.current;to:typeof orbit.current;
  fromTarget:THREE.Vector3;toTarget:THREE.Vector3}|null>(null);
 const walk=useRef({yaw:0,pitch:0,position:new THREE.Vector3(),active:false});
 const pressed=useRef(new Set<string>()),pointer=useRef<{x:number;y:number;id:number;distance:number}|null>(null);
 const touchPointers=useRef(new Map<number,{x:number;y:number}>()),pinchDistance=useRef<number|null>(null);
 const terrainProjection=useRef<TerrainProjection|null>(null);
 const terrainOrigin=useRef(new THREE.Vector3());
 const settings=layoutProject?.sceneSettings;
 const lighting=useMemo(()=>resolveCadLighting(layoutProject),[layoutProject?.lighting,layoutProject?.sceneSettings]);
 const terrainProjectKey=`${layoutProject?.id??sceneLabel??modelUrl??'new'}:${revision??''}`;
 const terrainInitialRef=useRef<{key:string;document:TerrainDocument}|null>(null);
 if(!terrainInitialRef.current||terrainInitialRef.current.key!==terrainProjectKey){
  terrainInitialRef.current={key:terrainProjectKey,document:settings?.terrain?validateTerrainDocument(settings.terrain):createTerrainDocument()};
 }
 const initialTerrain=terrainInitialRef.current.document;
 const terrainDocRef=useRef<TerrainDocument>(initialTerrain);
 const terrainBrushRef=useRef<{mode:SculptMode|null;radius:number;strength:number}>({mode:null,radius:12,strength:3});
 const lastBrushAt=useRef(0);
 const [mode,setMode]=useState<CameraMode>('orbit'),[ready,setReady]=useState(false),
 [error,setError]=useState(''),[progress,setProgress]=useState('Resolving project geometry…'),
 [handoff,setHandoff]=useState<Handoff|null>(null),[selection,setSelection]=useState<Selected|null>(null),
 [roofVisible,setRoofVisible]=useState(true),[hour,setHour]=useState<'day'|'evening'>(lighting.timeOfDay==='sunset'||lighting.timeOfDay==='night'?'evening':'day');
 const [nativeStatus,setNativeStatus]=useState('');
 const [wireframe,setWireframe]=useState(false),[viewPreset,setViewPreset]=useState<ViewPreset>('iso');
 const [terrain,setTerrain]=useState<TerrainDocument>(initialTerrain);
 const terrainOpen=Boolean(terrainHost)&&siteEditable;
 const [sculptMode,setSculptMode]=useState<SculptMode|null>(null);
 useEffect(()=>{if(!terrainOpen)setSculptMode(null)},[terrainOpen]);
 const [brushRadius,setBrushRadius]=useState(12),[brushStrength,setBrushStrength]=useState(3);
 const bounds=useRef(new THREE.Box3());
 const modelBounds=useRef(new THREE.Box3());
 const bindings=useRef(new Map<string,SceneBinding>());
 const selectedBox=useRef<THREE.Box3Helper|null>(null);
 const sourceColors=useRef(new Map<THREE.Material,THREE.Color>());
 const environmentRef=useRef<{sky:Sky;sun:THREE.DirectionalLight;fill:THREE.HemisphereLight}|null>(null);
 const materialSets=useRef(new Map<THREE.Mesh,{lit:THREE.Material|THREE.Material[];color:THREE.Material|THREE.Material[]}>());
 const pbrTextures=useRef<ReturnType<typeof createStudioTextures>|null>(null);
 const pbrMaterials=useRef(new Map<string,THREE.MeshPhysicalMaterial>());
 const [shading,setShading]=useState<'lit'|'color'>(lighting.shading);
 const [exposure,setExposure]=useState(lighting.exposure),[sunStrength,setSunStrength]=useState(lighting.intensity),[fillStrength,setFillStrength]=useState(lighting.ambientIntensity);
 const [skyVisible,setSkyVisible]=useState(lighting.skyVisible);
 const [sunAltitude,setSunAltitude]=useState(lighting.sunAltitude),[sunAzimuth,setSunAzimuth]=useState(lighting.sunAzimuth);
 const [sunColor,setSunColor]=useState(lighting.sunColor),[skyColor,setSkyColor]=useState(lighting.skyColor),[groundColor,setGroundColor]=useState(lighting.groundColor);
 const [environmentPresetId,setEnvironmentPresetId]=useState<WorldEnvironmentPresetId|'custom'>(lighting.environmentPresetId as WorldEnvironmentPresetId|'custom');
 const [cameraFov,setCameraFov]=useState(45);
 const [skyTurbidity,setSkyTurbidity]=useState(lighting.skyTurbidity),[skyRayleigh,setSkyRayleigh]=useState(lighting.skyRayleigh),[skyMieCoefficient,setSkyMieCoefficient]=useState(lighting.skyMieCoefficient),[skyMieDirectionalG,setSkyMieDirectionalG]=useState(lighting.skyMieDirectionalG);
 const [shadows,setShadows]=useState(lighting.shadows);
 const [shadowQuality,setShadowQuality]=useState<CadShadowQuality>(lighting.shadowQuality);
 const [toneMapping,setToneMapping]=useState<CadToneMapping>(lighting.toneMapping);
 const projection=settings?.projection??'perspective';
 const projectionRef=useRef(projection);
 useEffect(()=>{projectionRef.current=projection},[projection]);
 const clipNear=settings?.clipNear??.06,clipFar=settings?.clipFar??2400;
 const [activeCamera,setActiveCamera]=useState('iso');
 useEffect(()=>{
  setShading(lighting.shading);setExposure(lighting.exposure);setSunStrength(lighting.intensity);setFillStrength(lighting.ambientIntensity);
  setSkyVisible(lighting.skyVisible);setHour(lighting.timeOfDay==='sunset'||lighting.timeOfDay==='night'?'evening':'day');
  setSunAltitude(lighting.sunAltitude);setSunAzimuth(lighting.sunAzimuth);
  setSunColor(lighting.sunColor);setSkyColor(lighting.skyColor);setGroundColor(lighting.groundColor);
  setEnvironmentPresetId(lighting.environmentPresetId as WorldEnvironmentPresetId|'custom');
  setSkyTurbidity(lighting.skyTurbidity);setSkyRayleigh(lighting.skyRayleigh);setSkyMieCoefficient(lighting.skyMieCoefficient);
  setSkyMieDirectionalG(lighting.skyMieDirectionalG);setShadows(lighting.shadows);
  setShadowQuality(lighting.shadowQuality);setToneMapping(lighting.toneMapping);setRoofVisible(settings?.roofVisible??true);
 },[lighting,settings?.roofVisible]);
 useEffect(()=>{if(onSceneSettings||settings?.cameraFov!=null)setCameraFov(settings?.cameraFov??45)},[onSceneSettings,settings?.cameraFov]);
 useEffect(()=>{
  if(settings?.terrain)setTerrain(validateTerrainDocument(settings.terrain));
  else if(onSceneSettings)setTerrain(createTerrainDocument());
 },[settings?.terrain,onSceneSettings]);
 const changeTerrain=(next:TerrainDocument|((previous:TerrainDocument)=>TerrainDocument))=>{
  const value=typeof next==='function'?next(terrainDocRef.current):next;
  terrainDocRef.current=value;setTerrain(value);onSceneSettings?.({terrain:value});
 };
 const displayRef=useRef({mode,roofVisible});
 useEffect(()=>{displayRef.current={mode,roofVisible}},[mode,roofVisible]);
 useEffect(()=>{terrainDocRef.current=terrain},[terrain]);
 useEffect(()=>{terrainBrushRef.current={mode:sculptMode,radius:brushRadius,strength:brushStrength}},[sculptMode,brushRadius,brushStrength]);
 const visit=(zone:Zone)=>{
  if(!zone.candidateCameraBlenderXYZMetres||!ready)return;
  const [x,y,z]=zone.candidateCameraBlenderXYZMetres;
  // Blender Z-up -> glTF Y-up once, preserving canonical world units.
  walk.current.position.set(x,z,-y);
  walk.current.yaw=0;walk.current.pitch=0;
  walk.current.active=true;
  setMode('walk');
 };
 const reset=()=>{
  if(modelBounds.current.isEmpty())return;
  const center=modelBounds.current.getCenter(new THREE.Vector3()),size=modelBounds.current.getSize(new THREE.Vector3());
  target.current.copy(center);
  orbit.current={az:0.85,el:0.5,distance:fitDistance(size,cameraRef.current)};
  setViewPreset('iso');
  walk.current.position.set(center.x,Math.max(1.7,bounds.current.min.y+1.7),center.z);
  setMode('orbit');
 };
 const setView=(preset:ViewPreset)=>{
  if(modelBounds.current.isEmpty())return;
  const size=modelBounds.current.getSize(new THREE.Vector3());
  target.current.copy(modelBounds.current.getCenter(new THREE.Vector3()));
  const distance=fitDistance(size,cameraRef.current);
  orbit.current=preset==='plan'
    ?{az:0,el:Math.PI/2-.025,distance}
    :preset==='front'?{az:0,el:.075,distance}
    :preset==='side'?{az:Math.PI/2,el:.075,distance}
    :{az:.88,el:.49,distance};
  setViewPreset(preset);setActiveCamera(preset);setMode('orbit');
 };
 const exportSnapshot=()=>{
  const webgl=renderer.current,scene=sceneRef.current,camera=renderCamera.current;
  if(!webgl||!scene||!camera||!ready)return;
  webgl.render(scene,camera);
  const link=document.createElement('a');
  link.download=`${sceneLabel.replace(/[^a-z0-9_-]+/gi,'-')}-${revision}-${viewPreset}${wireframe?'-wireframe':''}-${hour}.png`;
  link.href=webgl.domElement.toDataURL('image/png');link.click();
 };
 const fitSite=()=>{
  target.current.copy(terrainOrigin.current);
  orbit.current={az:.88,el:.5,distance:Math.max(terrain.width,terrain.depth)*.82};
  setMode('orbit');
 };
 const worldApi=useRef<Partial<WorldViewCommands>|null>(null);
 worldApi.current={
  setMode:next=>{if(next==='walk')walk.current.active=false;setMode(next)},
  setView,frame:reset,
  transitionCamera:(id,duration)=>{
   const from={...orbit.current},fromTarget=target.current.clone();
   if(['iso','plan','front','side'].includes(id))setView(id as ViewPreset);
   else worldApi.current?.setCamera?.(id);
   glide.current={from,fromTarget,to:{...orbit.current},toTarget:target.current.clone(),
     start:performance.now(),duration:Math.max(.1,duration)*1000};
  },
  stopTransition:()=>{glide.current=null},
  saveCamera:label=>{
   if(readOnly||mode!=='orbit'||!ready||!label.trim()||!onSceneSettings)return;
   const shot={id:crypto.randomUUID(),label:label.trim().slice(0,96),target:target.current.toArray() as [number,number,number],...orbit.current,fov:cameraFov};
   onSceneSettings({savedCameras:[...(settings?.savedCameras??[]),shot]});setActiveCamera(shot.id);
  },
  setCamera:id=>{
   const shot=settings?.savedCameras?.find(camera=>camera.id===id);
   if(!shot)return;
   target.current.fromArray(shot.target);orbit.current={az:shot.az,el:shot.el,distance:shot.distance};
   setMode('orbit');setCameraFov(shot.fov);setActiveCamera(shot.id);
  },
  setProjection:projection=>{if(!readOnly)onSceneSettings?.({projection})},
  setClip:(near,far)=>{
   if(!readOnly&&near>0&&far>near&&Number.isFinite(far))onSceneSettings?.({clipNear:near,clipFar:far});
  },
  toggleRoof:()=>{setRoofVisible(!roofVisible);onSceneSettings?.({roofVisible:!roofVisible})},
  toggleDaylight:()=>{
   const next=hour!=='day',altitude=next?54:11,azimuth=next?55:309,color=next?'#fff0d7':'#ffc18d';
   setHour(next?'day':'evening');setSunAltitude(altitude);setSunAzimuth(azimuth);setSunColor(color);
   setEnvironmentPresetId('custom');onLightingChange?.({environmentPresetId:'custom',timeOfDay:next?'noon':'sunset',sunAltitude:altitude,sunAzimuth:azimuth,sunColor:color});
  },
  toggleWireframe:()=>setWireframe(v=>!v),
  visitRoom:id=>{const z=handoff?.zones.find(x=>x.roomId===id);if(z)visit(z)},
  capture:exportSnapshot,
  setShading:value=>{setShading(value);onLightingChange?.({shading:value})},
  setExposure:value=>{setExposure(value);onLightingChange?.({exposure:value})},
  setSun:value=>{setSunStrength(value);setEnvironmentPresetId('custom');onLightingChange?.({intensity:value,environmentPresetId:'custom'})},
  setAmbient:value=>{setFillStrength(value);setEnvironmentPresetId('custom');onLightingChange?.({ambientIntensity:value,environmentPresetId:'custom'})},
  setSky:value=>{setSkyVisible(value);setEnvironmentPresetId('custom');onLightingChange?.({skyVisible:value,environmentPresetId:'custom'})},
  setSunAltitude:value=>{setSunAltitude(value);setHour(value<25?'evening':'day');setEnvironmentPresetId('custom');onLightingChange?.({sunAltitude:value,timeOfDay:value<25?'sunset':'noon',environmentPresetId:'custom'})},
  setSunAzimuth:value=>{setSunAzimuth(value);setEnvironmentPresetId('custom');onLightingChange?.({sunAzimuth:value,environmentPresetId:'custom'})},
  setSunColor:value=>{setSunColor(value);setEnvironmentPresetId('custom');onLightingChange?.({sunColor:value,environmentPresetId:'custom'})},
  setSkyColor:value=>{setSkyColor(value);setEnvironmentPresetId('custom');onLightingChange?.({skyColor:value,environmentPresetId:'custom'})},
  setGroundColor:value=>{setGroundColor(value);setEnvironmentPresetId('custom');onLightingChange?.({groundColor:value,environmentPresetId:'custom'})},
  setCameraFov:value=>{const next=THREE.MathUtils.clamp(value,20,90);setCameraFov(next);onSceneSettings?.({cameraFov:next})},
  setEnvironmentPreset:id=>{
   const preset=WORLD_ENVIRONMENT_PRESETS.find(item=>item.id===id);if(!preset)return;
   setEnvironmentPresetId(id);setHour(preset.daylight?'day':'evening');setSunAltitude(preset.sunAltitude);setSunAzimuth(preset.sunAzimuth);
   setSunStrength(preset.sun);setFillStrength(preset.ambient);setSkyVisible(preset.sky);setSunColor(preset.sunColor);setSkyColor(preset.skyColor);setGroundColor(preset.groundColor);
   setSkyTurbidity(preset.skyTurbidity);setSkyRayleigh(preset.skyRayleigh);setSkyMieCoefficient(preset.skyMieCoefficient);setSkyMieDirectionalG(preset.skyMieDirectionalG);
   onLightingChange?.({environmentPresetId:id,timeOfDay:preset.daylight?'noon':'sunset',sunAltitude:preset.sunAltitude,sunAzimuth:preset.sunAzimuth,intensity:preset.sun,ambientIntensity:preset.ambient,skyVisible:preset.sky,sunColor:preset.sunColor,skyColor:preset.skyColor,groundColor:preset.groundColor,skyTurbidity:preset.skyTurbidity,skyRayleigh:preset.skyRayleigh,skyMieCoefficient:preset.skyMieCoefficient,skyMieDirectionalG:preset.skyMieDirectionalG});
  },
  setSkyTurbidity:value=>{setSkyTurbidity(value);setEnvironmentPresetId('custom');onLightingChange?.({skyTurbidity:value,environmentPresetId:'custom'})},
  setSkyRayleigh:value=>{setSkyRayleigh(value);setEnvironmentPresetId('custom');onLightingChange?.({skyRayleigh:value,environmentPresetId:'custom'})},
  setSkyMieCoefficient:value=>{setSkyMieCoefficient(value);setEnvironmentPresetId('custom');onLightingChange?.({skyMieCoefficient:value,environmentPresetId:'custom'})},
  setSkyMieDirectionalG:value=>{setSkyMieDirectionalG(value);setEnvironmentPresetId('custom');onLightingChange?.({skyMieDirectionalG:value,environmentPresetId:'custom'})},
  setShadows:value=>{setShadows(value);onLightingChange?.({shadows:value})},
  setShadowQuality:value=>{setShadowQuality(value);onLightingChange?.({shadowQuality:value})},
  setToneMapping:value=>{setToneMapping(value);onLightingChange?.({toneMapping:value})},
  resetLight:()=>{
   setShading('lit');setExposure(.72);setSunStrength(1);setFillStrength(.55);setSkyVisible(true);setHour('day');
   setSunAltitude(54);setSunAzimuth(55);setSunColor('#fff0d7');setSkyColor('#dceeff');setGroundColor('#53644d');setEnvironmentPresetId('daylight');
   setSkyTurbidity(3.5);setSkyRayleigh(2.1);setSkyMieCoefficient(.005);setSkyMieDirectionalG(.78);
   setShadows(true);setShadowQuality(typeof window!=='undefined'&&window.innerWidth<768?'medium':'high');setToneMapping('aces');
   onLightingChange?.({...DEFAULT_CAD_LIGHTING});
  },
 };
 useEffect(()=>registerWorldView(()=>worldApi.current as Partial<WorldViewCommands>),[]);
 useEffect(()=>{publishWorldView({kind:'world',cameras:(settings?.savedCameras??[]).map(({id,label})=>({id,label})),cameraId:activeCamera,projection,clipNear,clipFar,ready,mode,viewPreset,roofVisible,daylight:hour==='day',wireframe,shading,exposure,sun:sunStrength,ambient:fillStrength,sky:skyVisible,
  sunAltitude,sunAzimuth,sunColor,skyColor,groundColor,environmentPresetId,cameraFov,skyTurbidity,skyRayleigh,skyMieCoefficient,skyMieDirectionalG,shadows,shadowQuality,toneMapping,
  rooms:(handoff?.zones??[]).map(z=>({id:z.roomId,label:z.label})),siteOpen:terrainOpen,canEditSite:siteEditable,canEditScene:!readOnly,label:sceneLabel,revision})},
  [activeCamera,settings?.savedCameras,projection,clipNear,clipFar,ready,mode,viewPreset,roofVisible,hour,wireframe,handoff,terrainOpen,siteEditable,readOnly,sceneLabel,revision,shading,exposure,sunStrength,fillStrength,skyVisible,sunAltitude,sunAzimuth,sunColor,skyColor,groundColor,environmentPresetId,cameraFov,skyTurbidity,skyRayleigh,skyMieCoefficient,skyMieDirectionalG,shadows,shadowQuality,toneMapping]);
 // Site edits persist on this device per project revision until a revision host is connected.
 const terrainKey=`cad.terrain.v1:${sceneLabel}:${revision}`;
 useEffect(()=>{if(onSceneSettings)return;try{const raw=localStorage.getItem(terrainKey);if(raw)setTerrain(validateTerrainDocument(JSON.parse(raw)))}catch{/* storage unavailable or invalid */}},[terrainKey,onSceneSettings]);
 useEffect(()=>{if(onSceneSettings)return;try{localStorage.setItem(terrainKey,JSON.stringify(terrain))}catch{/* storage unavailable */}},[terrain,terrainKey,onSceneSettings]);
 useEffect(()=>{
  const host=mount.current;if(!host)return;
  const theme=readCadTheme(host);
  let alive=true;
  let gltfRoot:THREE.Object3D|null=null;
  // Shared renderer lifecycle; the CAD orbit/walk camera controller remains native to this workspace.
  const viewport=createThreeViewport(host,{THREE},{
    wrapper:false,controls:false,autoRender:false,lights:false,
    fov:56,near:.06,far:2400,maxPixelRatio:2,background:theme.background,
    powerPreference:'high-performance',preserveDrawingBuffer:true,
    shadowMap:{enabled:true,type:THREE.PCFShadowMap},
    toneMapping:THREE.ACESFilmicToneMapping,toneMappingExposure:.72,
  });
  const scene=viewport.scene as THREE.Scene;sceneRef.current=scene;
  const camera=viewport.camera as THREE.PerspectiveCamera;cameraRef.current=camera;
  const ortho=new THREE.OrthographicCamera();
  renderCamera.current=camera;
  const context=viewport.renderer as unknown as THREE.WebGLRenderer;renderer.current=context;
  const sun=new THREE.DirectionalLight('#fff0d7',1.05);sun.position.set(80,125,55);sun.castShadow=true;
  const shadowSize=window.innerWidth<768?1024:2048;
  sun.shadow.mapSize.set(shadowSize,shadowSize);sun.shadow.camera.left=-105;sun.shadow.camera.right=105;
  sun.shadow.camera.top=105;sun.shadow.camera.bottom=-105;sun.shadow.camera.near=1;sun.shadow.camera.far=310;
  sun.shadow.bias=-0.0002;sun.shadow.normalBias=0.025;scene.add(sun);
  const fill=new THREE.HemisphereLight('#dceeff','#53644d',0.55);scene.add(fill);
  const sky=new Sky();sky.scale.setScalar(1000);
  sky.material.uniforms['turbidity'].value=3.5;
  sky.material.uniforms['rayleigh'].value=2.1;
  sky.material.uniforms['mieCoefficient'].value=0.005;
  sky.material.uniforms['mieDirectionalG'].value=0.78;
  sky.material.uniforms['sunPosition'].value.copy(sun.position);
  scene.add(sky);
  scene.fog=new THREE.Fog('#b5c5cb',260,1150);
  environmentRef.current={sky,sun,fill};
  viewport.resize(); // Shared viewport owns ResizeObserver and GPU canvas sizing.
  const ray=new THREE.Raycaster();const floorRay=new THREE.Raycaster();
  let animation=0,last=performance.now();
  let loaded=false;
  const measureScene=trackCadRenderer("Registered CAD scene",context,host);
  const animate=(now:number)=>{
   if(!alive)return;
   const delta=Math.min((now-last)/1000,.075);last=now;
   const state=displayRef.current;
   if(state.mode==='orbit'){
    const move=glide.current;
    if(move){
      const elapsed=Math.min(1,(now-move.start)/move.duration);
      const t=THREE.MathUtils.smootherstep(elapsed,0,1);
      const arc=Math.atan2(Math.sin(move.to.az-move.from.az),Math.cos(move.to.az-move.from.az));
      orbit.current={az:move.from.az+t*arc,el:THREE.MathUtils.lerp(move.from.el,move.to.el,t),
        distance:THREE.MathUtils.lerp(move.from.distance,move.to.distance,t)};
      target.current.lerpVectors(move.fromTarget,move.toTarget,t);
      if(elapsed>=1)glide.current=null;
    }
    const o=orbit.current;
    camera.position.set(
      target.current.x+Math.sin(o.az)*Math.cos(o.el)*o.distance,
      target.current.y+Math.sin(o.el)*o.distance,
      target.current.z+Math.cos(o.az)*Math.cos(o.el)*o.distance
    );
    camera.lookAt(target.current);
   } else {
    const view=walk.current;
    if(!view.active){view.position.copy(camera.position);view.active=true}
    const move=new THREE.Vector3();
    if(pressed.current.has('KeyW')||pressed.current.has('ArrowUp'))move.z-=1;
    if(pressed.current.has('KeyS')||pressed.current.has('ArrowDown'))move.z+=1;
    if(pressed.current.has('KeyA')||pressed.current.has('ArrowLeft'))move.x-=1;
    if(pressed.current.has('KeyD')||pressed.current.has('ArrowRight'))move.x+=1;
    if(move.lengthSq()>0){
      move.normalize().applyAxisAngle(new THREE.Vector3(0,1,0),view.yaw);
      const speed=(pressed.current.has('ShiftLeft')?5.5:2.7)*delta;
      const step=move.multiplyScalar(speed);
      const blocked=collidersRef.current.some(hit=>{
        if(!('isMesh' in hit))return false;
        const distance=step.length();
        const direction=step.clone().normalize();
        ray.set(view.position.clone(),direction);
        ray.far=distance+0.33;
        return ray.intersectObject(hit,false).length>0;
      });
      if(!blocked){
        const next=view.position.clone().add(step);
        // Keep camera at standing eye height above real floor when a slab is below.
        floorRay.set(next.clone().add(new THREE.Vector3(0,.3,0)),new THREE.Vector3(0,-1,0));
        floorRay.far=3.5;
        const ground=floorRay.intersectObjects([...collidersRef.current,...(terrainProjection.current?[terrainProjection.current.surface]:[])],false)
          .find(hit=>hit.face?.normal && hit.face.normal.y>.4);
        if(ground)next.y=ground.point.y+1.65;
        view.position.copy(next);
      }
    }
    camera.position.copy(view.position);
    camera.rotation.order='YXZ';
    camera.rotation.y=view.yaw;camera.rotation.x=view.pitch;camera.rotation.z=0;
   }
   if(projectionRef.current==='orthographic'&&state.mode==='orbit'){
    const halfHeight=orbit.current.distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    ortho.top=halfHeight;ortho.bottom=-halfHeight;ortho.right=halfHeight*camera.aspect;ortho.left=-ortho.right;
    ortho.near=camera.near;ortho.far=camera.far;ortho.updateProjectionMatrix();
    ortho.position.copy(camera.position);ortho.quaternion.copy(camera.quaternion);renderCamera.current=ortho;
   } else renderCamera.current=camera;
   context.render(scene,renderCamera.current);
   measureScene(now);
   animation=requestAnimationFrame(animate);
  };
  animation=requestAnimationFrame(animate);
  const fetchWorld=async()=>{
   try{
    if(manifestUrl){
     const manifestResponse=await fetch(manifestUrl,{credentials:'same-origin'});
     if(manifestResponse.ok){
      const raw=await manifestResponse.text();
      if(raw.trim()){
       try{const manifest: Handoff=JSON.parse(raw);if(alive&&Array.isArray(manifest.zones))setHandoff(manifest)}
       catch{if(alive)setProgress('Model handoff metadata invalid; opening scene geometry.')}
      }
     }
    }
    if(!alive)return;setProgress('Streaming registered model geometry…');
    createConfiguredGLTFLoader({THREE,GLTFLoader,DRACOLoader},{withCredentials:modelUrl.startsWith('/')}).load(modelUrl, gltf=>{
      if(!alive)return;
      gltfRoot=gltf.scene;
      const box=new THREE.Box3().setFromObject(gltfRoot);
      if(box.isEmpty())throw Error('Model GLB contains no geometry');
      bounds.current.copy(box);
      // Frame the real architecture, not the full parcel's Ground mesh;
      // the previous fit made the house a tiny speck on a bright field.
      const architectureBox=new THREE.Box3();
      gltfRoot.traverse(node=>{
        const category=String(node.userData?.Category||'').toLowerCase();
        if(node instanceof THREE.Mesh&&['wall','window','door','roof','slab'].includes(category))
          architectureBox.expandByObject(node);
        if(/^Ground(?:$|[_.])/i.test(node.name)){
          // Original surveyed/staged site is preserved in the GLB. Replace only its
          // visual projection with an editable terrain surface at its measured top.
          const groundBox=new THREE.Box3().setFromObject(node);
          const groundCenter=groundBox.getCenter(new THREE.Vector3());
          terrainOrigin.current.set(groundCenter.x,groundBox.max.y-.02,groundCenter.z);
          node.visible=false;
        }
      });
      const focusBox=architectureBox.isEmpty()?box:architectureBox;
      modelBounds.current.copy(focusBox);
      const center=focusBox.getCenter(new THREE.Vector3()),size=focusBox.getSize(new THREE.Vector3());
      const environment=environmentRef.current;
      if(environment){
        environment.sun.target.position.copy(center);
        scene.add(environment.sun.target);
      }
      target.current.copy(center);
      const ratio=host.clientWidth/Math.max(1,host.clientHeight);
      orbit.current={az:.88,el:.49,distance:Math.max(11,size.length()*(ratio<.7?1.7:ratio<1.25?1.15:.85))};
      walk.current.position.set(center.x,Math.max(1.65,box.min.y+1.65),center.z);
      const structure:THREE.Object3D[]=[];
      const categories=new Map<string,number>();
      materialSets.current.clear();
      const authoredMaterialPalette=new Map<THREE.Material,THREE.MeshBasicMaterial>();
      const materialColor=(source:THREE.Material):THREE.MeshBasicMaterial=>{
        const cached=authoredMaterialPalette.get(source);
        if(cached)return cached;
        const gltf=source as THREE.MeshStandardMaterial;
        const material=new THREE.MeshBasicMaterial({
          name:'CAD Color Fidelity · '+source.name,
          color:gltf.color?.clone()||new THREE.Color('#a6a9a7'),
          map:gltf.map??null,transparent:gltf.transparent,opacity:gltf.opacity,
          side:gltf.side,alphaTest:gltf.alphaTest,toneMapped:false,
        });
        authoredMaterialPalette.set(source,material);
        return material;
      };
      gltfRoot.traverse(o=>{
        if(!(o instanceof THREE.Mesh))return;
        // Retain the imported physical materials: replacing every PBR shader
        // with MeshBasicMaterial discards all directional lighting and shadows.
        // Keep the historical unlit swatches available as an explicit fallback.
        const lit=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();
        const color=Array.isArray(lit)?lit.map(materialColor):materialColor(lit);
        materialSets.current.set(o,{lit,color});
        o.material=lit;
        // Preserve authored transparent glazing and structural shadow rules.
        // Transparent glazing does not cast opaque shadows on interior surfaces.
        const mats=Array.isArray(o.material)?o.material:[o.material];
        const isGlass=mats.some(m=>m.transparent&&m.opacity<0.98);
        const shadowCategory=String(o.userData?.Category||o.parent?.userData?.Category||'').toLowerCase();
        o.castShadow=!isGlass&&(['wall','roof','gable','door','column','slab'].includes(shadowCategory)||/cedar|boulder|pine|tree|rock/i.test(o.name));
        o.receiveShadow=true;
        const category=String(o.userData?.Category||o.parent?.userData?.Category||'').trim().toLowerCase();
        if(category)categories.set(category,(categories.get(category)||0)+1);
        if(['wall','slab','roof','site','door'].includes(category))structure.push(o);
      });
      bindings.current=indexSceneElements(gltfRoot);
      onSceneElements?.([...bindings.current.values()].map(binding=>binding.element));
      onSceneInventory?.([...categories].map(([category,count])=>({category,count})).sort((a,b)=>b.count-a.count));
      collidersRef.current=structure;
      assetRef.current=gltfRoot;scene.add(gltfRoot);loaded=true;
      const terrainScene=createTerrainProjection(terrainDocRef.current);
      terrainScene.root.position.copy(terrainOrigin.current);
      scene.add(terrainScene.root);terrainProjection.current=terrainScene;
      setReady(true);setProgress('');
    }, progress=>{
      if(progress.total)setProgress('Loading scene '+Math.min(100,Math.floor(100*progress.loaded/progress.total))+'%');
    },e=>{if(alive){setError('Model unavailable: '+String(e));setProgress('')}});
   }catch(e){if(alive){setError(String(e));setProgress('')}}
  };
  void fetchWorld();
  const onKey=(e:KeyboardEvent)=>{if(e.target instanceof HTMLElement&&!e.target.closest('input,textarea,select,button,summary,[contenteditable=true]')){pressed.current.add(e.code);if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();}};
  const onKeyUp=(e:KeyboardEvent)=>pressed.current.delete(e.code);
  window.addEventListener('keydown',onKey);window.addEventListener('keyup',onKeyUp);
  return()=>{
   alive=false;cancelAnimationFrame(animation);
   window.removeEventListener('keydown',onKey);window.removeEventListener('keyup',onKeyUp);
   terrainProjection.current?.dispose();terrainProjection.current=null;
   const sharedPbr=new Set<THREE.Material>(pbrMaterials.current.values());
   gltfRoot?.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>{if(!sharedPbr.has(m))m.dispose()})}});
   pbrMaterials.current.forEach(material=>material.dispose());pbrMaterials.current.clear();
   pbrTextures.current?.dispose();pbrTextures.current=null;
   sky.geometry.dispose();sky.material.dispose();
   environmentRef.current=null;
   materialSets.current.clear();
   bindings.current.clear();sourceColors.current.clear();
   if(selectedBox.current){selectedBox.current.geometry.dispose();(selectedBox.current.material as THREE.Material).dispose();selectedBox.current=null;}
   viewport.dispose();renderer.current=null;sceneRef.current=null;cameraRef.current=null;renderCamera.current=null;
  };
 },[modelUrl,manifestUrl]);
 useEffect(()=>{
  if(!ready)return;
  applySceneElementEdits(bindings.current,sceneElements,roofVisible);
  const usedMaterials=new Set<string>();
  const edits=new Map(sceneElements.map(element=>[element.id,element]));
  for(const [mesh,variants] of materialSets.current){
    const element=edits.get(String(mesh.userData.CadElementId));
    for(const variant of [variants.lit,variants.color])for(const mat of Array.isArray(variant)?variant:[variant]){
      const colored=mat as THREE.MeshStandardMaterial;
      if(!colored.color)continue;
      if(!sourceColors.current.has(mat))sourceColors.current.set(mat,colored.color.clone());
      colored.color.copy(element?.color&&!element.materialPresetId?new THREE.Color(element.color):sourceColors.current.get(mat)!);
    }
    const preset=element?.materialPresetId?PROCEDURAL_PBR_MATERIAL_MAP[element.materialPresetId]:undefined;
    let pbrMaterial:THREE.MeshPhysicalMaterial|undefined;
    if(preset){
      if(!pbrTextures.current)pbrTextures.current=createStudioTextures(THREE,renderer.current?.capabilities.getMaxAnisotropy()??1);
      const finish=element?.finish;
      const key=finish?preset.id+JSON.stringify(finish):preset.id;
      usedMaterials.add(key);
      pbrMaterial=pbrMaterials.current.get(key);
      if(!pbrMaterial){
        pbrMaterial=createProceduralPbrMaterial(THREE,{...preset,...finish},pbrTextures.current,isSoftwareWebGLRenderer(renderer.current)) as THREE.MeshPhysicalMaterial;
        if(finish?.opacity!==undefined){pbrMaterial.opacity=finish.opacity;pbrMaterial.transparent=finish.opacity<1||preset.transmission>0}
        pbrMaterials.current.set(key,pbrMaterial);
      }
    }
    mesh.material=shading==='color'?variants.color:pbrMaterial?(Array.isArray(variants.lit)?variants.lit.map(()=>pbrMaterial!):pbrMaterial):variants.lit;
  }
  for(const [key,material] of pbrMaterials.current){
    if(!usedMaterials.has(key)){material.dispose();pbrMaterials.current.delete(key)}
  }
  const scene=sceneRef.current;if(!scene)return;
  if(selectedBox.current){scene.remove(selectedBox.current);selectedBox.current.geometry.dispose();(selectedBox.current.material as THREE.Material).dispose();selectedBox.current=null;}
  const binding=selectedElementId?bindings.current.get(selectedElementId):undefined;
  if(binding){const helper=new THREE.Box3Helper(sceneElementBounds(binding),new THREE.Color(readCadTheme(mount.current).accent));scene.add(helper);selectedBox.current=helper;}
 },[sceneElements,selectedElementId,roofVisible,ready,shading]);
 useEffect(()=>{
  const focus=(event:Event)=>{
    const binding=bindings.current.get((event as CustomEvent<string>).detail);if(!binding)return;
    const box=sceneElementBounds(binding);target.current.copy(box.getCenter(new THREE.Vector3()));
    const center=target.current,building=modelBounds.current;
    const sides=[{distance:Math.abs(center.x-building.min.x),az:-Math.PI/2},{distance:Math.abs(building.max.x-center.x),az:Math.PI/2},{distance:Math.abs(center.z-building.min.z),az:Math.PI},{distance:Math.abs(building.max.z-center.z),az:0}].sort((a,b)=>a.distance-b.distance);
    orbit.current={az:sides[0].az,el:.15,distance:Math.max(fitDistance(box.getSize(new THREE.Vector3()),cameraRef.current),sides[0].distance+3)};setMode('orbit');
  };
  window.addEventListener('cad:frame-element',focus);return()=>window.removeEventListener('cad:frame-element',focus);
 },[]);
 // Layout geometry is tessellated from the same native BRep used for export.
 useEffect(()=>{
  const scene=sceneRef.current;if(!scene||!ready||!layoutProject?.sceneSource||!layoutProject.walls.length){setNativeStatus('');return;}
  let cancelled=false,layer:THREE.Group|undefined;
  const material=new THREE.MeshStandardMaterial({color:readCadTheme(mount.current).accent,roughness:.7});setNativeStatus('Evaluating native layout…');
  void nativePlanLayer(layoutProject,()=>material).then(result=>{if(cancelled){disposeNativeLayer(result);return;}layer=result;scene.add(layer);setNativeStatus('Layout: OCCT solids');},error=>{if(!cancelled)setNativeStatus(String(error).includes('requires_desktop')?'Native model evaluation unavailable':String(error));});
  return()=>{cancelled=true;if(layer){scene.remove(layer);disposeNativeLayer(layer);}material.dispose();};
 },[ready,layoutProject?.walls,layoutProject?.doors,layoutProject?.windows,layoutProject?.nativeHistory,layoutProject?.sceneSource]);
 useEffect(()=>{
  const camera=cameraRef.current;if(!ready||!camera)return;
  camera.near=clipNear;camera.far=clipFar;camera.fov=THREE.MathUtils.clamp(cameraFov,20,90);camera.updateProjectionMatrix();
 },[ready,cameraFov,clipNear,clipFar]);

 useEffect(()=>{
  const scene=sceneRef.current;if(!ready||!scene||!settings?.lights?.length)return;
  const group=new THREE.Group();
  const lights=settings.lights.map(spec=>{
   const light=spec.kind==='point'?new THREE.PointLight(spec.color,spec.intensity,spec.range):
    spec.kind==='spot'?new THREE.SpotLight(spec.color,spec.intensity,spec.range,THREE.MathUtils.degToRad(spec.cone)):
    new THREE.DirectionalLight(spec.color,spec.intensity);
   light.name=spec.name;light.position.fromArray(spec.position);light.castShadow=spec.shadows;
   if('target' in light){light.target.position.fromArray(spec.target);group.add(light.target)}
   group.add(light);return light;
  });
  scene.add(group);
  return ()=>{group.removeFromParent();lights.forEach(light=>light.dispose())};
 },[ready,settings?.lights,modelUrl]);
 useEffect(()=>{
  const environment=environmentRef.current,scene=sceneRef.current;
  if(!environment||!scene)return;
  const altitude=THREE.MathUtils.degToRad(sunAltitude),azimuth=THREE.MathUtils.degToRad(sunAzimuth);
  environment.sun.position.set(Math.sin(azimuth)*Math.cos(altitude),Math.sin(altitude),Math.cos(azimuth)*Math.cos(altitude)).multiplyScalar(160);
  environment.sun.intensity=sunStrength;
  environment.sun.color.set(sunColor);
  environment.fill.intensity=fillStrength;
  environment.fill.color.set(skyColor);
  environment.fill.groundColor.set(groundColor);
  environment.sky.visible=skyVisible;
  const uniforms=environment.sky.material.uniforms;
  uniforms['sunPosition'].value.copy(environment.sun.position);
  uniforms['turbidity'].value=skyTurbidity;uniforms['rayleigh'].value=skyRayleigh;
  uniforms['mieCoefficient'].value=skyMieCoefficient;uniforms['mieDirectionalG'].value=skyMieDirectionalG;
  scene.fog=(settings?.fog?.enabled??true)?new THREE.Fog(skyColor,settings?.fog?.near??260,settings?.fog?.far??1150):null;
 },[settings?.fog,ready,sunAltitude,sunAzimuth,sunStrength,sunColor,fillStrength,skyColor,groundColor,skyVisible,skyTurbidity,skyRayleigh,skyMieCoefficient,skyMieDirectionalG]);
 useEffect(()=>{
  for(const mesh of materialSets.current.keys()){
   for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
    if('wireframe' in material)(material as THREE.MeshStandardMaterial).wireframe=wireframe;
   }
  }
 },[sceneElements,shading,wireframe,ready]);
 useEffect(()=>{if(renderer.current)renderer.current.toneMappingExposure=exposure;},[exposure]);
 useEffect(()=>{
  const webgl=renderer.current,environment=environmentRef.current;if(!webgl||!environment)return;
  const size=shadowQuality==='low'?512:shadowQuality==='medium'?1024:2048;
  environment.sun.shadow.bias=lighting.shadowBias;
  environment.sun.castShadow=shadows;webgl.shadowMap.enabled=shadows;
  environment.sun.shadow.map?.dispose();environment.sun.shadow.map=null;
  environment.sun.shadow.mapSize.set(size,size);environment.sun.shadow.needsUpdate=true;webgl.shadowMap.needsUpdate=true;
 },[ready,lighting.shadowBias,shadows,shadowQuality]);
 useEffect(()=>{
  const webgl=renderer.current;if(!webgl)return;
  const mapping:Record<CadToneMapping,THREE.ToneMapping>={aces:THREE.ACESFilmicToneMapping,reinhard:THREE.ReinhardToneMapping,neutral:THREE.NeutralToneMapping,none:THREE.NoToneMapping};
  webgl.toneMapping=mapping[toneMapping];webgl.toneMappingExposure=exposure;
 },[toneMapping,exposure]);
 useEffect(()=>{const scene=sceneRef.current;if(scene)scene.background=new THREE.Color(skyVisible?skyColor:readCadTheme(mount.current).background);},[skyVisible,skyColor]);
 // Editing always regenerates the complete terrain projection from the same
 // document, so exported JSON and visible relief cannot diverge.
 useEffect(()=>{
  const scene=sceneRef.current;
  if(!scene||!ready)return;
  terrainProjection.current?.dispose();
  const projected=createTerrainProjection(terrain);
  projected.root.position.copy(terrainOrigin.current);
  scene.add(projected.root);terrainProjection.current=projected;
 },[terrain,ready]);
 const pick=useCallback((event:React.PointerEvent<HTMLDivElement>)=>{
  if(!ready||!assetRef.current||!renderCamera.current||!renderer.current)return;
  const rect=renderer.current.domElement.getBoundingClientRect(),nx=(event.clientX-rect.left)/rect.width*2-1,ny=-(event.clientY-rect.top)/rect.height*2+1;
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(nx,ny),renderCamera.current);
  const hit=ray.intersectObject(assetRef.current,true)[0]?.object;
  if(!hit)return;
  let o:THREE.Object3D|null=hit;
  while(o&&!o.userData?.CadElementId&&!o.userData?.DesignId)o=o.parent;
  if(!o)return;
  const selected={designId:String(o.userData.CadElementId||o.userData.DesignId),category:String(o.userData.Category||'component'),nodeName:o.name,source:String(o.userData.Source||revision)};
  setSelection(selected);onSelect?.(selected,{x:event.clientX,y:event.clientY});
 },[ready,onSelect]);
 const sculptAt=useCallback((event:React.PointerEvent<HTMLDivElement>,force=false)=>{
  const brush=terrainBrushRef.current,projection=terrainProjection.current,camera=renderCamera.current,webgl=renderer.current;
  if(!brush.mode||!projection||!camera||!webgl)return;
  const now=performance.now();
  if(!force&&now-lastBrushAt.current<90)return;
  const rect=webgl.domElement.getBoundingClientRect();
  const nx=(event.clientX-rect.left)/rect.width*2-1,ny=-(event.clientY-rect.top)/rect.height*2+1;
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(nx,ny),camera);
  const intersection=ray.intersectObject(projection.surface,false)[0];
  if(!intersection)return;
  const local=intersection.point.clone().sub(terrainOrigin.current);
  lastBrushAt.current=now;
  changeTerrain(current=>addSculptStroke(current,local.x,local.z,brush.radius,brush.strength,brush.mode!));
 },[onSceneSettings]);
 const start=useCallback((e:React.PointerEvent<HTMLDivElement>)=>{
  glide.current=null;
  if(e.button!==0&&e.pointerType==='mouse')return;
  if(e.pointerType==='touch'){
   touchPointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(touchPointers.current.size===2){const points=[...touchPointers.current.values()];pinchDistance.current=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);pointer.current=null;}
  }
  if(!pointer.current&&touchPointers.current.size<=1)pointer.current={x:e.clientX,y:e.clientY,id:e.pointerId,distance:0};
  e.currentTarget.setPointerCapture(e.pointerId);
  if(terrainBrushRef.current.mode)sculptAt(e,true);
 },[sculptAt]);
 const drag=useCallback((e:React.PointerEvent<HTMLDivElement>)=>{
  if(touchPointers.current.has(e.pointerId)){
   touchPointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(touchPointers.current.size===2){
    const points=[...touchPointers.current.values()],distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);
    if(pinchDistance.current&&distance>0&&displayRef.current.mode==='orbit')orbit.current.distance=Math.max(3,Math.min(350,orbit.current.distance*pinchDistance.current/distance));
    pinchDistance.current=distance;return;
   }
  }
  const p=pointer.current;if(!p||p.id!==e.pointerId)return;
  const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;p.distance+=Math.hypot(dx,dy);
  if(terrainBrushRef.current.mode){sculptAt(e);return;}
  if(displayRef.current.mode==='orbit'){
   orbit.current.az-=dx*ORBIT_SPEED;
   orbit.current.el=Math.max(.045,Math.min(Math.PI/2-.015,orbit.current.el+dy*ORBIT_SPEED));
  }else{
   walk.current.yaw-=dx*.004;
   walk.current.pitch=Math.max(-1.4,Math.min(1.4,walk.current.pitch-dy*.004));
  }
 },[sculptAt]);
 const stop=(e:React.PointerEvent<HTMLDivElement>)=>{
  const wasPinching=pinchDistance.current!==null;
  touchPointers.current.delete(e.pointerId);
  if(touchPointers.current.size<2)pinchDistance.current=null;
  const p=pointer.current;if(p?.id===e.pointerId){if(!wasPinching&&!terrainBrushRef.current.mode&&p.distance<5)pick(e);pointer.current=null}
 };
 return <section className="relative h-full min-h-0 min-w-0 flex-1 bg-[var(--cad-bg)] text-[var(--cad-ink)]" data-cad-world="project-revision" data-world-ready={ready?'true':'false'}>
   <div ref={mount} role="img" aria-label={`${sceneLabel} ${revision} BIM world`}
     className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing"
     onPointerDown={start} onPointerMove={drag} onPointerUp={stop}
     onWheel={e=>{
       glide.current=null;
       if(displayRef.current.mode!=='orbit')return;
       const extent=modelBounds.current.getSize(new THREE.Vector3()).length();
       const minDistance=selectedElementId?1.5:Math.max(6,extent*.45);
       const maxDistance=Math.max(250,minDistance*8);
       const step=Math.max(-240,Math.min(240,e.deltaY));
       orbit.current.distance=Math.max(minDistance,Math.min(maxDistance,orbit.current.distance*Math.exp(step*.0015)));
     }}/>
   <div className="cad-viewport-overlay" aria-label="3D viewport status">
     <div className="cad-viewport-overlay__chip cad-viewport-overlay__identity"><span>CAD Creator</span><span className="cad-viewport-overlay__sep" aria-hidden="true">·</span><strong title={sceneLabel}>{sceneLabel}</strong></div>
     <div className="cad-viewport-overlay__chip"><span>Rev {revision}</span><span className="cad-viewport-overlay__sep" aria-hidden="true">·</span><span>{mode==='walk'?'Walk':'Orbit'}</span></div>
     {progress||error?null:<div className="cad-viewport-overlay__hint">Lightweight HUD · full GLB loads only in this workspace</div>}
   </div>
   {nativeStatus&&<div className="absolute bottom-3 left-3 text-xs bg-[var(--cad-surface)] text-[var(--cad-ink)] px-2 py-1" role="status">{nativeStatus}</div>}
   {mode==='walk'&&<div className="pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2 rounded-lg bg-[var(--cad-surface)] px-3 py-2 text-center text-xs text-[var(--cad-ink)]">W A S D · drag to look · Shift to move faster</div>}
   {mode==='walk'&&<div className="absolute bottom-16 left-3 z-20 flex gap-1 sm:hidden">
     {(['KeyW','KeyA','KeyS','KeyD'] as const).map((key,i)=><button key={key} type="button" aria-label={'Move '+['forward','left','back','right'][i]}
       onPointerDown={e=>{e.preventDefault();pressed.current.add(key)}} onPointerUp={()=>pressed.current.delete(key)} onPointerCancel={()=>pressed.current.delete(key)}
       className="rounded-lg border border-[var(--cad-line)] bg-[var(--cad-input)] px-3 py-2.5 text-xs font-bold">{['↑','←','↓','→'][i]}</button>)}
   </div>}
   {siteEditable&&terrainHost&&createPortal(<TerrainEditorPanel document={terrain} resetDocument={terrainInitialRef.current.document} onChange={changeTerrain} sculptMode={sculptMode} onSculptMode={next=>{setSculptMode(next);if(next)setMode('orbit')}}
     brushRadius={brushRadius} onBrushRadius={setBrushRadius} brushStrength={brushStrength} onBrushStrength={setBrushStrength}
     onFitSite={fitSite}/>,terrainHost)}
   {!terrainOpen&&selection&&!onSelect&&<aside className="absolute bottom-12 right-3 z-20 w-[min(310px,70vw)] rounded-lg border border-[var(--cad-line)] bg-[var(--cad-surface)] p-3 text-xs shadow-xl" aria-label="Selected BIM element">
     <div className="flex justify-between gap-2"><strong>BIM · {selection.category}</strong><button onClick={()=>setSelection(null)} aria-label="Close BIM inspector">×</button></div>
     <p className="mt-1 break-all font-mono text-[var(--cad-accent-ink)]">{selection.designId}</p>
     <p className="mt-1 text-[var(--cad-muted)]">{selection.nodeName} · {selection.source}</p>
   </aside>}
   <div className="absolute bottom-12 right-3 z-20"><ViewCube/></div>
   {(progress||error)&&<div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--cad-line)] bg-[var(--cad-surface)] px-5 py-4 text-center text-sm" role="status">{error||progress}</div>}

 </section>;
}
