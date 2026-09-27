import type { ContentAsset } from "../core/asset.js";
import { auditAlt } from "./alt.js";

export interface SeoReport {
  score: number; // 0..100
  checks: Array<{ id: string; ok: boolean; detail: string }>;
}

const OPAQUE_NAME = /^([0-9a-f-]{20,}|IMG_\d+|DSC\d+|Screenshot.*|image\d*)$/i;

export function seoReport(asset: ContentAsset): SeoReport {
  const checks: SeoReport["checks"] = [];

  const baseName = (asset.deliveryAlias ?? asset.semanticAlias ?? asset.filename ?? "").replace(
    /\.[a-z0-9]+$/i,
    "",
  );
  const semanticName = baseName.length > 0 && !OPAQUE_NAME.test(baseName);
  checks.push({
    id: "filename",
    ok: semanticName,
    detail: semanticName
      ? `Delivery name "${baseName}" is semantic.`
      : `Delivery name "${baseName || "(none)"}" is opaque — propose a semantic alias.`,
  });

  if (asset.kind === "image") {
    const alt = auditAlt(asset);
    checks.push({
      id: "alt",
      ok: alt.ok,
      detail: alt.ok ? "Alt text present and sane." : alt.issues.join(" "),
    });
  }

  const hasCaption = !!asset.caption;
  checks.push({
    id: "caption",
    ok: hasCaption,
    detail: hasCaption ? "Caption present." : "No caption (optional).",
  });

  const heavyThreshold = asset.kind === "video" ? 50_000_000 : 400_000;
  const optimized =
    (asset.bytes ?? 0) <= heavyThreshold || asset.variants.some((v) => v.approved);
  checks.push({
    id: "weight",
    ok: optimized,
    detail: optimized
      ? "Delivery weight acceptable or optimized derivative exists."
      : `Source is ${Math.round((asset.bytes ?? 0) / 1024)} KB with no approved lighter derivative.`,
  });

  const ogReady = asset.variants.some((v) => v.name === "og" || v.name === "social");
  checks.push({
    id: "og",
    ok: ogReady,
    detail: ogReady ? "OG/social variant exists." : "No OG/social variant candidate.",
  });

  const okCount = checks.filter((c) => c.ok).length;
  return { score: Math.round((okCount / checks.length) * 100), checks };
}
