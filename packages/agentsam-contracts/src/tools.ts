import { AGENT_AUTHORITY_TYPES } from './authority';
import type { AgentAuthorityRequirement } from './authority';
import { assertAgentJsonSchema } from './json-schema';
import type { AgentJsonSchema } from './json-schema';

export const AGENT_TOOL_SIDE_EFFECT_LEVELS = [
  'none',
  'local_write',
  'external_write',
  'billable_external_write',
  'destructive_possible',
] as const;
export const AGENT_TOOL_RISK_LEVELS = ['low', 'moderate', 'high', 'critical'] as const;
export const AGENT_TOOL_RECEIPT_MODES = ['full', 'redacted', 'metadata_only'] as const;
export const AGENT_TOOL_IDEMPOTENCY_MODES = [
  'not_applicable',
  'intrinsic',
  'supported',
  'required',
] as const;
export const AGENT_TOOL_HANDLER_TYPES = [
  'local',
  'http',
  'worker_rpc',
  'execos',
  'mcp',
  'custom',
] as const;

export interface AgentCapability {
  id: string;
  label?: string;
  description?: string;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export type AgentToolSideEffectLevel = typeof AGENT_TOOL_SIDE_EFFECT_LEVELS[number];
export type AgentToolRiskLevel = typeof AGENT_TOOL_RISK_LEVELS[number];
export type AgentToolReceiptMode = typeof AGENT_TOOL_RECEIPT_MODES[number];
export type AgentToolIdempotencyMode = typeof AGENT_TOOL_IDEMPOTENCY_MODES[number];
export type AgentToolHandlerType = typeof AGENT_TOOL_HANDLER_TYPES[number];

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const stringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');
function assertEnum(value: unknown, allowed: readonly string[], field: string, toolKey: string): void {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new TypeError(`tool ${toolKey} has invalid ${field}`);
  }
}
function assertOnlyFields(value: Record<string, unknown>, allowed: readonly string[], field: string, toolKey: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new TypeError(`tool ${toolKey} has unknown ${field} field: ${key}`);
  }
}
function assertAuthorityRequirement(value: unknown, toolKey: string): void {
  if (!isRecord(value)) throw new TypeError(`tool ${toolKey} has invalid authority requirement`);
  assertOnlyFields(value,['type','ref','provider','scopes','optional','metadata'],'authority',toolKey);
  assertEnum(value.type,AGENT_AUTHORITY_TYPES,'authority type',toolKey);
  for (const field of ['ref','provider']) {
    if (value[field] !== undefined && typeof value[field] !== 'string') {
      throw new TypeError(`tool ${toolKey} authority ${field} must be a string`);
    }
  }
  if (value.scopes !== undefined && !stringArray(value.scopes)) {
    throw new TypeError(`tool ${toolKey} authority scopes must be a string array`);
  }
  if (value.optional !== undefined && typeof value.optional !== 'boolean') {
    throw new TypeError(`tool ${toolKey} authority optional must be boolean`);
  }
  if (value.metadata !== undefined && !isRecord(value.metadata)) {
    throw new TypeError(`tool ${toolKey} authority metadata must be an object`);
  }
}

