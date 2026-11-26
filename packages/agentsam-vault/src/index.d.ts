/**
 * Package entry types for `@inneranimalmedia/agentsam-vault`.
 * Re-exports crypto + contracts used by Local Studio / Worker consumers.
 */

export * from "./crypto/aes-gcm.js";
export * from "./contracts/credential.js";

export * from "./crypto/oauth-envelope.js";


export interface ResolvedAccountCredential {
  source: "vault";
  value: string;
  last4: string;
  ref: string;
  provider: string;
  accountId: string;
}

export function resolveAccountCredential(input: {
  env: Record<string, unknown>;
  db?: { prepare(sql: string): { bind(...values: unknown[]): { first(): Promise<unknown>; run(): Promise<unknown> } } };
  accountId: string;
  provider: string;
  kind?: string;
  secretName?: string | null;
  actor?: string;
}): Promise<ResolvedAccountCredential | null>;
