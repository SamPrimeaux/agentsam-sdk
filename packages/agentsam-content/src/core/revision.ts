import type { ActorRef } from "./actor.js";

/** Immutable record of an edit to an asset's metadata or bytes. */
export interface ContentRevision {
  id: string;
  assetId: string;
  at: string;
  actor: ActorRef;
  /** Field-level diff for metadata edits. */
  changes: Record<string, { from: unknown; to: unknown }>;
  note?: string;
}

export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    const b = before[key];
    const a = after[key];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes[key] = { from: b, to: a };
    }
  }
  return changes;
}
