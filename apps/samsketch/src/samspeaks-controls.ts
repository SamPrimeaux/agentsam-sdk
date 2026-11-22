import { ATMOSPHERE_PRESETS, STUDIO_FINISH_PRESETS, type AtmosphereMoodId, type StudioFinishId } from '@inneranimalmedia/agentsam-3d-viewer';
export type FinishId = StudioFinishId;
export type MoodId = AtmosphereMoodId;
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
  anisotropy: number;
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
  ambientGroundColor: string;
  ambientHue: number;
  ambientSaturation: number;
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
  surfaceTreatment: "clay" | "glass" | "metal";
  roughness: number;
  metalness: number;
  loopPresentation: boolean;
  voiceMode: TransitionMode;
  voiceName: VoiceName;
  voiceStyle: string;
  environment: string;
  horizonBrightness: number;
  ambientShadowOpacity: number;
  reducedMotion: boolean;
  showProperties: boolean;
  keepTimeline: boolean;
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

const toHex = (color: number) => '#' + color.toString(16).padStart(6, '0');

export const FINISHES: FinishPreset[] = STUDIO_FINISH_PRESETS.map(
  ({ color: _color, emissive, ...preset }) => ({ ...preset, emissive: toHex(emissive) }),
);

// SamSketch-specific viewport defaults. Keep the existing fog response and backdrop
// while inheriting the actual lighting recipe from the shared viewer.
const VIEWPORT_MOOD_DEFAULTS: Record<MoodId, Pick<MoodPreset,'backdrop' | 'ambientHue' | 'ambientSaturation' | 'fogDensity'>> = {
  studio: { backdrop: "#202c40", ambientHue: 214, ambientSaturation: 100, fogDensity: .012 },
  sunset: { backdrop: "#39231f", ambientHue: 25, ambientSaturation: 100, fogDensity: .018 },
  twilight: { backdrop: "#171c38", ambientHue: 232, ambientSaturation: 66, fogDensity: .022 },
  noir: { backdrop: "#10151f", ambientHue: 218, ambientSaturation: 18, fogDensity: .026 },
  dawn: { backdrop: "#1b302b", ambientHue: 157, ambientSaturation: 60, fogDensity: .015 },
};

export const MOODS: MoodPreset[] = ATMOSPHERE_PRESETS.map(preset => ({
  id: preset.id,
  label: preset.label,
  swatchHex: preset.swatchHex,
  keyColor: toHex(preset.keyColor),
  fillColor: toHex(preset.rimColor),
  ambientColor: toHex(preset.hemiSky),
  ambientGroundColor: toHex(preset.hemiGround),
  keyIntensity: preset.keyIntensity,
  fillIntensity: preset.rimIntensity,
  ambientIntensity: preset.hemiIntensity,
  exposure: preset.exposure,
  fogColor: toHex(preset.fogColor),
  ...VIEWPORT_MOOD_DEFAULTS[preset.id],
}));

export const SCENE_PROFILES: SceneProfile[] = [
  { id: "astrolabe", label: "Astrolabe", subtitle: "Kinetic sound sculpture", finish: "gold", mood: "studio", color: "#e5b85c" },
  { id: "pavilion", label: "Pavilion", subtitle: "Architectural maquette", finish: "copper", mood: "dawn", color: "#b68a62" },
  { id: "vox", label: "Vox-01", subtitle: "SamSpeaks companion", finish: "titanium", mood: "twilight", color: "#8da9d7" },
  { id: "terrarium", label: "Terrarium", subtitle: "Glass biome", finish: "iridescent", mood: "sunset", color: "#86bca4" },
];

export const CAMERA_SHOTS: CameraShotPreset[] = [
  { id: "establishing", label: "Wide Stage", direction: [.35, .5, 2.3], distance: 16.6 },
  { id: "hero", label: "Hero 3/4", direction: [.85, .22, .9], distance: 8.8 },
  { id: "closeup", label: "Macro Detail", direction: [-.25, .06, .57], distance: 4.4 },
  { id: "lowAngle", label: "Low Hero", direction: [-.65, -.48, .8], distance: 8 },
  { id: "overhead", label: "Crane Top", direction: [0, 1.55, .9], distance: 12.5 },
  { id: "leftProp", label: "Studio Mic", direction: [.57, .33, .87], distance: 7.6 },
  { id: "rightProp", label: "VU Monitor", direction: [-.59, .37, .87], distance: 7.8 },
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
  keyLightAngle: .65, keyIntensity: 2.6, ambientHue: 214, ambientSaturation: 100,
  ambientIntensity: 1.15, shadowSoftness: 3, cameraShot: "establishing", transitionType: "glide",
  cameraDistance: 15, fieldOfView: 37, autoTour: false, brushEnabled: false, fogEnabled: false,
  fogDensity: .012, wireframe: false, showGrid: false, selectionOutline: true, shadowsEnabled: true,
  surfaceTreatment: "metal", roughness: .22, metalness: .92, loopPresentation: false,
  voiceMode: "single", voiceName: "Kore", voiceStyle: "Warm, cinematic documentary narrator",
  environment: "studio", horizonBrightness: 1.12, ambientShadowOpacity: .23,
  reducedMotion: false, showProperties: true, keepTimeline: true,
};
export const DEFAULT_STORYBOARD: StoryBeat[] = [
  { id: "beat-1", title: "01 · Wide Establishing", script: "Welcome to SamSpeaks. Let us begin with the whole scene.", ttsMode: "single", voiceName: "Kore", voiceStyle: "Warm, cinematic documentary narrator", cameraShot: "establishing", transitionType: "glide", mood: "studio", explodeAmount: 0 },
  { id: "beat-2", title: "02 · Core Inspection", script: "Move closer to inspect the materials, details and construction.", ttsMode: "single", voiceName: "Charon", voiceStyle: "Deep, poised architectural storyteller", cameraShot: "closeup", transitionType: "dolly", mood: "sunset", explodeAmount: .65 },
  { id: "beat-3", title: "03 · Twilight Finale", script: "The final view brings the whole composition together.", ttsMode: "single", voiceName: "Puck", voiceStyle: "Enthusiastic creative director", cameraShot: "hero", transitionType: "orbit", mood: "twilight", explodeAmount: 0 },
];
