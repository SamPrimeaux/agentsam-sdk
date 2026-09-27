/**
 * Origin + lifecycle. Views are computed over this metadata —
 * assets are never physically moved between folders.
 */

export type ContentOrigin =
  | "upload"
  | "generated"
  | "cms-import"
  | "provider-sync"
  | "brand-pack"
  | "product"
  | "site-crawl"
  | "agent-created";

export type ContentState =
  | "draft"
  | "review"
  | "approved"
  | "live"
  | "archived"
  | "rejected"
  | "superseded";

/**
 * Legal lifecycle transitions:
 *
 *   generated → draft → review → rejected
 *                          └───→ approved → live → superseded
 */
export const CONTENT_STATE_TRANSITIONS: Record<ContentState, ContentState[]> = {
  draft: ["review", "archived"],
  review: ["approved", "rejected", "draft"],
  approved: ["live", "review", "archived", "superseded"],
  live: ["superseded", "archived", "approved"],
  rejected: ["draft", "archived"],
  superseded: ["archived", "review"],
  archived: ["draft", "review"],
};

export function canTransition(from: ContentState, to: ContentState): boolean {
  return (CONTENT_STATE_TRANSITIONS[from] ?? []).includes(to);
}

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: ContentState,
    public readonly to: ContentState,
  ) {
    super(`Illegal content state transition: ${from} → ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function assertTransition(from: ContentState, to: ContentState): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}
