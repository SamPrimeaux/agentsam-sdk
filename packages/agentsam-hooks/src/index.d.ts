export type HookEvent =
  | 'session_start' | 'session_end'
  | 'user_prompt_submitted' | 'user_prompt_transformed'
  | 'pre_model_use' | 'post_model_use'
  | 'pre_tool_use' | 'post_tool_use' | 'post_tool_use_failure'
  | 'error_occurred' | 'agent_stop' | 'subagent_start' | 'subagent_stop';
export type PermissionDecision = 'allow' | 'deny' | 'ask';
export type ErrorHandlingDecision = 'retry' | 'skip' | 'abort';
export type HookFailureMode = 'open' | 'closed' | 'error';

export interface HookInvocation {
  session_id?: string;
  run_id?: string;
  turn_id?: string;
  message_id?: string;
  agent_id?: string;
  parent_agent_id?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface HookEnvelope<TInput extends Record<string, unknown> = Record<string, unknown>> {
  schema: 'agentsam.hook.v1';
  hook: HookEvent;
  timestamp: number;
  cwd: string;
  invocation: HookInvocation;
  input: Readonly<TInput>;
}

export interface HookOutput {
  permission_decision?: PermissionDecision;
  permission_decision_reason?: string;
  modified_args?: Record<string, unknown>;
  modified_request?: Record<string, unknown>;
  modified_result?: unknown;
  modified_prompt?: string;
  modified_transformed_prompt?: string;
  modified_config?: Record<string, unknown>;
  additional_context?: string;
  suppress_output?: boolean;
  error_handling?: ErrorHandlingDecision;
  retry_count?: number;
  user_notification?: string;
  decision?: 'allow' | 'block';
  reason?: string;
  cleanup_actions?: string[];
  session_summary?: string;
  metadata?: Record<string, unknown>;
}

export type HookHandler = (envelope: HookEnvelope) => HookOutput | null | undefined | Promise<HookOutput | null | undefined>;
export interface HookDefinition {
  id?: string;
  handler: HookHandler;
  matches?: (envelope: HookEnvelope) => boolean | Promise<boolean>;
  priority?: number;
  timeout_ms?: number;
  failure_mode?: HookFailureMode;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}
export interface HookReceipt {
  schema: 'agentsam.hook.receipt.v1';
  hook_id: string;
  hook: HookEvent;
  invocation?: Readonly<HookInvocation>;
  status: 'completed' | 'failed';
  started_at: number;
  completed_at: number;
  duration_ms: number;
  input_keys: readonly string[];
  output_keys: readonly string[];
  error?: { code: string; message: string };
}
export interface HookDispatchResult {
  schema: 'agentsam.hook.dispatch.v1';
  hook: HookEvent;
  input: Readonly<Record<string, unknown>>;
  output: Readonly<HookOutput>;
  receipts: readonly HookReceipt[];
  errors: readonly { hook_id: string; hook: HookEvent; code: string; message: string }[];
}
export interface HookRuntime {
  register(event: HookEvent | string, definition: HookDefinition | HookHandler): this;
  unregister(event: HookEvent | string, id: string): boolean;
  list(event?: HookEvent | string): readonly Omit<HookDefinition, 'handler' | 'matches'>[];
  dispatch(event: HookEvent | string, input?: Record<string, unknown>, invocation?: HookInvocation, options?: { cwd?: string }): Promise<HookDispatchResult>;
}

export const HOOK_PROTOCOL_SCHEMA: 'agentsam.hook.v1';
export const HOOK_CONFIG_SCHEMA: 'agentsam.hooks.config.v1';
export const HOOK_RECEIPT_SCHEMA: 'agentsam.hook.receipt.v1';
export const HOOK_EVENTS: readonly HookEvent[];
export const PERMISSION_DECISIONS: readonly PermissionDecision[];
export const ERROR_HANDLING_DECISIONS: readonly ErrorHandlingDecision[];
export const STOP_DECISIONS: readonly ('allow' | 'block')[];
export const HOOK_FAILURE_MODES: readonly HookFailureMode[];
export function normalizeHookEvent(value: string): HookEvent;
export function normalizeHookFailureMode(value: string | undefined, hook: HookEvent): HookFailureMode;
export function createHookInvocation(value?: HookInvocation): Readonly<HookInvocation>;
export function createHookEnvelope(event: string, input?: Record<string, unknown>, invocation?: HookInvocation, options?: { timestamp?: number; cwd?: string }): HookEnvelope;
export function normalizeHookOutput(event: string, value: HookOutput | null | undefined): Readonly<HookOutput>;
export function normalizeHookDefinition(event: string, value: HookDefinition | HookHandler, index?: number): Readonly<HookDefinition & { id: string; hook: HookEvent; timeout_ms: number; failure_mode: HookFailureMode }>;
export function createHookRuntime(options?: { hooks?: Record<string, HookDefinition | HookHandler | (HookDefinition | HookHandler)[]>; clock?: () => number; onReceipt?: (receipt: HookReceipt) => unknown }): HookRuntime;
export class AgentSamHooks implements HookRuntime {
  constructor(options?: { hooks?: Record<string, HookDefinition | HookHandler | (HookDefinition | HookHandler)[]>; clock?: () => number; onReceipt?: (receipt: HookReceipt) => unknown });
  register(event: HookEvent | string, definition: HookDefinition | HookHandler): this;
  unregister(event: HookEvent | string, id: string): boolean;
  list(event?: HookEvent | string): readonly Omit<HookDefinition, 'handler' | 'matches'>[];
  dispatch(event: HookEvent | string, input?: Record<string, unknown>, invocation?: HookInvocation, options?: { cwd?: string }): Promise<HookDispatchResult>;
}
export function ensureHookRuntime(value?: HookRuntime | Record<string, unknown>, options?: Record<string, unknown>): HookRuntime;
export function isHookRuntime(value: unknown): value is HookRuntime;
export class HookExecutionError extends Error { code: string; hook: HookEvent; hook_id: string; }
export class HookPermissionError extends Error { code: string; kind: string; target: string; decision: string; }

export function createCallbackHookAdapter(handler: (input: Record<string, unknown>, invocation: HookInvocation, envelope: HookEnvelope) => unknown): HookHandler;
export function createCommandHookAdapter(options: { command: string; args?: string[]; cwd?: string; env?: Record<string, string>; inherit_environment?: boolean; timeout_ms?: number; max_output_bytes?: number }): HookHandler;
export function createHttpHookAdapter(options: { url: string; headers?: Record<string, string>; timeout_ms?: number; max_response_bytes?: number; fetchImpl?: typeof fetch }): HookHandler;
export function findHookConfig(startDirectory?: string, options?: Record<string, unknown>): string | null;
export function loadHookConfig(filename?: string, options?: Record<string, unknown>): Record<string, unknown>;
export function normalizeHookConfig(value: Record<string, unknown>, options?: Record<string, unknown>): Record<string, unknown>;
export function createConfiguredHookAdapter(definition: Record<string, unknown>, configDirectory: string, options?: Record<string, unknown>): HookHandler;
export function createHookRuntimeFromConfig(configOrFilename?: string | Record<string, unknown>, options?: Record<string, unknown>): { runtime: HookRuntime; config: Record<string, unknown> };

export interface StoredHook {
  id: string;
  owner_id: string;
  hook_key: string;
  event_type: HookEvent;
  source_kind: 'stored' | 'config' | 'code' | 'system';
  scope_type: 'global' | 'account' | 'repository' | 'project' | 'session';
  scope_ref: string | null;
  handler_type: string;
  handler_config: Record<string, unknown>;
  match: Record<string, unknown>;
  failure_mode: HookFailureMode;
  priority: number;
  timeout_ms: number;
  is_active: boolean;
  workflow_id: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  revision: number;
}
export interface HookStore {
  readonly ownerId: string;
  listHooks(query?: Record<string, unknown>): Promise<readonly StoredHook[]>;
  getHook(id: string): Promise<StoredHook | null>;
  upsertHook(value: Record<string, unknown>): Promise<StoredHook>;
  setHookActive(id: string, active: boolean): Promise<boolean>;
  removeHook(id: string): Promise<boolean>;
  recordExecution(receipt: HookReceipt, correlation?: Record<string, unknown>): Promise<string>;
  listExecutions(query?: Record<string, unknown>): Promise<readonly Record<string, unknown>[]>;
}
export function createHookStore(db: { prepare(sql: string): unknown }, options?: { ownerId?: string }): HookStore;
export function matchesHookInput(match?: Record<string, unknown>, input?: Record<string, unknown>): boolean;
export function registerStoredHooks(runtime: HookRuntime, store: HookStore, options?: Record<string, unknown>): Promise<readonly StoredHook[]>;

export interface CapabilityAdapter {
  toolDescriptors(options?: Record<string, unknown>): Array<{ name: string; description?: string; input_schema?: Record<string, unknown>; [key: string]: unknown }>;
  canInvoke?(id: string): boolean;
  invoke(id: string, input?: Record<string, unknown>, context?: Record<string, unknown>): Promise<unknown>;
}
export interface ProviderAdapter {
  provider?: string;
  create(params?: Record<string, unknown>): Promise<Record<string, unknown>>;
  continueWithToolOutputs(params?: Record<string, unknown>): Promise<Record<string, unknown>>;
  compact?(params?: Record<string, unknown>): Promise<Record<string, unknown>>;
}
export function createHookedCapabilityAdapter(base: CapabilityAdapter, options?: Record<string, unknown>): CapabilityAdapter;
export function createHookedProviderAdapter(base: ProviderAdapter, options?: Record<string, unknown>): ProviderAdapter;
export function createCompositeCapabilityAdapter(adapters: CapabilityAdapter[]): CapabilityAdapter;
export function createMcpCapabilityAdapter(options: Record<string, unknown>): Promise<CapabilityAdapter>;
export function createLspCapabilityAdapter(options: Record<string, unknown>): CapabilityAdapter;
export function createAgentCapabilityAdapter(options: Record<string, unknown>): CapabilityAdapter;
