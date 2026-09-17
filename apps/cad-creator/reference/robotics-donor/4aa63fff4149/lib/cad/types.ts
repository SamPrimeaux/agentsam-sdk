/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Supported CAD execution engines in AgentSam CAD Creator
 */
export type CadEngineType = 'openscad' | 'blender' | 'freecad' | 'meshy' | 'mujoco';

/**
 * Artifact representation for CAD files, models, and simulation receipts
 */
export interface Artifact {
  id: string;
  name: string;
  format: 'stl' | 'step' | 'scad' | 'blend' | 'glb' | 'obj' | 'dxf' | 'xml' | 'png' | 'json';
  sizeBytes?: number;
  uri?: string;
  data?: string; // base64 or raw string
  createdAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * Standardized CAD execution request contract
 */
export interface CadExecutionRequest {
  jobId: string;
  engine: CadEngineType;
  operation: string; // e.g. 'compile', 'render', 'boolean_op', 'mesh_gen', 'step_export'
  input: {
    code?: string;
    params?: Record<string, number | string | boolean>;
    prompt?: string;
    sceneData?: unknown;
    sourceArtifacts?: string[];
  };
  options?: {
    timeoutMs?: number;
    quality?: 'draft' | 'preview' | 'production' | 'high';
    format?: string;
  };
}

/**
 * Standardized CAD execution receipt contract
 */
export interface CadExecutionReceipt {
  jobId: string;
  engine: CadEngineType;
  operation: string;
  status: 'success' | 'failed' | 'fallback' | 'simulated' | 'in_progress';
  artifacts: Artifact[];
  diagnostics: {
    executionTimeMs: number;
    logs: string[];
    warnings?: string[];
    errors?: string[];
  };
}

/**
 * Canonical CAD Project Model
 */
export interface CadProject {
  id: string;
  name: string;
  version: string;
  units: 'mm' | 'm' | 'in';
  createdAt: number;
  updatedAt: number;
  metadata: {
    author?: string;
    description?: string;
    tags?: string[];
  };
  parametric?: {
    scadCode: string;
    variables: Record<string, { label: string; value: number; min: number; max: number; step: number }>;
  };
  robotics?: {
    robotId: string;
    sceneConfig: string;
    jointTargets?: number[];
    workcellLayout?: unknown;
  };
  render?: {
    lightingPreset: string;
    materialPreset: string;
    cameraAngle: string;
  };
  generative?: {
    prompt: string;
    style: string;
  };
  artifacts: Artifact[];
}
