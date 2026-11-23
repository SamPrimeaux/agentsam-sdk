import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { createConfiguredGLTFLoader } from '@inneranimalmedia/agentsam-3d-viewer';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { colorAdjustmentPreviewFilter, STAGE_ENVIRONMENT_DEFAULTS, STAGE_FINISHES, type CoProColorAdjustments, type CoProStageEnvironment } from '@inneranimalmedia/copro-ui';
// LOCAL-ONLY engine integration. Consume the actual SamScene sky renderer, not a
// second look-alike shader. Keep this behind UI acceptance before packaging.
import { SkyGenerator } from './samscene/skyGenerator.ts';

import { resolveSamSceneSkyId } from './SamSceneSkyBridge';


type SceneTransform = {x?:number;y?:number;scale?:number;rotation?:number;opacity?:number};
type SpatialTransform = {x?:number;y?:number;z?:number;rotationYDeg?:number;scale?:number;opacity?:number};
export type CoProWorldSceneProps = {
  src:string;
  title:string;
  timeUs:number;
  environment?:CoProStageEnvironment;
  adjustments?:CoProColorAdjustments;
  transform?:SceneTransform;
  world3dTransform?:SpatialTransform;
  world3dVisible?:boolean;
  skyVideoSrc?:string;
  playing?:boolean;
  onThumbnail?:(dataUrl:string)=>void;
};

type WorldHandle = {
  stage:THREE.Scene; renderer:THREE.WebGLRenderer;
  camera:THREE.PerspectiveCamera; controls:OrbitControls;
  sky:SkyGenerator; grid:THREE.GridHelper; hemi:THREE.HemisphereLight;
  key:THREE.DirectionalLight; bounce:THREE.DirectionalLight; ground:THREE.Mesh; shadowPlane:THREE.Mesh;
  model:THREE.Group|null; mixer:THREE.AnimationMixer|null;
  radius:number;center:THREE.Vector3;
};

