/**
 * AgentSam CAD/BIM Canonical Schema & Project Validation Engine
 *
 * Formalizes strict domain types and provides canonical validation
 * for all AI-generated, imported, or collaborative project states.
 */

export type MeasurementUnit = 'in' | 'ft' | 'm' | 'mm';

export type WallMaterial = 'drywall' | 'brick' | 'concrete' | 'glass' | 'wood_panel' | 'steel';

export type FloorMaterial = 'hardwood' | 'marble' | 'tile' | 'polished_concrete' | 'carpet' | 'terrazzo';

export interface WallElement {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number; // in inches (e.g. 6)
  height3D: number; // in inches (e.g. 96 or 108)
  material: WallMaterial;
  color?: string;
  exterior?: boolean;
  sourceSketchShapeIds?: string[];
}

export interface DoorElement {
  id: string;
  wallId: string;
  distanceAlongWall: number; // 0 to 1 ratio or offset
  width: number; // in inches
  height: number; // in inches
  swing: 'left' | 'right' | 'sliding' | 'double' | 'pocket';
  openAngle: number; // 0 to 90 degrees
  label?: string;
  sourceSketchShapeIds?: string[];
}

export interface WindowElement {
  id: string;
  wallId: string;
  distanceAlongWall: number; // 0 to 1 ratio
  width: number; // in inches
  height: number; // in inches
  elevation: number; // height from floor in inches
  style: 'casement' | 'sliding' | 'picture' | 'hung';
  label?: string;
  sourceSketchShapeIds?: string[];
}

export type FurnitureCategory = 'seating' | 'tables' | 'bedroom' | 'kitchen' | 'bathroom' | 'office' | 'decor' | 'parametric';

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
  points: [number, number][]; // Polygon vertices in inches
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
  sunAltitude: number; // 10 to 90 degrees
  sunAzimuth: number; // 0 to 360 degrees
  intensity: number; // 0.2 to 2.0
  timeOfDay: 'morning' | 'noon' | 'sunset' | 'night';
  shadows: boolean;
  ambientColor: string;
}

export type ParametricGeneratorType = 'openscad' | 'procedural_csg' | 'custom_script';

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
  generatorTemplate?: string;
  parameters: Record<string, number | string | boolean>;
  parameterDefs?: ParametricParameterDef[];
  transform: {
    x: number;
    y: number;
    z: number;
    rotationX?: number;
    rotationY?: number;
    rotationZ?: number;
  };
  source: string;
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
  tldrawSnapshot?: any;
  shapesCount?: number;
  lastEditedAt?: number;
}

export interface ProjectState {
  id: string;
  name: string;
  units: MeasurementUnit;
  scale: number;
  gridSize: number;
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
  lighting: LightingConfig;
  roofType: 'none' | 'flat' | 'gable';
  ceilingHeight: number;
  metadata?: ProjectMetadata;
  updatedAt: number;
  version: number;
}

export type DesignProject = ProjectState;

export interface ProjectValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  project: ProjectState;
}

// ---------------------------------------------------------------------------
// DEFAULT FACTORIES
// ---------------------------------------------------------------------------

export function createDefaultLightingConfig(): LightingConfig {
  return {
    sunAltitude: 45,
    sunAzimuth: 135,
    intensity: 1.0,
    timeOfDay: 'noon',
    shadows: true,
    ambientColor: '#ffffff',
  };
}

export function createEmptyProject(name = 'New Architectural Design'): ProjectState {
  const now = Date.now();
  return {
    id: `proj_${now}_${Math.random().toString(36).substr(2, 6)}`,
    name,
    units: 'in',
    scale: 1,
    gridSize: 12,
    snapToGrid: true,
    walls: [],
    doors: [],
    windows: [],
    furniture: [],
    rooms: [],
    annotations: [],
    parametricObjects: [],
    lighting: createDefaultLightingConfig(),
    roofType: 'flat',
    ceilingHeight: 108,
    metadata: {
      createdAt: now,
      updatedAt: now,
      revision: 1,
      author: 'AgentSam Designer',
      tags: ['spatial-plan', 'bim-model'],
    },
    updatedAt: now,
    version: 1,
  };
}

// ---------------------------------------------------------------------------
// SANITIZATION & VALIDATION HELPERS
// ---------------------------------------------------------------------------

function sanitizeString(val: any, fallback: string): string {
  if (typeof val === 'string' && val.trim().length > 0) {
    return val.trim();
  }
  return fallback;
}

