import type { ContentAsset } from "../core/asset.js";
import { auditAlt } from "./alt.js";
import { evaluateDeleteSafety } from "../core/usage.js";
import { bestDeliveryVariant } from "../core/variant.js";

export interface Recommendation {
  id: string;
  severity: "info" | "warn" | "action";
  message: string;
  action?:
    | "add-alt"
    | "rename-semantic"
    | "optimize"
    | "review"
    | "archive"
    | "dedupe"
    | "add-poster"
    | "tag";
}

/** Rule-based recommendations from machine facts + lifecycle + usage. */
export function recommend(asset: ContentAsset, now = new Date()): Recommendation[] {
  const recs: Recommendation[] = [];

  const alt = auditAlt(asset);
  if (!alt.ok) {
    recs.push({
      id: "alt",
      severity: asset.state === "live" ? "action" : "warn",
      message: alt.issues.join(" "),
      action: "add-alt",
    });
  }

  if (!asset.semanticAlias) {
    recs.push({
      id: "semantic-name",
      severity: "info",
      message: `No semantic alias — delivery still uses "${asset.filename ?? asset.id}".`,
      action: "rename-semantic",
    });
  }

  const heavy = asset.kind === "image" && (asset.bytes ?? 0) > 500_000;
  if (heavy && !bestDeliveryVariant(asset.variants)) {
    recs.push({
      id: "optimize",
      severity: "action",
      message: `${Math.round((asset.bytes ?? 0) / 1024)} KB source with no approved lighter derivative.`,
      action: "optimize",
    });
  }

  if (asset.kind === "video" && !asset.variants.some((v) => v.name === "poster")) {
    recs.push({
      id: "poster",
      severity: "warn",
      message: "Video has no poster — cards will instantiate players just to show a frame.",
      action: "add-poster",
    });
  }

  if (asset.state === "review") {
    recs.push({ id: "review", severity: "action", message: "Awaiting review.", action: "review" });
  }

  if (asset.intelligence?.machine?.duplicateOf) {
    recs.push({
      id: "duplicate",
      severity: "warn",
      message: `Byte-identical to ${asset.intelligence.machine.duplicateOf}.`,
      action: "dedupe",
    });
  }

  const safety = evaluateDeleteSafety(asset.usage, now);
  if (safety.safe && asset.state !== "archived" && asset.usage.length > 0 && safety.lastUsedAt) {
    const days = Math.floor((now.getTime() - new Date(safety.lastUsedAt).getTime()) / 86_400_000);
    if (days > 90) {
      recs.push({
        id: "stale",
        severity: "info",
        message: `Unused for ${days} days — candidate for archive.`,
        action: "archive",
      });
    }
  }

  if (asset.tags.length === 0) {
    recs.push({ id: "untagged", severity: "info", message: "No tags.", action: "tag" });
  }

  return recs;
}
