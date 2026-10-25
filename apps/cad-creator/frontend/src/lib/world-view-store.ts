import {useSyncExternalStore} from 'react';

export type WorldCameraMode = 'orbit' | 'walk';
export type WorldViewPreset = 'iso' | 'plan' | 'front' | 'side';

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
  label: string;
  revision: string;
  shading: 'lit' | 'color';
  exposure: number;
  sun: number;
  ambient: number;
  sky: boolean;
}

export interface WorldViewCommands {
  setCamera(cameraId: string): void;
  setMode(mode: WorldCameraMode): void;
  setView(preset: WorldViewPreset): void;
  frame(): void;
  toggleRoof(): void;
  toggleDaylight(): void;
  toggleWireframe(): void;
  visitRoom(roomId: string): void;
  capture(): void;
  toggleSite(): void;
  setShading(shading: 'lit' | 'color'): void;
  setExposure(value: number): void;
  setSun(value: number): void;
  setAmbient(value: number): void;
  setSky(on: boolean): void;
  resetLight(): void;
}

const initial: WorldViewState = {
  active: false, kind: 'world', cameraId: 'orbit', cameras: [], ready: false, mode: 'orbit', viewPreset: 'iso', roofVisible: true, daylight: true,
  wireframe: false, rooms: [], siteOpen: false, canEditSite: false, label: '', revision: '',
  shading: 'lit', exposure: 0.72, sun: 1, ambient: 0.55, sky: true,
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
  setMode: m => call('setMode', m),
  setView: p => call('setView', p),
  frame: () => call('frame'),
  toggleRoof: () => call('toggleRoof'),
  toggleDaylight: () => call('toggleDaylight'),
  toggleWireframe: () => call('toggleWireframe'),
  visitRoom: id => call('visitRoom', id),
  capture: () => call('capture'),
  toggleSite: () => call('toggleSite'),
  setShading: s => call('setShading', s),
  setExposure: v => call('setExposure', v),
  setSun: v => call('setSun', v),
  setAmbient: v => call('setAmbient', v),
  setSky: on => call('setSky', on),
  resetLight: () => call('resetLight'),
};

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useWorldView(): WorldViewState {
  return useSyncExternalStore(subscribe, () => state, () => initial);
}
