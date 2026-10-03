/**
 * Server-only: find existing R2 bindings in a project's Wrangler config.
 * Reads config shape only — never secrets, never the network.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  rankStorageCandidates,
  type ScoreHints,
  type StorageCandidate,
} from "../storage/roles.js";

const CONFIG_FILES = ["wrangler.jsonc", "wrangler.json", "wrangler.toml"];
const R2_CAPS: StorageCandidate["capabilities"] = ["list", "read", "write", "delete"];

interface RawR2 {
  binding?: string;
  bucket_name?: string;
}

function stripJsonc(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'\\])\/\/.*$/gm, "$1")
    .replace(/,(\s*[}\]])/g, "$1");
}

function parseJsonc(text: string): RawR2[] {
  const cfg = JSON.parse(stripJsonc(text)) as { r2_buckets?: RawR2[] };
  return (cfg.r2_buckets ?? []).map((b) => ({
    binding: (b as { binding?: string }).binding,
    bucket_name: b.bucket_name,
  }));
}

/** Minimal [[r2_buckets]] reader; avoids a TOML dependency. */
function parseToml(text: string): RawR2[] {
  const out: RawR2[] = [];
  let cur: RawR2 | null = null;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("[[")) {
      cur = t === "[[r2_buckets]]" ? {} : null;
      if (cur) out.push(cur);
      continue;
    }
    if (t.startsWith("[")) {
      cur = null;
      continue;
    }
    if (!cur) continue;
    const m = /^(binding|binding_name|bucket_name)\s*=\s*"([^"]+)"/.exec(t);
    if (!m) continue;
    if (m[1] === "bucket_name") cur.bucket_name = m[2];
    else cur.binding = m[2];
  }
  return out;
}

export interface DiscoverStorageOptions extends ScoreHints {
  cwd?: string;
  accountId?: string;
}

export function discoverStorageCandidates(opts: DiscoverStorageOptions = {}): StorageCandidate[] {
  const cwd = opts.cwd ?? process.cwd();
  const found: Array<Omit<StorageCandidate, "confidence">> = [];
  for (const file of CONFIG_FILES) {
    const path = join(cwd, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    const rows = file.endsWith(".toml") ? parseToml(text) : parseJsonc(text);
    for (const r of rows) {
      if (!r.binding && !r.bucket_name) continue;
      found.push({
        provider: "r2",
        binding: r.binding,
        bucket: r.bucket_name,
        accountId: opts.accountId,
        capabilities: R2_CAPS,
        source: file,
      });
    }
    break; // first config wins, matching Wrangler's own precedence
  }
  return rankStorageCandidates(found, opts);
}
