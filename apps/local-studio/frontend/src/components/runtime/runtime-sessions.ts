import type { StudioTerminalSession } from "@/lib/work/terminal-sessions";

/** Connected status must come from a live, provider-bound session, not a CLI probe or OAuth grant. */
export type RuntimeKind = "local" | "docker" | "gcp" | "cf-sandbox" | "cf-container";
export type RuntimeSessionEvidence = Pick<StudioTerminalSession, "state" | "lane" | "connectionId" | "instanceId" | "runtimeLabel">;

export function isConnectedRuntimeSession(id: RuntimeKind, session: RuntimeSessionEvidence): boolean {
  if (session.state !== "connected") return false;
  if (id === "local") return session.lane === "local";
  const source = [session.runtimeLabel, session.connectionId, session.instanceId].filter(Boolean).join(" ");
  if (id === "gcp") return session.lane === "remote" && /google|gcp|iam-tunnel/i.test(source);
  // A local CLI with Docker installed is not a running Docker container.
  if (id === "docker") return /^docker[:/-]/i.test(session.connectionId) || /^docker container\b/i.test(session.runtimeLabel || "");
  if (id === "cf-sandbox") return session.lane === "sandbox" && /sandbox/i.test(source);
  if (id === "cf-container") return session.lane === "sandbox" && /container/i.test(source);
  return false;
}
