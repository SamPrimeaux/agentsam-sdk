import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestFile = path.resolve(here, "../../protocol/governance/github-labels.v1.json");
export const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
export const labelNames = new Set(manifest.labels.map((label) => label.name));

export function validateLabelManifest(source = manifest) {
  if (source.schema !== "agentsam.github-labels.v1") throw new Error("github_labels_schema_invalid");
  const seen = new Set();
  for (const item of source.labels) {
    if (!/^[0-9a-f]{6}$/i.test(item.color)) throw new Error(`github_label_color_invalid:${item.name}`);
    if (!item.name || seen.has(item.name.toLowerCase())) throw new Error(`github_label_duplicate:${item.name}`);
    if (!item.description || item.description.length > 100) throw new Error(`github_label_description_invalid:${item.name}`);
    seen.add(item.name.toLowerCase());
  }
  for (const prefix of source.managedPrefixes) {
    if (!source.labels.some((item) => item.name.startsWith(prefix))) throw new Error(`github_label_prefix_empty:${prefix}`);
  }
  return source.labels.length;
}

export function inferScope(paths) {
  const found = new Set();
  for (const value of paths) {
    const p = String(value).replaceAll("\\", "/");
    let scope = null;
    if (/^apps\/local-studio\/desktop-shell\//.test(p)) scope = "desktop";
    else if (/^apps\/local-studio\/frontend\//.test(p)) scope = "frontend";
    else if (/^apps\/local-studio\/backend\//.test(p)) scope = "backend";
    else if (/^apps\/local-studio\//.test(p)) scope = "desktop";
    else if (/^apps\/agentsam-go-worker\//.test(p)) scope = "daemon";
    else if (/^(apps\/agentsam-copro-studio\/|packages\/copro-)/.test(p)) scope = "media";
    else if (/^(apps\/cad-creator\/|services\/cad\/)/.test(p)) scope = "cad";
    else if (/^apps\/ecommerce-cms-agentsam\//.test(p)) scope = "ecommerce";
    else if (/^packages\/agentsam-work\//.test(p)) scope = "work";
    else if (/^(scripts\/(build-sea|install|release-|verify-go-distribution)|\.github\/workflows\/publish-stable)/.test(p)) scope = "release";
    else if (/^src\/commands\/|^bin\//.test(p)) scope = "cli";
    else if (/^src\/sam\/|^protocol\/|^packages\//.test(p)) scope = "sdk";
    else if (/^docs\//.test(p)) scope = "docs";
    else if (/^(\.github\/|scripts\/github\/)/.test(p)) scope = "infra";
    if (scope) found.add(`scope: ${scope}`);
  }
  // Cross-component work needs a human choice. Never silently guess ownership.
  return found.size === 1 ? [...found][0] : null;
}

export function labelsForIssueOpen(existing = []) {
  return existing.some((label) => label.startsWith("status:"))
    ? [] : ["status: needs-triage"];
}

export function labelsForPullRequest(paths, existing = []) {
  if (existing.some((label) => label.startsWith("scope:"))) return [];
  const inferred = inferScope(paths);
  return inferred && labelNames.has(inferred) ? [inferred] : [];
}