function sanitizeNumber(val: any, fallback: number, min?: number, max?: number): number {
  const num = typeof val === 'number' && !isNaN(val) ? val : Number(val);
  if (isNaN(num)) return fallback;
  let clamped = num;
  if (min !== undefined && clamped < min) clamped = min;
  if (max !== undefined && clamped > max) clamped = max;
  return clamped;
}

function sanitizeBoolean(val: any, fallback: boolean): boolean {
  if (typeof val === 'boolean') return val;
  if (val === 'true' || val === 1) return true;
  if (val === 'false' || val === 0) return false;
  return fallback;
}

const VALID_WALL_MATERIALS: Set<WallMaterial> = new Set([
  'drywall',
  'brick',
  'concrete',
  'glass',
  'wood_panel',
  'steel',
]);

const VALID_FLOOR_MATERIALS: Set<FloorMaterial> = new Set([
  'hardwood',
  'marble',
  'tile',
  'polished_concrete',
  'carpet',
  'terrazzo',
]);

const VALID_FURNITURE_CATEGORIES: Set<FurnitureCategory> = new Set([
  'seating',
  'tables',
  'bedroom',
  'kitchen',
  'bathroom',
  'office',
  'decor',
  'parametric',
]);

export function validateWall(wall: any, index: number, warnings: string[]): WallElement | null {
  if (!wall || typeof wall !== 'object') {
    warnings.push(`Wall at index ${index} is not an object and was skipped.`);
    return null;
  }

  const x1 = sanitizeNumber(wall.x1, 0);
  const y1 = sanitizeNumber(wall.y1, 0);
  const x2 = sanitizeNumber(wall.x2, x1 + 120);
  const y2 = sanitizeNumber(wall.y2, y1);

  // Check degenerate wall
  const lengthSq = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (lengthSq < 1) {
    warnings.push(`Wall #${wall.id || index} has zero length and was skipped.`);
    return null;
  }

  const material: WallMaterial = VALID_WALL_MATERIALS.has(wall.material) ? wall.material : 'drywall';

  return {
    id: sanitizeString(wall.id, `wall_${Date.now()}_${index}`),
    x1,
    y1,
    x2,
    y2,
    thickness: sanitizeNumber(wall.thickness, 6, 1, 36),
    height3D: sanitizeNumber(wall.height3D, 108, 12, 360),
    material,
    color: typeof wall.color === 'string' ? wall.color : undefined,
    exterior: sanitizeBoolean(wall.exterior, false),
    sourceSketchShapeIds: Array.isArray(wall.sourceSketchShapeIds) ? wall.sourceSketchShapeIds.filter((s: any) => typeof s === 'string') : undefined,
  };
}

export function validateDoor(door: any, index: number, walls: WallElement[], warnings: string[]): DoorElement | null {
  if (!door || typeof door !== 'object') {
    warnings.push(`Door at index ${index} is not an object.`);
    return null;
  }

  const swingOptions = ['left', 'right', 'sliding', 'double', 'pocket'] as const;
  const swing = swingOptions.includes(door.swing) ? door.swing : 'left';

  return {
    id: sanitizeString(door.id, `door_${Date.now()}_${index}`),
    wallId: sanitizeString(door.wallId, walls[0]?.id || 'wall_0'),
    distanceAlongWall: sanitizeNumber(door.distanceAlongWall, 0.5, 0, 1),
    width: sanitizeNumber(door.width, 36, 18, 96),
    height: sanitizeNumber(door.height, 84, 48, 120),
    swing,
    openAngle: sanitizeNumber(door.openAngle, 0, 0, 90),
    label: typeof door.label === 'string' ? door.label : undefined,
    sourceSketchShapeIds: Array.isArray(door.sourceSketchShapeIds) ? door.sourceSketchShapeIds.filter((s: any) => typeof s === 'string') : undefined,
  };
}

export function validateWindow(win: any, index: number, walls: WallElement[], warnings: string[]): WindowElement | null {
  if (!win || typeof win !== 'object') {
    warnings.push(`Window at index ${index} is not an object.`);
    return null;
  }

  const styleOptions = ['casement', 'sliding', 'picture', 'hung'] as const;
  const style = styleOptions.includes(win.style) ? win.style : 'casement';

  return {
    id: sanitizeString(win.id, `win_${Date.now()}_${index}`),
    wallId: sanitizeString(win.wallId, walls[0]?.id || 'wall_0'),
    distanceAlongWall: sanitizeNumber(win.distanceAlongWall, 0.5, 0, 1),
    width: sanitizeNumber(win.width, 48, 12, 144),
    height: sanitizeNumber(win.height, 60, 12, 120),
    elevation: sanitizeNumber(win.elevation, 36, 0, 100),
    style,
    label: typeof win.label === 'string' ? win.label : undefined,
    sourceSketchShapeIds: Array.isArray(win.sourceSketchShapeIds) ? win.sourceSketchShapeIds.filter((s: any) => typeof s === 'string') : undefined,
  };
}

