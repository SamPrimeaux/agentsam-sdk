/**
 * Local Studio LocalContentHost — Tauri / agentsamd / Node FS bridge.
 *
 * Browser packages never import this. Host owns path mapping; opaque refs only.
 */
import {
  createAgentsamdLocalHostSeam,
  type LocalContentEntry,
  type LocalContentHost,
  type LocalContentStat,
  type LocalDirectoryRef,
  type LocalFileRef,
  type LocalPickOptions,
  type LocalRuntimeStatus,
  type MaterializedContent,
  type ContentReadHandle,
} from "@inneranimalmedia/agentsam-content";

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

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

async function invokeContentBridge(payload: BridgeRequest): Promise<Record<string, unknown>> {
  if (isTauri() && window.__TAURI__?.core?.invoke) {
    const result = (await window.__TAURI__.core.invoke("local_content_bridge", {
      requestJson: JSON.stringify(payload),
    })) as string;
    return JSON.parse(result) as Record<string, unknown>;
  }

  const response = await fetch("/api/content/local/bridge", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || body.ok === false) {
    throw new Error(String(body.error || `local_content_bridge_failed_${response.status}`));
  }
  return body;
}

async function ensureAgentsamdViaTauri(): Promise<boolean> {
  if (!isTauri() || !window.__TAURI__?.core?.invoke) return false;
  try {
    const handshake = (await window.__TAURI__.core.invoke("ensure_agentsamd", {})) as {
      ok?: boolean;
    };
    return Boolean(handshake?.ok);
  } catch {
    try {
      const health = (await window.__TAURI__.core.invoke("agentsamd_health", {})) as {
        ok?: boolean;
      };
      return Boolean(health?.ok);
    } catch {
      return false;
    }
  }
}

function pickViaInput(options?: LocalPickOptions): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = options?.multiple !== false;
    if (options?.accept?.length) {
      input.accept = options.accept.join(",");
    }
    input.style.display = "none";
    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      input.remove();
      resolve(files);
    });
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Real LocalContentHost backed by Tauri `local_content_bridge` (desktop)
 * or the Node companion route (dev). Attaches via agentsamd seam.
 */
export function createLocalStudioContentHostBridge(): LocalContentHost {
  return {
    async status(): Promise<LocalRuntimeStatus> {
      try {
        await ensureAgentsamdViaTauri();
        const body = await invokeContentBridge({ op: "status", cwd: "." });
        const availability =
          body.availability === "available" || body.status === "available"
            ? "available"
            : body.availability === "attachable" || body.status === "attachable"
              ? "attachable"
              : "unavailable";
        return {
          availability,
          machineId: typeof body.machineId === "string" ? body.machineId : undefined,
          label: typeof body.label === "string" ? body.label : "Local Studio content host",
          watchSupported: Boolean(body.watchSupported),
          processSupported: Boolean(body.processSupported),
        };
      } catch {
        return {
          availability: "attachable",
          label: isTauri()
            ? "Local runtime attachable — open Local Studio desktop shell"
            : "Local FS bridge attachable — start Local Studio / agentsamd",
          watchSupported: false,
          processSupported: false,
        };
      }
    },

    async pickFiles(options?: LocalPickOptions): Promise<LocalFileRef[]> {
      const files = await pickViaInput(options);
      const refs: LocalFileRef[] = [];
      for (const file of files) {
        const buf = new Uint8Array(await file.arrayBuffer());
        const body = await invokeContentBridge({
          op: "import_bytes",
          cwd: ".",
          name: file.name,
          encoding: "base64",
          data: bytesToB64(buf),
        });
        if (typeof body.ref === "string") refs.push(body.ref as LocalFileRef);
      }
      return refs;
    },

    async pickDirectory(): Promise<LocalDirectoryRef | null> {
      // Desktop FS root is authorized by the bridge; expose content library dir.
      return ".agentsam/content-library" as LocalDirectoryRef;
    },

    async list(pathOrRef: LocalDirectoryRef | string = ".agentsam/content-library"): Promise<LocalContentEntry[]> {
      try {
        const body = await invokeContentBridge({
          op: "list",
          cwd: ".",
          path: pathOrRef || ".agentsam/content-library",
        });
        return Array.isArray(body.entries) ? (body.entries as LocalContentEntry[]) : [];
      } catch {
        return [];
      }
    },

    async stat(ref: string): Promise<LocalContentStat> {
      const body = await invokeContentBridge({ op: "stat", cwd: ".", ref });
      return {
        ref: String(body.ref || ref) as LocalFileRef,
        name: String(body.name || ref),
        kind: body.kind === "directory" ? "directory" : "file",
        mime: typeof body.mime === "string" ? body.mime : undefined,
        bytes: typeof body.bytes === "number" ? body.bytes : undefined,
        mtime: typeof body.mtime === "string" ? body.mtime : undefined,
      };
    },

    async openRead(ref: LocalFileRef): Promise<ContentReadHandle> {
      return {
        ref,
        async read(maxBytes?: number) {
          const body = await invokeContentBridge({
            op: "read",
            cwd: ".",
            ref,
            maxBytes,
          });
          if (body.encoding !== "base64" || typeof body.data !== "string") {
            throw new Error("local_content_read_encoding");
          }
          return b64ToBytes(body.data);
        },
      };
    },

    async materialize(ref: LocalFileRef): Promise<MaterializedContent> {
      const body = await invokeContentBridge({ op: "materialize", cwd: ".", ref });
      return {
        ref,
        mime: typeof body.mime === "string" ? body.mime : undefined,
        bytes: typeof body.bytes === "number" ? body.bytes : undefined,
        pathHint: typeof body.pathHint === "string" ? body.pathHint : String(ref),
      };
    },

    async reveal(ref: LocalFileRef | LocalDirectoryRef) {
      await invokeContentBridge({ op: "reveal", cwd: ".", ref });
    },
  };
}

/**
 * Attachable agentsamd seam + real bridge. Prefer this from Local Studio.
 */
export function createLocalStudioLocalContentHost(): ReturnType<typeof createAgentsamdLocalHostSeam> {
  const seam = createAgentsamdLocalHostSeam({
    channel: "local_content_bridge",
    watchSupported: false,
    processSupported: true,
  });
  seam.attach(createLocalStudioContentHostBridge());
  return seam;
}

export async function contentBridgeDispatch(payload: BridgeRequest) {
  return invokeContentBridge(payload);
}
