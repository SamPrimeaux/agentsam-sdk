import {useSyncExternalStore} from 'react';

export type WorldCameraMode = 'orbit' | 'walk';
export type WorldViewPreset = 'iso' | 'plan' | 'front' | 'side';
export type WorldShadowQuality = 'low' | 'medium' | 'high';
export type WorldToneMapping = 'aces' | 'reinhard' | 'neutral' | 'none';
export type WorldEnvironmentPresetId = 'daylight' | 'overcast' | 'golden-hour' | 'studio';
export interface WorldEnvironmentPreset {
  id:WorldEnvironmentPresetId; label:string; description:string; preview:string; daylight:boolean;
  sunAltitude:number; sunAzimuth:number; sun:number; ambient:number; sky:boolean; sunColor:string; skyColor:string; groundColor:string;
  skyTurbidity:number; skyRayleigh:number; skyMieCoefficient:number; skyMieDirectionalG:number;
}

/** Real THREE.Sky + directional/hemisphere lighting presets, not decorative theme swatches. */
export const WORLD_ENVIRONMENT_PRESETS: readonly WorldEnvironmentPreset[] = [
  {id:'daylight',label:'Daylight',description:'Neutral daylight with a clear blue atmosphere',preview:'linear-gradient(155deg,#8cc9f4 0%,#e5f4ff 58%,#e6c99a 100%)',daylight:true,sunAltitude:54,sunAzimuth:55,sun:1,ambient:0.55,sky:true,sunColor:'#fff0d7',skyColor:'#dceeff',groundColor:'#53644d',skyTurbidity:3.5,skyRayleigh:2.1,skyMieCoefficient:0.005,skyMieDirectionalG:0.78},
  {id:'overcast',label:'Overcast',description:'Soft diffuse illumination with a clouded, high-turbidity sky',preview:'linear-gradient(155deg,#8393a2 0%,#c5d0d8 58%,#687b7c 100%)',daylight:true,sunAltitude:48,sunAzimuth:90,sun:0.34,ambient:0.86,sky:true,sunColor:'#dce5ed',skyColor:'#b7c5d0',groundColor:'#66746e',skyTurbidity:8.5,skyRayleigh:1.25,skyMieCoefficient:0.018,skyMieDirectionalG:0.74},
  {id:'golden-hour',label:'Golden hour',description:'Low warm sun with amber atmospheric scattering',preview:'linear-gradient(155deg,#f6c078 0%,#e88b68 55%,#64505d 100%)',daylight:false,sunAltitude:12,sunAzimuth:240,sun:0.9,ambient:0.42,sky:true,sunColor:'#ffb36b',skyColor:'#f0a06a',groundColor:'#665145',skyTurbidity:4.2,skyRayleigh:2.8,skyMieCoefficient:0.012,skyMieDirectionalG:0.82},
  {id:'studio',label:'Studio',description:'Controlled cool fill with restrained directional light',preview:'linear-gradient(155deg,#202a36 0%,#526273 55%,#17212d 100%)',daylight:false,sunAltitude:35,sunAzimuth:45,sun:0.35,ambient:1,sky:true,sunColor:'#dce8f5',skyColor:'#29384a',groundColor:'#394656',skyTurbidity:2,skyRayleigh:0.8,skyMieCoefficient:0.003,skyMieDirectionalG:0.6},
];

export interface WorldViewState {
  active: boolean;
  /** 'world' = published BIM world viewport; 'model' = native project 3D view. */
  kind: 'world' | 'model';
  cameraId: string;
  cameras: {id: string; label: string}[];
  ready: boolean;
  mode: WorldCameraMode;
  viewPreset: WorldViewPreset;
  roofVisible: boolean;
  daylight: boolean;
  wireframe: boolean;
  rooms: {id: string; label: string}[];
  siteOpen: boolean;
  canEditSite: boolean;
  canEditScene: boolean;
  label: string;
  revision: string;
  shading: 'lit' | 'color';
  exposure: number;
  sun: number;
  ambient: number;
  sky: boolean;
  sunAltitude: number;
  sunAzimuth: number;
  sunColor: string;
  skyColor: string;
  groundColor: string;
  environmentPresetId:WorldEnvironmentPresetId|'custom';
  cameraFov:number;
  projection:'perspective'|'orthographic';
  clipNear:number;
  clipFar:number;
  skyTurbidity:number;
  skyRayleigh:number;
  skyMieCoefficient:number;
  skyMieDirectionalG:number;
  shadows: boolean;
  shadowQuality: WorldShadowQuality;
  toneMapping: WorldToneMapping;
}