export function validateFurniture(item: any, index: number, warnings: string[]): FurnitureElement | null {
  if (!item || typeof item !== 'object') {
    warnings.push(`Furniture at index ${index} is not an object.`);
    return null;
  }

  const category: FurnitureCategory = VALID_FURNITURE_CATEGORIES.has(item.category) ? item.category : 'seating';

  return {
    id: sanitizeString(item.id, `furn_${Date.now()}_${index}`),
    type: sanitizeString(item.type, 'chair'),
    category,
    name: sanitizeString(item.name, 'Furniture Item'),
    x: sanitizeNumber(item.x, 0),
    y: sanitizeNumber(item.y, 0),
    w: sanitizeNumber(item.w, 36, 6, 300),
    d: sanitizeNumber(item.d, 36, 6, 300),
    h: sanitizeNumber(item.h, 30, 2, 200),
    rotation: sanitizeNumber(item.rotation, 0, -360, 360),
    color: sanitizeString(item.color, '#6366f1'),
    material: typeof item.material === 'string' ? item.material : undefined,
    icon: typeof item.icon === 'string' ? item.icon : undefined,
    parametricObjectId: typeof item.parametricObjectId === 'string' ? item.parametricObjectId : undefined,
    sourceSketchShapeIds: Array.isArray(item.sourceSketchShapeIds) ? item.sourceSketchShapeIds.filter((s: any) => typeof s === 'string') : undefined,
  };
}

export function validateRoom(room: any, index: number, warnings: string[]): RoomZone | null {
  if (!room || typeof room !== 'object') {
    warnings.push(`Room at index ${index} is not an object.`);
    return null;
  }

  let points: [number, number][] = [];
  if (Array.isArray(room.points)) {
    points = room.points
      .filter((pt: any) => Array.isArray(pt) && pt.length >= 2 && !isNaN(Number(pt[0])) && !isNaN(Number(pt[1])))
      .map((pt: any) => [Number(pt[0]), Number(pt[1])] as [number, number]);
  }

  if (points.length < 3) {
    // Generate fallback rectangle
    const ox = index * 140;
    points = [
      [ox, 0],
      [ox + 120, 0],
      [ox + 120, 120],
      [ox, 120],
    ];
    warnings.push(`Room #${room.id || index} had insufficient vertices; populated default boundary.`);
  }

  const floorMaterial: FloorMaterial = VALID_FLOOR_MATERIALS.has(room.floorMaterial)
    ? room.floorMaterial
    : 'hardwood';

  // Calculate polygon area in square feet if missing or zero
  let areaSqFt = sanitizeNumber(room.areaSqFt, 0);
  if (areaSqFt <= 0 && points.length >= 3) {
    let areaInches = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      areaInches += points[i][0] * points[j][1];
      areaInches -= points[j][0] * points[i][1];
    }
    areaSqFt = Math.round((Math.abs(areaInches) / 2) / 144);
  }

  return {
    id: sanitizeString(room.id, `room_${Date.now()}_${index}`),
    name: sanitizeString(room.name, `Room ${index + 1}`),
    points,
    areaSqFt: areaSqFt || 100,
    floorMaterial,
    color: sanitizeString(room.color, '#3b82f6'),
    sourceSketchShapeIds: Array.isArray(room.sourceSketchShapeIds) ? room.sourceSketchShapeIds.filter((s: any) => typeof s === 'string') : undefined,
  };
}

