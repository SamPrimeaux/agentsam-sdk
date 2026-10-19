#!/usr/bin/env node
// Safe, additive synchronization of canonical labels. Never remove unrelated labels.
import { labelNames, manifest, validateLabelManifest } from "./label-policy.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
if (args.includes("--help")) {
  console.log("Usage: node scripts/github/sync-labels.mjs [--dry-run | --apply] [--repo owner/name]");
  process.exit(0);
}
if (args.includes("--apply") && args.includes("--dry-run")) throw new Error("github_labels_mode_conflict");
const repoAt = args.indexOf("--repo");
const repo = repoAt >= 0 ? args[repoAt+1] : process.env.GITHUB_REPOSITORY;
const validArgs = new Set(["--dry-run","--apply","--repo"]);
for (let index = 0; index < args.length; index++) {
  if (!validArgs.has(args[index])) throw new Error(`github_labels_unknown_arg:${args[index]}`);
  if (args[index] === "--repo") index++;
}
if (repoAt >= 0 && (!repo || repo.startsWith("--"))) throw new Error("github_labels_repo_required");
const count = validateLabelManifest();
if (!apply) {
  console.log(`GitHub label schema PASS: ${count} definitions. Dry-run: no API requests and no mutations.`);
  process.exit(0);
}
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo ?? "")) throw new Error("github_labels_repo_required");
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) throw new Error("github_labels_token_required");
const endpoint = `https://api.github.com/repos/${repo}/labels`;
async function request(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`github_labels_http_${response.status}:${method}`);
  return response.json();
}
const existing = new Map();
for (let page = 1;;page++) {
  const batch = await request("GET", `${endpoint}?per_page=100&page=${page}`);
  for (const value of batch) existing.set(value.name.toLowerCase(), value);
  if (batch.length < 100) break;
}
let created = 0, updated = 0, unchanged = 0;
for (const label of manifest.labels) {
  if (!labelNames.has(label.name)) throw new Error("github_labels_unexpected_item");
  const current = existing.get(label.name.toLowerCase());
  if (!current) {
    await request("POST", endpoint, label);
    created++;
  } else if (current.color.toLowerCase() !== label.color || (current.description ?? "") !== label.description) {
    // Existing labels may have been renamed by maintainers. Update metadata, not names.
    await request("PATCH", `${endpoint}/${encodeURIComponent(current.name)}`, {
      color: label.color,
      description: label.description,
    });
    updated++;
  } else unchanged++;
}
console.log(`GitHub labels ${repo}: created=${created} updated=${updated} unchanged=${unchanged}; deleted=0`);
