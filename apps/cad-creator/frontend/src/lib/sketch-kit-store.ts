import {useSyncExternalStore} from 'react';

export type KitValue = number | string | boolean;
export type GizmoMode = 'move' | 'rotate' | 'scale';
export interface KitState {
  /** Id of the active catalog tool that has no live ActiveTool behind it yet; null when a live tool (or none) is active. */
  tool: string | null;
  /** Per-tool option overrides; defaults come from the catalog. */
  values: Record<string, Record<string, KitValue>>;
  gizmo: {mode: GizmoMode; space: 'world' | 'local'; snap: boolean; step: number};
}

let state: KitState = {tool: null, values: {}, gizmo: {mode: 'move', space: 'world', snap: true, step: 6}};
const listeners = new Set<() => void>();
const set = (next: KitState) => { state = next; listeners.forEach(l => l()); };

export const selectKitTool = (id: string | null) => set({...state, tool: id});
export const setKitOption = (tool: string, field: string, value: KitValue) =>
  set({...state, values: {...state.values, [tool]: {...state.values[tool], [field]: value}}});
export const setGizmo = (patch: Partial<KitState['gizmo']>) => set({...state, gizmo: {...state.gizmo, ...patch}});

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useKit = (): KitState => useSyncExternalStore(subscribe, () => state, () => state);
