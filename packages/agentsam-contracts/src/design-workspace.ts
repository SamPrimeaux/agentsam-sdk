import type { AgentResourceScopeV2 } from "./resource-scope";

/**
 * This is a cross-product EDITING contract, not a universal Canvas renderer.
 * The host retains document authority, geometry, timeline, commerce, source,
 * storage, authorization, and publication. Never persist this snapshot as a
 * second product document.
 */
export const AGENTSAM_DESIGN_WORKSPACE_CONTRACT =
  "agentsam.design-workspace.v1" as const;

export type DesignDocumentKind =
  | "website"
  | "app-ui"
  | "design"
  | "cad"
  | "sketch"
  | "sculpt"
  | "product"
  | "collection"
  | "campaign"
  | "moodboard"
  | "movie"
  | (string & {});

export type DesignWorkspaceCapability =
  | "create"
  | "open"
  | "select"
  | "inspect"
  | "modify"
  | "preview"
  | "save"
  | "undo"
  | "redo"
  | "history"
  | "generate"
  | "export"
  | "publish"
  | (string & {});

/** Opaque identity; coordinates, layers, frames, tracks, and geometry stay in the engine. */
export interface DesignSelection {
  id: string;
  kind: string;
  parentId?: string;
}

export interface DesignResourceAddress {
  id: string;
  kind: DesignDocumentKind;
  appId: string;
  title: string;
  /** Deep link resolved by the existing host router; never an authorization source. */
  href: string;
  accountId: string;
  projectId?: string;
  siteId?: string;
}

export interface DesignWorkspaceSnapshot {
  contract: typeof AGENTSAM_DESIGN_WORKSPACE_CONTRACT;
  resource: DesignResourceAddress;
  capabilities: readonly DesignWorkspaceCapability[];
  revision: string;
  savedRevision: string | null;
  dirty: boolean;
  selection: readonly DesignSelection[];
  status: "ready" | "read-only" | "unavailable";
  /** The host owns any activity receipts; these are never synthetic progress. */
  activeRunId?: string;
}

/**
 * All mutating operations require the known revision to avoid stomping another
 * editor or agent. The host validates payload per action and object type.
 */
export interface DesignWorkspaceOperation {
  id: string;
  kind: DesignWorkspaceCapability;
  resourceId: string;
  expectedRevision?: string;
  /** Deliberate user approval; publication cannot be implied by create/save. */
  publicationApproval?: "explicit-user-action";
  selection?: readonly DesignSelection[];
  payload?: unknown;
}

export interface DesignWorkspaceReceipt {
  operationId: string;
  kind: DesignWorkspaceCapability;
  resourceId: string;
  previousRevision: string;
  revision: string;
  status: "applied" | "unchanged";
  /** Actual targets touched by the domain engine. */
  affected?: readonly DesignSelection[];
  message?: string;
}

export type DesignWorkspaceEvent =
  | {
      type: "selection";
      resourceId: string;
      selection: readonly DesignSelection[];
    }
  | {
      type: "revision";
      resourceId: string;
      revision: string;
      savedRevision: string | null;
      dirty: boolean;
    }
  | {
      type: "activity";
      resourceId: string;
      runId: string;
      operationId: string;
      phase: "started" | "completed" | "failed" | "canceled";
      target?: DesignSelection;
    }
  | {
      type: "failure";
      resourceId: string;
      operationId?: string;
      code: string;
      message: string;
    };

export interface DesignWorkspaceCreateRequest {
  kind: DesignDocumentKind;
  /** Idempotency is mandatory; the authority must atomically honor it. */
  idempotencyKey: string;
  projectId?: string;
  siteId?: string;
  initial?: unknown;
}

/**
 * A host adapter is injected by the owning product. Each method MUST enforce
 * server-side principal authorization and capability checks; these browser-
 * side checks are usability guardrails, not a security boundary.
 *
 * No render(), no generic object schema, no file/asset database, no implicit
 * publication, and no owner-account fallback are defined here.
 */
export interface DesignWorkspaceAdapter {
  readonly kind: DesignDocumentKind;
  open(
    scope: AgentResourceScopeV2,
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<DesignWorkspaceSnapshot>;
  createDraft?(
    scope: AgentResourceScopeV2,
    request: DesignWorkspaceCreateRequest,
    signal?: AbortSignal,
  ): Promise<DesignWorkspaceSnapshot>;
  execute(
    scope: AgentResourceScopeV2,
    operation: DesignWorkspaceOperation,
    signal?: AbortSignal,
  ): Promise<DesignWorkspaceReceipt>;
  subscribe?(
    resourceId: string,
    onEvent: (event: DesignWorkspaceEvent) => void,
  ): () => void;
}

const required = (value: string | undefined, code: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
};

export function assertDesignWorkspaceScope(
  snapshot: DesignWorkspaceSnapshot,
  scope: AgentResourceScopeV2,
): void {
  if (snapshot?.contract !== AGENTSAM_DESIGN_WORKSPACE_CONTRACT)
    throw new Error("design_workspace_contract_mismatch");
  required(snapshot.resource?.id, "design_resource_id_required");
  required(snapshot.resource?.appId, "design_app_id_required");
  required(snapshot.resource?.href, "design_resource_href_required");
  if (
    !snapshot.resource.href.startsWith("/") ||
    snapshot.resource.href.startsWith("//")
  ) {
    throw new Error("design_resource_href_invalid");
  }
  required(snapshot.revision, "design_revision_required");
  required(snapshot.resource?.accountId, "design_resource_account_required");
  if (
    scope?.contract !== "agentsam.resource-scope.v2" ||
    !scope.accountId ||
    !scope.authUserId
  ) {
    throw new Error("authenticated_account_required");
  }
  if (snapshot.resource.accountId !== scope.accountId)
    throw new Error("design_resource_forbidden");
  if (
    scope.projectId &&
    snapshot.resource.projectId &&
    scope.projectId !== snapshot.resource.projectId
  ) {
    throw new Error("design_project_scope_mismatch");
  }
}

const mutatingOperations = new Set<DesignWorkspaceCapability>([
  "modify",
  "save",
  "undo",
  "redo",
  "generate",
  "publish",
  "export",
]);

/** Client-side preflight only; the adapter MUST repeat authority checks. */
export function assertDesignWorkspaceOperation(
  snapshot: DesignWorkspaceSnapshot,
  scope: AgentResourceScopeV2,
  operation: DesignWorkspaceOperation,
): void {
  assertDesignWorkspaceScope(snapshot, scope);
  required(operation?.id, "design_operation_id_required");
  if (operation.resourceId !== snapshot.resource.id)
    throw new Error("design_operation_resource_mismatch");
  if (!snapshot.capabilities.includes(operation.kind))
    throw new Error("design_capability_unavailable");
  if (
    operation.kind === "publish" &&
    operation.publicationApproval !== "explicit-user-action"
  ) {
    throw new Error("design_publish_requires_approval");
  }
  if (snapshot.status === "unavailable")
    throw new Error("design_workspace_unavailable");
  if (mutatingOperations.has(operation.kind)) {
    if (snapshot.status === "read-only")
      throw new Error("design_workspace_read_only");
    if (
      !operation.expectedRevision ||
      operation.expectedRevision !== snapshot.revision
    ) {
      throw new Error("design_revision_conflict");
    }
  }
}

export function assertDesignCreateRequest(
  request: DesignWorkspaceCreateRequest,
): void {
  required(request?.kind, "design_kind_required");
  required(request?.idempotencyKey, "design_create_idempotency_required");
}
