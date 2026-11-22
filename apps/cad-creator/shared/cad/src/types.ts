export type MeasurementUnit = 'in' | 'ft' | 'm' | 'mm';

export type WallMaterial = 'drywall' | 'brick' | 'concrete' | 'glass' | 'wood_panel' | 'steel';

export type FloorMaterial = 'hardwood' | 'marble' | 'tile' | 'polished_concrete' | 'carpet' | 'terrazzo';

/** Editable BIM assembly metadata. Total layer thickness drives the existing
 * overall wall solid. Individual OCCT ply solids require separate validation. */
export interface WallAssemblyLayer {
  id: string;
  name: string;
  material: WallMaterial;
  thickness: number; // inches
}
export interface WallAssembly {
  name: string;
  layers: WallAssemblyLayer[]; // interior to exterior
}
export interface WallElement {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number; // in inches (e.g. 6)
  height3D: number; // in inches (e.g. 96 or 108)
  material: WallMaterial;
  /** Optional renderer-level PBR finish; structural wall material remains unchanged. */
  materialPresetId?:string;
  assembly?: WallAssembly;
  color?: string;
  exterior?: boolean;
  sourceSketchShapeIds?: string[];
}

export interface DoorElement {
  id: string;
  wallId: string;
  distanceAlongWall: number; // 0 to 1 ratio or absolute offset
  width: number; // in inches (e.g. 36)
  height: number; // in inches (e.g. 84)
  swing: 'left' | 'right' | 'sliding' | 'double' | 'pocket';
  openAngle: number; // 0 to 90 degrees
  label?: string;
  sourceSketchShapeIds?: string[];
}

export interface WindowElement {
  id: string;
  wallId: string;
  distanceAlongWall: number; // 0 to 1 ratio
  width: number; // in inches (e.g. 48)
  height: number; // in inches (e.g. 60)
  elevation: number; // height from floor in inches (e.g. 36)
  style: 'casement' | 'sliding' | 'picture' | 'hung';
  label?: string;
  sourceSketchShapeIds?: string[];
}

export type FurnitureCategory = 'seating' | 'tables' | 'bedroom' | 'kitchen' | 'bathroom' | 'office' | 'decor' | 'parametric';

export interface FurnitureElement {
  id: string;
  type: string; // 'sofa_3seater', 'king_bed', 'dining_table_6', 'desk', 'kitchen_island', 'toilet', 'bathtub', 'potted_plant', etc.
  category: FurnitureCategory;
  name: string;
  x: number; // center x in inches
  y: number; // center y in inches
  w: number; // width in inches
  d: number; // depth in inches
  h: number; // height in inches
  rotation: number; // in degrees
  color: string;
  material?: string;
  materialPresetId?:string;
  icon?: string;
  parametricObjectId?: string;
  sourceSketchShapeIds?: string[];
}

export interface RoomZone {
  id: string;
  name: string;
  points: [number, number][]; // Polygon vertices in inches
  areaSqFt: number;
  floorMaterial: FloorMaterial;
  floorMaterialPresetId?:string;
  color: string;
  sourceSketchShapeIds?: string[];
}

export interface DimensionAnnotation {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  sourceSketchShapeIds?: string[];
}

/** Canonical project-wide lighting, environment and renderer configuration. */
export interface LightingConfig {
  sunAltitude: number; // 0 to 90 degrees
  sunAzimuth: number; // 0 to 360 degrees
  intensity: number; // directional/key light multiplier
  timeOfDay: 'morning' | 'noon' | 'sunset' | 'night';
  shadows: boolean;
  ambientColor: string;
  ambientIntensity?:number;
  sunColor?:string;
  skyColor?:string;
  groundColor?:string;
  skyVisible?:boolean;
  environmentPresetId?:string;
  skyTurbidity?:number;
  skyRayleigh?:number;
  skyMieCoefficient?:number;
  skyMieDirectionalG?:number;
  exposure?:number;
  shading?:'lit'|'color';
  shadowQuality?:CadShadowQuality;
  toneMapping?:CadToneMapping;
  shadowBias?:number;
}

// ---------------------------------------------------------------------------
// PARAMETRIC & OPENSCAD DOMAIN MODEL
// ---------------------------------------------------------------------------

