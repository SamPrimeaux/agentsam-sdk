import type { CoProProject } from "@inneranimalmedia/copro-project";

export type CoProCommand =
  | { type: "project.set_cover"; payload: { cover: {kind:"frame"|"upload";url:string;timeUs?:number}|null } }
  | { type: "project.apply_template"; payload: { tracks: any[]; canvas?: any } }
  | { type: "project.set_environment"; payload: { patch: {background?:string;ambient?:number;fogColor?:string;fogOpacity?:number;showGrid?:boolean;skyPreset?:string;finish?:string;cloudDensity?:number;skyProgression?:number;starIntensity?:number;galaxyIntensity?:number;auroraIntensity?:number;stars?:boolean;glow?:boolean;lightHue?:number;shadowSoftness?:number;keyAngle?:number}|null } }
  | { type: "project.set_canvas"; payload: { width: number; height: number; frameRate?: number } }
  | { type: "clip.insert"; payload: { trackId: string; clip: unknown } }
  | { type: "clip.move"; payload: { clipId: string; startUs: number; trackId?: string } }
  | { type: "clip.trim"; payload: { clipId: string; startUs?: number; inUs?: number; durationUs?: number } }
  | { type: "clip.split"; payload: { clipId: string; atUs: number; rightClipId: string } }
  | { type: "clip.duplicate"; payload: { clipId: string; newClipId: string; startUs?: number } }
  | { type: "clip.set_speed"; payload: { clipId: string; playbackRate: number } }
  | { type: "clip.set_volume"; payload: { clipId: string; volume: number } }
  | { type: "clip.set_transform"; payload: { clipId: string; scale?: number; x?: number; y?: number; rotation?: number; opacity?: number } }
  | { type: "clip.set_world3d"; payload: { clipId: string; patch: { transform?: { x?:number; y?:number; z?:number; rotationYDeg?:number; scale?:number; opacity?:number }; visible?:boolean; animationIndex?:number; keyframes?:Array<{timeUs:number;x?:number;y?:number;z?:number;rotationYDeg?:number;scale?:number;opacity?:number}> } } }
  | { type: "clip.set_text"; payload: { clipId: string; text: string } }
  | { type: "clip.set_mask"; payload: { clipId: string; mask: {shape:"circle"|"rectangle";size:number;feather:number;invert:boolean}|null } }
  | { type: "clip.set_adjustments"; payload: { clipId: string; patch: Partial<Record<"exposure"|"contrast"|"saturation"|"highlights"|"shadows"|"temperature"|"tint"|"lift"|"gamma"|"gain"|"hue"|"luminance", number>> } }
  | { type: "clip.set_effect"; payload: { clipId: string; effect: string } }
  | { type: "clip.set_motion"; payload: { clipId: string; motion: string; durationUs?: number; delayUs?: number; amplitude?: number } }
  | { type: "clip.set_creative_parameters"; payload: { clipId: string; patch: Record<string, unknown> } }
  | { type: "clip.set_graphic"; payload: { clipId: string; graphic: Record<string, unknown> | null } }
  | { type: "clip.set_transition"; payload: { clipId: string; transition: string; durationUs?: number; direction?: string; easing?: string } }
  | { type: "track.insert"; payload: { track: unknown; index?: number } }
  | { type: "track.reorder"; payload: { trackId: string; index: number } }
  | { type: "track.set_state"; payload: { trackId: string; visible?: boolean; muted?: boolean; locked?: boolean } }
  | { type: "clip.delete"; payload: { clipId: string } };

export declare function applyCoProCommand(project: CoProProject, command: CoProCommand): CoProProject;

export declare class CoProEditorSession {
  constructor(project: CoProProject);
  get project(): CoProProject;
  execute(command: CoProCommand): CoProProject;
  undo(): CoProProject;
  redo(): CoProProject;
  get canUndo(): boolean;
  get canRedo(): boolean;
}
