/**
 * Shared proposal contract for graduating an editable Canvas/visual review to
 * an AgentSam coding agent. This describes the task but does not start a run.
 * The authorized host owns task creation, execution, and status streaming.
 */
export interface AgentSamCanvasHandoff {
  schema: "agentsam.canvas.handoff.v1";
  createdAt: string;
  target: {
    board: string;
    page: string;
    owner: string;
    source: string;
    url: string;
  };
  document: unknown;
  threads: Array<{
    id: string;
    boardId: string;
    nodeId: string;
    replies: Array<{body: string; at: string}>;
    resolved: boolean;
  }>;
  review: {
    verdict?: "keep" | "refine" | "repair" | "retire";
    note?: string;
  };
  instructions: string[];
}
/** Do not report a submitted task as started without an authorized run receipt. */
export interface AgentSamCanvasHandoffReceipt {
  taskId: string;
  status: "queued" | "running";
  statusUrl?: string;
}
export function isAgentSamCanvasHandoffReceipt(
  value: unknown,
): value is AgentSamCanvasHandoffReceipt {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.taskId === "string" && v.taskId.length > 0 &&
    (v.status === "queued" || v.status === "running") &&
    (v.statusUrl === undefined || typeof v.statusUrl === "string");
}
