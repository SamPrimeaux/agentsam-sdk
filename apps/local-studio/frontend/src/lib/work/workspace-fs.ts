/**
 * Workspace filesystem adapters for Local Studio.
 *
 * Scratch → in-memory Project.files (browser)
 * Runtime → authorized local PTY/FS HTTP (/v1/fs) — never localStorage authority
 */

export type WorkspaceKind = "scratch" | "filesystem";

export type WorkspaceFileEntry = {
  path: string;
  kind: "file" | "directory" | "symlink";
  size?: number;
  mtime?: number;
  content_hash?: string | null;
};

export type WorkspaceFileDocument = {
  path: string;
  content: string;
  version: string;
  mtime: number;
  content_hash: string;
  language?: string;
};

export type WorkspaceAdapterResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; code?: string; expected?: string | null; actual?: string | null };

export interface WorkspaceAdapter {
  kind: WorkspaceKind;
  list(path?: string): Promise<WorkspaceAdapterResult<{ entries: WorkspaceFileEntry[] }>>;
  read(path: string): Promise<WorkspaceAdapterResult<WorkspaceFileDocument>>;
  write(
    path: string,
    content: string,
    expectedVersion?: string | null,
    overwrite?: boolean,
  ): Promise<WorkspaceAdapterResult<{ version: string; mtime: number }>>;
  create(path: string, content?: string): Promise<WorkspaceAdapterResult<{ version: string }>>;
  rename(from: string, to: string): Promise<WorkspaceAdapterResult<{ from: string; to: string }>>;
  remove(path: string, expectedVersion?: string | null): Promise<WorkspaceAdapterResult<{ path: string }>>;
  mkdir(path: string): Promise<WorkspaceAdapterResult<{ path: string }>>;
}

type ScratchFile = {
  id: string;
  path: string;
  content: string;
  language: string;
  updatedAt: number;
};

export class ScratchWorkspaceAdapter implements WorkspaceAdapter {
  kind: WorkspaceKind = "scratch";
  constructor(private getFiles: () => ScratchFile[], private setFiles: (files: ScratchFile[]) => void) {}

