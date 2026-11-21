import type * as THREE from 'three';

export type StudioSubjectId =
  | 'astrolabe'
  | 'pavilion'
  | 'vox'
  | 'terrarium'
  | 'primetech-cadmesh'
  | 'primetech-plinth';

export type FinishId = 'gold' | 'titanium' | 'obsidian' | 'copper' | 'iridescent';

export type EnvironmentLevelId =
  | 'studio-stage'
  | 'architectural-atrium'
  | 'twilight-forest'
  | 'coastal-observatory'
  | 'orbital-lab'
  | 'primetech-arch-identity'
  | 'primetech-sculptural-emblem'
  | 'primetech-vault'
  | 'iamscene-circuit';

export type SkyPresetId =
  | 'studio-void'
  | 'diurnal-cloudscape'
  | 'andromeda-nebula'
  | 'aurora-borealis'
  | 'exoplanet-rings'
  | 'supernova-remnant'
  | 'orbital-eclipse'
  | 'pastel-anime-sky';

export type SkyTriggerMode =
  | 'orbit-time'
  | 'hover-reactive'
  | 'scroll-reactive'
  | 'audio-reactive';

export type SkyCelestialBody =
  | 'none'
  | 'spiral-galaxy'
  | 'ringed-planet'
  | 'twin-suns'
  | 'eclipse-corona'
  | 'comet-shower';

export interface SkySceneConfig {
  presetId: SkyPresetId;
  title: string;
  zenithHex: string;
  horizonHex: string;
  nadirHex: string;
  cloudPrimaryHex: string;
  cloudAccentHex: string;
  nebulaPrimaryHex: string;
  nebulaSecondaryHex: string;
  sunHex: string;
  cloudDensity: number;
  cloudScale: number;
  cirrusWisps: number;
  starIntensity: number;
  galaxyIntensity: number;
  auroraIntensity: number;
  sunElevation: number;
  progression: number;
  evolutionSpeed: number;
  triggerMode: SkyTriggerMode;
  celestialBody: SkyCelestialBody;
  immersiveSkyOnly: boolean;
}

export interface SkyPresetMetadata {
  id: SkyPresetId;
  label: string;
  subtitle: string;
  category: 'atmospheric' | 'cosmic' | 'stylized';
  description: string;
  swatchHex: string;
  config: SkySceneConfig;
}

export type CharacterStylePresetId =
  | 'pixar-cinematic'
  | 'cel-anime'
  | 'clay-stopmotion'
  | 'vinyl-cyber'
  | 'storybook-ink';

export type CharacterHeadShape = 'rounded' | 'chibi' | 'heroic' | 'robotic';

export type CharacterHeadgear =
  | 'none'
  | 'cat-ears'
  | 'crown'
  | 'antennae'
  | 'wizard-hat'
  | 'astronaut-helmet'
  | 'horns'
  | 'crest';

export type CharacterOutfit =
  | 'jacket'
  | 'cape'
  | 'mech-armor'
  | 'robe'
  | 'explorer';

export type CharacterPropItem =
  | 'none'
  | 'cosmic-orb'
  | 'star-wand'
  | 'lantern'
  | 'microphone'
  | 'hoverboard';

export type CharacterAnimationStyle =
  | 'bouncy-cartoon'
  | 'heroic-idle'
  | 'floating-cosmic'
  | 'dance-groove'
  | 'talk-gesture';

export interface CharacterPalette {
  skinHex: string;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  eyeHex: string;
  hairHex: string;
}

export interface CharacterPoseKeyframe {
  timestampSec: number;
  poseName: string;
  actionDescription: string;
  headTiltDeg: number;
  armRaise: number;
  bounceAmplitude: number;
  propSpinSpeed: number;
  expression: 'joyful' | 'curious' | 'heroic' | 'serene';
}

export interface ExtractedSurfaceTextureSpec {
  id: string;
  name: string;
  surfaceRole: 'sky-cloud' | 'stage-floor' | 'hero-finish' | 'character-outfit';
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  roughness: number;
  metalness: number;
  patternType: 'cirrus-wisp' | 'nebula-swirl' | 'travertine-vein' | 'cel-halftone' | 'metallic-brush';
}

export interface ExtractedCameraKeyframe {
  timestampSec: number;
  shotId: CameraShotId;
  transitionType: TransitionType;
  position: [number, number, number];
  target: [number, number, number];
  fovDeg: number;
  skyProgression: number;
  motionNote: string;
}

export interface ExtractedVideoKeyframe {
  index: number;
  timestampSec: number;
  dataUrl: string;
  width: number;
  height: number;
  dominantHex: string;
}

export interface CharacterRigSpec {
  id: string;
  name: string;
  archetype: string;
  stylePreset: CharacterStylePresetId;
  bio: string;
  voiceName: VoiceName;
  voiceStyle: string;
  introScript: string;
  headShape: CharacterHeadShape;
  headgear: CharacterHeadgear;
  outfit: CharacterOutfit;
  propItem: CharacterPropItem;
  animationStyle: CharacterAnimationStyle;
  scaleHeight: number;
  palette: CharacterPalette;
  poseKeyframes?: CharacterPoseKeyframe[];
  portraitDataUrl?: string;
  animatedVideoDataUrl?: string;
}

