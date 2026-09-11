/**
 * Shared CAD Types & Schemas
 *
 * Canonical data models shared between backend services, runtime adapters, and frontend client.
 */

export type MeasurementUnit = 'in' | 'ft' | 'mm' | 'm';

export type WallMaterial = 'drywall' | 'brick' | 'concrete' | 'glass' | 'wood_panel' | 'steel';

export type FloorMaterial = 'hardwood' | 'marble' | 'tile' | 'polished_concrete' | 'carpet' | 'terrazzo';

export type FurnitureCategory = 'seating' | 'tables' | 'bedroom' | 'kitchen' | 'bathroom' | 'office' | 'decor' | 'parametric';

export type ExportFormat = 'glb' | 'gltf' | 'stl' | 'obj' | 'dxf' | 'blend' | 'scad' | 'json';

export type ExecutionLane = 'local-mock' | 'native-blender' | 'cad-container' | 'cloudflare-worker' | 'gcp-cloud-run';

export interface WallElement {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number; // default: 6 inches
  height3D: number; // default: 108 inches
  material: WallMaterial;
  color?: string;
  exterior?: boolean;
  sourceSketchShapeIds?: string[];
}

export interface OpeningElement {
  id: string;
  wallId: string;
  type: 'door' | 'window';
  distanceAlongWall: number; // 0.0 to 1.0 ratio
  width: number;
  height: number;
  elevation?: number; // from floor
  swing?: 'left' | 'right' | 'sliding' | 'double' | 'pocket';
  openAngle?: number;
  style?: 'casement' | 'sliding' | 'picture' | 'hung';
  label?: string;
  sourceSketchShapeIds?: string[];
}

export interface DoorElement {
  id: string;
  wallId: string;
  distanceAlongWall: number;
  width: number;
  height: number;
  swing: 'left' | 'right' | 'sliding' | 'double' | 'pocket';
  openAngle: number;
  label?: string;
  sourceSketchShapeIds?: string[];
}

export interface WindowElement {
  id: string;
  wallId: string;
  distanceAlongWall: number;
  width: number;
  height: number;
  elevation: number;
  style: 'casement' | 'sliding' | 'picture' | 'hung';
  label?: string;
  sourceSketchShapeIds?: string[];
}

export interface FurnitureElement {
  id: string;
  type: string;
  category: FurnitureCategory;
  name: string;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  rotation: number;
  color: string;
  material?: string;
  icon?: string;
  parametricObjectId?: string;
  sourceSketchShapeIds?: string[];
}

export interface RoomZone {
  id: string;
  name: string;
  points: [number, number][]; // 2D polygon vertices in inches
  areaSqFt: number;
  floorMaterial: FloorMaterial;
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

export interface LightingConfig {
  sunAltitude: number; // 10 to 90
  sunAzimuth: number; // 0 to 360
  intensity: number; // 0.2 to 3.0
  timeOfDay: 'morning' | 'noon' | 'sunset' | 'night';
  shadows: boolean;
  ambientColor: string;
}

export interface CameraConfig {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  fov: number;
}

export interface MaterialDef {
  id: string;
  name: string;
  color: string;
  roughness: number;
  metallic?: number;
  textureUrl?: string;
}

export interface ParametricObject {
  id: string;
  name: string;
  generator: 'openscad' | 'procedural_csg' | 'custom_script';
  parameters: Record<string, number | string | boolean>;
  transform: {
    x: number;
    y: number;
    z: number;
    rotationX?: number;
    rotationY?: number;
    rotationZ?: number;
  };
  source: string;
  updatedAt?: number;
}

export interface ProjectMetadata {
  author?: string;
  description?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  revision: number;
  revisionMessage?: string;
}

/**
 * Normalized Portable CAD Project State
 */
export interface ProjectState {
  schema_version?: number;
  id: string;
  name: string;
  units: MeasurementUnit;
  scale: number;
  gridSize: number;
  snapToGrid: boolean;
  walls: WallElement[];
  doors: DoorElement[];
  windows: WindowElement[];
  openings?: OpeningElement[];
  furniture: FurnitureElement[];
  rooms: RoomZone[];
  annotations: DimensionAnnotation[];
  parametricObjects?: ParametricObject[];
  sketchDocument?: {
    tldrawSnapshot?: any;
    shapesCount?: number;
    lastEditedAt?: number;
  };
  lighting: LightingConfig;
  cameras?: CameraConfig[];
  materials?: MaterialDef[];
  roofType: 'none' | 'flat' | 'gable';
  ceilingHeight: number;
  metadata?: ProjectMetadata;
  updatedAt: number;
  version: number;
}

/**
 * Declarative CAD Recipe Operation
 */
export interface CadRecipeOperation {
  op:
    | 'create_collection'
    | 'extrude_wall'
    | 'boolean_opening'
    | 'create_floor_slab'
    | 'place_fixture'
    | 'assign_material'
    | 'create_camera'
    | 'setup_sunlight';
  id: string;
  collection?: string;
  params: Record<string, any>;
}

export interface CadRecipe {
  schema_version: number;
  recipe_id: string;
  title: string;
  units: MeasurementUnit;
  metadata: {
    author: string;
    generator: string;
    createdAt: number;
  };
  environment: {
    sunAltitude: number;
    sunAzimuth: number;
    ambientColor: string;
    shadows: boolean;
  };
  operations: CadRecipeOperation[];
}

export interface ArtifactReceipt {
  artifactId: string;
  filename: string;
  format: ExportFormat | 'png' | 'jpeg';
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: number;
  generator: string;
  storagePath: string;
  downloadUrl?: string;
  warnings?: string[];
}
