export type AgentAuthorityType =
  | 'none'
  | 'host'
  | 'binding'
  | 'secret'
  | 'oauth'
  | 'connection';

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
