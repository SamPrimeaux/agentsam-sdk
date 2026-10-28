import {useSyncExternalStore} from 'react';
import type * as THREE from 'three';

export type RenderQuality = 'performance'|'balanced'|'quality';
export type SceneMetrics = {
 source:string;fps:number;frameMs:number;triangles:number;drawCalls:number;
 geometries:number;textures:number;width:number;height:number;pixelRatio:number;collectedAt:number;
};
type SceneState={metrics:SceneMetrics|null;quality:RenderQuality};
let state:SceneState={metrics:null,quality:'balanced'};
const listeners=new Set<()=>void>();
const emit=()=>{for(const fn of listeners)fn()};
const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}};
const snapshot=()=>state;
export const useScenePerformance=()=>useSyncExternalStore(subscribe,snapshot,snapshot);
export function setSceneQuality(quality:RenderQuality){
 if(quality===state.quality)return;
 state={...state,quality};emit();
}
export function publishSceneMetrics(metrics:SceneMetrics){state={...state,metrics};emit();}
export function renderQualityPixelRatio(quality:RenderQuality,deviceDpr:number){
 return Math.min(Math.max(0.5,deviceDpr),quality==='quality'?2:quality==='balanced'?1.5:1);
}
export function trackCadRenderer(source:string,renderer:THREE.WebGLRenderer,host:HTMLElement){
 let last=0,frames=0,lastQuality:RenderQuality|null=null;
 return (now:number)=>{
  if(state.quality!==lastQuality){
   lastQuality=state.quality;
   renderer.setPixelRatio(renderQualityPixelRatio(lastQuality,window.devicePixelRatio||1));
   renderer.setSize(Math.max(1,host.clientWidth),Math.max(1,host.clientHeight),false);
  }
  if(!last)last=now;
  frames++;
  const elapsed=now-last;
  if(elapsed<1000)return;
  const info=renderer.info,render=info.render;
  publishSceneMetrics({
   source,fps:Math.round(frames*1000/elapsed),frameMs:Math.round(elapsed/frames*10)/10,
   triangles:render.triangles,drawCalls:render.calls,
   geometries:info.memory.geometries,textures:info.memory.textures,
   width:host.clientWidth,height:host.clientHeight,
   pixelRatio:renderer.getPixelRatio(),collectedAt:Date.now()
  });
  last=now;frames=0;
 };
}
