/**
 * Portable AgentSam credential / vault contracts (types).
 * Secrets never live on CredentialRecord — only credential_ref.
 */

export type CredentialOwnerType = "user" | "account" | "app";
export type CredentialKind =
  | "provider_api_key"
  | "oauth_connection"
  | "agentsam_api_key"
  | "app_secret";
export type CredentialStatus = "active" | "expired" | "revoked" | "invalid";

export interface CredentialRecord {
  id: string;
  owner_type: CredentialOwnerType;
  owner_id: string;
  kind: CredentialKind;
  provider?: string;
  label: string;
  credential_ref: string;
  status: CredentialStatus;
  capabilities?: string[];
  granted_scopes?: string[];
  expires_at?: string | null;
  validated_at?: string | null;
  last_used_at?: string | null;
  rotated_at?: string | null;
  last4?: string;
  created_at: string;
  updated_at: string;
}

export interface CredentialProviderField {
  id: string;
  type: "secret" | "text" | "url";
  required?: boolean;
  label?: string;
}

export interface CredentialProviderDefinition {
  id: string;
  label: string;
  credential: { kind: CredentialKind; sensitive?: boolean };
  fields: CredentialProviderField[];
  capabilities?: string[];
  operations?: { test?: boolean; rotate?: boolean; revoke?: boolean };
}

export declare const CREDENTIAL_KINDS: Readonly<{
  PROVIDER_API_KEY: "provider_api_key";
  OAUTH_CONNECTION: "oauth_connection";
  AGENTSAM_API_KEY: "agentsam_api_key";
  APP_SECRET: "app_secret";
}>;

export declare const CREDENTIAL_STATUSES: Readonly<{
  ACTIVE: "active";
  EXPIRED: "expired";
  REVOKED: "revoked";
  INVALID: "invalid";
}>;

export declare const CREDENTIAL_AUTHORITY: Readonly<{
  vaultMasterKey: "VAULT_MASTER_KEY";
  agentsamApiKey: "AGENTSAM_API_KEY";
  agentsamApiKeyPrefix: "aak_";
  agentsamApiKeyStore: "agentsam_api_credentials";
  bridgeKey: "AGENTSAM_BRIDGE_KEY";
}>;

export function normalizeCredentialRecord(
  input: Partial<CredentialRecord> & Record<string, unknown>,
): CredentialRecord;

export function defineCredentialProvider(
  def: CredentialProviderDefinition,
): CredentialProviderDefinition;
