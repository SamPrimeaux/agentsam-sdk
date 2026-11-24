export const VAULT_ROW_STATUS: Readonly<Record<
  "canonical_verified" | "legacy_verified" | "provenance_unknown" | "key_unavailable" | "decrypt_failed" | "metadata_invalid",
  string
>>;
export interface VaultRowClassification {
  status: string;
  format: string;
  opens_as: string[];
  expired: boolean;
}
export function classifyVaultRow(
  env: { VAULT_MASTER_KEY?: unknown; VAULT_KEY?: unknown },
  row: { secret_value_encrypted: string; metadata_json?: unknown; expires_at?: number | null },
  aad: string,
  nowSec?: number,
): Promise<VaultRowClassification>;
export function summarizeVaultReport(items: Array<{ status: string; expired?: boolean }>): {
  inspected: number;
  authenticated: number;
  expired: number;
  by_status: Record<string, number>;
};
