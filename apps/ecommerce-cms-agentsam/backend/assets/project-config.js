/**
 * CLI-side asset storage: read the project's own wrangler.toml, the same file the Worker
 * deploys from. Node only; never imported by the Worker.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Walk up from `start` to the directory that holds wrangler.toml. */
export function findProjectRoot(start = process.cwd()) {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "wrangler.toml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`No wrangler.toml found at or above ${start}`);
    dir = parent;
  }
}

function tomlString(toml, key) {
  return toml.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m"))?.[1] || null;
}

/** Pure parser so it can be tested without touching the filesystem. */
export function assetStorageFromWrangler(toml, { binding = "WEBSITE_ASSETS", env = process.env } = {}) {
  const bucket = [...toml.matchAll(/\[\[r2_buckets\]\]([^[]*)/g)]
    .map((m) => ({ binding: tomlString(m[1], "binding"), bucket: tomlString(m[1], "bucket_name") }))
    .find((b) => b.binding === binding)?.bucket;
  if (!bucket) throw new Error(`wrangler.toml has no [[r2_buckets]] with binding "${binding}"`);

  const route = [...toml.matchAll(/\[\[routes\]\]([^[]*)/g)]
    .map((m) => ({ pattern: tomlString(m[1], "pattern"), custom: /custom_domain\s*=\s*true/.test(m[1]) }))
    .find((r) => r.custom && r.pattern && !r.pattern.includes("*"));
  const allowed = tomlString(toml, "ALLOWED_ORIGINS")?.split(",").map((s) => s.trim()).find((s) => s.startsWith("https://"));
  const base = route ? `https://${route.pattern}` : allowed;
  if (!base) throw new Error("wrangler.toml has no custom_domain route or https ALLOWED_ORIGINS to serve /media from");

  return {
    binding,
    bucket,
    accountId: tomlString(toml, "CLOUDFLARE_ACCOUNT_ID") || tomlString(toml, "account_id") || env.CLOUDFLARE_ACCOUNT_ID || null,
    workerMediaBaseUrl: `${base}/media`,
    publicBaseUrl: tomlString(toml, "ASSET_PUBLIC_BASE_URL"),
    corsOrigins: (tomlString(toml, "ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean),
  };
}

export function assetStorageFromProject(root = findProjectRoot()) {
  return assetStorageFromWrangler(readFileSync(join(root, "wrangler.toml"), "utf8"));
}