export type StudioResourceKind =
  | 'sky_shader'
  | 'hover_scroll_scene'
  | 'character_actor'
  | 'scene_pack'
  | 'cover_art'
  | 'animated_video';

export type StudioTemplateStatus = 'draft' | 'active' | 'archived';

export interface StudioTemplateRecord {
  id: string;
  sku: string | null;
  app_id: string;
  resource_kind: StudioResourceKind | string;
  pack_slug: string | null;
  pack_title: string | null;
  category: string;
  title: string;
  description: string | null;
  use_case: string | null;
  tags: string[];
  specs: Record<string, unknown>;
  payload_bucket_id: string | null;
  payload_r2_key: string | null;
  payload_sha256: string | null;
  payload_schema_uri: string | null;
  preview_bucket_id: string | null;
  preview_r2_key: string | null;
  renderer_key: string | null;
  compatible_apps: string[];
  source_refs: string[];
  version: number;
  status: StudioTemplateStatus;
  sort_order: number;
  created_at: number;
  updated_at: number;
  payload?: Record<string, unknown> | null;
}

export interface CharacterStudioResult {
  character: CharacterRigSpec;
  portraitDataUrl?: string;
  animatedVideoDataUrl?: string;
  suggestedSky?: SkySceneConfig;
  template?: StudioTemplateRecord;
}

export interface ScenePackResult {
  packSlug: string;
  packTitle: string;
  summary: string;
  coverArtDataUrl?: string;
  animatedVideoDataUrl?: string;
  environmentId: EnvironmentLevelId;
  moodId: AtmosphereMoodId;
  subjectId: StudioSubjectId;
  finishId: FinishId;
  skyConfig: SkySceneConfig;
  character?: CharacterRigSpec;
  extractedTextures?: ExtractedSurfaceTextureSpec[];
  cameraPath?: ExtractedCameraKeyframe[];
  characterPoses?: CharacterPoseKeyframe[];
  sourceKeyframes?: ExtractedVideoKeyframe[];
  sceneryProps: Array<{
    type: SceneryPropType;
    position: [number, number, number];
    rotationY: number;
  }>;
  beats: MovieBeat[];
  templates: StudioTemplateRecord[];
}

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

export type SceneryPropType =
  | 'cube' | 'sphere' | 'cylinder' | 'cone' | 'plane' | 'torus'
  | 'pyramid' | 'icosahedron' | 'dodecahedron' | 'torus-knot'
  | 'pine' | 'boulders' | 'lantern' | 'arch';

export type PlacedItemKind =
  | SceneryPropType
  | 'image'
  | 'video'
  | 'model'
  | 'bim'
  | 'character';

export type ImportedAssetCategory =
  | 'model'
  | 'bim'
  | 'image'
  | 'video'
  | 'audio'
  | 'transcript';

export interface SubjectMetadata {
  id: StudioSubjectId;
  label: string;
  subtitle: string;
  description: string;
  defaultSingleScript: string;
  defaultDualScript: string;
}

