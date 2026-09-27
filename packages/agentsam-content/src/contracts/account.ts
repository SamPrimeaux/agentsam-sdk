/**
 * Account / actor boundary for ContentRuntime.
 * Auth/session resolves these; Content never invents identity.
 */

import type { ActorRef } from "../core/actor.js";

export interface ContentAccount {
  id: string;
  label?: string;
}

/**
 * Fully resolved host actor. Prefer this over bare ActorRef for new hosts.
 * Legacy `identity: ActorRef` remains accepted during migration.
 */
export interface ContentActor {
  accountId: string;
  authUserId?: string;
  actorId?: string;
  actorType: ActorRef["type"];
  /** Back-compat projection into existing ActorRef fields. */
  ref?: string;
}

export function actorRefFromContentActor(actor: ContentActor): ActorRef {
  return {
    type: actor.actorType,
    ref: actor.ref ?? actor.actorId ?? actor.authUserId,
  };
}

export function assertAccountScoped(accountId: string, assetAccountId: string): void {
  if (!accountId || accountId !== assetAccountId) {
    throw new Error(`account_scope_violation: expected ${accountId}, got ${assetAccountId}`);
  }
}