export type ParametricGeneratorType = 'openscad' | 'procedural_csg' | 'custom_script' | 'occt';

export interface ParametricParameterDef {
  name: string;
  label: string;
  type: 'number' | 'string' | 'boolean' | 'select';
  value: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { label: string; value: string | number }[];
  description?: string;
}

export interface ParametricObject {
  id: string;
  name: string;
  generator: ParametricGeneratorType;
  generatorTemplate?: string; // 'workstation' | 'bookshelf' | 'chair' | 'pergola' | 'cabinet' | 'custom'
  parameters: Record<string, number | string | boolean>;
  parameterDefs?: ParametricParameterDef[];
  transform: {
    x: number; // in inches
    y: number; // in inches (floor plane)
    z: number; // elevation in inches
    rotationX?: number;
    rotationY?: number; // rotation around Y axis in degrees
    rotationZ?: number;
  };
  source: string; // OpenSCAD source (.scad) or a native kernel recipe identifier (e.g. occt:box)
  generatedArtifacts?: DesignArtifactSummary[];
  updatedAt?: number;
}

export interface DesignArtifactSummary {
  id: string;
  format: 'stl' | '3mf' | 'dxf' | 'scad' | 'obj' | 'svg' | 'json';
  filename: string;
  sizeBytes: number;
  createdAt: number;
  checksum?: string;
}

// ---------------------------------------------------------------------------
// CANONICAL PROJECT STATE & METADATA
// ---------------------------------------------------------------------------

export interface ProjectMetadata {
  author?: string;
  description?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  revision: number;
  revisionMessage?: string;
}

export interface ProjectLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  color?: string;
}

export interface SketchDocumentRef {
  /** Native SamSketch strokes, in project inches, versionable with the CAD document. */
  nativeStrokes?: Array<{id:string;kind:'ink'|'line'|'rect';points:[number,number][];purpose?:'layout'|'markup';targetId?:string}>;
  nativeConstraints?: Array<{strokeId:string;axis?:'horizontal'|'vertical';lengthInches?:number}>;
  review?: { note:string; targetId?:string; targetLabel?:string; revisionRef?:string };
  /** Legacy archived source; retain for backwards-compatible import, never mutate it. */
  tldrawSnapshot?: any;
  shapesCount?: number;
  lastEditedAt?: number;
}

/** Registered scene bindings and reversible presentation edits in the same project document.
 * These never assert that an imported mesh has acquired a parametric BIM feature history.
 */
export interface CadFinishSettings {
  colorHex?:string;
  emissiveHex?:string;
  metalness?:number;
  roughness?:number;
  opacity?:number;
  emissiveIntensity?:number;
}
export interface CadSceneElement {
  finish?:CadFinishSettings;
  id:string;
  name:string;
  category:string;
  source:string;
  bounds:{min:[number,number,number];max:[number,number,number]};
  offset:[number,number,number]; // glTF world metres, Y up
  rotation:number; // degrees about the vertical world axis, around the element centre
  visible:boolean;
  color?:string;
  /** Stable shared PBR preset identifier; the source model remains untouched. */
  materialPresetId?:string;
  note?:string;
}
export interface CadSceneSource {
  assetId:string;
  contentHash:string;
  revision:string;
  units:'m';
  axes:'gltf-y-up';
}
export type CadToneMapping = 'aces' | 'reinhard' | 'neutral' | 'none';
export type CadShadowQuality = 'low' | 'medium' | 'high';

