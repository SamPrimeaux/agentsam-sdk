/**
 * Usage is a first-class graph. An asset knows every surface that
 * references it, which makes "can I delete this?" answerable.
 */

export interface ContentUsage {
  /** Consuming application/site, e.g. "ember". */
  app: string;
  /** Surface path, e.g. "home.hero", "product.42.gallery". */
  surface: string;
  kind?: "page" | "product" | "campaign" | "email" | "embed" | (string & {});
  live: boolean;
  attachedAt?: string;
  detachedAt?: string;
}

export interface DeleteSafety {
  safe: boolean;
  liveReferences: ContentUsage[];
  totalReferences: number;
  lastUsedAt?: string;
  reason: string;
}

export function evaluateDeleteSafety(usage: ContentUsage[], now = new Date()): DeleteSafety {
  const live = usage.filter((u) => u.live && !u.detachedAt);
  const past = usage.filter((u) => !u.live || u.detachedAt);
  const lastUsedAt = past
    .map((u) => u.detachedAt ?? u.attachedAt)
    .filter((d): d is string => !!d)
    .sort()
    .pop();

  if (live.length > 0) {
    return {
      safe: false,
      liveReferences: live,
      totalReferences: usage.length,
      lastUsedAt,
      reason: `No. Used in ${live.length} live surface${live.length === 1 ? "" : "s"}.`,
    };
  }

  let reason = "Yes. No live references.";
  if (lastUsedAt) {
    const days = Math.floor((now.getTime() - new Date(lastUsedAt).getTime()) / 86_400_000);
    reason += ` Last used ${days} days ago.`;
  } else if (usage.length === 0) {
    reason += " Never referenced.";
  }
  return { safe: true, liveReferences: [], totalReferences: usage.length, lastUsedAt, reason };
}

export function usageKey(u: Pick<ContentUsage, "app" | "surface">): string {
  return `${u.app}::${u.surface}`;
}
