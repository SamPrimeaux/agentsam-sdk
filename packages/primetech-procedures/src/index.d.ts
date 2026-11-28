/** Public TypeScript API for @inneranimalmedia/primetech-procedures. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject { [key: string]: JsonValue | undefined; }

export interface JsonSchemaDefinition {
  type?: string | string[];
  properties?: Record<string, JsonSchemaDefinition>;
  required?: string[];
  items?: JsonSchemaDefinition;
  additionalProperties?: boolean;
  enum?: JsonValue[];
  const?: JsonValue;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  pattern?: string;
  [key: string]: unknown;
}

export type ProcedureEffect = 'read' | 'local_write' | 'project_write' | 'export' | 'external_action';
export type ProcedureVerificationKind = 'output_schema' | 'fixture_suite' | 'native_validation';
export type ProcedureRuntimeKind = 'python' | 'bash' | 'sam_operation' | 'native_tool';
export type ProcedureRuntime =
  | { kind: 'python'; entrypoint: string; min_python: string; dependencies?: string[]; interpreter_candidates?: string[] }
  | { kind: 'bash'; entrypoint: string }
  | { kind: 'sam_operation'; operation: string }
  | { kind: 'native_tool'; tool_key: string };

export interface ProcedureManifest {
  schema: 'inneranimalmedia.primetech.procedure.v1';
  id: string;
  version: string;
  summary: string;
  effect: ProcedureEffect;
  capabilities: string[];
  runtime: ProcedureRuntime;
  input_schema: JsonSchemaDefinition;
  output_schema: JsonSchemaDefinition;
  verification: { kind: ProcedureVerificationKind; expected?: JsonValue; fixture_id?: string };
  flags: { network: boolean; physical_hardware: boolean; requires_operator_review: boolean };
}
export interface ProcedureValidationIssue { path: string; code: string; expected?: unknown; }
export interface ProcedureValidationResult { ok: boolean; errors: ProcedureValidationIssue[]; }
export type ProcedureCatalogEntry =
  | { id: string; version: string; summary: string; effect: ProcedureEffect; available: true }
  | { id: string; available: false; error: string };
export interface LoadedProcedure {
  manifest: ProcedureManifest;
  manifestPath: string;
  procedureDir: string;
  entrypointPath: string | null;
  manifestSha256: string;
  entrypointSha256: string | null;
}
export interface ProcedureCatalog {
  readonly root: string;
  list(): ProcedureCatalogEntry[];
  get(id: string, version?: string): LoadedProcedure;
}
export interface ProcedurePerformanceRow {
  id: string;
  version: string;
  run_count: number;
  completed: number;
  failed: number;
  success_rate: number;
  mean_duration_ms: number | null;
  p50_duration_ms: number | null;
  p95_duration_ms: number | null;
  last_run_at: string | null;
  failures: Array<{ code: string; count: number }>;
}
export interface ProcedurePerformanceSummary {
  schema: 'inneranimalmedia.primetech.procedure-performance.v1';
  scanned: number;
  ignored: number;
  by_procedure: ProcedurePerformanceRow[];
}
export interface ProcedureInvocation { id: string; version: string; input: Record<string, unknown>; }
export interface ProcedureAuthorizationRequest {
  id: string;
  version: string;
  effect: ProcedureEffect;
  network: boolean;
  requires_operator_review: boolean;
  input_sha256: string;
}
export interface SamOperationResult {
  ok: boolean;
  data?: unknown;
  receipt?: Record<string, unknown>;
  error?: string | { code?: string; message?: string };
  [key: string]: unknown;
}
export type SamOperationInvoker = (operation: string, input: Record<string, unknown>) => SamOperationResult | Promise<SamOperationResult>;
export type NativeToolInvoker = (toolKey: string, input: Record<string, unknown>) => SamOperationResult | Promise<SamOperationResult>;
export interface ProcedureVerificationContext {
  manifest: ProcedureManifest;
  projectRoot: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  execution: { operation: string | null; source_receipt: Record<string, unknown> | null };
}
export interface ProcedureVerificationResult { kind: ProcedureVerificationKind; ok: boolean; evidence?: unknown; }
export interface PrimeTechProcedureHandlerOptions {
  catalog?: ProcedureCatalog;
  projectRoot?: string;
  receiptDir?: string | null;
  invokeSamOperation?: SamOperationInvoker;
  invokeFileRuntime?: (request: { id: string; version: string; manifestSha256: string; entrypointSha256: string; projectRoot: string; input: Record<string, unknown>; idempotencyKey: string }) => SamOperationResult | Promise<SamOperationResult>;
  invokeNativeTool?: NativeToolInvoker | null;
  isCapabilityAvailable?: (capability: string) => boolean | Promise<boolean>;
  isNativeToolAvailable?: (toolKey: string) => boolean | Promise<boolean>;
  verifyProcedureOutput?: (context: ProcedureVerificationContext) => ProcedureVerificationResult | Promise<ProcedureVerificationResult>;
  authorizeProcedure?: (request: ProcedureAuthorizationRequest) => boolean | Promise<boolean>;
  now?: () => number;
}
export interface ProcedureRunResult {
  schema: 'inneranimalmedia.primetech.procedure-run.v1';
  id: string;
  version: string;
  status: 'completed';
  effect: ProcedureEffect;
  output: Record<string, unknown>;
  artifact: { ref: string; sha256: string | null; bytes: number } | null;
  verification: { kind: ProcedureVerificationKind; ok: true; evidence?: unknown };
  execution: {
    operation: string | null;
    runtime_kind: ProcedureRuntimeKind;
    execution_id: string | null;
    source_receipt_id: string | null;
    script_sha256: string | null;
    status: string;
    exit_code: number | null;
    duration_ms: number | null;
    script_bytes: number | null;
  };
  receipt: { id: string; written: boolean; [key: string]: unknown };
  duration_ms: number;
  warnings?: Array<{ code: string; message: string }>;
}
export type PrimeTechProcedureHandler = (input?: ProcedureInvocation) => Promise<ProcedureRunResult>;
export class PrimetechProcedureError extends Error {
  constructor(code: string, message?: string, details?: unknown);
  code: string;
  details?: unknown;
}
export const DEFAULT_CATALOG_ROOT: string;
export function validateProcedureManifest(manifest: unknown): ProcedureValidationResult;
export function createProcedureCatalog(options?: { root?: string }): ProcedureCatalog;
export function summarizeProcedureRuns(options: { receiptDir: string; procedureId?: string | null; limit?: number }): ProcedurePerformanceSummary;
export function createPrimeTechProcedureHandler(options?: PrimeTechProcedureHandlerOptions): PrimeTechProcedureHandler;

export * from './creative/index.js';
export * from './production-board.js';
export * from './skills.js';
