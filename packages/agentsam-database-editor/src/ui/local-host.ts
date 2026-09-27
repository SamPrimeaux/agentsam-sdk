/**
 * Host capability boundary for machine-local SQLite.
 * The package never imports Tauri or agentsamd — Local Studio implements this.
 */

export type LocalRuntimeStatus = "available" | "attachable" | "unavailable";

export type LocalDatabaseRef = {
  id: string;
  label: string;
  /** Opaque to the browser — host maps this to a real path. */
  ref: string;
  pathHint?: string;
  kind: "agentsam" | "file" | "recent" | "created";
  writable?: boolean;
};

export type LocalDatabaseHost = {
  status(): Promise<LocalRuntimeStatus>;
  list(): Promise<LocalDatabaseRef[]>;
  pick?(): Promise<LocalDatabaseRef | null>;
  open(ref: LocalDatabaseRef): Promise<{ sourceId: string }>;
  create?(options?: { label?: string }): Promise<{ sourceId: string }>;
};

export type ProviderCapability = "available" | "attachable" | "unavailable";

export type ProviderFamily = "cloudflare" | "supabase" | "local";

export function createUnavailableLocalHost(message = "Local runtime not attached"): LocalDatabaseHost {
  return {
    async status() {
      return "unavailable";
    },
    async list() {
      return [];
    },
    async open() {
      throw new Error(message);
    },
  };
}
