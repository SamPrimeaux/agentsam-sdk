/**
 * R2 list / put helpers for FNF asset pipelines (CLI + scripts).
 * Uses Cloudflare API for list; wrangler for put (auth via with-cf-admin-env).
 */
import { spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { assetStorage } from "./config.js";

function apiToken() {
  return process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || "";
}

/**
 * @param {string} prefix
 * @returns {Promise<Array<{key:string,size:number,uploaded?:string}>>}
 */
export async function listR2Objects(prefix) {
  const tok = apiToken();
  if (!tok) throw new Error("CLOUDFLARE_API_TOKEN (or CF_API_TOKEN) required");
  const out = [];
  let cursor = "";
  for (;;) {
    const url = new URL(
      `https://api.cloudflare.com/client/v4/accounts/${assetStorage().accountId}/r2/buckets/${assetStorage().bucket}/objects`,
    );
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("per_page", "1000");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
    const body = await res.json();
    if (!body.success) throw new Error(`R2 list failed: ${JSON.stringify(body.errors || body)}`);
    const rows = Array.isArray(body.result) ? body.result : body.result?.objects || [];
    out.push(...rows.map((o) => ({ key: o.key, size: Number(o.size || 0), uploaded: o.uploaded })));
    cursor = body.result_info?.cursor || body.result?.cursor || "";
    if (!cursor || rows.length === 0) break;
  }
  return out;
}

/** Download via verified Worker /media path. */
export async function downloadObjectToFile(key, destPath) {
  const url = `${assetStorage().workerMediaBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${key} → HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
  return destPath;
}

/**
 * @param {string} key
 * @param {string} filePath
 * @param {string} contentType
 * @param {Record<string,string>} [customMetadata]
 * @param {{ cwd?: string, dryRun?: boolean }} [opts]
 */
export function putObjectFromFile(key, filePath, contentType, customMetadata = {}, opts = {}) {
  if (opts.dryRun) return { ok: true, dry_run: true, key };
  const baseArgs = [
    "wrangler",
    "r2",
    "object",
    "put",
    `${assetStorage().bucket}/${key}`,
    "--file",
    filePath,
    "--content-type",
    contentType,
    "--remote",
  ];
  const tryPut = (args) =>
    spawnSync("npx", args, {
      cwd: opts.cwd || process.cwd(),
      encoding: "utf8",
      env: process.env,
    });

  let args = [...baseArgs];
  if (customMetadata && Object.keys(customMetadata).length) {
    args.push("--custom-metadata", JSON.stringify(customMetadata));
  }
  let r = tryPut(args);
  if (r.status !== 0 && String(r.stderr || r.stdout || "").match(/custom-metadata|Unknown argument/i)) {
    r = tryPut(baseArgs);
    if (r.status !== 0) throw new Error(`wrangler put ${key}: ${r.stderr || r.stdout}`);
    return { ok: true, key, metadata_deferred: customMetadata };
  }
  if (r.status !== 0) throw new Error(`wrangler put ${key}: ${r.stderr || r.stdout}`);
  return { ok: true, key, metadata: customMetadata };
}

/**
 * Delete an R2 object (intake cleanup after successful promote).
 * @param {string} key
 * @param {{ cwd?: string, dryRun?: boolean }} [opts]
 */
export function deleteR2Object(key, opts = {}) {
  const clean = String(key || "").replace(/^\/+/, "");
  if (!clean) throw new Error("deleteR2Object: key required");
  if (opts.dryRun) return { ok: true, dry_run: true, key: clean };
  const r = spawnSync(
    "npx",
    ["wrangler", "r2", "object", "delete", `${assetStorage().bucket}/${clean}`, "--remote"],
    {
      cwd: opts.cwd || process.cwd(),
      encoding: "utf8",
      env: process.env,
    },
  );
  if (r.status !== 0) throw new Error(`wrangler delete ${clean}: ${r.stderr || r.stdout}`);
  return { ok: true, key: clean, deleted: true };
}
