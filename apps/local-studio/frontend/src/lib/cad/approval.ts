import type { CadHostHandlers, CadSelectionContext } from "@/lib/cad-host-bridge";

export type CadProposal = Parameters<NonNullable<CadHostHandlers["onProposal"]>>[0];

export function isLocalCadExecutionHost(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname.toLowerCase());
}

/** The guest can request a write, but never choose its revision authority. */
export function validateCadApproval(proposal: CadProposal, selection: CadSelectionContext | null): Record<string, unknown> {
  if (!selection) throw new Error("cad_selection_required");
  const args = proposal.args;
  if (proposal.tool !== "design_apply_operation"
    || args.project_id !== selection.project_id
    || args.expected_revision !== selection.revision
    || !args.operation || typeof args.operation !== "object" || Array.isArray(args.operation)
    || typeof (args.operation as Record<string, unknown>).type !== "string") {
    throw new Error("cad_proposal_revision_or_shape_mismatch");
  }
  return {
    project_id: selection.project_id,
    expected_revision: selection.revision,
    operation: args.operation,
    ...(typeof args.message === "string" ? { message: args.message.slice(0, 2000) } : {}),
  };
}

export async function approveCadProposal(
  proposal: CadProposal,
  selection: CadSelectionContext | null,
  hostname: string,
  request: typeof fetch = fetch,
): Promise<unknown> {
  if (!isLocalCadExecutionHost(hostname)) throw new Error("cad_local_execution_required");
  const args = validateCadApproval(proposal, selection);
  const response = await request("/api/cad/project/tools/design_apply_operation", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const body = await response.json() as { ok?: boolean; result?: unknown; error?: string };
  if (!response.ok || body.ok !== true) throw new Error(body.error || "cad_revision_write_failed");
  return body.result;
}
