/**
 * Host-neutral GoalGuru contract. Goal data belongs to the signed-in account.
 * No authority comes from a browser session, conversation, app or workspace.
 */
export type GoalGuruGoal = {
  id: string; source_key: string | null; title: string | null; description: string | null;
  goal_type: "personal" | "platform" | string; status: string; priority: number;
};
export type GoalGuruStep = {
  id: string; goal_id: string; title: string; status: string;
  note?: string | null; evidence_ref?: string | null;
};
export type GoalGuruTicketLink = {
  goal_id: string; ticket_id: string; title: string; status: string; project?: string | null;
};
/** Receives paths relative to GoalGuru API root, e.g. /goals or /steps/:id. */
export type GoalGuruTransport = (path: string, init?: RequestInit) => Promise<Response>;
/** Host provides the actual transport, including its own credentials and authorization. */
export function createGoalGuruHttpTransport(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
): GoalGuruTransport {
  const base = baseUrl.replace(/\/$/, "");
  if (!base.startsWith("/")) throw new Error("goalguru_same_origin_base_required");
  return (path, init) => {
    if (!path.startsWith("/") || path.startsWith("//") || path.includes(".."))
      throw new Error("goalguru_invalid_path");
    return fetcher(base + (path === "/" ? "" : path), { credentials: "same-origin", ...init });
  };
}