  async list(dir = ".") {
    const prefix = dir === "." || dir === "/" || dir === "" ? "" : dir.replace(/^\//, "").replace(/\/$/, "");
    const files = this.getFiles();
    const dirs = new Set<string>();
    const entries: WorkspaceFileEntry[] = [];
    for (const f of files) {
      const p = f.path.replace(/^\//, "");
      if (prefix && !p.startsWith(prefix + "/") && p !== prefix) continue;
      const rest = prefix ? p.slice(prefix.length + 1) : p;
      if (!rest) continue;
      const slash = rest.indexOf("/");
      if (slash >= 0) {
        const name = rest.slice(0, slash);
        const full = prefix ? `${prefix}/${name}` : name;
        if (!dirs.has(full)) {
          dirs.add(full);
          entries.push({ path: full, kind: "directory" });
        }
      } else {
        entries.push({
          path: p,
          kind: "file",
          size: f.content.length,
          mtime: f.updatedAt,
        });
      }
    }
    return { ok: true as const, entries };
  }

  async read(filePath: string) {
    const p = filePath.replace(/^\//, "");
    const file = this.getFiles().find((f) => f.path.replace(/^\//, "") === p);
    if (!file) return { ok: false as const, error: "not_found", code: "ENOENT" };
    const version = `scratch:${file.updatedAt}:${file.content.length}`;
    return {
      ok: true as const,
      path: p,
      content: file.content,
      version,
      mtime: file.updatedAt,
      content_hash: version,
      language: file.language,
    };
  }

  async write(filePath: string, content: string) {
    const p = filePath.replace(/^\//, "");
    const files = this.getFiles();
    const idx = files.findIndex((f) => f.path.replace(/^\//, "") === p);
    const now = Date.now();
    if (idx >= 0) {
      const next = [...files];
      next[idx] = { ...next[idx]!, content, updatedAt: now };
      this.setFiles(next);
    } else {
      this.setFiles([
        ...files,
        { id: `scratch-${now}`, path: p, content, language: "plaintext", updatedAt: now },
      ]);
    }
    return { ok: true as const, version: `scratch:${now}:${content.length}`, mtime: now };
  }

  async create(filePath: string, content = "") {
    const p = filePath.replace(/^\//, "");
    if (this.getFiles().some((f) => f.path.replace(/^\//, "") === p)) {
      return { ok: false as const, error: "already_exists", code: "already_exists" };
    }
    return this.write(p, content);
  }

  async rename(from: string, to: string) {
    const a = from.replace(/^\//, "");
    const b = to.replace(/^\//, "");
    const files = this.getFiles();
    const idx = files.findIndex((f) => f.path.replace(/^\//, "") === a);
    if (idx < 0) return { ok: false as const, error: "not_found", code: "ENOENT" };
    const next = [...files];
    next[idx] = { ...next[idx]!, path: b, updatedAt: Date.now() };
    this.setFiles(next);
    return { ok: true as const, from: a, to: b };
  }

  async remove(filePath: string) {
    const p = filePath.replace(/^\//, "");
    this.setFiles(this.getFiles().filter((f) => f.path.replace(/^\//, "") !== p));
    return { ok: true as const, path: p };
  }

  async mkdir() {
    return { ok: true as const, path: "." };
  }
}

export class RuntimeFilesystemAdapter implements WorkspaceAdapter {
  kind: WorkspaceKind = "filesystem";
  constructor(private baseUrl: string) {}

  private url(action: string, filePath?: string) {
    const u = new URL(`${this.baseUrl.replace(/\/$/, "")}/v1/fs/${action}`);
    if (filePath != null) u.searchParams.set("path", filePath);
    return u.toString();
  }

  private async getJson(action: string, filePath?: string) {
    const res = await fetch(this.url(action, filePath));
    return (await res.json()) as Record<string, unknown>;
  }

  private async postJson(action: string, body: Record<string, unknown>) {
    const res = await fetch(this.url(action), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as Record<string, unknown>;
  }

  async list(dir = ".", recursive = false) {
    const u = new URL(this.url("list", dir));
    if (recursive) u.searchParams.set("recursive", "1");
    const res = await fetch(u.toString());
    const data = (await res.json()) as Record<string, unknown>;
    if (!data.ok) return { ok: false as const, error: String(data.error || "list_failed"), code: String(data.code || "") };
    return { ok: true as const, entries: (data.entries as WorkspaceFileEntry[]) || [] };
  }

  async read(filePath: string) {
    const data = await this.getJson("read", filePath);
    if (!data.ok) {
      return {
        ok: false as const,
        error: String(data.error || "read_failed"),
        code: String(data.code || ""),
      };
    }
    return {
      ok: true as const,
      path: String(data.path),
      content: String(data.content ?? ""),
      version: String(data.version),
      mtime: Number(data.mtime) || 0,
      content_hash: String(data.content_hash || data.version),
    };
  }

  async write(filePath: string, content: string, expectedVersion?: string | null, overwrite = false) {
    const data = await this.postJson("write", {
      path: filePath,
      content,
      expectedVersion: expectedVersion ?? undefined,
      overwrite,
    });
    if (!data.ok) {
      return {
        ok: false as const,
        error: String(data.error || "write_failed"),
        code: String(data.code || ""),
        expected: (data.expected as string) ?? null,
        actual: (data.actual as string) ?? null,
      };
    }
    return {
      ok: true as const,
      version: String(data.version),
      mtime: Number(data.mtime) || Date.now(),
    };
  }

  async create(filePath: string, content = "") {
    const data = await this.postJson("create", { path: filePath, content });
    if (!data.ok) {
      return { ok: false as const, error: String(data.error || "create_failed"), code: String(data.code || "") };
    }
    return { ok: true as const, version: String(data.version || "") };
  }

  async rename(from: string, to: string) {
    const data = await this.postJson("rename", { from, to });
    if (!data.ok) {
      return { ok: false as const, error: String(data.error || "rename_failed"), code: String(data.code || "") };
    }
    return { ok: true as const, from: String(data.from), to: String(data.to) };
  }

  async remove(filePath: string, expectedVersion?: string | null) {
    const data = await this.postJson("remove", { path: filePath, expectedVersion: expectedVersion ?? undefined });
    if (!data.ok) {
      return { ok: false as const, error: String(data.error || "remove_failed"), code: String(data.code || "") };
    }
    return { ok: true as const, path: String(data.path || filePath) };
  }

  async mkdir(dirPath: string) {
    const data = await this.postJson("mkdir", { path: dirPath });
    if (!data.ok) {
      return { ok: false as const, error: String(data.error || "mkdir_failed"), code: String(data.code || "") };
    }
    return { ok: true as const, path: String(data.path || dirPath) };
  }
}

export async function probeLocalRuntime(baseUrl = "http://127.0.0.1:3099") {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return { ok: false as const, error: `http_${res.status}` };
    const data = (await res.json()) as { ok?: boolean; filesystem?: boolean; cwd?: string };
    if (!data.ok) return { ok: false as const, error: "unhealthy" };
    if (!data.filesystem) return { ok: false as const, error: "filesystem_unavailable" };
    return { ok: true as const, cwd: data.cwd || null, baseUrl: baseUrl.replace(/\/$/, "") };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