export interface CadCameraBeat {
  transition?: 'cut'|'glide';
  id: string;
  view: string;
  duration: number;
}
export interface CadSceneLight {
  id:string;
  name:string;
  kind:'directional'|'point'|'spot';
  color:string;
  intensity:number;
  position:[number,number,number];
  target:[number,number,number];
  range:number;
  cone:number;
  shadows:boolean;
}
export interface CadSceneSettings {
  lights?: CadSceneLight[];
  cameraSequence?: CadCameraBeat[];
  savedCameras?: {id:string;label:string;target:[number,number,number];az:number;el:number;distance:number;fov:number}[];
  fog?:{enabled:boolean;near:number;far:number};
  /** @deprecated Migrated to DesignProject.lighting.shadowBias on the next lighting edit. */
  shadowBias?:number;
  projection?:'perspective'|'orthographic';
  clipNear?: number;
  clipFar?: number;
  /** @deprecated Migrated to DesignProject.lighting.shading on the next lighting edit. */
  shading?:'lit'|'color';
  /** @deprecated Migrated to DesignProject.lighting.exposure on the next lighting edit. */
  exposure?:number;
  /** @deprecated Migrated to DesignProject.lighting.intensity on the next lighting edit. */
  sun?:number;
  /** @deprecated Migrated to DesignProject.lighting.ambientIntensity on the next lighting edit. */
  ambient?:number;
  /** @deprecated Migrated to DesignProject.lighting.skyVisible on the next lighting edit. */
  sky?:boolean;
  /** @deprecated Migrated to DesignProject.lighting.timeOfDay on the next lighting edit. */
  daylight?:boolean;
  roofVisible?:boolean;
  /** Solar direction in the CAD viewport's Y-up world coordinates. */
  /** @deprecated Migrated to DesignProject.lighting.sunAltitude on the next lighting edit. */
  sunAltitude?:number;
  /** @deprecated Migrated to DesignProject.lighting.sunAzimuth on the next lighting edit. */
  sunAzimuth?:number;
  /** Actual Three.js light and hemisphere colors, persisted with the scene. */
  /** @deprecated Migrated to DesignProject.lighting.sunColor on the next lighting edit. */
  sunColor?:string;
  /** @deprecated Migrated to DesignProject.lighting.skyColor on the next lighting edit. */
  skyColor?:string;
  /** @deprecated Migrated to DesignProject.lighting.groundColor on the next lighting edit. */
  groundColor?:string;
  /** @deprecated Migrated to DesignProject.lighting.environmentPresetId on the next lighting edit. */
  environmentPresetId?:string;
  cameraFov?:number;
  /** @deprecated Migrated to DesignProject.lighting.skyTurbidity on the next lighting edit. */
  skyTurbidity?:number;
  /** @deprecated Migrated to DesignProject.lighting.skyRayleigh on the next lighting edit. */
  skyRayleigh?:number;
  /** @deprecated Migrated to DesignProject.lighting.skyMieCoefficient on the next lighting edit. */
  skyMieCoefficient?:number;
  /** @deprecated Migrated to DesignProject.lighting.skyMieDirectionalG on the next lighting edit. */
  skyMieDirectionalG?:number;
  /** @deprecated Migrated to DesignProject.lighting.shadows on the next lighting edit. */
  shadows?:boolean;
  /** @deprecated Migrated to DesignProject.lighting.shadowQuality on the next lighting edit. */
  shadowQuality?:CadShadowQuality;
  /** @deprecated Migrated to DesignProject.lighting.toneMapping on the next lighting edit. */
  toneMapping?:CadToneMapping;
  terrain?:unknown;
}

export interface DesignProject {
  id: string;
  name: string;
  units?: MeasurementUnit;
  scale: number; // 1 canvas unit = 1 inch
  gridSize: number; // grid step in inches (default 12 inches = 1 ft)
  snapToGrid: boolean;
  layers?: ProjectLayer[];
  walls: WallElement[];
  doors: DoorElement[];
  windows: WindowElement[];
  furniture: FurnitureElement[];
  rooms: RoomZone[];
  annotations: DimensionAnnotation[];
  parametricObjects?: ParametricObject[];
  sketchDocument?: SketchDocumentRef;
  sceneSource?: CadSceneSource;
  sceneElements?: CadSceneElement[];
  sceneSettings?: CadSceneSettings;
  nativeHistory?: {version:1;operations:Record<string,unknown>[];cursor:number};
  lighting: LightingConfig;
  roofType: 'none' | 'flat' | 'gable';
  ceilingHeight: number; // e.g. 108 inches
  metadata?: ProjectMetadata;
  updatedAt: number;
  version: number;
}

// Backwards-compatible alias
export type ProjectState = DesignProject;

