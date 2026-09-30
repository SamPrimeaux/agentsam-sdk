export type TauriInvoke = (command: string, args?: unknown) => Promise<unknown>;

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: { core?: { invoke?: TauriInvoke } };
    __AGENTSAM_DESKTOP__?: boolean;
  }
}

export function getTauriInvoke(): TauriInvoke | null {
  if (typeof window === "undefined") return null;
  return window.__TAURI__?.core?.invoke || null;
}

export function isPackagedDesktop(): boolean {
  return Boolean(
    typeof window !== "undefined" &&
      (window.__AGENTSAM_DESKTOP__ || window.__TAURI_INTERNALS__ || getTauriInvoke()),
  );
}


const SECURE_STORE_APP_ID = "local-studio";

export async function secureStoreGet(account: string): Promise<string | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return (await invoke("secure_store_get", {
    appId: SECURE_STORE_APP_ID,
    account,
  })) as string | null;
}

export async function secureStoreSet(account: string, value: string): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) throw new Error("secure_store_unavailable");
  await invoke("secure_store_set", {
    appId: SECURE_STORE_APP_ID,
    account,
    value,
  });
}

export async function secureStoreDelete(account: string): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  await invoke("secure_store_delete", {
    appId: SECURE_STORE_APP_ID,
    account,
  });
}

export async function invokeIdentity(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const invoke = getTauriInvoke();
  if (!invoke) throw new Error("identity_bridge_unavailable");
  const raw = (await invoke("identity_bridge", {
    requestJson: JSON.stringify(payload),
  })) as string;
  return JSON.parse(raw) as Record<string, unknown>;
}


export type StudioServiceOperation = "inventory" | "chat" | "cms" | "database" | "connections";

export type StudioServiceResponse = {
  ok: boolean;
  status: number;
  content_type: string;
  body: string;
};

export async function invokeStudioService(payload: {
  operation: StudioServiceOperation;
  account_id?: string | null;
  body?: unknown;
  path?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
}): Promise<StudioServiceResponse> {
  const invoke = getTauriInvoke();
  if (!invoke) throw new Error("studio_service_bridge_unavailable");
  const sessionId = isPackagedDesktop() ? await secureStoreGet("identity_session") : null;
  const raw = (await invoke("studio_service_bridge", {
    requestJson: JSON.stringify({ ...payload, session_id: sessionId || undefined }),
  })) as string;
  return JSON.parse(raw) as StudioServiceResponse;
}

export async function resolveDesktopStudioAccountId(): Promise<string> {
  if (!isPackagedDesktop()) return "studio-local";
  try {
    const sessionId = await secureStoreGet("identity_session");
    if (!sessionId) return "studio-local";
    const status = await invokeIdentity({ op: "status", session_id: sessionId });
    const user = status.user as { id?: unknown } | null | undefined;
    const id = typeof user?.id === "string" ? user.id.trim() : "";
    return id || "studio-local";
  } catch {
    return "studio-local";
  }
}


export async function openExternalUrl(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) throw new Error("external_url_scheme_not_allowed");
  const invoke = getTauriInvoke();
  if (!invoke) {
    window.location.assign(url);
    return;
  }
  await invoke("open_external_url", { url });
}
