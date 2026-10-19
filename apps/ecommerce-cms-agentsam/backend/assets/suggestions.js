/**
 * Deterministic content-intelligence suggestions (no LLM).
 * Never overwrite human titles/alt — callers must apply accept/reject.
 */

import { classifyMediaAsset, extensionOf } from "./classify.js";

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "asset";
}

function humanize(value) {
  return String(value || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * @param {{
 *   r2Key: string,
 *   filename?: string|null,
 *   contentType?: string|null,
 *   bytes?: number|null,
 *   width?: number|null,
 *   height?: number|null,
 *   folder?: string|null,
 *   existing?: { title?: string|null, alt_text?: string|null, tags?: string[]|null }|null,
 *   brandName?: string|null,
 *   contentHash?: string|null,
 *   nearDuplicateKeys?: string[]|null,
 * }} input
 */
export function buildDeterministicSuggestions(input) {
  const key = String(input.r2Key || "").replace(/^\/+/, "");
  const filename = input.filename || key.split("/").pop() || "asset";
  const classification = classifyMediaAsset({
    r2Key: key,
    filename,
    contentType: input.contentType,
    bytes: input.bytes,
    width: input.width,
    height: input.height,
    folder: input.folder,
  });

  const stem = slugify(filename);
  const brand = input.brandName || "Fuel & Free Time";
  const title = humanize(stem);
  const role = classification.media_role;
  const alt =
    role === "logo"
      ? `${brand} logo`
      : role === "icon"
        ? `${brand} icon`
        : role === "glb"
          ? `${title} 3D model`
          : role === "video"
            ? `${title} video`
            : `${title} — ${brand}`;

  const tags = [
    classification.media_kind,
    role,
    classification.asset_role,
    input.folder,
  ].filter(Boolean);

  const existing = input.existing || {};
  const suggestions = {
    normalized_filename: `${stem}.${extensionOf(filename) || "bin"}`,
    slug: stem,
    title,
    alt_text: alt,
    tags,
    media_role: role,
    brand_relevance: {
      score: /\b(fuel|freetime|fft|fandft)\b/i.test(`${key} ${filename}`) ? "high" : "medium",
      brand,
    },
    product_associations: inferAssociations(key, filename),
    near_duplicates: Array.isArray(input.nearDuplicateKeys)
      ? input.nearDuplicateKeys.filter(Boolean)
      : [],
    content_hash: input.contentHash || null,
    classification,
  };

  return {
    suggestions,
    /** Fields already set by a human — do not auto-apply. */
    protected_fields: {
      title: Boolean(existing.title && String(existing.title).trim()),
      alt_text: Boolean(existing.alt_text && String(existing.alt_text).trim()),
      tags: Array.isArray(existing.tags) && existing.tags.length > 0,
    },
    apply_policy: "review_required",
  };
}

function inferAssociations(key, filename) {
  const parts = String(key).split("/").filter(Boolean);
  const out = [];
  if (parts[0] === "products" && parts[1]) {
    out.push({ type: "product_folder", value: parts[1] });
  }
  const m = String(filename).match(/\b(tee|shirt|hat|tumbler|hoodie)\b/i);
  if (m) out.push({ type: "product_kind", value: m[1].toLowerCase() });
  return out;
}

/**
 * Merge accepted suggestion keys into existing human metadata without silent overwrite.
 * @param {Record<string, unknown>} current
 * @param {Record<string, unknown>} suggestionPayload
 * @param {string[]} acceptKeys
 */
export function applyAcceptedSuggestions(current, suggestionPayload, acceptKeys) {
  const next = { ...current };
  const suggestions = suggestionPayload?.suggestions || suggestionPayload || {};
  const protectedFields = suggestionPayload?.protected_fields || {};
  const accepted = [];
  const skipped = [];

  for (const key of acceptKeys || []) {
    if (protectedFields[key]) {
      skipped.push({ key, reason: "human_value_present" });
      continue;
    }
    if (suggestions[key] === undefined) {
      skipped.push({ key, reason: "unknown_suggestion" });
      continue;
    }
    next[key] = suggestions[key];
    accepted.push(key);
  }

  return { metadata: next, accepted, skipped };
}
