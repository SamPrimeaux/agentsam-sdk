/**
 * Container file browsing and editing through agentsamd's native Docker API
 * (/v1/docker/files/*). Paths from the IDE are relative to the selected root;
 * they are resolved here and can never escape it. Versions are a SHA-256 of the
 * file bytes so saves keep the same compare-and-swap guard as the desktop bridge.
 */
import { agentsamdRequest } from "./agentsamd-client.ts";

export type DockerRequest = (route: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;
export const FILE_ACTIONS: ReadonlySet<string> = new Set(["list", "read", "preview", "write", "create", "mkdir", "rename", "delete"]);

export function resolveInRoot(root: unknown, relative: unknown): string {
  const base = typeof root === "string" && root.startsWith("/") ? root : "";
  if (!base) throw new Error("docker_root_invalid");
  const parts: string[] = [];
  for (const segment of String(relative ?? ".").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === ".." || segment.includes("\0")) throw new Error("docker_path_outside_root");
    parts.push(segment);
  }
  const root_ = base.replace(/\/+$/, "") || "";
  return (root_ + "/" + parts.join("/")).replace(/\/+$/, "") || "/";
}

function relativeTo(root: string, absolute: string): string {
  const base = root.replace(/\/+$/, "");
  return absolute.startsWith(base + "/") ? absolute.slice(base.length + 1) : absolute;
}

export async function versionOf(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

const toBytes = (res: Record<string, unknown>): Uint8Array => {
  const content = String(res.content ?? "");
  if (res.encoding === "base64") return Uint8Array.from(atob(content), c => c.charCodeAt(0));
  return new TextEncoder().encode(content);
};

export async function dockerFilesViaAgentsamd(
  action: string,
  fields: Record<string, unknown>,
  request: DockerRequest = agentsamdRequest,
): Promise<Record<string, unknown>> {
  const container = String(fields.container ?? "");
  const root = String(fields.root ?? "");
  const abs = resolveInRoot(root, fields.path);
  const call = (route: string, extra: Record<string, unknown> = {}) =>
    request("/v1/docker/" + route, { container, path: abs, ...extra });

  if (action === "list") {
    const res = await call("files/list");
    const entries = (res.entries as Array<{ path: string; type: string; size: number }> | undefined) ?? [];
    return {
      ok: true,
      entries: entries.filter(e => e.type === "file" || e.type === "dir").map(e => ({
        path: relativeTo(root, e.path), kind: e.type === "dir" ? "folder" : "file", size: e.size,
      })),
    };
  }
  if (action === "read") {
    const res = await call("files/read");
    if (res.encoding !== "utf8") throw new Error("docker_file_not_text");
    return { ok: true, path: fields.path, content: String(res.content), version: await versionOf(toBytes(res)) };
  }
  if (action === "preview") {
    const res = await call("files/read");
    const bytes = toBytes(res);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return { ok: true, contentBase64: btoa(binary) };
  }
  if (fields.approved !== true) throw new Error("docker_approval_required");
  if (action === "write") {
    const current = await call("files/read").catch(() => null);
    if (current) {
      if (!fields.expectedVersion || (await versionOf(toBytes(current))) !== fields.expectedVersion) {
        throw new Error("docker_version_conflict");
      }
    }
    const content = String(fields.content ?? "");
    await call("files/write", { content });
    return { ok: true, version: await versionOf(new TextEncoder().encode(content)) };
  }
  if (action === "create") {
    if (await call("files/read").then(() => true, () => false)) throw new Error("docker_path_exists");
    await call("files/write", { content: String(fields.content ?? "") });
    return { ok: true };
  }
  if (action === "mkdir") { await call("files/mkdir"); return { ok: true }; }
  if (action === "rename") {
    const name = String(fields.destination ?? "");
    if (!name || name.includes("/") || name === "." || name === "..") throw new Error("docker_path_outside_root");
    await call("files/rename", { destination: abs.replace(/\/[^/]*$/, "") + "/" + name });
    return { ok: true };
  }
  if (action === "delete") {
    const current = await call("files/read").catch(() => null);
    if (current && fields.expectedVersion && (await versionOf(toBytes(current))) !== fields.expectedVersion) {
      throw new Error("docker_version_conflict");
    }
    await call("files/delete", { recursive: !current });
    return { ok: true };
  }
  throw new Error("docker_action_unsupported");
}
