import { ExportFormat, DesignArtifact } from '@inneranimalmedia/agentsam-cad-shared';

export interface ExecutionCapabilities {
  supportsNativeOpenScad: boolean;
  supportsClientSideCsg: boolean;
  supportedFormats: ExportFormat[];
  maxTimeoutMs: number;
  environmentName: string;
}

export interface OpenScadExecutionRequest {
  source: string;
  outputFormat: 'stl' | '3mf' | 'dxf' | 'obj';
  parameters?: Record<string, number | string | boolean>;
  timeoutMs?: number;
  requestId?: string;
  filename?: string;
}

export interface OpenScadExecutionResult {
  success: boolean;
  artifactContent?: string | Uint8Array;
  mimeType: string;
  filename: string;
  sizeBytes: number;
  durationMs: number;
  logs: string[];
  error?: string;
}

export interface ConvertArtifactRequest {
  sourceArtifact: DesignArtifact;
  targetFormat: ExportFormat;
}

export interface ExecutionHealth {
  status: 'healthy' | 'degraded' | 'unavailable';
  version?: string;
  backend: 'local-browser' | 'docker-service' | 'cloud-executor';
  message?: string;
  dockerService?: {
    available: boolean;
    url?: string;
    version?: string | null;
  };
}

export interface FreeCadExecutionRequest {
  operations?: any[];
  recipe?: any;
  format?: 'step' | 'iges' | 'brep' | 'stl';
  filename?: string;
  timeoutMs?: number;
}

export interface FreeCadExecutionResult {
  success: boolean;
  engine: string;
  format: string;
  filename: string;
  artifactBase64?: string;
  sizeBytes: number;
  durationMs: number;
  logs: string[];
  metrics?: Record<string, any>;
  error?: string;
}

export interface BlenderExecutionRequest {
  operation?: 'build' | 'inspect' | 'render_preview' | 'export';
  recipe?: any;
  operations?: any[];
  format?: 'glb' | 'stl' | 'obj' | 'png';
  filename?: string;
  timeoutMs?: number;
}

export interface BlenderExecutionResult {
  success: boolean;
  engine: string;
  operation: string;
  format: string;
  filename?: string;
  artifactBase64?: string | null;
  sizeBytes: number;
  sha256?: string | null;
  durationMs: number;
  result?: any;
  logs: string[];
  error?: string;
}

export interface DesignExecutionProvider {
  id: string;
  displayName: string;
  capabilities(): Promise<ExecutionCapabilities>;
  executeOpenScad(request: OpenScadExecutionRequest): Promise<OpenScadExecutionResult>;
  executeFreeCad?(request: FreeCadExecutionRequest): Promise<FreeCadExecutionResult>;
  executeBlender?(request: BlenderExecutionRequest): Promise<BlenderExecutionResult>;
  convertArtifact?(request: ConvertArtifactRequest): Promise<DesignArtifact>;
  health(): Promise<ExecutionHealth>;
}