/** Runtime guard for the same portable definition exported as AgentToolDefinition. */
export function assertAgentToolDefinition(value: unknown): asserts value is AgentToolDefinition {
  if (!isRecord(value)) throw new TypeError('tool definition must be an object');
  const toolKey = nonEmptyString(value.toolKey) ? value.toolKey : '(unknown)';
  const allowedFields = [
    'toolKey','displayName','description','provider','pluginId','capabilityKey','handler',
    'inputSchema','outputSchema','authority','riskLevel','sideEffectLevel','idempotencyMode',
    'timeoutMs','retryPolicy','receiptMode','sensitiveInputPaths','sensitiveOutputPaths',
    'emitsEvents','active','metadata',
  ];
  assertOnlyFields(value,allowedFields,'definition',toolKey);
  for (const field of ['toolKey','displayName','capabilityKey']) {
    if (!nonEmptyString(value[field])) throw new TypeError(`tool definition requires ${field}`);
  }
  for (const field of ['description','provider','pluginId']) {
    if (value[field] !== undefined && typeof value[field] !== 'string') {
      throw new TypeError(`tool ${toolKey} ${field} must be a string`);
    }
  }
  for (const field of ['inputSchema','outputSchema']) {
    if (!isRecord(value[field])) throw new TypeError(`tool ${toolKey} requires object ${field}`);
    assertAgentJsonSchema(value[field], `tool ${toolKey} ${field}`);
  }
  assertEnum(value.riskLevel,AGENT_TOOL_RISK_LEVELS,'riskLevel',toolKey);
  assertEnum(value.sideEffectLevel,AGENT_TOOL_SIDE_EFFECT_LEVELS,'sideEffectLevel',toolKey);
  assertEnum(value.idempotencyMode,AGENT_TOOL_IDEMPOTENCY_MODES,'idempotencyMode',toolKey);

  if (value.handler !== undefined) {
    if (!isRecord(value.handler)) throw new TypeError(`tool ${toolKey} has invalid handler reference`);
    assertOnlyFields(value.handler,['type','ref','metadata'],'handler',toolKey);
    assertEnum(value.handler.type,AGENT_TOOL_HANDLER_TYPES,'handler type',toolKey);
    if (!nonEmptyString(value.handler.ref)) throw new TypeError(`tool ${toolKey} has invalid handler reference`);
    if (value.handler.metadata !== undefined && !isRecord(value.handler.metadata)) {
      throw new TypeError(`tool ${toolKey} handler metadata must be an object`);
    }
  }
  if (value.authority !== undefined) {
    if (!Array.isArray(value.authority)) throw new TypeError(`tool ${toolKey} authority must be an array`);
    value.authority.forEach(requirement=>assertAuthorityRequirement(requirement,toolKey));
  }
  if (value.timeoutMs !== undefined &&
      (!Number.isInteger(value.timeoutMs) || (value.timeoutMs as number) < 1)) {
    throw new TypeError(`tool ${toolKey} timeoutMs must be a positive integer`);
  }
  if (value.retryPolicy !== undefined) {
    if (!isRecord(value.retryPolicy)) throw new TypeError(`tool ${toolKey} has invalid retryPolicy`);
    assertOnlyFields(value.retryPolicy,['maxAttempts','backoff','baseDelayMs','maxDelayMs','retryableReasons'],'retryPolicy',toolKey);
    if (!Number.isInteger(value.retryPolicy.maxAttempts) || (value.retryPolicy.maxAttempts as number) < 1) {
      throw new TypeError(`tool ${toolKey} has invalid retryPolicy`);
    }
    if (value.retryPolicy.backoff !== undefined &&
        !['none','fixed','exponential'].includes(String(value.retryPolicy.backoff))) {
      throw new TypeError(`tool ${toolKey} retryPolicy backoff is invalid`);
    }
    for (const field of ['baseDelayMs','maxDelayMs']) {
      if (value.retryPolicy[field] !== undefined &&
          (!Number.isInteger(value.retryPolicy[field]) || (value.retryPolicy[field] as number) < 0)) {
        throw new TypeError(`tool ${toolKey} retryPolicy ${field} is invalid`);
      }
    }
    if (value.retryPolicy.retryableReasons !== undefined && !stringArray(value.retryPolicy.retryableReasons)) {
      throw new TypeError(`tool ${toolKey} retryPolicy retryableReasons must be a string array`);
    }
  }
  if (value.receiptMode !== undefined) {
    assertEnum(value.receiptMode,AGENT_TOOL_RECEIPT_MODES,'receiptMode',toolKey);
  }
  for (const field of ['sensitiveInputPaths','sensitiveOutputPaths','emitsEvents']) {
    if (value[field] !== undefined && !stringArray(value[field])) {
      throw new TypeError(`tool ${toolKey} ${field} must be a string array`);
    }
  }
  if (value.active !== undefined && typeof value.active !== 'boolean') {
    throw new TypeError(`tool ${toolKey} active must be boolean`);
  }
  if (value.metadata !== undefined && !isRecord(value.metadata)) {
    throw new TypeError(`tool ${toolKey} metadata must be an object`);
  }
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

export type AgentToolPermissionDecision = 'allow_once' | 'allow_session' | 'deny';

export interface AgentToolPermissionDatum {
  label: string;
  value: string;
}

export interface AgentToolPermissionRequest {
  id: string;
  toolKey: string;
  displayName: string;
  provider?: string;
  summary?: string;
  scope?: string;
  sharedData?: AgentToolPermissionDatum[];
  riskLevel?: AgentToolRiskLevel;
  sideEffectLevel?: AgentToolSideEffectLevel;
  destructive?: boolean;
  openWorld?: boolean;
  metadata?: Record<string, unknown>;
}
