import type {
  AtmosphereMoodId,
  AtmospherePreset,
  CameraShotId,
  CameraShotPreset,
  FinishId,
  FinishPreset,
  MovieBeat,
  SceneryPropType,
  StudioSubjectId,
  SubjectMetadata,
  TransitionType,
  VoiceName,
} from './types.ts';

export const SUBJECT_LIST: SubjectMetadata[] = [
  {
    id: 'astrolabe',
    label: 'Astrolabe',
    subtitle: 'Kinetic Sound Sculpture',
    description:
      'A multi-axis gimbal sculpture with brushed metal rings, optical crystal core, and audio-reactive harmonic chimes.',
    defaultSingleScript:
      'Welcome to Atelier XR. <breath> Notice how the brushed gimbal rings catch the studio key light while the crystal core resonates with every word.',
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

export const FINISH_LIST: FinishPreset[] = [
  {
    id: 'gold',
    label: 'Gold',
    swatchHex: '#e5b85c',
    color: 0xe8b954,
    metalness: 0.94,
    roughness: 0.18,
    anisotropy: 0.8,
    iridescence: 0.0,
    emissive: 0x332200,
    emissiveIntensity: 0.08,
  },
  {
    id: 'titanium',
    label: 'Titanium',
    swatchHex: '#aeb9c8',
    color: 0xbac4d2,
    metalness: 0.92,
    roughness: 0.22,
    anisotropy: 0.85,
    iridescence: 0.0,
    emissive: 0x0c1420,
    emissiveIntensity: 0.05,
  },
  {
    id: 'obsidian',
    label: 'Obsidian',
    swatchHex: '#252a36',
    color: 0x1c202a,
    metalness: 0.72,
    roughness: 0.14,
    anisotropy: 0.2,
    iridescence: 0.15,
    emissive: 0x091124,
    emissiveIntensity: 0.12,
  },
  {
    id: 'copper',
    label: 'Copper',
    swatchHex: '#d47952',
    color: 0xd87a4e,
    metalness: 0.94,
    roughness: 0.2,
    anisotropy: 0.75,
    iridescence: 0.05,
    emissive: 0x2a0f04,
    emissiveIntensity: 0.06,
  },
  {
    id: 'iridescent',
    label: 'Prism',
    swatchHex: '#8d7eff',
    color: 0x8b9bff,
    metalness: 0.88,
    roughness: 0.16,
    anisotropy: 0.35,
    iridescence: 1.0,
    emissive: 0x18103c,
    emissiveIntensity: 0.18,
  },
];

export const FINISH_MAP: Record<FinishId, FinishPreset> = {
  gold: FINISH_LIST[0],
  titanium: FINISH_LIST[1],
  obsidian: FINISH_LIST[2],
  copper: FINISH_LIST[3],
  iridescent: FINISH_LIST[4],
};

export const ATMOSPHERE_LIST: AtmospherePreset[] = [
  {
    id: 'studio',
    label: 'Studio',
    swatchHex: '#0a84ff',
    fogColor: 0x131314,
    fogDensity: 0.05,
    keyColor: 0xfff0da,
    keyIntensity: 2.6,
    hemiSky: 0xd0e2ff,
    hemiGround: 0x171719,
    hemiIntensity: 1.15,
    rimColor: 0x409cff,
    rimIntensity: 1.35,
    exposure: 1.12,
  },
  {
    id: 'sunset',
    label: 'Golden',
    swatchHex: '#e69951',
    fogColor: 0x211415,
    fogDensity: 0.06,
    keyColor: 0xffb36b,
    keyIntensity: 3.1,
    hemiSky: 0xffcda3,
    hemiGround: 0x26161b,
    hemiIntensity: 1.05,
    rimColor: 0xff6e54,
    rimIntensity: 1.5,
    exposure: 1.18,
  },
  {
    id: 'twilight',
    label: 'Twilight',
    swatchHex: '#6e76d6',
    fogColor: 0x0e1026,
    fogDensity: 0.075,
    keyColor: 0xb7c6ff,
    keyIntensity: 2.1,
    hemiSky: 0x7d8be8,
    hemiGround: 0x0e1020,
    hemiIntensity: 1.0,
    rimColor: 0x9c7aff,
    rimIntensity: 1.9,
    exposure: 1.08,
  },
  {
    id: 'noir',
    label: 'Noir',
    swatchHex: '#434b5c',
    fogColor: 0x06080d,
    fogDensity: 0.085,
    keyColor: 0xf4f7ff,
    keyIntensity: 3.2,
    hemiSky: 0x5c6882,
    hemiGround: 0x080a0f,
    hemiIntensity: 0.65,
    rimColor: 0x4cc9f0,
    rimIntensity: 2.1,
    exposure: 1.04,
  },
  {
    id: 'dawn',
    label: 'Dawn',
    swatchHex: '#5fc29c',
    fogColor: 0x101c1c,
    fogDensity: 0.052,
    keyColor: 0xffe8cc,
    keyIntensity: 2.5,
    hemiSky: 0xa6ebd6,
    hemiGround: 0x16241f,
    hemiIntensity: 1.25,
    rimColor: 0x5be3b7,
    rimIntensity: 1.4,
    exposure: 1.16,
  },
];

export const ATMOSPHERE_MAP: Record<AtmosphereMoodId, AtmospherePreset> = {
  studio: ATMOSPHERE_LIST[0],
  sunset: ATMOSPHERE_LIST[1],
  twilight: ATMOSPHERE_LIST[2],
  noir: ATMOSPHERE_LIST[3],
  dawn: ATMOSPHERE_LIST[4],
};

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
      'Welcome to Atelier XR. <breath> Let us glide across the studio floor and begin our guided adventure.',
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
