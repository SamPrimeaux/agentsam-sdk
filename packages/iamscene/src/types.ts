export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type SceneNodeKind = 'group' | 'mesh' | 'path' | 'pulse' | 'light' | 'text';
export type SceneAssetRole = 'presentation' | 'geometry-source' | 'texture' | 'environment' | 'audio' | 'reference';

export interface SceneMetadata {
  id: string;
  name: string;
  description?: string;
  author?: string;
  createdAt?: string;
  modifiedAt?: string;
  assetBaseUri?: string;
  tags?: string[];
  provenance?: Record<string, unknown>;
}

export interface SceneCoordinateSystem {
  handedness: 'right';
  upAxis: 'Y' | 'Z';
  distanceUnit: 'm' | 'cm' | 'mm';
}

export interface SceneAsset {
  id: string;
  uri: string;
  mediaType: string;
  sha256?: string;
  role?: SceneAssetRole;
  sourceNodeId?: string;
  units?: 'm' | 'cm' | 'mm';
}

export interface SceneMaterial {
  id: string;
  baseColor: string;
  emissive?: string;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
  opacity?: number;
  transparent?: boolean;
  additive?: boolean;
  depthWrite?: boolean;
}

export interface SceneTransform {
  position?: Vec3;
  rotation?: Quat;
  scale?: Vec3;
}

export interface OcctGeometrySource {
  type: 'occt';
  units: 'mm';
  operations: Array<{ id: string; type: string; [key: string]: unknown }>;
}

export interface PolylineGeometry {
  type: 'polyline';
  points: Vec3[];
  radius: number;
  closed?: boolean;
  segments?: number;
  radialSegments?: number;
}

export interface SphereGeometry {
  type: 'sphere';
  radius: number;
}

export type SceneGeometry = OcctGeometrySource | PolylineGeometry | SphereGeometry;

export interface SceneNode {
  id: string;
  name: string;
  kind: SceneNodeKind;
  parentId?: string;
  transform: SceneTransform;
  visible: boolean;
  assetRef?: string;
  materialRef?: string;
  pathRef?: string;
  geometry?: SceneGeometry;
  renderOrder?: number;
  userData?: Record<string, unknown>;
}

export interface SceneCamera {
  projection: 'perspective';
  position: Vec3;
  target: Vec3;
  fov: number;
  near: number;
  far: number;
}

export interface SceneEnvironmentLight {
  id: string;
  type: 'directional' | 'point';
  color: string;
  intensity: number;
  position: Vec3;
}

export interface SceneEnvironment {
  background: string;
  fog?: { color: string; near: number; far: number };
  ambientIntensity: number;
  lights: SceneEnvironmentLight[];
}

export type AnimationValue = number | boolean | Vec3 | Quat;
export interface AnimationKeyframe {
  time: number;
  value: AnimationValue;
  easing?: 'linear' | 'sineInOut' | 'cubicInOut';
}

export interface AnimationTrack {
  id: string;
  targetId: string;
  property: string;
  interpolation?: 'linear' | 'step';
  keyframes: AnimationKeyframe[];
}

export interface SceneAnimation {
  id: string;
  name: string;
  duration: number;
  loop: boolean;
  tracks: AnimationTrack[];
}

export interface SceneInteraction {
  id: string;
  targetId: string;
  event: 'pointerenter' | 'pointerleave' | 'click';
  action: { type: 'playAnimation'; animationId: string };
}

export interface SceneDocument {
  $schema: string;
  format: 'iamscene';
  formatVersion: '1.0.0';
  metadata: SceneMetadata;
  coordinateSystem: SceneCoordinateSystem;
  assets: SceneAsset[];
  materials: SceneMaterial[];
  scene: { rootNodeIds: string[]; nodes: SceneNode[] };
  camera: SceneCamera;
  environment: SceneEnvironment;
  animations: SceneAnimation[];
  interactions: SceneInteraction[];
  extensionsUsed: string[];
  extensionsRequired: string[];
}

export interface SceneValidationIssue {
  path: string;
  message: string;
  keyword?: string;
}

export interface SceneValidationResult {
  valid: boolean;
  errors: SceneValidationIssue[];
}
