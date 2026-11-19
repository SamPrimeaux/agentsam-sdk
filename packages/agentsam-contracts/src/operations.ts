import type { AgentAuthorityRequirement } from './authority';
import type { AgentJsonSchema, AgentToolIdempotencyMode } from './tools';
import { AGENT_TOOL_IDEMPOTENCY_MODES } from './tools';

export const AGENT_OPERATION_LANES = ['local', 'remote', 'sandbox', 'platform', 'mcp'] as const;
export const AGENT_OPERATION_MODEL_POLICIES = ['never', 'optional', 'required'] as const;
export const AGENT_OPERATION_NETWORK_POLICIES = ['none', 'optional', 'required'] as const;
export const AGENT_OPERATION_SIDE_EFFECTS = [
  'none', 'local_write', 'remote_read', 'remote_write', 'deploy', 'billable', 'oauth',
] as const;
export const AGENT_OPERATION_RISKS = ['read_only', 'write', 'privileged'] as const;
export const AGENT_OPERATION_SPEND_POLICIES = ['never', 'optional', 'required'] as const;
export const AGENT_OPERATION_STATUSES = [
  'stable', 'experimental', 'stub', 'deprecated', 'compatibility',
] as const;
export const AGENT_OPERATION_IDEMPOTENCY_MODES = AGENT_TOOL_IDEMPOTENCY_MODES;

export type AgentOperationLane = typeof AGENT_OPERATION_LANES[number];
export type AgentOperationModelPolicy = typeof AGENT_OPERATION_MODEL_POLICIES[number];
export type AgentOperationNetworkPolicy = typeof AGENT_OPERATION_NETWORK_POLICIES[number];
export type AgentOperationSideEffects = typeof AGENT_OPERATION_SIDE_EFFECTS[number];
export type AgentOperationRisk = typeof AGENT_OPERATION_RISKS[number];
export type AgentOperationSpendPolicy = typeof AGENT_OPERATION_SPEND_POLICIES[number];
export type AgentOperationStatus = typeof AGENT_OPERATION_STATUSES[number];

export interface AgentOperationExecution {
  lanes: AgentOperationLane[];
  model: AgentOperationModelPolicy;
  network: AgentOperationNetworkPolicy;
  sideEffects: AgentOperationSideEffects;
  embedding?: AgentOperationSpendPolicy;
  provider_spend?: AgentOperationSpendPolicy;
}

export interface AgentOperationAuth {
  account?: boolean;
  provider?: string[];
}

export interface AgentCapabilityReference {
  id: string;
  provider?: string;
  oauth_scopes?: string[];
  feature_packs?: string[];
}

export interface AgentMcpProjection {
  server_name?: string;
  server_url?: string;
  tool_name?: string;
  required_scopes?: string[];
  feature_packs?: string[];
  protocol?: 'streamable_http' | 'sse' | 'stdio';
}

export interface AgentOperationPreview {
  available?: boolean;
  operation?: string;
}

export interface AgentOperationCli {
  command?: string[][];
}

export interface AgentOperationDocs {
  section?: string;
  examples?: string[];
}

/**
 * Portable, serializable operation metadata. It deliberately contains no handler,
 * account identity, provider secret, workspace root, or product persistence state.
 * The host runtime binds this contract to an executable handler.
 */
export interface AgentOperationContract {
  id: string;
  version: number;
  module: string;
  action: string;
  summary: string;
  purpose?: string;
  outcome?: string;
  description?: string;
  execution: AgentOperationExecution;
  auth?: AgentOperationAuth;
  authority?: AgentAuthorityRequirement[];
  capability_refs?: AgentCapabilityReference[];
  mcp?: AgentMcpProjection;
  risk: AgentOperationRisk;
  input_schema?: string | AgentJsonSchema;
  output_schema?: string | AgentJsonSchema;
  capabilities?: string[];
  accepts?: string[];
  phases?: string[];
  artifacts?: string[];
  skill?: { id?: string; help?: boolean } | string | null;
  preview?: AgentOperationPreview;
  cli?: AgentOperationCli;
  docs?: AgentOperationDocs;
  pipeline?: string;
  idempotencyMode?: AgentToolIdempotencyMode;
  status?: AgentOperationStatus;
}

export interface AgentOperationDefinition<
  TInput = unknown,
  TOutput = unknown,
  TContext = unknown,
> extends AgentOperationContract {
  handler: (input: TInput, context: TContext) => TOutput | Promise<TOutput>;
}

export interface AgentOperationReceipt {
  id: string;
  operation: string;
  module?: string;
  started_at: string;
  completed_at: string;
  execution: {
    lane: AgentOperationLane;
    deterministic: boolean;
    model_used: boolean;
  };
  side_effects?: string[];
  input_hash?: string | null;
  output_hash?: string | null;
  status: 'completed' | 'failed' | 'cancelled';
  mcp?: AgentMcpProjection;
}

export interface AgentOperationResult<TData = unknown> {
  schema: 'agentsam.result.v1';
  operation: string;
  operation_version?: number;
  ok: boolean;
  data: TData;
  receipt: AgentOperationReceipt;
  evidence?: unknown[];
  artifacts?: unknown[];
  usage?: {
    provider_calls: number;
    model_calls?: number;
    embedding_calls?: number;
    cost_usd?: number;
  };
  help?: { skill?: string | null };
  warnings?: unknown[];
  diagnostics?: unknown[];
  error?: unknown;
}
