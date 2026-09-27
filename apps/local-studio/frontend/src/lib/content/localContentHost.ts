/**
 * Local Studio LocalContentHost — native Tauri FS / browser File System Access.
 *
 * Desktop: Tauri `local_content_bridge` (native Rust — no Node/monorepo).
 * Browser/dev: File System Access API when available; else explicit browser-import.
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
    showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]>;
    showDirectoryPicker?: (options?: unknown) => Promise<FileSystemDirectoryHandle>;
  }
}

const MAX_BROWSER_IMPORT_BYTES = 32 * 1024 * 1024;

/** Browser-only handle map — never serializes absolute paths. */
const browserHandles = new Map<
  string,
  { kind: "file" | "directory"; handle: FileSystemHandle; name: string }
>();

function isTauri(): boolean {
  return Boolean(
    typeof window !== "undefined" &&
      (window.__TAURI_INTERNALS__ || window.__TAURI__?.core?.invoke),
  );
}

function mintBrowserRef(kind: "file" | "directory"): string {
  const suffix = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  return kind === "directory" ? `localdir_${suffix}` : `localref_${suffix}`;
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
    const body = JSON.parse(result) as Record<string, unknown>;
    if (body.ok === false) {
      throw new Error(String(body.error || "local_content_bridge_failed"));
    }
    return body;
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

function supportsFileSystemAccess(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.showOpenFilePicker === "function" &&
    typeof window.showDirectoryPicker === "function"
  );
}

