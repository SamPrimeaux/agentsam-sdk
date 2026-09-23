import type { AgentAuthorityRequirement } from './authority';

export interface AgentCapability {
  id: string;
  label?: string;
  description?: string;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export type AgentJsonSchema = Record<string, unknown>;

export type AgentToolSideEffectLevel =
  | 'none'
  | 'local_write'
  | 'external_write'
  | 'billable_external_write'
  | 'destructive_possible';

export type AgentToolRiskLevel = 'low' | 'moderate' | 'high' | 'critical';

export type AgentToolReceiptMode = 'full' | 'redacted' | 'metadata_only';

export type AgentToolIdempotencyMode =
  | 'not_applicable'
  | 'intrinsic'
  | 'supported'
  | 'required';

export type AgentToolHandlerType =
  | 'local'
  | 'http'
  | 'worker_rpc'
  | 'execos'
  | 'mcp'
  | 'custom';

export interface AgentToolHandlerReference {
  type: AgentToolHandlerType;
  ref: string;
  metadata?: Record<string, unknown>;
}

export interface AgentToolRetryPolicy {
  maxAttempts: number;
  backoff?: 'none' | 'fixed' | 'exponential';
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryableReasons?: string[];
}

export interface AgentToolDefinition {
  toolKey: string;
  displayName: string;
  description?: string;
  provider?: string;
  pluginId?: string;
  capabilityKey: string;
  handler?: AgentToolHandlerReference;
  inputSchema: AgentJsonSchema;
  outputSchema: AgentJsonSchema;
  authority?: AgentAuthorityRequirement[];
  riskLevel: AgentToolRiskLevel;
  sideEffectLevel: AgentToolSideEffectLevel;
  idempotencyMode: AgentToolIdempotencyMode;
  timeoutMs?: number;
  retryPolicy?: AgentToolRetryPolicy;
  receiptMode?: AgentToolReceiptMode;
  sensitiveInputPaths?: string[];
  sensitiveOutputPaths?: string[];
  emitsEvents?: string[];
  active?: boolean;
  metadata?: Record<string, unknown>;
}

export type AgentToolCallStatus =
  | 'queued'
  | 'running'
  | 'retrying'
  | 'awaiting_input'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export interface AgentToolCall {
  id: string;
  runId?: string;
  name: string;
  toolKey?: string;
  status: AgentToolCallStatus;
  startedAt?: number;
  completedAt?: number;
  input?: unknown;
  output?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}
