import type { ContentAsset } from "../core/asset.js";

/**
 * Alt proposal: prefer semantic enrichment, fall back to deterministic
 * composition. Flag missing alt on live imagery as an accessibility issue.
 */
export function proposeAlt(asset: ContentAsset): string | undefined {
  const s = asset.intelligence?.semantic;
  if (s?.altProposal) return s.altProposal;
  if (s?.subject && s?.description) return `${s.subject} — ${s.description}`;
  if (s?.subject) return s.subject;
  if (asset.title) return asset.title;
  if (asset.caption) return asset.caption;
  return undefined;
}

export interface AltAudit {
  ok: boolean;
  issues: string[];
}

export function auditAlt(asset: ContentAsset): AltAudit {
  const issues: string[] = [];
  if (asset.kind !== "image") return { ok: true, issues };
  if (!asset.alt || asset.alt.trim().length === 0) {
    issues.push(asset.state === "live" ? "Live image with no alt text." : "Missing alt text.");
  } else {
    if (asset.alt.length > 160) issues.push("Alt text longer than 160 characters.");
    if (/^(image|photo|picture) of/i.test(asset.alt)) {
      issues.push('Alt starts with redundant "image of/photo of".');
    }
    if (asset.filename && asset.alt.trim() === asset.filename) {
      issues.push("Alt text is just the filename.");
    }
  }
  return { ok: issues.length === 0, issues };
}
