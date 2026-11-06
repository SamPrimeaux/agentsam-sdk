import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENTSAM_DESIGN_WORKSPACE_CONTRACT,
  assertDesignWorkspaceOperation,
  DesignWorkspaceRegistry,
} from "../dist/index.js";

const scope = {
  contract: "agentsam.resource-scope.v2",
  accountId: "account-a",
  authUserId: "user-a",
  projectId: "project-a",
};
const snapshot = (overrides = {}) => ({
  contract: AGENTSAM_DESIGN_WORKSPACE_CONTRACT,
  resource: {
    id: "draft-1",
    kind: "cad",
    appId: "cad-creator",
    title: "Floor Plan",
    href: "/cad/draft-1/workspace",
    accountId: "account-a",
    projectId: "project-a",
  },
  capabilities: ["open", "select", "inspect", "modify", "save", "preview"],
  revision: "rev-2",
  savedRevision: "rev-1",
  dirty: true,
  selection: [],
  status: "ready",
  ...overrides,
});
const operation = (overrides = {}) => ({
  id: "op-1",
  kind: "modify",
  resourceId: "draft-1",
  expectedRevision: "rev-2",
  payload: { dimension: 42 },
  ...overrides,
});

test("selection and revisions are editor-neutral, authorization remains account-scoped", () => {
  assert.doesNotThrow(() =>
    assertDesignWorkspaceOperation(snapshot(), scope, operation()),
  );
  assert.throws(
    () =>
      assertDesignWorkspaceOperation(
        snapshot(),
        { ...scope, accountId: "other" },
        operation(),
      ),
    /design_resource_forbidden/,
  );
  assert.throws(
    () =>
      assertDesignWorkspaceOperation(
        snapshot(),
        { ...scope, projectId: "other" },
        operation(),
      ),
    /design_project_scope_mismatch/,
  );
  assert.throws(
    () =>
      assertDesignWorkspaceOperation(
        snapshot(),
        scope,
        operation({ resourceId: "another" }),
      ),
    /design_operation_resource_mismatch/,
  );
  assert.throws(
    () =>
      assertDesignWorkspaceOperation(
        snapshot({
          resource: {
            ...snapshot().resource,
            href: "https://untrusted.example",
          },
        }),
        scope,
        operation(),
      ),
    /design_resource_href_invalid/,
  );
});

test("preflight rejects absent capabilities, read-only mutation, and stale edits", () => {
  assert.throws(
    () =>
      assertDesignWorkspaceOperation(
        snapshot(),
        scope,
        operation({ kind: "publish" }),
      ),
    /design_capability_unavailable/,
  );
  assert.throws(
    () =>
      assertDesignWorkspaceOperation(
        snapshot({ capabilities: [...snapshot().capabilities, "publish"] }),
        scope,
        operation({ kind: "publish" }),
      ),
    /design_publish_requires_approval/,
  );
  assert.throws(
    () =>
      assertDesignWorkspaceOperation(
        snapshot({ status: "read-only" }),
        scope,
        operation(),
      ),
    /design_workspace_read_only/,
  );
  assert.throws(
    () =>
      assertDesignWorkspaceOperation(
        snapshot(),
        scope,
        operation({ expectedRevision: "rev-1" }),
      ),
    /design_revision_conflict/,
  );
  assert.doesNotThrow(() =>
    assertDesignWorkspaceOperation(
      snapshot(),
      scope,
      operation({ kind: "select", expectedRevision: undefined }),
    ),
  );
});

test("specialist registry delegates to the authoritative engine and does not render", async () => {
  const registry = new DesignWorkspaceRegistry();
  const calls = [];
  const cad = {
    kind: "cad",
    open: async (_scope, id) => {
      calls.push(["open", id]);
      return snapshot();
    },
    createDraft: async (_scope, request) => {
      calls.push(["create", request.idempotencyKey]);
      return snapshot();
    },
    execute: async (_scope, op) => {
      calls.push(["execute", op.id]);
      return {
        operationId: op.id,
        kind: op.kind,
        resourceId: op.resourceId,
        previousRevision: "rev-2",
        revision: "rev-3",
        status: "applied",
      };
    },
  };
  const unregister = registry.register(cad);
  assert.equal(registry.supports("cad"), true);
  assert.deepEqual(registry.kinds(), ["cad"]);
  assert.throws(() => registry.register(cad), /already_registered/);
  await registry.open(scope, "cad", "draft-1");
  await assert.rejects(
    registry.open(scope, "cad", "different"),
    /design_open_resource_mismatch/,
  );
  await assert.rejects(
    registry.createDraft(scope, { kind: "cad", idempotencyKey: "" }),
    /design_create_idempotency_required/,
  );
  await assert.rejects(
    registry.createDraft(
      { ...scope, authUserId: "" },
      { kind: "cad", idempotencyKey: "blocked" },
    ),
    /authenticated_account_required/,
  );
  await assert.rejects(
    registry.createDraft(scope, {
      kind: "cad",
      idempotencyKey: "blocked",
      projectId: "another-project",
    }),
    /design_project_scope_mismatch/,
  );
  await registry.createDraft(scope, {
    kind: "cad",
    idempotencyKey: "create-1",
  });
  const receipt = await registry.execute(scope, snapshot(), operation());
  assert.equal(receipt.revision, "rev-3");
  assert.deepEqual(calls, [
    ["open", "draft-1"],
    ["open", "different"],
    ["create", "create-1"],
    ["execute", "op-1"],
  ]);
  assert.equal("render" in cad, false);
  unregister();
  assert.equal(registry.supports("cad"), false);
});

test("a hostile or broken adapter cannot return another account document or mismatched receipt", async () => {
  const registry = new DesignWorkspaceRegistry();
  registry.register({
    kind: "product",
    open: async () =>
      snapshot({
        resource: {
          ...snapshot().resource,
          kind: "product",
          accountId: "another-account",
        },
      }),
    execute: async () => ({
      operationId: "wrong",
      kind: "save",
      resourceId: "x",
      previousRevision: "a",
      revision: "b",
      status: "applied",
    }),
  });
  await assert.rejects(
    registry.open(scope, "product", "draft-1"),
    /design_resource_forbidden/,
  );
  const productSnapshot = snapshot({
    resource: { ...snapshot().resource, kind: "product" },
  });
  await assert.rejects(
    registry.execute(scope, productSnapshot, operation({ kind: "save" })),
    /design_operation_receipt_mismatch/,
  );
});
