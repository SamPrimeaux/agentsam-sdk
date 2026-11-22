import type {
  AtmosphereMoodId,
  CameraShotId,
  CameraShotPreset,
  FinishId,
  MovieBeat,
  SceneryPropType,
  StudioSubjectId,
  SubjectMetadata,
  TransitionType,
  VoiceName,
} from './types.ts';
import {
  ATMOSPHERE_MAP as SHARED_ATMOSPHERE_MAP,
  ATMOSPHERE_PRESETS as SHARED_ATMOSPHERE_PRESETS,
  STUDIO_FINISH_MAP,
  STUDIO_FINISH_PRESETS,
} from '@inneranimalmedia/agentsam-3d-viewer';

export const SUBJECT_LIST: SubjectMetadata[] = [
  {
    id: 'astrolabe',
    label: 'Astrolabe',
    subtitle: 'Kinetic Sound Sculpture',
    description:
      'A multi-axis gimbal sculpture with brushed metal rings, optical crystal core, and audio-reactive harmonic chimes.',
    defaultSingleScript:
      'Welcome to SamSpeaks. <breath> Notice how the brushed gimbal rings catch the studio key light while the crystal core resonates with every word.',
    defaultDualScript:
      'Alex: Look at the specular sheen across that outer gimbal! <breath> It feels sculptural.\nSam: |yeah| And every syllable pulses right through the harmonic chimes.',
  },
  {
    id: 'pavilion',
    label: 'Pavilion',
    subtitle: 'Architectural Maquette',
    description:
      'A cantilevered timber and steel studio pavilion perched on a stepped travertine plinth with warm hearth illumination.',
    defaultSingleScript:
      'Here is the Cantilever Pavilion maquette. <breath> Beveled walnut eaves float cleanly above slender steel columns and a warm glowing hearth.',
    defaultDualScript:
      'Alex: That cantilevered roof line gives the whole space so much lightness.\nSam: |mhm| Slide the explode control to inspect the structural core underneath.',
  },
  {
    id: 'vox',
    label: 'Vox-01',
    subtitle: 'Studio Companion Bot',
    description:
      'An articulated robotic creative assistant featuring a glowing waveform visor, dual studio boom antennae, and responsive head motion.',
    defaultSingleScript:
      'Hello creator! <laugh> I am Vox Zero One, your spatial studio companion, tuned and ready to bring your concepts to life.',
    defaultDualScript:
      'Alex: Vox Zero One is online! <breath> Look at its visor tracking the cadence of my voice.\nSam: |yeah| Try switching finishes from brushed gold to iridescent chrome.',
  },
  {
    id: 'terrarium',
    label: 'Terrarium',
    subtitle: 'Aether Glass Biome',
    description:
      'A hand-turned copper vessel housing a sculpted bonsai canopy, moss terrain, and floating bioluminescent spores under glass.',
    defaultSingleScript:
      'Inside this copper vessel sits a living miniature biome. <breath> Bioluminescent spores drift softly beneath the optical glass dome.',
    defaultDualScript:
      'Alex: The glass refraction over the copper base feels remarkably serene.\nSam: |mhm| Paint glowing light ribbons around the dome with the 3D brush.',
  },
];

export const SUBJECT_MAP: Record<StudioSubjectId, SubjectMetadata> = {
  astrolabe: SUBJECT_LIST[0],
  pavilion: SUBJECT_LIST[1],
  vox: SUBJECT_LIST[2],
  terrarium: SUBJECT_LIST[3],
};

export const FINISH_LIST = STUDIO_FINISH_PRESETS;
export const FINISH_MAP = STUDIO_FINISH_MAP;

/** Single source of truth lives in @inneranimalmedia/agentsam-3d-viewer (atmosphere.js).
 * These aliases preserve the StudioApp and MiniAgentSam call sites. */
export const ATMOSPHERE_LIST = SHARED_ATMOSPHERE_PRESETS;
export const ATMOSPHERE_MAP = SHARED_ATMOSPHERE_MAP;

export const CAMERA_SHOTS: CameraShotPreset[] = [
  {
    id: 'establishing',
    label: 'Wide Stage',
    position: [0.35, 1.55, 1.05],
    target: [0, 1.05, -1.25],
  },
  {
    id: 'hero',
    label: 'Hero 3/4',
    position: [0.85, 1.38, -0.35],
    target: [0, 1.16, -1.25],
  },
  {
    id: 'closeup',
    label: 'Macro Detail',
    position: [-0.25, 1.24, -0.68],
    target: [0, 1.18, -1.25],
  },
  {
    id: 'lowAngle',
    label: 'Low Hero',
    position: [-0.65, 0.72, -0.45],
    target: [0, 1.2, -1.25],
  },
  {
    id: 'overhead',
    label: 'Crane Top',
    position: [0.0, 2.55, -0.35],
    target: [0, 1.0, -1.25],
  },
  {
    id: 'leftProp',
    label: 'Studio Mic',
    position: [-0.15, 1.35, -0.45],
    target: [-0.72, 1.02, -1.32],
  },
  {
    id: 'rightProp',
    label: 'VU Monitor',
    position: [0.15, 1.25, -0.45],
    target: [0.74, 0.88, -1.32],
  },
];

