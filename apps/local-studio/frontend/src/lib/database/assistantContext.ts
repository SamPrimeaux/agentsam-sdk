/**
 * Bridge between DatabaseEditor Ask AgentSam and SideStage CoworkerChat.
 * Events can fire before the chat tab mounts — buffer the latest context.
 */

export type DatabaseAssistantContextPayload = Record<string, unknown>;

let pending: DatabaseAssistantContextPayload | null = null;

export function publishDatabaseAssistantContext(ctx: DatabaseAssistantContextPayload) {
  pending = ctx;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("agentsam:database-assistant-context", { detail: ctx }),
    );
  }
}

export function consumePendingDatabaseAssistantContext(): DatabaseAssistantContextPayload | null {
  const next = pending;
  pending = null;
  return next;
}

export function peekPendingDatabaseAssistantContext(): DatabaseAssistantContextPayload | null {
  return pending;
}