// ---------------------------------------------------------------------------
// CANONICAL DESIGN OPERATIONS (COMMANDS)
// ---------------------------------------------------------------------------

export type DesignOperationType =
  | 'create_wall'
  | 'update_wall'
  | 'delete_wall'
  | 'create_room'
  | 'update_room'
  | 'delete_room'
  | 'add_door'
  | 'update_door'
  | 'delete_door'
  | 'add_window'
  | 'update_window'
  | 'delete_window'
  | 'add_fixture'
  | 'update_fixture'
  | 'delete_fixture'
  | 'move_element'
  | 'create_parametric_object'
  | 'update_parametric_parameter'
  | 'update_parametric_source'
  | 'delete_parametric_object'
  | 'attach_sketch'
  | 'convert_sketch_selection'
  | 'set_material'
  | 'set_lighting'
  | 'batch_operations';

export interface BaseDesignOperation {
  id: string;
  type: DesignOperationType;
  timestamp: number;
  authorId?: string;
}

export interface CreateWallOp extends BaseDesignOperation {
  type: 'create_wall';
  wall: WallElement;
}

export interface UpdateWallOp extends BaseDesignOperation {
  type: 'update_wall';
  wallId: string;
  updates: Partial<WallElement>;
}

export interface DeleteWallOp extends BaseDesignOperation {
  type: 'delete_wall';
  wallId: string;
}

export interface CreateRoomOp extends BaseDesignOperation {
  type: 'create_room';
  room: RoomZone;
}

export interface UpdateRoomOp extends BaseDesignOperation {
  type: 'update_room';
  roomId: string;
  updates: Partial<RoomZone>;
}

export interface DeleteRoomOp extends BaseDesignOperation {
  type: 'delete_room';
  roomId: string;
}

export interface AddDoorOp extends BaseDesignOperation {
  type: 'add_door';
  door: DoorElement;
}

export interface UpdateDoorOp extends BaseDesignOperation {
  type: 'update_door';
  doorId: string;
  updates: Partial<DoorElement>;
}

export interface DeleteDoorOp extends BaseDesignOperation {
  type: 'delete_door';
  doorId: string;
}

export interface AddWindowOp extends BaseDesignOperation {
  type: 'add_window';
  window: WindowElement;
}

export interface UpdateWindowOp extends BaseDesignOperation {
  type: 'update_window';
  windowId: string;
  updates: Partial<WindowElement>;
}

export interface DeleteWindowOp extends BaseDesignOperation {
  type: 'delete_window';
  windowId: string;
}

export interface AddFixtureOp extends BaseDesignOperation {
  type: 'add_fixture';
  fixture: FurnitureElement;
}

export interface UpdateFixtureOp extends BaseDesignOperation {
  type: 'update_fixture';
  fixtureId: string;
  updates: Partial<FurnitureElement>;
}

export interface DeleteFixtureOp extends BaseDesignOperation {
  type: 'delete_fixture';
  fixtureId: string;
}

export interface MoveElementOp extends BaseDesignOperation {
  type: 'move_element';
  elementType: 'wall' | 'door' | 'window' | 'furniture' | 'room' | 'parametric';
  elementId: string;
  dx: number;
  dy: number;
  dz?: number;
}

export interface CreateParametricObjectOp extends BaseDesignOperation {
  type: 'create_parametric_object';
  parametricObject: ParametricObject;
}

export interface UpdateParametricParameterOp extends BaseDesignOperation {
  type: 'update_parametric_parameter';
  parametricObjectId: string;
  parameterName: string;
  value: number | string | boolean;
}

export interface UpdateParametricSourceOp extends BaseDesignOperation {
  type: 'update_parametric_source';
  parametricObjectId: string;
  source: string;
}

export interface DeleteParametricObjectOp extends BaseDesignOperation {
  type: 'delete_parametric_object';
  parametricObjectId: string;
}

export interface AttachSketchOp extends BaseDesignOperation {
  type: 'attach_sketch';
  sketchDocument: SketchDocumentRef;
}

export interface ConvertSketchSelectionOp extends BaseDesignOperation {
  type: 'convert_sketch_selection';
  sourceShapeIds: string[];
  proposedOperations: DesignOperation[];
}

