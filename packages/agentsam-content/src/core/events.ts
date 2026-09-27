import type { ContentAsset } from "./asset.js";
import type { ActorRef } from "./actor.js";
import type { ContentState } from "./origin.js";

/** Normalized lifecycle event taxonomy. */
export type ContentEventType =
  | "content.asset.discovered"
  | "content.asset.imported"
  | "content.asset.generated"
  | "content.asset.created"
  | "content.asset.optimized"
  | "content.asset.tagged"
  | "content.asset.edited"
  | "content.asset.rated"
  | "content.asset.used"
  | "content.asset.unused"
  | "content.asset.published"
  | "content.asset.state-changed"
  | "content.asset.variant-added"
  | "content.asset.superseded"
  | "content.asset.deleted";

export interface ContentEvent<T = Record<string, unknown>> {
  id: string;
  type: ContentEventType;
  at: string;
  accountId: string;
  assetId: string;
  actor: ActorRef;
  data: T;
}

export interface StateChangedData {
  from: ContentState;
  to: ContentState;
  [key: string]: unknown;
}

export type ContentEventListener = (event: ContentEvent) => void | Promise<void>;

export interface ContentEventBus {
  emit(event: ContentEvent): void;
  on(type: ContentEventType | "*", listener: ContentEventListener): () => void;
  history(filter?: { assetId?: string; type?: ContentEventType }): ContentEvent[];
}

export function eventForAsset(
  type: ContentEventType,
  asset: Pick<ContentAsset, "id" | "accountId">,
  actor: ActorRef,
  data: Record<string, unknown> = {},
): ContentEvent {
  return {
    id: `evt_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
    type,
    at: new Date().toISOString(),
    accountId: asset.accountId,
    assetId: asset.id,
    actor,
    data,
  };
}
