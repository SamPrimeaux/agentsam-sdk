import {
  ExecutionLane,
  ExportFormat,
  ProjectState,
  CadRecipe,
  ArtifactReceipt,
} from './types';

// ==========================================
// 1. GET /api/cad/health
// ==========================================
export interface CadHealthResponse {
  status: 'ok' | 'degraded' | 'error';
  runtime: string;
  version: string;
  execution_lane: ExecutionLane;
  timestamp: string;
}

// ==========================================
// 2. GET /api/cad/capabilities
// ==========================================
export interface CadCapabilityDetails {
  available: boolean;
  version?: string;
  engine: string;
  supportedFormats: ExportFormat[];
  executionLane: ExecutionLane;
  notes?: string;
}

export interface CadCapabilitiesResponse {
  schema_version: number;
  available_lanes: ExecutionLane[];
  active_lane: ExecutionLane;
  blender: {
    available: boolean;
    version?: string;
    binary?: string;
    execution_lane: ExecutionLane;
    capabilities: ('build' | 'render_preview' | 'inspect' | 'export')[];
    install_guide?: string;
  };
  openscad: {
    available: boolean;
    version?: string;
    capabilities: ('csg' | 'render' | 'export')[];
  };
  freecad?: {
    available: boolean;
    capabilities: string[];
  };
  formats: {
    import: string[];
    export: ExportFormat[];
  };
}

// ==========================================
// 3. GET /api/cad/blender/status
// ==========================================
export interface BlenderStatusResponse {
  schema_version: number;
  capability: 'blender.status';
  available: boolean;
  binary: string | null;
  version: string | null;
  execution_lane: ExecutionLane;
  detected_paths?: string[];
  install_info?: {
    help: string;
    download_url: string;
    env_variable: string;
  };
}

// ==========================================
// 4. POST /api/cad/blender/inspect
// ==========================================
export interface BlenderInspectRequest {
  artifact_path: string; // Restricted to owned output/storage root
  include_geometry_metrics?: boolean;
}

export interface BlenderInspectResponse {
  schema_version: number;
  capability: 'blender.inspect';
  success: boolean;
  artifact_path: string;
  blender_version: string;
  scene: {
    name: string;
    unit_system: string;
    objects_count: number;
    collections: string[];
    materials: string[];
    cameras: string[];
    lights: string[];
    rooms_detected?: number;
    walls_detected?: number;
    fixtures_detected?: number;
    vertex_count?: number;
    face_count?: number;
  };
  error?: string;
}

// ==========================================
// 5. POST /api/cad/blender/build
// ==========================================
export interface BlenderBuildRequest {
  recipe: CadRecipe;
  output_filename?: string;
  source_blend_path?: string; // If extending an existing base blend template
}

export interface BlenderBuildResponse {
  schema_version: number;
  capability: 'blender.build';
  success: boolean;
  artifact: ArtifactReceipt;
  blender_version: string;
  operations_applied: number;
  duration_ms: number;
  warnings?: string[];
  error?: string;
}

// ==========================================
// 6. POST /api/cad/blender/render-preview
// ==========================================
export interface BlenderRenderPreviewRequest {
  artifact_path: string;
  width?: number; // default 1280
  height?: number; // default 720
  samples?: number; // default 64
  engine?: 'BLENDER_EEVEE_NEXT' | 'CYCLES' | 'BLENDER_WORKBENCH';
  camera_name?: string;
  transparent_background?: boolean;
}

export interface BlenderRenderPreviewResponse {
  schema_version: number;
  capability: 'blender.render_preview';
  success: boolean;
  artifact: ArtifactReceipt;
  preview_url: string; // Base64 data URI or static artifact URL
  render_metadata: {
    duration_ms: number;
    engine: string;
    samples: number;
    resolution: { width: number; height: number };
  };
  error?: string;
}

// ==========================================
// 7. POST /api/cad/blender/export
// ==========================================
export interface BlenderExportRequest {
  artifact_path: string;
  format: 'glb' | 'stl' | 'obj';
  selected_collections?: string[];
  apply_modifiers?: boolean;
}

export interface BlenderExportResponse {
  schema_version: number;
  capability: 'blender.export';
  success: boolean;
  artifact: ArtifactReceipt;
  format: 'glb' | 'stl' | 'obj';
  duration_ms: number;
  error?: string;
}

// ==========================================
// 8. Project & Design High-Level Studio API
// ==========================================
export interface StudioProjectGetRequest {
  id?: string;
}

export interface StudioProjectSaveRequest {
  project: ProjectState;
}

export interface StudioProjectResponse {
  success: boolean;
  project: ProjectState;
  storage_provider: 'memory' | 'sqlite' | 'cloudflare-d1';
  revision: number;
}

export interface StudioSceneResponse {
  success: boolean;
  scene_id: string;
  units: string;
  counts: {
    walls: number;
    doors: number;
    windows: number;
    rooms: number;
    furniture: number;
    lights: number;
  };
  bounding_box: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

export interface StudioDesignCompileRequest {
  project: ProjectState;
  target_format?: ExportFormat;
}

export interface StudioDesignCompileResponse {
  success: boolean;
  recipe: CadRecipe;
  summary: {
    total_operations: number;
    wall_count: number;
    opening_count: number;
    room_count: number;
    fixture_count: number;
  };
}

export interface StudioDesignRenderRequest {
  project?: ProjectState;
  recipe?: CadRecipe;
  width?: number;
  height?: number;
  engine?: 'EEVEE' | 'CYCLES' | 'PREVIEW';
}

export interface StudioDesignRenderResponse {
  success: boolean;
  image_url: string;
  receipt: ArtifactReceipt;
  render_engine: string;
  duration_ms: number;
}

export interface StudioDesignExportRequest {
  project?: ProjectState;
  recipe?: CadRecipe;
  format: ExportFormat;
}

export interface StudioDesignExportResponse {
  success: boolean;
  receipt: ArtifactReceipt;
  download_url: string;
  format: ExportFormat;
}
