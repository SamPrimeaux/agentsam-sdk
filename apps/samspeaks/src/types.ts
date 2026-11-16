import type * as THREE from 'three';

export type StudioSubjectId = 'astrolabe' | 'pavilion' | 'vox' | 'terrarium';

export type FinishId = 'gold' | 'titanium' | 'obsidian' | 'copper' | 'iridescent';

export type VoiceName =
  | 'Kore'
  | 'Puck'
  | 'Charon'
  | 'Fenrir'
  | 'Zephyr'
  | 'Aoede'
  | 'Leda'
  | 'Orus'
  | 'Callirrhoe'
  | 'Autonoe'
  | 'Sulafat'
  | 'Enceladus'
  | 'Gacrux'
  | 'Despina'
  | 'Umbriel';

export type TtsMode = 'single' | 'dual';

export type CameraShotId =
  | 'establishing'
  | 'hero'
  | 'closeup'
  | 'lowAngle'
  | 'overhead'
  | 'leftProp'
  | 'rightProp';

export type TransitionType = 'glide' | 'dolly' | 'orbit' | 'crane' | 'cut';

export type AtmosphereMoodId = 'studio' | 'sunset' | 'twilight' | 'noir' | 'dawn';

export type SceneryPropType = 'pine' | 'boulders' | 'lantern' | 'arch';

export interface SubjectMetadata {
  id: StudioSubjectId;
  label: string;
  subtitle: string;
  description: string;
  defaultSingleScript: string;
  defaultDualScript: string;
}

export interface FinishPreset {
  id: FinishId;
  label: string;
  swatchHex: string;
  color: number;
  metalness: number;
  roughness: number;
  anisotropy: number;
  iridescence: number;
  emissive: number;
  emissiveIntensity: number;
}

export interface AtmospherePreset {
  id: AtmosphereMoodId;
  label: string;
  swatchHex: string;
  fogColor: number;
  fogDensity: number;
  keyColor: number;
  keyIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  rimColor: number;
  rimIntensity: number;
  exposure: number;
}

export interface CameraShotPreset {
  id: CameraShotId;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
}

export interface DroppedImageAsset {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  width: number;
  height: number;
}

export interface MovieBeat {
  id: string;
  title: string;
  script: string;
  ttsMode: TtsMode;
  voiceName: VoiceName;
  voiceStyle: string;
  cameraShot: CameraShotId;
  transitionType: TransitionType;
  mood: AtmosphereMoodId;
  explodeAmount: number;
}

export interface ComposeResponse {
  movieTitle: string;
  beats: MovieBeat[];
}

export interface TtsSingleRequest {
  mode: 'single';
  text: string;
  voiceName: VoiceName;
  stylePrompt: string;
}

export interface TtsDualRequest {
  mode: 'dual';
  text: string;
  speakerA: string;
  speakerB: string;
  voiceA: VoiceName;
  voiceB: VoiceName;
  styleA: string;
  styleB: string;
}

export type TtsRequest = TtsSingleRequest | TtsDualRequest;

export interface TtsResponse {
  audioBase64: string;
  mimeType: string;
  model: string;
}

export interface AudioLevels {
  overall: number;
  low: number;
  mid: number;
  high: number;
  isPlaying: boolean;
}

export interface ExplodablePart {
  object: THREE.Object3D;
  basePosition: THREE.Vector3;
  explodeOffset: THREE.Vector3;
}

export interface StudioSubjectInstance {
  id: StudioSubjectId;
  root: THREE.Group;
  explodableParts: ExplodablePart[];
  primaryMetalMeshes: THREE.Mesh[];
  accentMeshes: THREE.Mesh[];
  emissiveMeshes: THREE.Mesh[];
  updateAnimation: (elapsed: number, delta: number, audio: AudioLevels) => void;
  dispose: () => void;
}

export interface DynamicLightingState {
  keyIntensity: number;
  ambientHue: number;
  ambientSaturation: number;
  ambientIntensity: number;
  ambientHex: string;
  shadowSoftness: number;
  keyAngle: number;
}

