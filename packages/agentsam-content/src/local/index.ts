/**
 * Host-side LocalContentHost stubs.
 *
 * Browser/React packages must not import Tauri / Node fs / agentsamd.
 * Local Studio (or another desktop host) supplies a real LocalContentHost
 * that adapts those bridges behind this contract.
 */

import type {
  ContentReadHandle,
  LocalContentEntry,
  LocalContentHost,
  LocalContentStat,
  LocalDirectoryRef,
  LocalFileRef,
  LocalPickOptions,
  LocalRuntimeStatus,
  MaterializedContent,
  WatchSubscription,
} from "../contracts/local-host.js";

export interface MemoryLocalFile {
  ref: LocalFileRef;
  name: string;
  mime?: string;
  bytes: Uint8Array;
  mtime?: string;
  contentKind?: LocalContentEntry["contentKind"];
}

/**
 * In-memory LocalContentHost for tests and browser demos.
 * availability: "available" with ephemeral machine id.
 */
export function createMemoryLocalHost(opts?: {
  machineId?: string;
  label?: string;
  files?: MemoryLocalFile[];
}): LocalContentHost {
  const files = new Map<string, MemoryLocalFile>();
  for (const f of opts?.files ?? []) files.set(f.ref, f);
  const machineId = opts?.machineId ?? `mem_${Math.random().toString(36).slice(2, 10)}`;

  return {
    async status(): Promise<LocalRuntimeStatus> {
      return {
        availability: "available",
        machineId,
        label: opts?.label ?? "Memory local host",
        watchSupported: false,
        processSupported: false,
      };
    },

    async pickFiles(options?: LocalPickOptions): Promise<LocalFileRef[]> {
      const all = [...files.values()];
      const accept = options?.accept;
      const filtered = accept?.length
        ? all.filter((f) => accept.some((a) => (f.mime ?? "").includes(a.replace("*", ""))))
        : all;
      const picked = options?.multiple === false ? filtered.slice(0, 1) : filtered;
      return picked.map((f) => f.ref);
    },

    async pickDirectory(): Promise<LocalDirectoryRef | null> {
      return "memdir_root" as LocalDirectoryRef;
    },

    async list(): Promise<LocalContentEntry[]> {
      return [...files.values()].map((f) => ({
        ref: f.ref,
        name: f.name,
        kind: "file" as const,
        mime: f.mime,
        bytes: f.bytes.byteLength,
        mtime: f.mtime,
        contentKind: f.contentKind,
      }));
    },

    async stat(ref: string): Promise<LocalContentStat> {
      const f = files.get(ref);
      if (!f) throw new Error(`local_file_not_found:${ref}`);
      return {
        ref: f.ref,
        name: f.name,
        kind: "file",
        mime: f.mime,
        bytes: f.bytes.byteLength,
        mtime: f.mtime,
      };
    },

    async openRead(ref: LocalFileRef): Promise<ContentReadHandle> {
      const f = files.get(ref);
      if (!f) throw new Error(`local_file_not_found:${ref}`);
      return {
        ref,
        async read(maxBytes?: number) {
          if (maxBytes === undefined) return f.bytes;
          return f.bytes.slice(0, maxBytes);
        },
      };
    },

    async materialize(ref: LocalFileRef): Promise<MaterializedContent> {
      const f = files.get(ref);
      if (!f) throw new Error(`local_file_not_found:${ref}`);
      return { ref, mime: f.mime, bytes: f.bytes.byteLength, pathHint: `memory://${ref}` };
    },

    put(file: MemoryLocalFile): LocalFileRef {
      files.set(file.ref, file);
      return file.ref;
    },
  } as LocalContentHost & { put(file: MemoryLocalFile): LocalFileRef };
}

export type MemoryLocalHost = ReturnType<typeof createMemoryLocalHost>;

/**
 * Attachable seam for Tauri / agentsamd / desktop bridges.
 * Starts as "attachable"; becomes "available" once a bridge is provided.
 */
export function createAttachableLocalHost(opts?: {
  label?: string;
  machineId?: string;
}): LocalContentHost & {
  attach(bridge: LocalContentHost): void;
  detach(): void;
} {
  let bridge: LocalContentHost | null = null;
  const label = opts?.label ?? "Attachable local host";

  const guard = (): LocalContentHost => {
    if (!bridge) throw new Error("local_runtime_not_attached");
    return bridge;
  };

  return {
    attach(next: LocalContentHost) {
      bridge = next;
    },
    detach() {
      bridge = null;
    },

    async status(): Promise<LocalRuntimeStatus> {
      if (!bridge) {
        return {
          availability: "attachable",
          machineId: opts?.machineId,
          label,
          watchSupported: false,
          processSupported: false,
        };
      }
      return bridge.status();
    },

    async pickFiles(options) {
      return guard().pickFiles?.(options) ?? [];
    },
    async pickDirectory(options) {
      return guard().pickDirectory?.(options) ?? null;
    },
    async list(pathOrRef) {
      return guard().list(pathOrRef);
    },
    async stat(ref) {
      return guard().stat(ref);
    },
    async openRead(ref) {
      return guard().openRead(ref);
    },
    async materialize(ref, options) {
      const b = guard();
      if (!b.materialize) throw new Error("local_materialize_unsupported");
      return b.materialize(ref, options);
    },
    async watch(ref, options) {
      const b = guard();
      if (!b.watch) throw new Error("local_watch_unsupported");
      return b.watch(ref, options);
    },
    async reveal(ref) {
      await guard().reveal?.(ref);
    },
    async importToLibrary(ref, options) {
      const b = guard();
      if (!b.importToLibrary) throw new Error("local_import_unsupported");
      return b.importToLibrary(ref, options);
    },
    async exportFromLibrary(assetId, destination) {
      const b = guard();
      if (!b.exportFromLibrary) throw new Error("local_export_unsupported");
      return b.exportFromLibrary(assetId, destination);
    },
  };
}

/** Documented adapter seam for Local Studio / agentsamd — host fills in. */
export interface AgentsamdLocalBridgeHints {
  /** Opaque IPC channel name — never a remote URL with secrets. */
  channel?: string;
  /** Whether native watch/fs is expected. */
  watchSupported?: boolean;
  processSupported?: boolean;
}

/**
 * Factory placeholder: Local Studio wires Tauri invoke / agentsamd RPC here.
 * Throws until a real bridge is attached via createAttachableLocalHost.
 */
export function createAgentsamdLocalHostSeam(
  hints?: AgentsamdLocalBridgeHints,
): ReturnType<typeof createAttachableLocalHost> {
  return createAttachableLocalHost({
    label: hints?.channel ? `agentsamd:${hints.channel}` : "agentsamd seam (unattached)",
  });
}

export type { WatchSubscription };
