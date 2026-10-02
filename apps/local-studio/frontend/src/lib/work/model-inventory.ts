import {
  getDesktopWorkspaceContext,
  identitySessionExists,
  invokeLocalProvider,
  invokeStudioService,
  isPackagedDesktop,
} from "@/lib/desktop/tauri";
import type { StudioModelSelection } from "./models";

export const MODEL_INVENTORY_CHANGED_EVENT = "agentsam:model-inventory-changed";

export { mergeInventoryPayloads } from "./model-inventory-core";
export type {
  StudioInventoryDiscovery,
  StudioInventoryPayload,
  StudioInventoryProvider,
} from "./model-inventory-core";
import { mergeInventoryPayloads, type StudioInventoryPayload } from "./model-inventory-core";

async function loadWebInventory(): Promise<StudioInventoryPayload> {
  const res = await fetch("/api/llm/inventory", { credentials: "same-origin" });
  const body = (await res.json()) as StudioInventoryPayload;
  if (!res.ok || body.ok === false) throw new Error(body.error || `inventory_http_${res.status}`);
  return body;
}

async function loadDesktopAccountInventory(): Promise<StudioInventoryPayload> {
  const bridged = await invokeStudioService({ operation: "inventory" });
  let body: StudioInventoryPayload;
  try {
    body = JSON.parse(bridged.body || "{}") as StudioInventoryPayload;
  } catch {
    throw new Error(`inventory_invalid_response_${bridged.status}`);
  }
  if (!bridged.ok || body.ok === false) throw new Error(body.error || `inventory_http_${bridged.status}`);
  return body;
}

export async function loadEffectiveModelInventory(): Promise<StudioInventoryPayload> {
  if (!isPackagedDesktop()) return loadWebInventory();

  // A packaged desktop is a local-capable product even when the user is signed in.
  // Always ask the local bridge so the GUI sees the same machine credential sources
  // as the AgentSam CLI. Account inventory is an additive remote plane, not a switch
  // that disables local execution.
  const workspace = await getDesktopWorkspaceContext().catch(() => null);
  const localPromise = invokeLocalProvider<StudioInventoryPayload>({
    operation: "inventory",
    cwd: workspace?.default_cwd || undefined,
  });
  const signedIn = await identitySessionExists().catch(() => false);
  const accountPromise = signedIn ? loadDesktopAccountInventory() : Promise.resolve(null);
  const [localResult, accountResult] = await Promise.allSettled([localPromise, accountPromise]);

  const local = localResult.status === "fulfilled" && localResult.value?.ok !== false
    ? localResult.value
    : null;
  const account = accountResult.status === "fulfilled"
    ? accountResult.value
    : null;

  if (!local && !account) {
    const localError = localResult.status === "rejected" ? localResult.reason : null;
    const accountError = accountResult.status === "rejected" ? accountResult.reason : null;
    throw localError || accountError || new Error("model_inventory_unavailable");
  }

  return mergeInventoryPayloads(local, account);
}


export async function persistEffectiveModelSelection(selection: StudioModelSelection): Promise<boolean> {
  if (!isPackagedDesktop()) return false;
  try {
    const workspace = await getDesktopWorkspaceContext();
    const result = await invokeLocalProvider<{ ok?: boolean }>({
      operation: "select_model",
      provider: selection.provider,
      model_id: selection.model_id,
      cwd: workspace?.default_cwd || undefined,
    });
    return result.ok === true;
  } catch {
    return false;
  }
}

export function announceModelInventoryChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MODEL_INVENTORY_CHANGED_EVENT));
}
