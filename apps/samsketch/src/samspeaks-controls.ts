export type FinishId = "gold" | "titanium" | "obsidian" | "copper" | "prism";
export type MoodId = "studio" | "golden" | "twilight" | "noir" | "dawn";
export type CameraShotId = "establishing" | "hero" | "closeup" | "lowAngle" | "overhead" | "leftProp" | "rightProp";
export type TransitionId = "glide" | "dolly" | "orbit" | "crane" | "cut";
export type SceneProfileId = "astrolabe" | "pavilion" | "vox" | "terrarium";
export type SceneryPropId = "pine" | "boulders" | "lantern" | "arch";
export type VoiceName = "Kore" | "Puck" | "Charon" | "Fenrir" | "Zephyr" | "Aoede" | "Leda" | "Orus" | "Callirrhoe" | "Autonoe" | "Sulafat" | "Enceladus" | "Gacrux" | "Despina" | "Umbriel";
export type TransitionMode = "single" | "dual";

export interface FinishPreset {
  id: FinishId;
  label: string;
  swatchHex: string;
  metalness: number;
  roughness: number;
  iridescence: number;
  emissive: string;
  emissiveIntensity: number;
}
export interface MoodPreset {
  id: MoodId;
  label: string;
  swatchHex: string;
  backdrop: string;
  keyColor: string;
  fillColor: string;
  ambientColor: string;
  keyIntensity: number;
  fillIntensity: number;
  ambientIntensity: number;
  exposure: number;
  fogColor: string;
  fogDensity: number;
}
export interface SceneSettings {
  profile: SceneProfileId;
  finish: FinishId;
  mood: MoodId;
  explodeAmount: number;
  spinSpeed: number;
  keyLightAngle: number;
  keyIntensity: number;
  ambientHue: number;
  ambientSaturation: number;
  ambientIntensity: number;
  shadowSoftness: number;
  cameraShot: CameraShotId;
  transitionType: TransitionId;
  cameraDistance: number;
  fieldOfView: number;
  autoTour: boolean;
  brushEnabled: boolean;
  fogEnabled: boolean;
  fogDensity: number;
  wireframe: boolean;
  showGrid: boolean;
  selectionOutline: boolean;
  shadowsEnabled: boolean;
}
export interface StoryBeat {
  id: string;
  title: string;
  script: string;
  ttsMode: TransitionMode;
  voiceName: VoiceName;
  voiceStyle: string;
  cameraShot: CameraShotId;
  transitionType: TransitionId;
  mood: MoodId;
  explodeAmount: number;
}
export interface BrushStroke {
  id: string;
  points: [number, number, number][];
  color: string;
  width: number;
}
export interface SceneProfile {
  id: SceneProfileId;
  label: string;
  subtitle: string;
  finish: FinishId;
  mood: MoodId;
  color: string;
}
export interface CameraShotPreset {
  id: CameraShotId;
  label: string;
  direction: [number, number, number];
  distance: number;
}
export interface SceneryPropPreset {
  id: SceneryPropId;
  label: string;
  hint: string;
  color: string;
}

export const FINISHES: FinishPreset[] = [
  { id: "gold", label: "Gold", swatchHex: "#e5b85c", metalness: .94, roughness: .18, iridescence: 0, emissive: "#332200", emissiveIntensity: .08 },
  { id: "titanium", label: "Titanium", swatchHex: "#aeb9c8", metalness: .92, roughness: .22, iridescence: 0, emissive: "#0c1420", emissiveIntensity: .05 },
  { id: "obsidian", label: "Obsidian", swatchHex: "#252a36", metalness: .72, roughness: .14, iridescence: .15, emissive: "#091124", emissiveIntensity: .12 },
  { id: "copper", label: "Copper", swatchHex: "#d47952", metalness: .94, roughness: .2, iridescence: .05, emissive: "#2a0f04", emissiveIntensity: .06 },
  { id: "prism", label: "Prism", swatchHex: "#8d7eff", metalness: .88, roughness: .16, iridescence: 1, emissive: "#18103c", emissiveIntensity: .18 },
];

export const MOODS: MoodPreset[] = [
  { id: "studio", label: "Studio", swatchHex: "#0a84ff", backdrop: "#202c40", keyColor: "#fff0da", fillColor: "#409cff", ambientColor: "#d0e2ff", keyIntensity: 2.6, fillIntensity: 1.35, ambientIntensity: 1.15, exposure: 1.12, fogColor: "#131314", fogDensity: .012 },
  { id: "golden", label: "Golden", swatchHex: "#e69951", backdrop: "#39231f", keyColor: "#ffb36b", fillColor: "#ff6e54", ambientColor: "#ffcda3", keyIntensity: 3.1, fillIntensity: 1.5, ambientIntensity: 1.05, exposure: 1.18, fogColor: "#211415", fogDensity: .018 },
  { id: "twilight", label: "Twilight", swatchHex: "#6e76d6", backdrop: "#171c38", keyColor: "#b7c6ff", fillColor: "#9c7aff", ambientColor: "#7d8be8", keyIntensity: 2.1, fillIntensity: 1.9, ambientIntensity: 1, exposure: 1.08, fogColor: "#0e1026", fogDensity: .022 },
  { id: "noir", label: "Noir", swatchHex: "#434b5c", backdrop: "#10151f", keyColor: "#f4f7ff", fillColor: "#4cc9f0", ambientColor: "#5c6882", keyIntensity: 3.2, fillIntensity: 2.1, ambientIntensity: .65, exposure: 1.04, fogColor: "#06080d", fogDensity: .026 },
  { id: "dawn", label: "Dawn", swatchHex: "#5fc29c", backdrop: "#1b302b", keyColor: "#ffe8cc", fillColor: "#5be3b7", ambientColor: "#a6ebd6", keyIntensity: 2.5, fillIntensity: 1.4, ambientIntensity: 1.25, exposure: 1.16, fogColor: "#101c1c", fogDensity: .015 },
];