export interface WorldViewCommands {
  setCamera(cameraId: string): void;
  transitionCamera(id:string,duration:number):void;
  stopTransition():void;
  saveCamera(label:string):void;
  setProjection(projection:'perspective'|'orthographic'):void;
  setClip(near:number,far:number):void;
  setMode(mode: WorldCameraMode): void;
  setView(preset: WorldViewPreset): void;
  frame(): void;
  toggleRoof(): void;
  toggleDaylight(): void;
  toggleWireframe(): void;
  visitRoom(roomId: string): void;
  capture(): void;
  setShading(shading: 'lit' | 'color'): void;
  setExposure(value: number): void;
  setSun(value: number): void;
  setAmbient(value: number): void;
  setSky(on: boolean): void;
  setSunAltitude(value: number): void;
  setSunAzimuth(value: number): void;
  setSunColor(value: string): void;
  setSkyColor(value: string): void;
  setGroundColor(value: string): void;
  setEnvironmentPreset(id:WorldEnvironmentPresetId):void;
  setCameraFov(value:number):void;
  setSkyTurbidity(value:number):void;
  setSkyRayleigh(value:number):void;
  setSkyMieCoefficient(value:number):void;
  setSkyMieDirectionalG(value:number):void;
  setShadows(on: boolean): void;
  setShadowQuality(value: WorldShadowQuality): void;
  setToneMapping(value: WorldToneMapping): void;
  resetLight(): void;
}

const initial: WorldViewState = {
  active: false, kind: 'world', cameraId: 'orbit', cameras: [], ready: false, mode: 'orbit', viewPreset: 'iso', roofVisible: true, daylight: true,
  wireframe: false, rooms: [], siteOpen: false, canEditSite: false, canEditScene: false, label: '', revision: '',
  shading: 'lit', exposure: 0.72, sun: 1, ambient: 0.55, sky: true,
  sunAltitude: 54, sunAzimuth: 55, sunColor: '#fff0d7', skyColor: '#dceeff', groundColor: '#53644d',
  environmentPresetId:'daylight', cameraFov:45, projection:'perspective', clipNear:.06, clipFar:2400, skyTurbidity:3.5, skyRayleigh:2.1, skyMieCoefficient:0.005, skyMieDirectionalG:0.78,
  shadows: true, shadowQuality: 'high', toneMapping: 'aces',
};

let state = initial;
let getApi: (() => Partial<WorldViewCommands>) | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

/** The viewport publishes its live state here; panels only read it. */
export function publishWorldView(patch: Partial<WorldViewState>) {
  state = {...state, ...patch};
  emit();
}

/** The viewport registers its command surface; returns the unregister callback. */
export function registerWorldView(api: () => Partial<WorldViewCommands>): () => void {
  getApi = api;
  publishWorldView({active: true});
  return () => {
    if (getApi === api) { getApi = null; state = initial; emit(); }
  };
}

const call = <K extends keyof WorldViewCommands>(name: K, ...args: Parameters<WorldViewCommands[K]>) =>
  (getApi?.()[name] as ((...a: unknown[]) => void) | undefined)?.(...args);

export const worldView: WorldViewCommands = {
  setCamera: id => call('setCamera', id),
  transitionCamera: (id,duration)=>call('transitionCamera',id,duration),
  stopTransition: ()=>call('stopTransition'),
  saveCamera: label=>call('saveCamera',label),
  setProjection: value=>call('setProjection',value),
  setClip: (near,far)=>call('setClip',near,far),
  setMode: m => call('setMode', m),
  setView: p => call('setView', p),
  frame: () => call('frame'),
  toggleRoof: () => call('toggleRoof'),
  toggleDaylight: () => call('toggleDaylight'),
  toggleWireframe: () => call('toggleWireframe'),
  visitRoom: id => call('visitRoom', id),
  capture: () => call('capture'),
  setShading: s => call('setShading', s),
  setExposure: v => call('setExposure', v),
  setSun: v => call('setSun', v),
  setAmbient: v => call('setAmbient', v),
  setSky: on => call('setSky', on),
  setSunAltitude: value => call('setSunAltitude', value),
  setSunAzimuth: value => call('setSunAzimuth', value),
  setSunColor: value => call('setSunColor', value),
  setSkyColor: value => call('setSkyColor', value),
  setGroundColor: value => call('setGroundColor', value),
  setEnvironmentPreset: id => call('setEnvironmentPreset', id),
  setCameraFov: value => call('setCameraFov', value),
  setSkyTurbidity: value => call('setSkyTurbidity', value),
  setSkyRayleigh: value => call('setSkyRayleigh', value),
  setSkyMieCoefficient: value => call('setSkyMieCoefficient', value),
  setSkyMieDirectionalG: value => call('setSkyMieDirectionalG', value),
  setShadows: on => call('setShadows', on),
  setShadowQuality: value => call('setShadowQuality', value),
  setToneMapping: value => call('setToneMapping', value),
  resetLight: () => call('resetLight'),
};

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useWorldView(): WorldViewState {
  return useSyncExternalStore(subscribe, () => state, () => initial);
}
