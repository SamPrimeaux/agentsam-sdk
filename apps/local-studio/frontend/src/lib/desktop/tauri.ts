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


export async function identityStoreGet(account: string): Promise<string | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return (await invoke("identity_store_get", { account })) as string | null;
}

export async function identityStoreSet(account: string, value: string): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) throw new Error("identity_store_unavailable");
  await invoke("identity_store_set", { account, value });
}

export async function identityStoreDelete(account: string): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  await invoke("identity_store_delete", { account });
}

export async function providerKeyExists(provider: string): Promise<boolean> {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  return Boolean(await invoke("provider_key_exists", { provider }));
}

export async function providerKeySet(provider: string, value: string): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) throw new Error("provider_key_store_unavailable");
  await invoke("provider_key_set", { provider, value });
}

export async function providerKeyDelete(provider: string): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  await invoke("provider_key_delete", { provider });
}

export async function invokeIdentity(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const invoke = getTauriInvoke();
  if (!invoke) throw new Error("identity_bridge_unavailable");
  const raw = (await invoke("identity_bridge", {
    requestJson: JSON.stringify(payload),
  })) as string;
  return JSON.parse(raw) as Record<string, unknown>;
}


export type StudioServiceOperation = "inventory" | "chat" | "vault" | "cms" | "database" | "connections";

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
  const sessionId = isPackagedDesktop() ? await identityStoreGet("identity_session") : null;
  const raw = (await invoke("studio_service_bridge", {
    requestJson: JSON.stringify({ ...payload, session_id: sessionId || undefined }),
  })) as string;
  return JSON.parse(raw) as StudioServiceResponse;
}

export async function resolveDesktopStudioAccountId(): Promise<string> {
  if (!isPackagedDesktop()) return "studio-local";
  try {
    const sessionId = await identityStoreGet("identity_session");
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

export async function getCurrentDeepLinks(): Promise<string[]> {
  const invoke = getTauriInvoke();
  if (!invoke) return [];
  const current = await invoke("take_pending_deep_links", {});
  if (!Array.isArray(current)) return [];
  return current.filter((value): value is string => typeof value === "string");
}

export async function listenDeepLinks(handler: (url: string) => void): Promise<() => void> {
  if (!getTauriInvoke()) throw new Error("tauri_deep_link_unavailable");

  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const pump = async () => {
    try {
      const urls = await getCurrentDeepLinks();
      if (!disposed) {
        for (const url of urls) handler(url);
      }
    } catch {
      // Keep the transport alive; a transient native invoke failure should not
      // permanently disable OAuth callbacks for the app lifetime.
    } finally {
      if (!disposed) timer = setTimeout(() => void pump(), 500);
    }
  };

  void pump();

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
  };
}