export const SCENE_PROFILES: SceneProfile[] = [
  { id: "astrolabe", label: "Astrolabe", subtitle: "Kinetic sound sculpture", finish: "gold", mood: "studio", color: "#e5b85c" },
  { id: "pavilion", label: "Pavilion", subtitle: "Architectural maquette", finish: "copper", mood: "dawn", color: "#b68a62" },
  { id: "vox", label: "Vox-01", subtitle: "SamSpeaks companion", finish: "titanium", mood: "twilight", color: "#8da9d7" },
  { id: "terrarium", label: "Terrarium", subtitle: "Glass biome", finish: "prism", mood: "golden", color: "#86bca4" },
];

export const CAMERA_SHOTS: CameraShotPreset[] = [
  { id: "establishing", label: "Wide Stage", direction: [.35, 1.55, 1.05], distance: 15 },
  { id: "hero", label: "Hero 3/4", direction: [.85, 1.38, -.35], distance: 11 },
  { id: "closeup", label: "Macro Detail", direction: [-.25, 1.24, -.68], distance: 7 },
  { id: "lowAngle", label: "Low Hero", direction: [-.65, .72, -.45], distance: 10 },
  { id: "overhead", label: "Crane Top", direction: [0, 2.55, -.35], distance: 14 },
  { id: "leftProp", label: "Studio Mic", direction: [-1.15, 1.35, -.45], distance: 9 },
  { id: "rightProp", label: "VU Monitor", direction: [1.15, 1.25, -.45], distance: 9 },
];
export const TRANSITIONS: { id: TransitionId; label: string; duration: number }[] = [
  { id: "glide", label: "Smooth Glide", duration: 900 },
  { id: "dolly", label: "Dolly Push-In", duration: 650 },
  { id: "orbit", label: "Orbit Sweep", duration: 1200 },
  { id: "crane", label: "Aerial Crane", duration: 1100 },
  { id: "cut", label: "Scenic Cut", duration: 0 },
];
export const SCENERY_PROPS: SceneryPropPreset[] = [
  { id: "pine", label: "Cypress Pine", hint: "Layered evergreen", color: "#476a55" },
  { id: "boulders", label: "Moss Boulders", hint: "Sculpted stone cluster", color: "#74836b" },
  { id: "lantern", label: "Wayfinder Lamp", hint: "Warm trail lantern", color: "#d6a35f" },
  { id: "arch", label: "Studio Arch", hint: "Illuminated light portal", color: "#8a9dd6" },
];
export const VOICES: { name: VoiceName; tone: string }[] = [
  { name: "Kore", tone: "Warm & poised" }, { name: "Puck", tone: "Bright & upbeat" },
  { name: "Charon", tone: "Deep & resonant" }, { name: "Fenrir", tone: "Bold & dramatic" },
  { name: "Zephyr", tone: "Airy & expressive" }, { name: "Aoede", tone: "Breezy & natural" },
  { name: "Leda", tone: "Youthful & energetic" }, { name: "Orus", tone: "Calm & firm" },
  { name: "Callirrhoe", tone: "Friendly & easy" }, { name: "Autonoe", tone: "Bright & clear" },
  { name: "Sulafat", tone: "Warm & melodic" }, { name: "Enceladus", tone: "Breathy & intimate" },
  { name: "Gacrux", tone: "Mature & grounded" }, { name: "Despina", tone: "Smooth & velvety" },
  { name: "Umbriel", tone: "Relaxed & baritone" },
];
export const VOICE_STYLES = [
  { label: "Documentary", style: "Warm, articulate design documentary narrator" },
  { label: "Director", style: "Enthusiastic, visionary creative director" },
  { label: "Whisper", style: "Intimate, calm studio whisper" },
  { label: "Trailer", style: "Dramatic, cinematic voiceover artist" },
];
export const DEFAULT_SCENE_SETTINGS: SceneSettings = {
  profile: "astrolabe", finish: "gold", mood: "studio", explodeAmount: 0, spinSpeed: .28,
  keyLightAngle: .65, keyIntensity: 2.6, ambientHue: 210, ambientSaturation: 24,
  ambientIntensity: 1.15, shadowSoftness: 3, cameraShot: "establishing", transitionType: "glide",
  cameraDistance: 15, fieldOfView: 37, autoTour: false, brushEnabled: false, fogEnabled: false,
  fogDensity: .012, wireframe: false, showGrid: false, selectionOutline: true, shadowsEnabled: true,
};
export const DEFAULT_STORYBOARD: StoryBeat[] = [
  { id: "beat-1", title: "01 · Wide Establishing", script: "Welcome to SamSpeaks. Let us begin with the whole scene.", ttsMode: "single", voiceName: "Kore", voiceStyle: "Warm, cinematic documentary narrator", cameraShot: "establishing", transitionType: "glide", mood: "studio", explodeAmount: 0 },
  { id: "beat-2", title: "02 · Core Inspection", script: "Move closer to inspect the materials, details and construction.", ttsMode: "single", voiceName: "Charon", voiceStyle: "Deep, poised architectural storyteller", cameraShot: "closeup", transitionType: "dolly", mood: "golden", explodeAmount: .65 },
  { id: "beat-3", title: "03 · Twilight Finale", script: "The final view brings the whole composition together.", ttsMode: "single", voiceName: "Puck", voiceStyle: "Enthusiastic creative director", cameraShot: "hero", transitionType: "orbit", mood: "twilight", explodeAmount: 0 },
];
