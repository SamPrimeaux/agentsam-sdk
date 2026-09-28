/**
 * Local Studio host: detect Tauri / local Node bridge and expose LocalDatabaseHost.
 */
import type {
  CreateLocalDatabaseOptions,
  LocalDatabaseHost,
  LocalDatabaseRef,
  LocalRuntimeStatus,
} from "@inneranimalmedia/agentsam-database-editor/frontend";

type BridgeRequest = Record<string, unknown>;

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: { core?: { invoke?: (cmd: string, args?: unknown) => Promise<unknown> } };
  }
}

function isTauri(): boolean {
  return Boolean(
    typeof window !== "undefined" &&
      (window.__TAURI_INTERNALS__ || window.__TAURI__?.core?.invoke),
  );
}

async function invokeBridge(payload: BridgeRequest): Promise<Record<string, unknown>> {
  if (isTauri() && window.__TAURI__?.core?.invoke) {
    const result = (await window.__TAURI__.core.invoke("local_sqlite_bridge", {
      requestJson: JSON.stringify(payload),
    })) as string;
    return JSON.parse(result) as Record<string, unknown>;
  }

  // Dev / local Node companion (optional). Hosted CF Worker never serves this.
  const response = await fetch("/api/database/local/bridge", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || body.ok === false) {
    throw new Error(String(body.error || `local_bridge_failed_${response.status}`));
  }
  return body;
}

export function createLocalStudioLocalHost(): LocalDatabaseHost {
  return {
    async status(): Promise<LocalRuntimeStatus> {
      try {
        const body = await invokeBridge({ op: "status", cwd: "." });
        const status = String(body.status || "");
        if (status === "available" || status === "attachable") return status;
        return body.exists ? "available" : "attachable";
      } catch {
        // Hosted browser without local runtime → attachable CTA, not a dead disable.
        return isTauri() ? "attachable" : "attachable";
      }
    },

    async list(): Promise<LocalDatabaseRef[]> {
      try {
        const body = await invokeBridge({ op: "list", cwd: "." });
        return Array.isArray(body.refs) ? (body.refs as LocalDatabaseRef[]) : [];
      } catch {
        return [];
      }
    },

    async pick(): Promise<LocalDatabaseRef | null> {
      const invoke = window.__TAURI__?.core?.invoke;
      if (!isTauri() || !invoke) return null;
      return (await invoke("local_sqlite_pick_database")) as LocalDatabaseRef | null;
    },

    async open(ref: LocalDatabaseRef) {
      if (ref.kind === "agentsam" || ref.ref === "agentsam" || ref.id === "local-sqlite:agentsam") {
        const body = await invokeBridge({ op: "open_agentsam", cwd: "." });
        return { sourceId: String(body.sourceId || "local-sqlite:agentsam") };
      }
      const body = await invokeBridge({
        op: "open_database",
        cwd: ".",
        ref: ref.ref,
        source_id: ref.id,
      });
      return { sourceId: String(body.sourceId || ref.id) };
    },

    async create(options: CreateLocalDatabaseOptions) {
      const body = await invokeBridge({
        op: "create_database",
        cwd: ".",
        name: options.name,
        directory_ref: options.directoryRef,
        preset: options.preset,
      });
      return {
        sourceId: String(body.sourceId || "local-sqlite:created"),
        ref: body.ref as LocalDatabaseRef,
      };
    },

    async pickDirectory(): Promise<string | null> {
      const invoke = window.__TAURI__?.core?.invoke;
      if (!isTauri() || !invoke) return null;
      return (await invoke("local_sqlite_pick_directory")) as string | null;
    },

    async detach(ref: LocalDatabaseRef): Promise<void> {
      await invokeBridge({
        op: "detach_database",
        cwd: ".",
        ref: ref.ref,
        source_id: ref.id,
      });
    },
  };
}

export async function localBridgeDispatch(payload: BridgeRequest) {
  return invokeBridge(payload);
}