export interface SetLightingOp extends BaseDesignOperation {
  type: 'set_lighting';
  lighting: Partial<LightingConfig>;
}

export interface BatchOperationsOp extends BaseDesignOperation {
  type: 'batch_operations';
  operations: DesignOperation[];
}

export type DesignOperation =
  | CreateWallOp
  | UpdateWallOp
  | DeleteWallOp
  | CreateRoomOp
  | UpdateRoomOp
  | DeleteRoomOp
  | AddDoorOp
  | UpdateDoorOp
  | DeleteDoorOp
  | AddWindowOp
  | UpdateWindowOp
  | DeleteWindowOp
  | AddFixtureOp
  | UpdateFixtureOp
  | DeleteFixtureOp
  | MoveElementOp
  | CreateParametricObjectOp
  | UpdateParametricParameterOp
  | UpdateParametricSourceOp
  | DeleteParametricObjectOp
  | AttachSketchOp
  | ConvertSketchSelectionOp
  | SetLightingOp
  | BatchOperationsOp;

// ---------------------------------------------------------------------------
// ARTIFACT EXPORTER & PUBLISHER MODELS
// ---------------------------------------------------------------------------

export type ExportFormat = 'json' | 'svg' | 'dxf' | 'obj' | 'scad' | 'stl' | '3mf' | 'gltf';

export interface DesignArtifact {
  id: string;
  projectId: string;
  revisionId: string;
  format: ExportFormat;
  mimeType: string;
  filename: string;
  size: number;
  createdAt: number;
  generator: string;
  checksum: string;
  content: string | Uint8Array;
  localUrl?: string;
  storageRef?: string;
  metadata?: Record<string, any>;
}

export type PublisherDestinationId = 'local' | 'github' | 'cloudflare' | 'docker' | 'custom';

export interface PublisherCapabilities {
  supportsPrivatePublish: boolean;
  supportsReleases: boolean;
  supportsDirectArtifacts: boolean;
  requiresAuthToken: boolean;
  authFields?: { key: string; label: string; type: 'text' | 'password'; placeholder?: string; required?: boolean }[];
}

export interface PublishResult {
  success: boolean;
  destination: PublisherDestinationId;
  targetUrl?: string;
  receiptId: string;
  publishedAt: number;
  filesCount: number;
  message: string;
  metadata?: Record<string, any>;
}

export interface ProjectRevisionReceipt {
  revisionId: string;
  projectId: string;
  revisionNumber: number;
  timestamp: number;
  message: string;
  author?: string;
  wallsCount: number;
  roomsCount: number;
  parametricCount: number;
}

// ---------------------------------------------------------------------------
// MULTIPLAYER, ROLES, AND STUDIO UI STATE
// ---------------------------------------------------------------------------

export type UserRole = 'Owner' | 'Editor' | 'Viewer';

export interface RolePermissions {
  canEditGeometry: boolean;
  canUseAIAssistant: boolean;
  canUploadSketches: boolean;
  canChangeSettings: boolean;
  canManageRoles: boolean;
  canLoadTemplates: boolean;
  canSaveRevisions: boolean;
  canExport: boolean;
  canGenerateMedia: boolean;
  canEditParametric: boolean;
}

export interface MultiplayerUser {
  id: string;
  name: string;
  color: string;
  role: UserRole;
  cursor?: { x: number; y: number; view: '2d' | '3d' };
  selectedIds: string[];
  activeTool: string;
  lastActive: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  text: string;
  timestamp: number;
  planData?: Partial<DesignProject>;
  suggestedPrompts?: string[];
  generatedImages?: { url: string; prompt: string; timestamp: number }[];
  videoResult?: { url: string; prompt: string; operationName?: string };
  isStreaming?: boolean;
}

export type ActiveTool =
  | 'select'
  | 'wall'
  | 'door'
  | 'window'
  | 'room'
  | 'furniture'
  | 'dimension'
  | 'measure'
  | 'eraser'
  | 'pan';

export type StudioTabMode = 'plan' | 'sketch' | '3d' | 'parametric' | 'render';

export type ViewMode = 'split' | '2d' | '3d' | 'firstperson' | 'sketch' | 'parametric' | 'robotics';

