export const AGENT_AUTHORITY_TYPES = [
  'none',
  'host',
  'binding',
  'secret',
  'oauth',
  'connection',
] as const;
export type AgentAuthorityType = typeof AGENT_AUTHORITY_TYPES[number];

export interface AgentAuthorityRequirement {
  type: AgentAuthorityType;
  ref?: string;
  provider?: string;
  scopes?: string[];
  optional?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Opaque, non-secret reference to authority resolved by the host runtime.
 * Raw credentials/tokens must not be serialized into portable AgentSam contracts.
 */
export interface AgentResolvedAuthorityReference {
  type: Exclude<AgentAuthorityType, 'none'>;
  ref: string;
  provider?: string;
  accountRef?: string;
  scopes?: string[];
  metadata?: Record<string, unknown>;
}