export const CAMERA_SHOT_MAP: Record<CameraShotId, CameraShotPreset> = {
  establishing: CAMERA_SHOTS[0],
  hero: CAMERA_SHOTS[1],
  closeup: CAMERA_SHOTS[2],
  lowAngle: CAMERA_SHOTS[3],
  overhead: CAMERA_SHOTS[4],
  leftProp: CAMERA_SHOTS[5],
  rightProp: CAMERA_SHOTS[6],
};

export const TRANSITION_OPTIONS: Array<{ id: TransitionType; label: string }> = [
  { id: 'glide', label: 'Smooth Glide' },
  { id: 'dolly', label: 'Dolly Push-In' },
  { id: 'orbit', label: 'Orbit Sweep' },
  { id: 'crane', label: 'Aerial Crane' },
  { id: 'cut', label: 'Scenic Cut' },
];

export const SCENERY_PROP_OPTIONS: Array<{
  type: SceneryPropType;
  label: string;
  hint: string;
}> = [
  { type: 'pine', label: 'Cypress Pine', hint: 'Layered forest evergreen' },
  { type: 'boulders', label: 'Moss Boulders', hint: 'Sculpted stone cluster' },
  { type: 'lantern', label: 'Wayfinder Lamp', hint: 'Warm trail lantern post' },
  { type: 'arch', label: 'Studio Arch', hint: 'Illuminated light portal' },
];

export const DEFAULT_STORYBOARD_BEATS: MovieBeat[] = [
  {
    id: 'beat-1',
    title: '01 • Wide Establishing',
    script:
      'Welcome to SamSpeaks. <breath> Let us glide across the studio floor and begin our guided adventure.',
    ttsMode: 'single',
    voiceName: 'Kore',
    voiceStyle: 'Warm, cinematic documentary narrator',
    cameraShot: 'establishing',
    transitionType: 'glide',
    mood: 'studio',
    explodeAmount: 0,
  },
  {
    id: 'beat-2',
    title: '02 • Core Inspection',
    script:
      'Moving closer now, every brushed bevel and optical core opens up in synchronized motion.',
    ttsMode: 'single',
    voiceName: 'Charon',
    voiceStyle: 'Deep, poised architectural storyteller',
    cameraShot: 'closeup',
    transitionType: 'dolly',
    mood: 'sunset',
    explodeAmount: 0.65,
  },
  {
    id: 'beat-3',
    title: '03 • Twilight Finale',
    script:
      'Alex: Look how the twilight rim light wraps the whole stage.\nSam: |yeah| Ready for the next scene whenever you are.',
    ttsMode: 'dual',
    voiceName: 'Puck',
    voiceStyle: 'Enthusiastic creative director',
    cameraShot: 'hero',
    transitionType: 'orbit',
    mood: 'twilight',
    explodeAmount: 0,
  },
];

export const VOICE_OPTIONS: Array<{
  name: VoiceName;
  tone: string;
}> = [
  { name: 'Kore', tone: 'Warm & poised' },
  { name: 'Puck', tone: 'Bright & upbeat' },
  { name: 'Charon', tone: 'Deep & resonant' },
  { name: 'Fenrir', tone: 'Bold & dramatic' },
  { name: 'Zephyr', tone: 'Airy & expressive' },
  { name: 'Aoede', tone: 'Breezy & natural' },
  { name: 'Leda', tone: 'Youthful & energetic' },
  { name: 'Orus', tone: 'Calm & firm' },
  { name: 'Callirrhoe', tone: 'Friendly & easy' },
  { name: 'Autonoe', tone: 'Bright & clear' },
  { name: 'Sulafat', tone: 'Warm & melodic' },
  { name: 'Enceladus', tone: 'Breathy & intimate' },
  { name: 'Gacrux', tone: 'Mature & grounded' },
  { name: 'Despina', tone: 'Smooth & velvety' },
  { name: 'Umbriel', tone: 'Relaxed & baritone' },
];

export const DEFAULT_STYLE_PRESETS: Array<{ label: string; style: string }> = [
  { label: 'Documentary', style: 'Warm, articulate design documentary narrator' },
  { label: 'Director', style: 'Enthusiastic, visionary creative director' },
  { label: 'Whisper', style: 'Intimate, calm ASMR studio whisper' },
  { label: 'Trailer', style: 'Dramatic, cinematic voiceover artist' },
];
