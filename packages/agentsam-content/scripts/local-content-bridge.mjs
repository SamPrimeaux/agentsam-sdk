#!/usr/bin/env node
/**
 * Local-runtime content FS bridge for Local Studio browser/dev → LocalContentHost.
 * Reads one JSON request from stdin, writes one JSON response to stdout.
 * Never used from Workers / packaged .app — desktop uses native Rust Tauri FS.
 *
 * Ops: status | list | stat | read | materialize | reveal | pick_probe
 *      | import_bytes | import_to_library | grant_directory | grant_file
 *
 * Opaque refs: localref_* / localdir_* map to granted absolute paths in
 * `.agentsam/content-grants.json`. Legacy relative paths under project root
 * remain supported for tests. Absolute paths never returned to remote/model contexts.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createLocalFilesystem } from "../../../src/local-fs/index.js";
import { resolveContainedPath } from "../../../src/local-fs/paths.js";

const MAX_READ_BYTES = 32 * 1024 * 1024; // 32 MiB binary ceiling for content import
const AGENTSAMD_LISTEN = process.env.AGENTSAMD_LISTEN || "127.0.0.1:18765";

function findProjectRoot(startDir) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 16; i += 1) {
    if (fs.existsSync(path.join(dir, ".agentsam", "config.json"))) return dir;
    if (fs.existsSync(path.join(dir, "packages", "agentsam-content"))) return dir;
    if (fs.existsSync(path.join(dir, "apps", "local-studio"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim() || "{}";
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    process.stdin.on("error", reject);
  });
}

function ok(payload) {
  process.stdout.write(JSON.stringify({ ok: true, ...payload }) + "\n");
}

function fail(error, status = 400) {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      status,
    }) + "\n",
  );
  process.exitCode = 1;
}

function guessMime(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".glb")) return "model/gltf-binary";
  if (lower.endsWith(".gltf")) return "model/gltf+json";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".json")) return "application/json";
  return undefined;
}

function contentKind(mime, name) {
  const m = mime || "";
  const n = String(name || "").toLowerCase();
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/.test(n)) return "image";
  if (m.startsWith("video/") || /\.(mp4|webm|mov)$/.test(n)) return "video";
  if (m.startsWith("model/") || /\.(glb|gltf)$/.test(n)) return "model";
  if (m.startsWith("audio/") || /\.(mp3|wav|ogg)$/.test(n)) return "audio";
  if (m.startsWith("font/") || /\.(woff2?|ttf|otf)$/.test(n)) return "font";
  if (m.includes("pdf") || /\.(pdf|doc|txt|md)$/.test(n)) return "document";
  return "other";
}

function probeAgentsamd(listen = AGENTSAMD_LISTEN) {
  const host = String(listen).replace(/^https?:\/\//, "");
  try {
    const res = spawnSync(
      "curl",
      ["-fsS", "--max-time", "1", `http://${host}/health`],
      { encoding: "utf8" },
    );
    if (res.status !== 0) return { ok: false };
    const body = JSON.parse(res.stdout || "{}");
    return { ok: Boolean(body.ok), version: body.version || body.build?.go, body };
  } catch {
    return { ok: false };
  }
}

function mintId(kind) {
  return `${kind === "directory" ? "localdir" : "localref"}_${randomBytes(8).toString("hex")}`;
}

function grantsFile(root) {
  return path.join(root, ".agentsam", "content-grants.json");
}

function loadGrants(root) {
  const file = grantsFile(root);
  if (!fs.existsSync(file)) return { roots: [], entries: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      roots: Array.isArray(raw.roots) ? raw.roots : [],
      entries: raw.entries && typeof raw.entries === "object" ? raw.entries : {},
    };
  } catch {
    return { roots: [], entries: {} };
  }
}

function saveGrants(root, grants) {
  const dir = path.join(root, ".agentsam");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(grantsFile(root), JSON.stringify(grants, null, 2));
}

function registerGrant(root, absPath, kind, { isRoot = false } = {}) {
  const abs = path.resolve(absPath);
  if (kind === "directory" && !fs.statSync(abs).isDirectory()) {
    throw new Error("not_a_directory");
  }
  if (kind === "file" && !fs.statSync(abs).isFile()) {
    throw new Error("not_a_file");
  }
  const grants = loadGrants(root);
  const id = mintId(kind);
  const name = path.basename(abs);
  const entry = { id, kind, abs_path: abs, name, is_root: Boolean(isRoot) };
  grants.entries[id] = entry;
  if (isRoot && kind === "directory") {
    grants.roots = grants.roots.filter((r) => r.abs_path !== abs);
    grants.roots.push({ id, name, abs_path: abs });
  }
  saveGrants(root, grants);
  return entry;
}

function resolveOpaque(root, refId) {
  const grants = loadGrants(root);
  const entry = grants.entries[refId];
  if (entry?.abs_path && fs.existsSync(entry.abs_path)) return entry;
  const rootHit = grants.roots.find((r) => r.id === refId);
  if (rootHit?.abs_path && fs.existsSync(rootHit.abs_path)) {
    return {
      id: rootHit.id,
      kind: "directory",
      abs_path: rootHit.abs_path,
      name: rootHit.name,
      is_root: true,
    };
  }
  return null;
}

function isUnderGranted(root, absPath) {
  const grants = loadGrants(root);
  const abs = path.resolve(absPath);
  for (const r of grants.roots) {
    const base = path.resolve(r.abs_path);
    if (abs === base || abs.startsWith(base + path.sep)) return true;
  }
  for (const e of Object.values(grants.entries)) {
    if (path.resolve(e.abs_path) === abs) return true;
  }
  return false;
}

function toEntryFromAbs(abs, kind) {
  const name = path.basename(abs);
  const mime = kind === "file" ? guessMime(name) : undefined;
  let bytes;
  let mtime;
  try {
    const st = fs.statSync(abs);
    bytes = st.isFile() ? st.size : undefined;
    mtime = st.mtime?.toISOString?.();
  } catch {
    /* ignore */
  }
  return {
    name,
    kind: kind === "directory" ? "directory" : "file",
    mime,
    bytes,
    mtime,
    contentKind: kind === "file" ? contentKind(mime, name) : undefined,
  };
}

