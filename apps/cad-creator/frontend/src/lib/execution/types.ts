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
}

export interface DesignExecutionProvider {
  id: string;
  displayName: string;
  capabilities(): Promise<ExecutionCapabilities>;
  executeOpenScad(request: OpenScadExecutionRequest): Promise<OpenScadExecutionResult>;
  convertArtifact?(request: ConvertArtifactRequest): Promise<DesignArtifact>;
  health(): Promise<ExecutionHealth>;
}
