import type { ActorRef } from "../core/actor.js";

export type ContentPermission =
  | "content.read"
  | "content.upload"
  | "content.edit"
  | "content.review"
  | "content.publish"
  | "content.delete"
  | "content.generate"
  | "content.admin";

export interface PermissionPolicy {
  can(actor: ActorRef, permission: ContentPermission, context?: { assetId?: string }): boolean;
}

export const allowAll: PermissionPolicy = { can: () => true };

export function rolePolicy(
  roles: Record<string, ContentPermission[]>,
  actorRole: (actor: ActorRef) => string | undefined,
): PermissionPolicy {
  return {
    can(actor, permission) {
      const role = actorRole(actor);
      if (!role) return false;
      const grants = roles[role] ?? [];
      return grants.includes("content.admin") || grants.includes(permission);
    },
  };
}

export class PermissionDeniedError extends Error {
  constructor(permission: ContentPermission) {
    super(`Permission denied: ${permission}`);
    this.name = "PermissionDeniedError";
  }
}