/** Actual GLB geometry and animation tracks, not a flattened screenshot or CSS sky. */
export function CoProWorldScene({src,title,timeUs,environment,adjustments,transform,world3dTransform,world3dVisible=true,skyVideoSrc,playing=false,onThumbnail}:CoProWorldSceneProps) {
  const host=useRef<HTMLDivElement>(null);
  const skyVideoRef=useRef<HTMLVideoElement>(null);
  const world=useRef<WorldHandle|null>(null);
  const currentTime=useRef(timeUs);
  const playingRef=useRef(playing);
  playingRef.current=playing;
  const thumbnailCallback=useRef(onThumbnail);
  thumbnailCallback.current=onThumbnail;
  const [status,setStatus]=useState('Loading 3D scene…');
  const [hasModel,setHasModel]=useState(false);
  const [graphicsUnavailable,setGraphicsUnavailable]=useState(false);
  currentTime.current=timeUs;

  useEffect(()=>{
    const node=host.current;
    if(!node)return;
    let disposed=false;
    let raf=0;
    let resize:ResizeObserver|undefined;
    let root:THREE.Group|null=null;
    let mixer:THREE.AnimationMixer|null=null;
    const stage=new THREE.Scene();
    stage.background=null;
    const camera=new THREE.PerspectiveCamera(42,16/9,.01,100000);
    camera.position.set(3,2.2,5);
    // WebGL can be disabled (headless QA, older GPUs, remote desktops). A failed
    // renderer must never unmount CoPro or destroy the persisted scene clip.
    let renderer:THREE.WebGLRenderer;
    try {
      renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
    } catch {
      setGraphicsUnavailable(true);
      setStatus('WebGL is unavailable. Your 3D clip and edits remain in the project and timeline.');
      return;
    }
    setGraphicsUnavailable(false);
    renderer.setClearColor(0x000000,0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=STAGE_ENVIRONMENT_DEFAULTS.exposure;
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    node.appendChild(renderer.domElement);
    const controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=true;
    controls.dampingFactor=.08;
    controls.minDistance=.05;
    controls.maxDistance=10000;
    // SamScene's genuine sky engine, including cloud shaders, stellar actors,
    // procedural aurora and nebula. No separate CoPro sky shader is created.
    const sky=new SkyGenerator();
    const initialSky=sky.getConfig();
    sky.root.scale.setScalar(100);
    sky.root.visible=!skyVideoSrc;
    stage.add(sky.root as unknown as THREE.Object3D);
    const grid=new THREE.GridHelper(12,24,initialSky.horizonHex,initialSky.nadirHex);
    for(const material of Array.isArray(grid.material)?grid.material:[grid.material]){
      if(material instanceof THREE.LineBasicMaterial){material.transparent=true;material.opacity=.34;}
    }
    grid.visible=false;stage.add(grid);
    const hemi=new THREE.HemisphereLight(initialSky.horizonHex,initialSky.nadirHex,2.1);
    stage.add(hemi);
    const key=new THREE.DirectionalLight(initialSky.sunHex,3.3);
    key.position.set(4,7,5);key.castShadow=true;
    key.shadow.mapSize.set(1024,1024);
    key.shadow.camera.near=.05;key.shadow.camera.far=1000;
    stage.add(key);
    const bounce=new THREE.DirectionalLight(initialSky.cloudAccentHex,1.2);bounce.position.set(-4,3,-5);stage.add(bounce);
    const groundPlane=new THREE.Mesh(new THREE.PlaneGeometry(20000,20000),new THREE.MeshBasicMaterial({color:initialSky.horizonHex,toneMapped:false}));
    groundPlane.rotation.x=-Math.PI/2;groundPlane.position.y=-.015;stage.add(groundPlane);
    const shadowPlane=new THREE.Mesh(new THREE.PlaneGeometry(20000,20000),new THREE.ShadowMaterial({color:initialSky.nadirHex,opacity:.22}));
    shadowPlane.rotation.x=-Math.PI/2;shadowPlane.position.y=-.013;shadowPlane.receiveShadow=true;stage.add(shadowPlane);
    const handle:WorldHandle={stage,renderer,camera,controls,sky,grid,hemi,key,bounce,ground:groundPlane,shadowPlane,model:null,mixer:null,radius:1,center:new THREE.Vector3()};
    world.current=handle;
    const fit=()=>{
      const bounds=node.getBoundingClientRect();
      const w=Math.max(1,Math.round(bounds.width));const h=Math.max(1,Math.round(bounds.height));
      renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
    };
    fit();resize=new ResizeObserver(fit);resize.observe(node);
    const loader=createConfiguredGLTFLoader({THREE,GLTFLoader,DRACOLoader}) as GLTFLoader;
    loader.load(src,(gltf)=>{
      if(disposed){gltf.scene.traverse(child=>{if(child instanceof THREE.Mesh){child.geometry?.dispose();}});return;}
      root=gltf.scene;
      stage.add(root);
      const bounds=new THREE.Box3().setFromObject(root);
      const sphere=bounds.getBoundingSphere(new THREE.Sphere());
      const center=bounds.getCenter(new THREE.Vector3());
      const radius=Math.max(.1,Number.isFinite(sphere.radius)?sphere.radius:1);
      handle.radius=radius;
      handle.center.copy(center);
      root.position.sub(center);
      root.traverse(child=>{if(child instanceof THREE.Mesh){child.castShadow=true;child.receiveShadow=true;}});
      groundPlane.position.y=bounds.min.y-center.y-.035*radius;
      shadowPlane.position.y=groundPlane.position.y+.002*radius;
      grid.position.y=groundPlane.position.y+.004*radius;
      grid.scale.setScalar(Math.max(.1,radius));
      const distance=radius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))*1.35;
      camera.near=Math.max(.01,distance/1500);camera.far=Math.max(10000,distance*50);camera.updateProjectionMatrix();
      camera.position.set(distance*.52,distance*.35,distance*.82);
      controls.target.set(0,0,0);controls.minDistance=Math.max(radius*.35,.03);controls.maxDistance=Math.max(radius*40,30);
      controls.update();
      if(gltf.animations.length){
        mixer=new THREE.AnimationMixer(root);handle.mixer=mixer;
        for(const clip of gltf.animations)mixer.clipAction(clip).play();
      }
      handle.model=root;
      setHasModel(true);
      setStatus(`${gltf.animations.length} animation${gltf.animations.length===1?'':'s'} · orbit, zoom and scrub`);
      // Derive a real cover from this exact imported model and GPU render rather
      // than generating a generic icon or baked-in template thumbnail.
      requestAnimationFrame(()=>{
        if(disposed||!thumbnailCallback.current)return;
        renderer.render(stage,camera);
        try{
          const cover=document.createElement('canvas');cover.width=320;cover.height=180;
          const ctx=cover.getContext('2d');if(!ctx)return;
          ctx.drawImage(renderer.domElement,0,0,cover.width,cover.height);
          thumbnailCallback.current(cover.toDataURL('image/webp',.75));
        }catch { /* If screenshot capture is unavailable, retain the actual GLB without a synthetic poster. */ }
      });
    },undefined,error=>setStatus('3D scene could not be decoded: '+(error instanceof Error?error.message:String(error))));
    const animate=()=>{
      if(disposed)return;
      raf=requestAnimationFrame(animate);
      if(mixer)mixer.setTime(Math.max(0,currentTime.current/1_000_000));
      sky.update(currentTime.current/1_000_000,playingRef.current?1/60:0,{overall:0,low:0,mid:0,high:0,isPlaying:false});
      controls.update();renderer.render(stage,camera);
    };
    animate();
    return ()=>{
      disposed=true;cancelAnimationFrame(raf);resize?.disconnect();controls.dispose();
      mixer?.stopAllAction();
      root?.traverse(child=>{if(child instanceof THREE.Mesh){child.geometry?.dispose();
        const mats=Array.isArray(child.material)?child.material:[child.material];for(const mat of mats)mat.dispose();
        const original=child.userData.sourceMaterial as THREE.Material|THREE.Material[]|undefined;
        if(original && original!==child.material)for(const mat of Array.isArray(original)?original:[original])mat.dispose();}});
      sky.dispose();sky.root.removeFromParent();grid.geometry.dispose();
      for(const material of Array.isArray(grid.material)?grid.material:[grid.material]) material.dispose();
      groundPlane.geometry.dispose();
      (groundPlane.material as THREE.Material).dispose();
      shadowPlane.geometry.dispose();
      (shadowPlane.material as THREE.Material).dispose();
      renderer.dispose();renderer.domElement.remove();if(world.current===handle)world.current=null;
    };
  },[src]);

  useEffect(()=>{
    const renderer=world.current?.renderer;
    if(!renderer)return;
    renderer.domElement.style.filter=colorAdjustmentPreviewFilter(adjustments)||"none";
  },[adjustments,src]);

  useEffect(()=>{
    const handle=world.current;
    if(!handle)return;
    const preset=resolveSamSceneSkyId(environment?.skyPreset);
    handle.sky.setPreset(preset);
    handle.sky.applyConfig({
      cloudDensity:environment?.cloudDensity??handle.sky.getConfig().cloudDensity,
      progression:environment?.skyProgression??handle.sky.getConfig().progression,
      starIntensity:environment?.stars===false ? 0 : environment?.starIntensity??handle.sky.getConfig().starIntensity,
      galaxyIntensity:environment?.galaxyIntensity??handle.sky.getConfig().galaxyIntensity,
      auroraIntensity:environment?.auroraIntensity??handle.sky.getConfig().auroraIntensity,
    },true);
    handle.sky.setGlowEnabled(environment?.glow!==false);
    handle.sky.root.visible=!skyVideoSrc;
    handle.grid.visible=Boolean(environment?.showGrid);
    const skyConfig=handle.sky.getConfig();
    const ambient=environment?.ambient??1;
    handle.ground.visible=!skyVideoSrc;
    (handle.ground.material as THREE.MeshBasicMaterial).color.set(skyConfig.horizonHex);
    (handle.shadowPlane.material as THREE.ShadowMaterial).color.set(skyConfig.nadirHex);
    const gridMaterials=Array.isArray(handle.grid.material)?handle.grid.material:[handle.grid.material];
    gridMaterials.forEach((material,index)=>{
      if(material instanceof THREE.LineBasicMaterial)material.color.set(index===0?skyConfig.horizonHex:skyConfig.nadirHex);
    });
    handle.hemi.color.setHSL((environment?.lightHue??37)/360,.35,.92);
    handle.hemi.groundColor.set(skyConfig.nadirHex);
    handle.key.color.set(skyConfig.sunHex);
    handle.bounce.color.set(skyConfig.cloudAccentHex);
    handle.renderer.toneMappingExposure=environment?.exposure??STAGE_ENVIRONMENT_DEFAULTS.exposure;
    handle.stage.fog=(environment?.fogOpacity??0)>0
      ? new THREE.FogExp2(environment?.fogColor??skyConfig.horizonHex,(environment?.fogOpacity??0)*.008/Math.max(handle.radius,1)) : null;
    handle.hemi.intensity=1.4*ambient;
    handle.key.intensity=2.8*ambient;
    handle.bounce.intensity=1.2*ambient;
    handle.key.shadow.radius=environment?.shadowSoftness??2.5;
    handle.key.position.set(4*Math.cos((environment?.keyAngle??35)*Math.PI/180),7,5*Math.sin((environment?.keyAngle??35)*Math.PI/180));
    // Only override source materials when a stage finish is selected. PBR maps use
    // real MeshStandardMaterial properties; default GLB materials are preserved.
    if(handle.model){
      const finish=STAGE_FINISHES.find(item=>item.id===environment?.finish);
      handle.model.traverse(child=>{
        if(!(child instanceof THREE.Mesh))return;
        const mesh=child as THREE.Mesh & {userData:{sourceMaterial?:THREE.Material|THREE.Material[]}};
        if(!mesh.userData.sourceMaterial)mesh.userData.sourceMaterial=mesh.material;
        if(finish){
          const material=new THREE.MeshStandardMaterial({color:finish.color,metalness:finish.id==='carbon'?.28:.86,roughness:finish.id==='gold'?.29:.39});
          const previous=mesh.material;
          mesh.material=material;
          if(previous!==mesh.userData.sourceMaterial){
            for(const m of Array.isArray(previous)?previous:[previous])m.dispose();
          }
        }else{
          const previous=mesh.material;mesh.material=mesh.userData.sourceMaterial;
          if(previous!==mesh.userData.sourceMaterial)for(const m of Array.isArray(previous)?previous:[previous])m.dispose();
        }
      });
    }
  },[environment,hasModel,skyVideoSrc]);

  useEffect(()=>{
    const handle=world.current;if(!handle?.model)return;
    const target=handle.model;
    // CoPro persists scale/opacity as factors (1 = 100%), not UI percentages.
    const factor=Math.max(.025,world3dTransform?.scale??transform?.scale??1);
    target.scale.setScalar(factor);
    target.rotation.y=THREE.MathUtils.degToRad(world3dTransform?.rotationYDeg??transform?.rotation??0);
    // Spatial values are real scene coordinates. Legacy composition values
    // are interpreted as percentages only if no spatial override exists.
    target.position.x=-handle.center.x+(world3dTransform?.x??(transform?.x??0)/100*handle.radius*2);
    target.position.y=-handle.center.y+(world3dTransform?.y??(transform?.y??0)/100*handle.radius*2);
    target.position.z=-handle.center.z+(world3dTransform?.z??0);
    target.visible=world3dVisible;
    const opacity=Math.max(0,Math.min(1,world3dTransform?.opacity??transform?.opacity??1));
    target.traverse(child=>{
      if(!(child instanceof THREE.Mesh))return;
      for(const mat of Array.isArray(child.material)?child.material:[child.material]){
        mat.transparent=opacity<.999;mat.opacity=opacity;mat.depthWrite=opacity>=.999;mat.needsUpdate=true;
      }
    });
  },[transform,world3dTransform,world3dVisible,hasModel,environment]);

  useEffect(()=>{
    const video=skyVideoRef.current;
    if(!video)return;
    const target=timeUs/1_000_000;
    if(Number.isFinite(video.duration)&&video.duration>0 && Math.abs(video.currentTime-(target%video.duration))>.18)video.currentTime=target%video.duration;
    if(playing)void video.play().catch(()=>{});else video.pause();
  },[timeUs,playing,skyVideoSrc]);

  return <div ref={host} className="mm-world3d-player" data-world3d-scene={graphicsUnavailable?'unavailable':hasModel?'ready':'loading'} aria-label={'Editable 3D scene '+title}>
    {graphicsUnavailable&&<div className="mm-world3d-unavailable" role="status">
      <strong>3D preview unavailable</strong>
      <span>This device cannot initialize WebGL. The model is still on the timeline; its project data and controls remain available.</span>
    </div>}
    {skyVideoSrc&&<video ref={skyVideoRef} className="mm-world3d-sky-video" src={skyVideoSrc} muted playsInline loop preload="metadata" aria-label="Imported scene background video"/>}
    <div className="mm-world3d-status" role="status"><strong>3D Scene</strong><span>{status}</span></div>
    {!graphicsUnavailable&&<div className="mm-world3d-help">Drag to orbit · Scroll to zoom · Timeline to animate</div>}
  </div>;
}
