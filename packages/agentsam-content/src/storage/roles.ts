/**
 * Storage roles — runtime-neutral.
 *
 * Portable code asks for a logical role ("website_assets"), never a binding
 * name. Each project maps roles to whatever physical storage it already has.
 */

export type StorageRole = "website_assets" | "archive" | "generated_assets" | (string & {});

export type StorageProviderKind = "r2" | "local" | "s3";

export type StorageCapabilityName = "list" | "read" | "write" | "delete" | "deliver";

export interface StorageCandidate {
  provider: StorageProviderKind;
  /** Worker binding name, when the store is bound into a Worker. */
  binding?: string;
  bucket?: string;
  /** Local filesystem root, for provider "local". */
  path?: string;
  accountId?: string;
  publicBaseUrl?: string;
  capabilities: StorageCapabilityName[];
  /** 0..n, higher is a better guess. Deterministic; see scoreStorageCandidate. */
  confidence: number;
  /** Where this candidate was found (e.g. "wrangler.jsonc"). */
  source?: string;
}

/** A persisted mapping: what the project chose for a role. */
export interface StorageRoleBinding {
  provider: StorageProviderKind;
  binding?: string;
  bucket?: string;
  path?: string;
  accountId?: string;
  publicBaseUrl?: string;
}

export type StorageRoleMap = Partial<Record<StorageRole, StorageRoleBinding>>;

export interface ScoreHints {
  /** Role the caller is trying to fill. */
  role?: StorageRole;
  /** Binding names the app is already known to use for a role. */
  knownBindings?: string[];
  /** Number of current content records pointing at this store. */
  recordCount?: number;
}

const ROLE_NAME_HINTS: Record<string, RegExp> = {
  website_assets: /(website|site)?[-_ ]?(assets|media|content)/i,
  archive: /archive|backup|cold/i,
  generated_assets: /generated|studio|output/i,
};

/** Simple, explainable scoring. No magic; callers still confirm with the user. */
export function scoreStorageCandidate(
  c: Omit<StorageCandidate, "confidence">,
  hints: ScoreHints = {},
): number {
  let score = 0;
  const role = hints.role ?? "website_assets";
  if (role === "website_assets" && c.binding === "WEBSITE_ASSETS") score += 100;
  if (c.binding && hints.knownBindings?.includes(c.binding)) score += 90;
  if ((hints.recordCount ?? 0) > 0) score += 70;
  if (c.publicBaseUrl) score += 50;
  const label = `${c.binding ?? ""} ${c.bucket ?? ""}`;
  if (ROLE_NAME_HINTS[role]?.test(label)) score += 30;
  return score;
}

export function rankStorageCandidates(
  candidates: Array<Omit<StorageCandidate, "confidence"> & { confidence?: number }>,
  hints: ScoreHints = {},
): StorageCandidate[] {
  return candidates
    .map((c) => ({ ...c, confidence: scoreStorageCandidate(c, hints) }) as StorageCandidate)
    .sort((a, b) => b.confidence - a.confidence);
}

export function resolveStorageRole(
  roles: StorageRoleMap | undefined,
  role: StorageRole,
): StorageRoleBinding | undefined {
  return roles?.[role];
}

/** Throws a message the CLI/TUI can act on instead of failing deep in a provider. */
export function requireStorageRole(
  roles: StorageRoleMap | undefined,
  role: StorageRole,
): StorageRoleBinding {
  const found = resolveStorageRole(roles, role);
  if (!found) {
    throw new Error(
      `No storage mapped for role "${role}". Run \`agentsam doctor\` to discover and map existing storage.`,
    );
  }
  return found;
}
