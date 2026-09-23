import type { AgentAuthorityRequirement, AgentResolvedAuthorityReference } from './authority';
import type { AgentToolExecutionResult, AgentToolInvocation } from './execution';
import type { AgentToolDefinition } from './tools';

export interface AgentProviderDefinition {
  providerKey: string;
  displayName: string;
  description?: string;
  capabilityKeys?: string[];
  toolKeys?: string[];
  authority?: AgentAuthorityRequirement[];
  metadata?: Record<string, unknown>;
}

export interface AgentProviderExecutionContext {
  authority?: AgentResolvedAuthorityReference[];
  accountId?: string;
  deadlineAt?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Provider adapters implement provider-specific mechanics only.
 * Generic retries, receipts, hooks, queueing and event dispatch remain execution-plane concerns.
 */
export interface AgentProviderAdapter<TContext extends AgentProviderExecutionContext = AgentProviderExecutionContext> {
  readonly providerKey: string;
  listTools?(): AgentToolDefinition[] | Promise<AgentToolDefinition[]>;
  invoke<TInput = unknown, TOutput = unknown>(
    invocation: AgentToolInvocation<TInput>,
    context: TContext,
  ): Promise<AgentToolExecutionResult<TOutput>>;
}
