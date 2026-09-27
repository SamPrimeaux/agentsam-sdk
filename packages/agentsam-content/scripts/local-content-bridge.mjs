#!/usr/bin/env node
/**
 * Local-runtime content FS bridge for Local Studio → LocalContentHost.
 * Reads one JSON request from stdin, writes one JSON response to stdout.
 * Never used from Workers / browsers — Node + contained FS only.
 *
 * Ops: status | list | stat | read | materialize | reveal | pick_probe
 *
 * Paths stay machine-local; responses expose opaque relative refs only.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

/**
 * Opaque ref = relative path under authorized root (never absolute to remote).
 * Frontend maps these as LocalFileRef strings.
 */
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
      label: agentsamd.ok ? "Local Studio · agentsamd + FS" : "Local Studio · FS bridge",
      watchSupported: false,
      processSupported: Boolean(agentsamd.ok),
      agentsamd: {
        ok: agentsamd.ok,
        listen: AGENTSAMD_LISTEN,
        version: agentsamd.version || null,
      },
    });
  }

  if (op === "list") {
    const rel = String(req.path || req.ref || ".agentsam/" + libraryRel);
    const listed = fsApi.list(rel, { recursive: Boolean(req.recursive), maxDepth: 4 });
    if (!listed.ok) throw new Error(listed.error || listed.code || "list_failed");
    return ok({
      entries: (listed.entries || [])
        .filter((e) => e.kind === "file" || e.kind === "directory")
        .map(toEntry),
      path: listed.path,
    });
  }

  if (op === "stat") {
    const rel = String(req.ref || req.path || "");
    if (!rel) throw new Error("ref_required");
    const st = fsApi.stat(rel);
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
    const rel = String(req.ref || req.path || "");
    if (!rel) throw new Error("ref_required");
    const gate = resolveContainedPath(root, rel);
    if (!gate.ok) throw new Error(gate.error || gate.code || "path_escape");
    const st = fs.statSync(gate.abs);
    if (st.isDirectory()) throw new Error("is_directory");
    const maxBytes = Math.min(Number(req.maxBytes) || MAX_READ_BYTES, MAX_READ_BYTES);
    if (st.size > maxBytes) throw new Error(`file_too_large:${st.size}>${maxBytes}`);
    const buf = fs.readFileSync(gate.abs);
    const name = path.basename(gate.rel);
    return ok({
      ref: gate.rel,
      mime: guessMime(name),
      bytes: buf.byteLength,
      encoding: "base64",
      data: buf.toString("base64"),
    });
  }

  if (op === "materialize") {
    const rel = String(req.ref || req.path || "");
    if (!rel) throw new Error("ref_required");
    const gate = resolveContainedPath(root, rel);
    if (!gate.ok) throw new Error(gate.error || gate.code || "path_escape");
    const st = fs.statSync(gate.abs);
    if (st.isDirectory()) throw new Error("is_directory");
    const name = path.basename(gate.rel);
    return ok({
      ref: gate.rel,
      mime: guessMime(name),
      bytes: st.size,
      // Relative hint only — never absolute path for remote models.
      pathHint: gate.rel,
    });
  }

  if (op === "reveal") {
    const rel = String(req.ref || req.path || "");
    if (!rel) throw new Error("ref_required");
    const gate = resolveContainedPath(root, rel);
    if (!gate.ok) throw new Error(gate.error || gate.code || "path_escape");
    if (process.platform === "darwin") {
      spawnSync("open", ["-R", gate.abs], { stdio: "ignore" });
    } else if (process.platform === "win32") {
      spawnSync("explorer", ["/select,", gate.abs], { stdio: "ignore" });
    } else {
      spawnSync("xdg-open", [path.dirname(gate.abs)], { stdio: "ignore" });
    }
    return ok({ revealed: gate.rel });
  }

  if (op === "pick_probe") {
    return ok({
      pickSupported: true,
      note: "Host UI uses native file picker; bridge stores under .agentsam/content-library",
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
    });
  }

  throw new Error(`unknown_op:${op || "missing"}`);
}

main().catch((error) => fail(error));
