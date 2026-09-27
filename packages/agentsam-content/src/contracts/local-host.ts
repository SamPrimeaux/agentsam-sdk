/**
 * Local is a first-class content runtime — not a cloud fallback.
 *
 * Browser/React packages MUST NOT import Tauri, Node fs, or agentsamd.
 * Local Studio (or another desktop host) supplies LocalContentHost.
 * Content only sees opaque LocalFileRef / LocalDirectoryRef values.
 */

export type LocalRuntimeAvailability = "available" | "attachable" | "unavailable";

export interface LocalRuntimeStatus {
  availability: LocalRuntimeAvailability;
  /** Opaque machine/runtime id — never an absolute path as global id. */
  machineId?: string;
  label?: string;
  watchSupported?: boolean;
  processSupported?: boolean;
}

/** Opaque handle — host owns path mapping; never ship raw absolute paths to remote models by default. */
export type LocalFileRef = string & { readonly __localFile?: unique symbol };
export type LocalDirectoryRef = string & { readonly __localDir?: unique symbol };

export interface LocalContentEntry {
  ref: LocalFileRef | LocalDirectoryRef;
  name: string;
  kind: "file" | "directory";
  mime?: string;
  bytes?: number;
  mtime?: string;
  contentKind?: "image" | "video" | "model" | "audio" | "document" | "font" | "other";
}

export interface LocalContentStat {
  ref: LocalFileRef | LocalDirectoryRef;
  name: string;
  kind: "file" | "directory";
  mime?: string;
  bytes?: number;
  mtime?: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

export interface ContentReadHandle {
  ref: LocalFileRef;
  /** Stream or full buffer — host decides; callers must not assume all bytes in memory. */
  read(maxBytes?: number): Promise<Uint8Array>;
  close?(): Promise<void>;
}

export interface MaterializedContent {
  ref: LocalFileRef;
  pathHint?: string;
  mime?: string;
  bytes?: number;
}

export interface WatchSubscription {
  id: string;
  unsubscribe(): Promise<void>;
}

export interface LocalPickOptions {
  multiple?: boolean;
  accept?: string[];
}

export interface LocalContentHost {
  status(): Promise<LocalRuntimeStatus>;

  pickFiles?(options?: LocalPickOptions): Promise<LocalFileRef[]>;
  pickDirectory?(options?: { title?: string }): Promise<LocalDirectoryRef | null>;

  list(pathOrRef: LocalDirectoryRef | string): Promise<LocalContentEntry[]>;
  stat(ref: LocalFileRef | LocalDirectoryRef | string): Promise<LocalContentStat>;

  openRead(ref: LocalFileRef): Promise<ContentReadHandle>;
  materialize?(ref: LocalFileRef, options?: { maxBytes?: number }): Promise<MaterializedContent>;

  watch?(
    ref: LocalDirectoryRef | LocalFileRef,
    options?: { recursive?: boolean },
  ): Promise<WatchSubscription>;

  reveal?(ref: LocalFileRef | LocalDirectoryRef): Promise<void>;

  importToLibrary?(
    ref: LocalFileRef,
    options?: { accountId: string; brandId?: string },
  ): Promise<{ assetId: string }>;

  exportFromLibrary?(
    assetId: string,
    destination: LocalDirectoryRef | LocalFileRef,
  ): Promise<LocalFileRef>;
}

/** Hosted browser / no desktop bridge. */
export const unavailableLocalHost: LocalContentHost = {
  async status() {
    return { availability: "unavailable", label: "No local runtime connected" };
  },
  async list() {
    return [];
  },
  async stat() {
    throw new Error("local_runtime_unavailable");
  },
  async openRead() {
    throw new Error("local_runtime_unavailable");
  },
};