export interface EnvironmentLevelPreset {
  id: EnvironmentLevelId;
  label: string;
  subtitle: string;
  description: string;
  defaultMood: AtmosphereMoodId;
  swatchHex: string;
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

export type ProceduralPbrCategory = 'all' | 'metal' | 'stone' | 'glass' | 'organic';

export type ProceduralPbrPattern =
  | 'brushed-metal'
  | 'veined-marble'
  | 'hex-carbon'
  | 'hammered-copper'
  | 'frosted-crystal'
  | 'walnut-grain'
  | 'iridescent-pearl'
  | 'lava-basalt';

export interface ProceduralPbrMaterialPreset {
  id: string;
  label: string;
  category: Exclude<ProceduralPbrCategory, 'all'>;
  description: string;
  swatchGradient: string;
  colorHex: string;
  secondaryHex: string;
  emissiveHex: string;
  emissiveIntensity: number;
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  iridescence: number;
  anisotropy: number;
  transmission: number;
  ior: number;
  patternType: ProceduralPbrPattern;
  bumpScale: number;
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

export interface TranscriptCue {
  startSec: number;
  endSec: number;
  speaker?: string;
  text: string;
}

export interface BimSummary {
  schema: string;
  projectName: string;
  buildingName: string;
  storeys: Array<{ name: string; elevation: number }>;
  elementCounts: Record<string, number>;
  totalElements: number;
  boundingBoxMeters: [number, number, number];
}

export interface ModelAssetStats {
  format: string;
  meshCount: number;
  materialCount: number;
  vertexCount: number;
}

export interface IngestProgressState {
  active: boolean;
  currentFile: string;
  formatLabel: string;
  stage: string;
  completed: number;
  total: number;
}

export interface StudioImportReport {
  total: number;
  succeeded: string[];
  failed: Array<{ name: string; reason: string }>;
}


export interface StudioMediaAsset {
  id: string;
  category: ImportedAssetCategory;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: number;
  dataUrl?: string;
  objectUrl?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  waveformPeaks?: number[];
  transcriptText?: string;
  transcriptCues?: TranscriptCue[];
  bimSummary?: BimSummary;
  modelStats?: ModelAssetStats;
  animationClipNames?: string[];
  extractedKeyframes?: ExtractedVideoKeyframe[];
  /** Non-serialized live references for 3D / audio instantiation */
  runtimeFileBuffer?: ArrayBuffer;
  runtimeModelRoot?: THREE.Group;
  runtimeAnimations?: THREE.AnimationClip[];
}

export interface SelectedObjectDetails {
  id: string;
  kind: PlacedItemKind;
  label: string;
  position: [number, number, number];
  rotationYDeg: number;
  scale: number;
  visible: boolean;
  bimSummary?: BimSummary;
  characterSpec?: CharacterRigSpec;
  videoPlaying?: boolean;
  videoMuted?: boolean;
  animationClips?: string[];
  activeAnimationIndex?: number;
  animationPlaying?: boolean;
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
  skyProgression?: number;
  durationSec?: number;
  audioAssetId?: string;
  audioLabel?: string;
  muted?: boolean;
}

export interface ComposeResponse {
  movieTitle: string;
  beats: MovieBeat[];
  skyPresetId?: SkyPresetId;
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

export interface SerializedSceneryItem {
  id: string;
  kind: PlacedItemKind;
  label: string;
  position: [number, number, number];
  rotationY: number;
  scale: number;
  visible: boolean;
  assetId?: string;
  imageDataUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  characterSpec?: CharacterRigSpec;
}

export interface SamSceneProjectManifest {
  version: 1;
  projectName: string;
  updatedAt: number;
  subjectId: StudioSubjectId;
  finishId: FinishId;
  environmentId: EnvironmentLevelId;
  moodId: AtmosphereMoodId;
  skyConfig?: SkySceneConfig;
  explodeAmount: number;
  spinSpeed: number;
  lighting: DynamicLightingState;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  movieTitle: string;
  beats: MovieBeat[];
  activeBeatIndex: number;
  voiceState: {
    mode: TtsMode;
    voiceName: VoiceName;
    voiceStyle: string;
    script: string;
    volume: number;
    muted: boolean;
  };
  sceneryItems: SerializedSceneryItem[];
  savedImages: DroppedImageAsset[];
  /** Independent CoPro tracks and scene / media timing edits. Project-owned, never a renderer snapshot. */
  coproTimeline?: string;
}

export interface IamSceneNode {
  id: string;
  name: string;
  kind: 'group' | 'mesh' | 'light' | 'camera' | 'cad_assembly';
  parentId: string;
  visible: boolean;
  transform: {
    position: [number, number, number];
    rotation: [number, number, number, number];
    scale: [number, number, number];
  };
  provenance?: {
    sourceFormat: 'parametric' | 'occt' | 'ifc' | 'glb';
    procedureId?: string;
    sha256?: string;
  };
}

export interface IamSceneDocument {
  schemaVersion: 'iamscene.v1';
  id: string;
  name: string;
  coordinateSystem: 'right-handed-y-up-meters';
  environmentId: EnvironmentLevelId;
  subjectId: StudioSubjectId;
  finishId: FinishId;
  triggerMode: SkyTriggerMode;
  nodes: IamSceneNode[];
  updatedAt: string;
}

export interface ThemeSceneDefinition {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  environmentId: EnvironmentLevelId;
  subjectId: StudioSubjectId;
  rendererKey: string;
  assetUrls: string[];
  camera: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  };
  lighting: {
    moodId: AtmosphereMoodId;
    neutralObsidianOverride: boolean;
    keyColorHex: string;
    rimColorHex: string;
    backgroundHex: string;
    fogDensity: number;
  };
  props: Record<string, unknown>;
}

export interface PrimeTechEcosystemSnapshot {
  tools: Array<{
    id: string;
    tool_name: string;
    display_name: string;
    tool_category: string;
    handler_type: string;
    description: string;
    risk_level: string;
  }>;
  skills: Array<{
    id: string;
    name: string;
    slash_trigger: string;
    npm_package_name: string;
    npm_version: string;
    description: string;
    access_mode: string;
  }>;
  cadJobs: Array<{
    id: string;
    engine: string;
    prompt: string;
    status: string;
    task_type: string;
    model_formats: string;
    progress_pct: number;
  }>;
  workflows: Array<{
    id: string;
    workflow_key: string;
    display_name: string;
    description: string;
    lifecycle: string;
    entry_node_key: string;
  }>;
  workflowEdges: Array<{
    id: string;
    workflow_id: string;
    from_node_key: string;
    to_node_key: string;
    condition_type: string;
  }>;
  packages: Array<{
    name: string;
    version: string;
    visibility: 'Private' | 'Public';
    releaseTrain?: string;
    role: string;
    owner: string;
  }>;
}

