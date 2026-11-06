import { DesignWorkspaceRegistry } from "./design-workspace-registry";
import type { AgentResourceScopeV2 } from "./resource-scope";
import type { DesignWorkspaceAdapter, DesignWorkspaceSnapshot, DesignWorkspaceOperation, DesignWorkspaceReceipt } from "./design-workspace";

export const DESIGN_WORKSPACE_BRIDGE = "agentsam.design-workspace.bridge.v1";
type Wire = { channel: string; id: string; method?: string; resourceId?: string; operation?: DesignWorkspaceOperation; request?: unknown; ok?: boolean; result?: unknown; error?: string };

/** Same-origin host transport only. Each engine remains the document and permission authority. */
export function createDesignWorkspaceFrameAdapter(kind: string, frame: () => HTMLIFrameElement | null) {
  const pending = new Map<string, {resolve: (value: any) => void; reject: (reason: Error) => void; dispose: () => void}>();
  const receive = (event: MessageEvent<Wire>) => {
    if (event.origin !== location.origin || event.source !== frame()?.contentWindow || event.data?.channel !== DESIGN_WORKSPACE_BRIDGE) return;
    const item = pending.get(event.data.id);
    if (!item || typeof event.data.ok !== "boolean") return;
    pending.delete(event.data.id); item.dispose();
    if (event.data.ok) item.resolve(event.data.result);
    else item.reject(new Error(event.data.error || "design_operation_failed"));
  };
  window.addEventListener("message", receive);
  const request = (method: string, fields: object = {}, signal?: AbortSignal): Promise<any> => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("design_operation_aborted")); return; }
    const target = frame()?.contentWindow;
    if (!target) { reject(new Error("design_engine_unavailable")); return; }
    const id = crypto.randomUUID();
    const cancel = () => { pending.delete(id); dispose(); reject(new Error("design_operation_interrupted_reopen_to_verify")); };
    // Timeout reports an unknown outcome, never an invented failure receipt or automatic retry.
    const timer = setTimeout(() => { pending.delete(id); dispose(); reject(new Error("design_receipt_timeout_reopen_to_verify")); }, 60_000);
    const dispose = () => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); };
    pending.set(id, {resolve, reject, dispose}); signal?.addEventListener("abort", cancel, {once:true});
    target.postMessage({channel:DESIGN_WORKSPACE_BRIDGE,id,method,...fields}, location.origin);
  });
  const adapter: DesignWorkspaceAdapter = {
    kind,
    open: (_scope, resourceId, signal) => request("open", {resourceId}, signal),
    createDraft: (_scope, value, signal) => request("create", {request:value}, signal),
    execute: (_scope, operation, signal) => request("execute", {operation}, signal),
  };
  return {
    adapter,
    state: (signal?: AbortSignal) => request("state", {}, signal) as Promise<{scope:AgentResourceScopeV2;snapshot:DesignWorkspaceSnapshot}>,
    dispose: () => { window.removeEventListener("message", receive); for (const p of pending.values()) {p.dispose();p.reject(new Error("design_engine_closed"));} pending.clear(); },
  };
}

/** Auth is resolved by the engine's server, never accepted from a postMessage payload. */
export function installDesignWorkspaceGuest(options: {
  adapter: DesignWorkspaceAdapter;
  resolveScope: () => Promise<AgentResourceScopeV2>;
  currentResourceId: () => string | null;
}) {
  const registry = new DesignWorkspaceRegistry();
  const unregister = registry.register(options.adapter);
  const receipts = new Map<string, {input:string;result:DesignWorkspaceReceipt}>();
  let queue = Promise.resolve();
  const receive = (event: MessageEvent<Wire>) => {
    if (event.source !== window.parent || event.origin !== location.origin || event.data?.channel !== DESIGN_WORKSPACE_BRIDGE || typeof event.data.id !== "string") return;
    const data = event.data;
    if (!["state","open","create","execute"].includes(data.method || "")) return;
    queue = queue.then(async () => {
      const reply = (fields: object) => window.parent.postMessage({channel:DESIGN_WORKSPACE_BRIDGE,id:data.id,...fields}, location.origin);
      try {
        const scope = await options.resolveScope();
        let result: unknown;
        if (data.method === "create") result = await registry.createDraft(scope, data.request as Parameters<typeof registry.createDraft>[1]);
        else if (data.method === "execute") {
          const operation = data.operation!;
          const key = scope.authUserId + ":" + operation.id;
          const input = JSON.stringify(operation), prior = receipts.get(key);
          if (prior && prior.input !== input) throw new Error("design_operation_id_conflict");
          if (prior) result = prior.result;
          else {
            if (options.currentResourceId() !== operation.resourceId) throw new Error("design_operation_resource_mismatch");
            const snapshot = await registry.open(scope, options.adapter.kind, operation.resourceId);
            result = await registry.execute(scope, snapshot, operation);
            receipts.set(key, {input,result:result as DesignWorkspaceReceipt});
            if (receipts.size > 200) receipts.delete(receipts.keys().next().value!);
          }
        } else {
          const id = data.method === "state" ? options.currentResourceId() : data.resourceId;
          if (!id) throw new Error("design_resource_not_open");
          const snapshot = await registry.open(scope, options.adapter.kind, id);
          result = data.method === "state" ? {scope,snapshot} : snapshot;
        }
        reply({ok:true,result});
      } catch (error) { reply({ok:false,error:error instanceof Error?error.message:"design_operation_failed"}); }
    });
  };
  window.addEventListener("message",receive);
  return () => {unregister();window.removeEventListener("message",receive);};
}

/** Hosted personal-resource principal, verified afresh before every operation. */
export async function resolveHostedDesignScope(request: typeof fetch = fetch): Promise<AgentResourceScopeV2> {
  const response = await request("/api/auth/me", {credentials:"same-origin",cache:"no-store"});
  const body = await response.json();
  if (!response.ok || body?.ok !== true || body.authenticated !== true || typeof body.user?.id !== "string" || !body.user.id.trim())
    throw new Error("authenticated_account_required");
  return {contract:"agentsam.resource-scope.v2",accountId:body.user.id,authUserId:body.user.id};
}
