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
  sizeBytes?: number;
  tableCount?: number;
};

export type CreateLocalDatabaseOptions = {
  name: string;
  directoryRef?: string;
  preset?: "empty" | "agentsam" | "cms" | "custom";
};

export type LocalDatabaseHost = {
  status(): Promise<LocalRuntimeStatus>;
  list(): Promise<LocalDatabaseRef[]>;
  pick(): Promise<LocalDatabaseRef | null>;
  open(ref: LocalDatabaseRef): Promise<{ sourceId: string }>;
  create(options: CreateLocalDatabaseOptions): Promise<{ sourceId: string; ref: LocalDatabaseRef }>;
  pickDirectory?(): Promise<string | null>;
  detach(ref: LocalDatabaseRef): Promise<void>;
  rename?(ref: LocalDatabaseRef, name: string): Promise<LocalDatabaseRef>;
  delete?(ref: LocalDatabaseRef, options: { deleteFile: boolean }): Promise<void>;
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
    async pick() {
      return null;
    },
    async create() {
      throw new Error(message);
    },
    async detach() {
      throw new Error(message);
    },
  };
}