export function validateParametricObject(obj: any, index: number, warnings: string[]): ParametricObject | null {
  if (!obj || typeof obj !== 'object') {
    warnings.push(`Parametric object at index ${index} is not an object.`);
    return null;
  }

  const generator: ParametricGeneratorType =
    obj.generator === 'procedural_csg' || obj.generator === 'custom_script' ? obj.generator : 'openscad';

  const transform = obj.transform && typeof obj.transform === 'object' ? obj.transform : {};

  return {
    id: sanitizeString(obj.id, `param_${Date.now()}_${index}`),
    name: sanitizeString(obj.name, `Parametric Component ${index + 1}`),
    generator,
    generatorTemplate: typeof obj.generatorTemplate === 'string' ? obj.generatorTemplate : undefined,
    parameters: typeof obj.parameters === 'object' && obj.parameters !== null ? obj.parameters : {},
    parameterDefs: Array.isArray(obj.parameterDefs) ? obj.parameterDefs : undefined,
    transform: {
      x: sanitizeNumber(transform.x, 0),
      y: sanitizeNumber(transform.y, 0),
      z: sanitizeNumber(transform.z, 0),
      rotationX: sanitizeNumber(transform.rotationX, 0),
      rotationY: sanitizeNumber(transform.rotationY, 0),
      rotationZ: sanitizeNumber(transform.rotationZ, 0),
    },
    source: sanitizeString(obj.source, '// OpenSCAD parametric definition\ncube([48, 24, 30]);'),
    generatedArtifacts: Array.isArray(obj.generatedArtifacts) ? obj.generatedArtifacts : [],
    updatedAt: sanitizeNumber(obj.updatedAt, Date.now()),
  };
}

// ---------------------------------------------------------------------------
// CANONICAL PROJECT VALIDATION FUNCTION
// ---------------------------------------------------------------------------

/**
 * Validates and normalizes any arbitrary or AI-generated project structure
 * into a strictly conformant ProjectState object.
 *
 * @param data Raw untyped project object from JSON, AI Studio endpoint, or storage
 * @returns Fully typed, sanitized, and normalized ProjectState
 */
export function validateProject(data: any): ProjectState {
  const result = validateProjectDetailed(data);
  return result.project;
}

/**
 * Detailed validation providing warnings, errors, and the normalized ProjectState.
 */
