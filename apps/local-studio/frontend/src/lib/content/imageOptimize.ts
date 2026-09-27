/**
 * Host image optimizers for Local Studio ContentRuntime.
 *
 * Web  → POST /api/content/optimize (Nitro + sharp) — never used as desktop universal path.
 * Desktop (Tauri) → local_content_bridge optimize_image (native, no Nitro, no hosted Studio).
 */
import type { ImageOptimizer } from "@inneranimalmedia/agentsam-content";
import { contentBridgeDispatch } from "./localContentHost";

function isTauri(): boolean {
  return Boolean(
    typeof window !== "undefined" &&
      ((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ||
        (window as Window & { __TAURI__?: { core?: { invoke?: unknown } } }).__TAURI__?.core
          ?.invoke),
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

/** Web/Nitro host only. */
export function createWebImageOptimizer(
  endpoint = "/api/content/optimize",
): ImageOptimizer {
  return async (input) => {
    if (input.mime && !input.mime.startsWith("image/")) {
      return { ref: "", format: "", bytes: 0, skipped: true };
    }
    const res = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: input.filename,
        mime: input.mime,
        dataBase64: bytesToBase64(input.bytes),
        format: input.format,
      }),
    });
    const body = (await res.json().catch(() => ({ ok: false }))) as {
      ok?: boolean;
      skipped?: boolean;
      ref?: string;
      format?: string;
      bytes?: number;
      width?: number;
      height?: number;
      processor?: string;
      error?: string;
    };
    if (body.skipped) {
      return { ref: "", format: "", bytes: 0, skipped: true };
    }
    if (!res.ok || !body.ok || !body.ref) {
      throw new Error(body.error || `optimize_failed_${res.status}`);
    }
    return {
      ref: body.ref,
      format: body.format || "webp",
      bytes: body.bytes ?? 0,
      width: body.width,
      height: body.height,
      processor: body.processor,
    };
  };
}

/**
 * Desktop Local Studio — Tauri local_content_bridge only.
 * Must never call /api/content/optimize or agentsam.inneranimalmedia.com.
 */
export function createDesktopImageOptimizer(): ImageOptimizer {
  return async (input) => {
    if (input.mime && !input.mime.startsWith("image/")) {
      return { ref: "", format: "", bytes: 0, skipped: true };
    }
    if (!isTauri()) {
      throw new Error("desktop_image_optimizer_requires_tauri");
    }
    const body = await contentBridgeDispatch({
      op: "optimize_image",
      filename: input.filename,
      mime: input.mime,
      encoding: "base64",
      data: bytesToBase64(input.bytes),
      format: input.format || "jpeg",
    });
    if (body.skipped) {
      return { ref: "", format: "", bytes: 0, skipped: true };
    }
    if (typeof body.ref !== "string") {
      throw new Error(String(body.error || "optimize_image_missing_ref"));
    }
    return {
      ref: body.ref,
      format: typeof body.format === "string" ? body.format : "jpeg",
      bytes: typeof body.bytes === "number" ? body.bytes : 0,
      width: typeof body.width === "number" ? body.width : undefined,
      height: typeof body.height === "number" ? body.height : undefined,
      processor: typeof body.processor === "string" ? body.processor : "desktop-local",
    };
  };
}

/** Pick optimizer for the current host surface. */
export function createLocalStudioImageOptimizer(): ImageOptimizer {
  return isTauri() ? createDesktopImageOptimizer() : createWebImageOptimizer();
}

export { isTauri as isLocalStudioTauriHost };