function toEntry(item) {
  const name = path.basename(item.path);
  const mime = item.kind === "file" ? guessMime(name) : undefined;
  return {
    ref: item.path,
    name,
    kind: item.kind === "directory" ? "directory" : "file",
    mime,
    bytes: item.size,
    mtime: item.mtime ? new Date(item.mtime).toISOString() : undefined,
    contentKind: item.kind === "file" ? contentKind(mime, name) : undefined,
  };
}

async function main() {
  const req = await readStdin();
  const op = String(req.op || "").trim();
  const cwd = String(req.cwd || process.cwd());
  const root = findProjectRoot(cwd);
  const libraryRel = String(req.library || "content-library").replace(/^\/+/, "");
  const libraryAbs = path.join(root, ".agentsam", libraryRel);
  fs.mkdirSync(libraryAbs, { recursive: true });

  const fsApi = createLocalFilesystem(root);
  const agentsamd = probeAgentsamd(req.agentsamd_listen || AGENTSAMD_LISTEN);

  if (op === "status") {
    return ok({
      status: "available",
      availability: "available",
      root,
      library: libraryAbs,
      machineId: `host_${os.hostname().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48)}`,
      label: agentsamd.ok
        ? "Local Studio · browser/dev FS bridge + agentsamd"
        : "Local Studio · browser/dev FS bridge",
      watchSupported: false,
      processSupported: Boolean(agentsamd.ok),
      nativeFs: false,
      requiresNode: true,
      browserDevBridge: true,
      agentsamd: {
        ok: agentsamd.ok,
        listen: AGENTSAMD_LISTEN,
        version: agentsamd.version || null,
      },
    });
  }

  if (op === "grant_directory") {
    const abs = String(req.abs_path || req.path || "").trim();
    if (!abs) throw new Error("abs_path_required");
    if (!path.isAbsolute(abs)) throw new Error("abs_path_must_be_absolute");
    const entry = registerGrant(root, abs, "directory", { isRoot: true });
    return ok({
      ref: entry.id,
      name: entry.name,
      kind: "directory",
      copied: false,
    });
  }

  if (op === "grant_file") {
    const abs = String(req.abs_path || req.path || "").trim();
    if (!abs) throw new Error("abs_path_required");
    if (!path.isAbsolute(abs)) throw new Error("abs_path_must_be_absolute");
    const entry = registerGrant(root, abs, "file", { isRoot: false });
    return ok({
      ref: entry.id,
      name: entry.name,
      kind: "file",
      copied: false,
    });
  }

  if (op === "list") {
    const key = String(req.path || req.ref || "");
    // Empty / "." → granted roots (not a fake fixed library path).
    if (!key || key === ".") {
      const grants = loadGrants(root);
      const entries = grants.roots.map((r) => ({
        ref: r.id,
        ...toEntryFromAbs(r.abs_path, "directory"),
      }));
      if (fs.existsSync(libraryAbs)) {
        entries.push({
          ref: `.agentsam/${libraryRel}`,
          name: libraryRel,
          kind: "directory",
        });
      }
      return ok({ entries, path: "grants" });
    }

    const opaque = resolveOpaque(root, key);
    if (opaque) {
      const names = fs.readdirSync(opaque.abs_path);
      const entries = [];
      for (const name of names) {
        if (name === "." || name === "..") continue;
        const childAbs = path.join(opaque.abs_path, name);
        let st;
        try {
          st = fs.statSync(childAbs);
        } catch {
          continue;
        }
        const kind = st.isDirectory() ? "directory" : st.isFile() ? "file" : null;
        if (!kind) continue;
        const child = registerGrant(root, childAbs, kind, { isRoot: false });
        entries.push({
          ref: child.id,
          ...toEntryFromAbs(childAbs, kind),
        });
      }
      return ok({ entries, path: opaque.id });
    }

    const listed = fsApi.list(key, { recursive: Boolean(req.recursive), maxDepth: 4 });
    if (!listed.ok) throw new Error(listed.error || listed.code || "list_failed");
    return ok({
      entries: (listed.entries || [])
        .filter((e) => e.kind === "file" || e.kind === "directory")
        .map(toEntry),
      path: listed.path,
    });
  }

  if (op === "stat") {
    const key = String(req.ref || req.path || "");
    if (!key) throw new Error("ref_required");
    const opaque = resolveOpaque(root, key);
    if (opaque) {
      return ok({
        ref: opaque.id,
        ...toEntryFromAbs(opaque.abs_path, opaque.kind),
      });
    }
    const st = fsApi.stat(key);
    if (!st.ok) throw new Error(st.error || st.code || "stat_failed");
    const name = path.basename(st.path);
    const mime = st.kind === "file" ? guessMime(name) : undefined;
    return ok({
      ref: st.path,
      name,
      kind: st.kind === "directory" ? "directory" : "file",
      mime,
      bytes: st.size,
      mtime: st.mtime ? new Date(st.mtime).toISOString() : undefined,
    });
  }

  if (op === "read") {
    const key = String(req.ref || req.path || "");
    if (!key) throw new Error("ref_required");
    const opaque = resolveOpaque(root, key);
    let abs;
    let relHint;
    if (opaque) {
      if (opaque.kind === "directory") throw new Error("is_directory");
      abs = opaque.abs_path;
      relHint = opaque.id;
    } else {
      const gate = resolveContainedPath(root, key);
      if (!gate.ok) throw new Error(gate.error || gate.code || "path_escape");
      abs = gate.abs;
      relHint = gate.rel;
    }
    const st = fs.statSync(abs);
    if (st.isDirectory()) throw new Error("is_directory");
    const maxBytes = Math.min(Number(req.maxBytes) || MAX_READ_BYTES, MAX_READ_BYTES);
    if (st.size > maxBytes) throw new Error(`file_too_large:${st.size}>${maxBytes}`);
    const buf = fs.readFileSync(abs);
    const name = path.basename(abs);
    return ok({
      ref: relHint,
      mime: guessMime(name),
      bytes: buf.byteLength,
      encoding: "base64",
      data: buf.toString("base64"),
    });
  }

  if (op === "materialize") {
    const key = String(req.ref || req.path || "");
    if (!key) throw new Error("ref_required");
    const opaque = resolveOpaque(root, key);
    if (opaque) {
      if (opaque.kind === "directory") throw new Error("is_directory");
      const st = fs.statSync(opaque.abs_path);
      return ok({
        ref: opaque.id,
        mime: guessMime(opaque.name),
        bytes: st.size,
        pathHint: opaque.id,
      });
    }
    const gate = resolveContainedPath(root, key);
    if (!gate.ok) throw new Error(gate.error || gate.code || "path_escape");
    const st = fs.statSync(gate.abs);
    if (st.isDirectory()) throw new Error("is_directory");
    const name = path.basename(gate.rel);
    return ok({
      ref: gate.rel,
      mime: guessMime(name),
      bytes: st.size,
      pathHint: gate.rel,
    });
  }

  if (op === "reveal") {
    const key = String(req.ref || req.path || "");
    if (!key) throw new Error("ref_required");
    const opaque = resolveOpaque(root, key);
    let abs;
    let revealed;
    if (opaque) {
      abs = opaque.abs_path;
      revealed = opaque.id;
    } else {
      const gate = resolveContainedPath(root, key);
      if (!gate.ok) throw new Error(gate.error || gate.code || "path_escape");
      abs = gate.abs;
      revealed = gate.rel;
    }
    if (process.platform === "darwin") {
      spawnSync("open", ["-R", abs], { stdio: "ignore" });
    } else if (process.platform === "win32") {
      spawnSync("explorer", ["/select,", abs], { stdio: "ignore" });
    } else {
      spawnSync("xdg-open", [path.dirname(abs)], { stdio: "ignore" });
    }
    return ok({ revealed });
  }

  if (op === "pick_probe") {
    return ok({
      pickSupported: true,
      nativePicker: false,
      note: "Browser/dev bridge — desktop uses native Rust picker; grant_directory for explicit roots",
      library: path.relative(root, libraryAbs) || ".agentsam/content-library",
    });
  }

  if (op === "import_bytes") {
    const name = String(req.name || "upload.bin").replace(/[/\\]/g, "_");
    const encoding = String(req.encoding || "base64");
    if (encoding !== "base64") throw new Error("encoding_must_be_base64");
    const buf = Buffer.from(String(req.data || ""), "base64");
    if (!buf.byteLength) throw new Error("empty_bytes");
    if (buf.byteLength > MAX_READ_BYTES) throw new Error("file_too_large");
    const destRel = path.join(".agentsam", libraryRel, name);
    const gate = resolveContainedPath(root, destRel);
    if (!gate.ok) throw new Error(gate.error || "path_escape");
    fs.mkdirSync(path.dirname(gate.abs), { recursive: true });
    fs.writeFileSync(gate.abs, buf);
    const mime = guessMime(name);
    return ok({
      ref: gate.rel,
      name,
      mime,
      bytes: buf.byteLength,
      contentKind: contentKind(mime, name),
      browserImport: Boolean(req.browserImport),
      copied: true,
    });
  }

  if (op === "import_to_library") {
    const key = String(req.ref || "");
    if (!key) throw new Error("ref_required");
    const opaque = resolveOpaque(root, key);
    if (!opaque) throw new Error("unknown_ref");
    if (opaque.kind !== "file") throw new Error("import_requires_file");
    if (!isUnderGranted(root, opaque.abs_path) && !opaque.abs_path) {
      throw new Error("path_not_in_granted_root");
    }
    const destName = opaque.name.replace(/[/\\]/g, "_");
    let destAbs = path.join(libraryAbs, destName);
    if (fs.existsSync(destAbs)) {
      const ext = path.extname(destName);
      const stem = path.basename(destName, ext);
      destAbs = path.join(libraryAbs, `${stem}-${Date.now()}${ext}`);
    }
    fs.copyFileSync(opaque.abs_path, destAbs);
    const destRel = path.relative(root, destAbs);
    const mime = guessMime(path.basename(destAbs));
    return ok({
      ref: destRel,
      assetId: destRel,
      name: path.basename(destAbs),
      mime,
      bytes: fs.statSync(destAbs).size,
      contentKind: contentKind(mime, destAbs),
      copied: true,
    });
  }

  throw new Error(`unknown_op:${op || "missing"}`);
}

main().catch((error) => fail(error));
