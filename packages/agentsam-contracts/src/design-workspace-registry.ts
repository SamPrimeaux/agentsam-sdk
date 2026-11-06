import type { AgentResourceScopeV2 } from "./resource-scope";
import {
  assertDesignCreateRequest,
  assertDesignWorkspaceOperation,
  assertDesignWorkspaceScope,
  type DesignDocumentKind,
  type DesignWorkspaceAdapter,
  type DesignWorkspaceCreateRequest,
  type DesignWorkspaceOperation,
  type DesignWorkspaceReceipt,
  type DesignWorkspaceSnapshot,
} from "./design-workspace";

/**
 * An in-memory adapter directory injected at the host boundary.
 * It is NOT an application registry, renderer registry, or persistence layer.
 */
const assertPrincipalScope = (scope: AgentResourceScopeV2) => {
  if (
    scope?.contract !== "agentsam.resource-scope.v2" ||
    !scope.accountId?.trim() ||
    !scope.authUserId?.trim()
  ) {
    throw new Error("authenticated_account_required");
  }
};

export class DesignWorkspaceRegistry {
  private readonly adapters = new Map<
    DesignDocumentKind,
    DesignWorkspaceAdapter
  >();

  register(adapter: DesignWorkspaceAdapter): () => void {
    if (!adapter?.kind?.trim()) throw new Error("design_adapter_kind_required");
    if (this.adapters.has(adapter.kind))
      throw new Error("design_adapter_already_registered");
    this.adapters.set(adapter.kind, adapter);
    return () => {
      if (this.adapters.get(adapter.kind) === adapter)
        this.adapters.delete(adapter.kind);
    };
  }

  supports(kind: DesignDocumentKind): boolean {
    return this.adapters.has(kind);
  }

  kinds(): DesignDocumentKind[] {
    return [...this.adapters.keys()];
  }

  require(kind: DesignDocumentKind): DesignWorkspaceAdapter {
    const adapter = this.adapters.get(kind);
    if (!adapter) throw new Error("design_adapter_unavailable");
    return adapter;
  }

  async open(
    scope: AgentResourceScopeV2,
    kind: DesignDocumentKind,
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<DesignWorkspaceSnapshot> {
    assertPrincipalScope(scope);
    if (!resourceId?.trim()) throw new Error("design_resource_id_required");
    const snapshot = await this.require(kind).open(scope, resourceId, signal);
    assertDesignWorkspaceScope(snapshot, scope);
    if (snapshot.resource.id !== resourceId || snapshot.resource.kind !== kind)
      throw new Error("design_open_resource_mismatch");
    return snapshot;
  }

  async createDraft(
    scope: AgentResourceScopeV2,
    request: DesignWorkspaceCreateRequest,
    signal?: AbortSignal,
  ): Promise<DesignWorkspaceSnapshot> {
    assertPrincipalScope(scope);
    assertDesignCreateRequest(request);
    if (
      request.projectId &&
      scope.projectId &&
      request.projectId !== scope.projectId
    ) {
      throw new Error("design_project_scope_mismatch");
    }
    const adapter = this.require(request.kind);
    if (!adapter.createDraft) throw new Error("design_create_unavailable");
    const snapshot = await adapter.createDraft(scope, request, signal);
    assertDesignWorkspaceScope(snapshot, scope);
    if (snapshot.resource.kind !== request.kind)
      throw new Error("design_create_kind_mismatch");
    if (
      request.projectId &&
      snapshot.resource.projectId !== request.projectId
    ) {
      throw new Error("design_create_project_mismatch");
    }
    if (request.siteId && snapshot.resource.siteId !== request.siteId) {
      throw new Error("design_create_site_mismatch");
    }
    return snapshot;
  }

  async execute(
    scope: AgentResourceScopeV2,
    snapshot: DesignWorkspaceSnapshot,
    operation: DesignWorkspaceOperation,
    signal?: AbortSignal,
  ): Promise<DesignWorkspaceReceipt> {
    assertDesignWorkspaceOperation(snapshot, scope, operation);
    const receipt = await this.require(snapshot.resource.kind).execute(
      scope,
      operation,
      signal,
    );
    if (
      receipt.operationId !== operation.id ||
      receipt.resourceId !== snapshot.resource.id ||
      receipt.kind !== operation.kind ||
      receipt.previousRevision !== snapshot.revision ||
      !receipt.revision?.trim() ||
      (receipt.status !== "applied" && receipt.status !== "unchanged")
    ) {
      throw new Error("design_operation_receipt_mismatch");
    }
    return receipt;
  }
}