export function validateProjectDetailed(data: any): ProjectValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data || typeof data !== 'object') {
    errors.push('Provided project data is null, undefined, or not an object. Returned default project.');
    return {
      valid: false,
      errors,
      warnings,
      project: createEmptyProject(),
    };
  }

  const now = Date.now();
  const id = sanitizeString(data.id, `proj_${now}_${Math.random().toString(36).substr(2, 6)}`);
  const name = sanitizeString(data.name, 'Architectural Project');

  const unitOptions: MeasurementUnit[] = ['in', 'ft', 'm', 'mm'];
  const units: MeasurementUnit = unitOptions.includes(data.units) ? data.units : 'in';

  const scale = sanitizeNumber(data.scale, 1, 0.01, 100);
  const gridSize = sanitizeNumber(data.gridSize, 12, 1, 120);
  const snapToGrid = sanitizeBoolean(data.snapToGrid, true);
  const ceilingHeight = sanitizeNumber(data.ceilingHeight, 108, 48, 600);

  const roofOptions = ['none', 'flat', 'gable'] as const;
  const roofType = roofOptions.includes(data.roofType) ? data.roofType : 'flat';

  // Walls
  const rawWalls = Array.isArray(data.walls) ? data.walls : [];
  const walls: WallElement[] = [];
  rawWalls.forEach((w: any, idx: number) => {
    const validW = validateWall(w, idx, warnings);
    if (validW) walls.push(validW);
  });

  // Doors
  const rawDoors = Array.isArray(data.doors) ? data.doors : [];
  const doors: DoorElement[] = [];
  rawDoors.forEach((d: any, idx: number) => {
    const validD = validateDoor(d, idx, walls, warnings);
    if (validD) doors.push(validD);
  });

  // Windows
  const rawWindows = Array.isArray(data.windows) ? data.windows : [];
  const windows: WindowElement[] = [];
  rawWindows.forEach((win: any, idx: number) => {
    const validWin = validateWindow(win, idx, walls, warnings);
    if (validWin) windows.push(validWin);
  });

  // Furniture
  const rawFurniture = Array.isArray(data.furniture) ? data.furniture : [];
  const furniture: FurnitureElement[] = [];
  rawFurniture.forEach((f: any, idx: number) => {
    const validF = validateFurniture(f, idx, warnings);
    if (validF) furniture.push(validF);
  });

  // Rooms
  const rawRooms = Array.isArray(data.rooms) ? data.rooms : [];
  const rooms: RoomZone[] = [];
  rawRooms.forEach((r: any, idx: number) => {
    const validR = validateRoom(r, idx, warnings);
    if (validR) rooms.push(validR);
  });

  // Annotations
  const rawAnnotations = Array.isArray(data.annotations) ? data.annotations : [];
  const annotations: DimensionAnnotation[] = [];
  rawAnnotations.forEach((ann: any, idx: number) => {
    if (ann && typeof ann === 'object') {
      annotations.push({
        id: sanitizeString(ann.id, `dim_${Date.now()}_${idx}`),
        x1: sanitizeNumber(ann.x1, 0),
        y1: sanitizeNumber(ann.y1, 0),
        x2: sanitizeNumber(ann.x2, 0),
        y2: sanitizeNumber(ann.y2, 0),
        label: sanitizeString(ann.label, '0"'),
        sourceSketchShapeIds: Array.isArray(ann.sourceSketchShapeIds) ? ann.sourceSketchShapeIds : undefined,
      });
    }
  });

  // Parametric Objects
  const rawParametric = Array.isArray(data.parametricObjects) ? data.parametricObjects : [];
  const parametricObjects: ParametricObject[] = [];
  rawParametric.forEach((p: any, idx: number) => {
    const validP = validateParametricObject(p, idx, warnings);
    if (validP) parametricObjects.push(validP);
  });

  // Lighting
  const rawLight = data.lighting && typeof data.lighting === 'object' ? data.lighting : {};
  const timeOfDayOptions = ['morning', 'noon', 'sunset', 'night'] as const;
  const timeOfDay = timeOfDayOptions.includes(rawLight.timeOfDay) ? rawLight.timeOfDay : 'noon';
  const lighting: LightingConfig = {
    sunAltitude: sanitizeNumber(rawLight.sunAltitude, 45, 5, 90),
    sunAzimuth: sanitizeNumber(rawLight.sunAzimuth, 135, 0, 360),
    intensity: sanitizeNumber(rawLight.intensity, 1.0, 0.1, 3.0),
    timeOfDay,
    shadows: sanitizeBoolean(rawLight.shadows, true),
    ambientColor: sanitizeString(rawLight.ambientColor, '#ffffff'),
  };

  // Layers
  const layers: ProjectLayer[] | undefined = Array.isArray(data.layers)
    ? data.layers.map((l: any, idx: number) => ({
        id: sanitizeString(l.id, `layer_${idx}`),
        name: sanitizeString(l.name, `Layer ${idx + 1}`),
        visible: sanitizeBoolean(l.visible, true),
        locked: sanitizeBoolean(l.locked, false),
        color: typeof l.color === 'string' ? l.color : undefined,
      }))
    : undefined;

  // Sketch Document Reference
  let sketchDocument: SketchDocumentRef | undefined = undefined;
  if (data.sketchDocument && typeof data.sketchDocument === 'object') {
    sketchDocument = {
      tldrawSnapshot: data.sketchDocument.tldrawSnapshot,
      shapesCount: sanitizeNumber(data.sketchDocument.shapesCount, 0),
      lastEditedAt: sanitizeNumber(data.sketchDocument.lastEditedAt, now),
    };
  }

  // Metadata
  const rawMeta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  const metadata: ProjectMetadata = {
    author: typeof rawMeta.author === 'string' ? rawMeta.author : 'AgentSam Designer',
    description: typeof rawMeta.description === 'string' ? rawMeta.description : undefined,
    tags: Array.isArray(rawMeta.tags) ? rawMeta.tags.filter((t: any) => typeof t === 'string') : ['spatial-plan'],
    createdAt: sanitizeNumber(rawMeta.createdAt, now),
    updatedAt: sanitizeNumber(rawMeta.updatedAt, now),
    revision: sanitizeNumber(rawMeta.revision, 1, 1),
    revisionMessage: typeof rawMeta.revisionMessage === 'string' ? rawMeta.revisionMessage : undefined,
  };

  const project: ProjectState = {
    id,
    name,
    units,
    scale,
    gridSize,
    snapToGrid,
    layers,
    walls,
    doors,
    windows,
    furniture,
    rooms,
    annotations,
    parametricObjects,
    sketchDocument,
    lighting,
    roofType,
    ceilingHeight,
    metadata,
    updatedAt: sanitizeNumber(data.updatedAt, now),
    version: sanitizeNumber(data.version, 1, 1),
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    project,
  };
}

/**
 * Type guard for ProjectState
 */
export function isProjectState(data: any): data is ProjectState {
  if (!data || typeof data !== 'object') return false;
  return (
    typeof data.id === 'string' &&
    typeof data.name === 'string' &&
    Array.isArray(data.walls) &&
    Array.isArray(data.doors) &&
    Array.isArray(data.windows) &&
    Array.isArray(data.furniture) &&
    Array.isArray(data.rooms)
  );
}
