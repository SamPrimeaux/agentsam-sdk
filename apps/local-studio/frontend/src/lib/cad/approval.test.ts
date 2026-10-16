import assert from "node:assert/strict";
import { test } from "node:test";
import { approveCadProposal, isLocalCadExecutionHost, validateCadApproval } from "./approval.ts";

const selection = {
  source: "cad-creator" as const, workspace: "model", project_id: "villa", revision: 6,
  object: { id: "wall-10", label: "North Wall", type: "wall", units: "in" as const },
};
const proposal = {
  tool: "design_apply_operation" as const, summary: "Move north wall",
  args: { project_id: "villa", expected_revision: 6, operation: { type: "move_element", id: "wall-10", x: 8 } },
};

test("CAD approval validates selected project/revision and never trusts guest revision authority", () => {
  assert.equal(validateCadApproval(proposal, selection).expected_revision, 6);
  assert.throws(() => validateCadApproval({ ...proposal, args: { ...proposal.args, expected_revision: 5 } }, selection), /revision_or_shape_mismatch/);
  assert.throws(() => validateCadApproval({ ...proposal, args: { ...proposal.args, project_id: "other" } }, selection), /revision_or_shape_mismatch/);
  assert.throws(() => validateCadApproval(proposal, null), /selection_required/);
});

test("CAD proposal writes require explicit local approval and one revisioned tool request", async () => {
  assert.equal(isLocalCadExecutionHost("agentsam.inneranimalmedia.com"), false);
  assert.equal(isLocalCadExecutionHost("127.0.0.1"), true);
  let called = 0;
  const fakeFetch = async (url: string, init?: RequestInit) => {
    called++;
    assert.equal(url, "/api/cad/project/tools/design_apply_operation");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      project_id: "villa", expected_revision: 6, operation: proposal.args.operation,
    });
    return new Response(JSON.stringify({ ok: true, result: { revision: 7 } }), { status: 200 });
  };
  await assert.rejects(approveCadProposal(proposal, selection, "agentsam.inneranimalmedia.com", fakeFetch as typeof fetch), /cad_local_execution_required/);
  assert.equal(called, 0);
  assert.deepEqual(await approveCadProposal(proposal, selection, "localhost", fakeFetch as typeof fetch), { revision: 7 });
  assert.equal(called, 1);
});

test("CAD revision conflicts fail and cannot be reported as committed edits", async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ ok: false, error: "revision_conflict" }), { status: 409 });
  await assert.rejects(approveCadProposal(proposal, selection, "localhost", fakeFetch as typeof fetch), /revision_conflict/);
});