/** Explicit browser-import fallback — copies into content-library via bridge. */
function pickViaInputImport(options?: LocalPickOptions): Promise<File[]> {
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

async function browserPickFilesNative(options?: LocalPickOptions): Promise<LocalFileRef[]> {
  const handles = await window.showOpenFilePicker!({
    multiple: options?.multiple !== false,
    types: options?.accept?.length
      ? [
          {
            description: "Accepted",
            accept: Object.fromEntries(
              options.accept.map((a) => {
                if (a.includes("/")) return [a, []];
                return ["application/octet-stream", [a.startsWith(".") ? a : `.${a}`]];
              }),
            ),
          },
        ]
      : undefined,
  });
  const refs: LocalFileRef[] = [];
  for (const handle of handles) {
    const ref = mintBrowserRef("file");
    browserHandles.set(ref, { kind: "file", handle, name: handle.name });
    refs.push(ref as LocalFileRef);
  }
  return refs;
}

async function browserPickDirectoryNative(): Promise<LocalDirectoryRef | null> {
  const handle = await window.showDirectoryPicker!();
  const ref = mintBrowserRef("directory");
  browserHandles.set(ref, { kind: "directory", handle, name: handle.name });
  return ref as LocalDirectoryRef;
}

async function browserList(ref: string): Promise<LocalContentEntry[]> {
  if (!ref || ref === "." || ref === ".agentsam/content-library") {
    // Granted roots currently held in-memory for this session.
    return [...browserHandles.entries()]
      .filter(([, v]) => v.kind === "directory")
      .map(([id, v]) => ({
        ref: id as LocalDirectoryRef,
        name: v.name,
        kind: "directory" as const,
      }));
  }
  const entry = browserHandles.get(ref);
  if (!entry || entry.kind !== "directory") return [];
  const dir = entry.handle as FileSystemDirectoryHandle;
  const out: LocalContentEntry[] = [];
  for await (const [name, handle] of dir.entries()) {
    const childRef = mintBrowserRef(handle.kind === "directory" ? "directory" : "file");
    browserHandles.set(childRef, {
      kind: handle.kind === "directory" ? "directory" : "file",
      handle,
      name,
    });
    out.push({
      ref: childRef as LocalFileRef | LocalDirectoryRef,
      name,
      kind: handle.kind === "directory" ? "directory" : "file",
    });
  }
  return out;
}

async function browserStat(ref: string): Promise<LocalContentStat> {
  const entry = browserHandles.get(ref);
  if (!entry) throw new Error(`unknown_ref:${ref}`);
  if (entry.kind === "directory") {
    return { ref: ref as LocalDirectoryRef, name: entry.name, kind: "directory" };
  }
  const file = await (entry.handle as FileSystemFileHandle).getFile();
  return {
    ref: ref as LocalFileRef,
    name: entry.name,
    kind: "file",
    mime: file.type || undefined,
    bytes: file.size,
    mtime: new Date(file.lastModified).toISOString(),
  };
}

async function browserRead(ref: LocalFileRef, maxBytes?: number): Promise<Uint8Array> {
  const entry = browserHandles.get(ref);
  if (!entry || entry.kind !== "file") throw new Error(`unknown_ref:${ref}`);
  const file = await (entry.handle as FileSystemFileHandle).getFile();
  const limit = Math.min(maxBytes ?? MAX_BROWSER_IMPORT_BYTES, MAX_BROWSER_IMPORT_BYTES);
  if (file.size > limit) throw new Error(`file_too_large:${file.size}>${limit}`);
  return new Uint8Array(await file.arrayBuffer());
}

/**
 * Real LocalContentHost: native desktop picker/FS, or browser FSA / import fallback.
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
        const native = Boolean(body.nativeFs) || isTauri();
        return {
          availability,
          machineId: typeof body.machineId === "string" ? body.machineId : undefined,
          label:
            typeof body.label === "string"
              ? body.label
              : native
                ? "Local Studio · native FS"
                : supportsFileSystemAccess()
                  ? "Local Studio · browser File System Access"
                  : "Local Studio · browser-import fallback",
          watchSupported: Boolean(body.watchSupported),
          processSupported: Boolean(body.processSupported) || isTauri(),
        };
      } catch {
        if (supportsFileSystemAccess() || isTauri()) {
          return {
            availability: "available",
            label: isTauri()
              ? "Local Studio · native FS"
              : "Local Studio · browser File System Access",
            watchSupported: false,
            processSupported: isTauri(),
          };
        }
        return {
          availability: "attachable",
          label: "Browser-import fallback attachable (32 MiB) — desktop shell preferred",
          watchSupported: false,
          processSupported: false,
        };
      }
    },

    async pickFiles(options?: LocalPickOptions): Promise<LocalFileRef[]> {
      // Desktop: native picker → opaque refs, no copy.
      if (isTauri()) {
        const body = await invokeContentBridge({
          op: "pick_files",
          multiple: options?.multiple !== false,
          accept: options?.accept,
        });
        return Array.isArray(body.refs) ? (body.refs as LocalFileRef[]) : [];
      }

      // Browser: File System Access API (in-place handles).
      if (supportsFileSystemAccess()) {
        try {
          return await browserPickFilesNative(options);
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return [];
          // fall through to import fallback
        }
      }

      // Browser-import fallback — explicit copy into content-library.
      const files = await pickViaInputImport(options);
      const refs: LocalFileRef[] = [];
      for (const file of files) {
        if (file.size > MAX_BROWSER_IMPORT_BYTES) {
          throw new Error(`file_too_large:${file.size}>${MAX_BROWSER_IMPORT_BYTES}`);
        }
        const buf = new Uint8Array(await file.arrayBuffer());
        const body = await invokeContentBridge({
          op: "import_bytes",
          cwd: ".",
          name: file.name,
          encoding: "base64",
          data: bytesToB64(buf),
          browserImport: true,
        });
        if (typeof body.ref === "string") refs.push(body.ref as LocalFileRef);
      }
      return refs;
    },

    async pickDirectory(options?: { title?: string }): Promise<LocalDirectoryRef | null> {
      if (isTauri()) {
        try {
          const body = await invokeContentBridge({
            op: "pick_directory",
            title: options?.title,
          });
          return typeof body.ref === "string" ? (body.ref as LocalDirectoryRef) : null;
        } catch (err) {
          if (String(err).includes("pick_cancelled")) return null;
          throw err;
        }
      }

      if (supportsFileSystemAccess()) {
        try {
          return await browserPickDirectoryNative();
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return null;
          throw err;
        }
      }

      // No silent fake content-library path — browser without FSA cannot attach dirs.
      throw new Error("pick_directory_requires_desktop_or_file_system_access");
    },

    async list(pathOrRef: LocalDirectoryRef | string = ""): Promise<LocalContentEntry[]> {
      if (!isTauri() && browserHandles.has(String(pathOrRef))) {
        return browserList(String(pathOrRef));
      }
      if (!isTauri() && (!pathOrRef || pathOrRef === ".agentsam/content-library")) {
        const local = await browserList("");
        if (local.length) return local;
      }
      try {
        const body = await invokeContentBridge({
          op: "list",
          cwd: ".",
          path: pathOrRef || "",
          ref: pathOrRef || "",
        });
        return Array.isArray(body.entries) ? (body.entries as LocalContentEntry[]) : [];
      } catch {
        return [];
      }
    },

    async stat(ref: string): Promise<LocalContentStat> {
      if (!isTauri() && browserHandles.has(ref)) {
        return browserStat(ref);
      }
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
          if (!isTauri() && browserHandles.has(ref)) {
            return browserRead(ref, maxBytes);
          }
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
      if (!isTauri() && browserHandles.has(ref)) {
        const st = await browserStat(ref);
        return {
          ref,
          mime: st.mime,
          bytes: st.bytes,
          pathHint: ref,
        };
      }
      const body = await invokeContentBridge({ op: "materialize", cwd: ".", ref });
      return {
        ref,
        mime: typeof body.mime === "string" ? body.mime : undefined,
        bytes: typeof body.bytes === "number" ? body.bytes : undefined,
        pathHint: typeof body.pathHint === "string" ? body.pathHint : String(ref),
      };
    },

    async reveal(ref: LocalFileRef | LocalDirectoryRef) {
      if (!isTauri() && browserHandles.has(ref)) {
        // Browser cannot reveal in Finder; no-op with clear contract.
        return;
      }
      await invokeContentBridge({ op: "reveal", cwd: ".", ref });
    },

    async importToLibrary(ref: LocalFileRef, options?: { accountId: string; brandId?: string }) {
      if (!isTauri() && browserHandles.has(ref)) {
        const bytes = await browserRead(ref);
        const entry = browserHandles.get(ref)!;
        const body = await invokeContentBridge({
          op: "import_bytes",
          cwd: ".",
          name: entry.name,
          encoding: "base64",
          data: bytesToB64(bytes),
          accountId: options?.accountId,
          brandId: options?.brandId,
        });
        return { assetId: String(body.ref || body.assetId || ref) };
      }
      const body = await invokeContentBridge({
        op: "import_to_library",
        ref,
        accountId: options?.accountId,
        brandId: options?.brandId,
      });
      return { assetId: String(body.assetId || body.ref || ref) };
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
