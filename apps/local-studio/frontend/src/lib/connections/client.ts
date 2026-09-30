import {
  invokeStudioService,
  isPackagedDesktop,
  openExternalUrl,
  resolveDesktopStudioAccountId,
} from "@/lib/desktop/tauri";

export type LocalStudioConnectionRecord = {
  id?: string;
  provider?: string;
  kind?: string;
  label?: string;
  display_name?: string;
  status?: string;
  connected?: boolean;
  granted_scopes?: string[];
  scopes?: string[];
  account_name?: string;
  accountName?: string;
  connection?: {
    connectionId?: string;
    scopes?: string[];
    cloudflareAccountId?: string;
  };
};

export type LocalStudioConnectionsResponse = {
  ok?: boolean;
  connections?: LocalStudioConnectionRecord[];
  items?: LocalStudioConnectionRecord[];
  error?: string;
};

export class LocalStudioConnectionError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = "LocalStudioConnectionError";
    this.status = status;
    this.payload = payload;
  }
}

function parseJsonBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function responseError(status: number, payload: unknown) {
  const body =
    payload && typeof payload === "object"
      ? (payload as { error?: unknown; message?: unknown })
      : null;
  const message = String(
    body?.message || body?.error || "Connection request failed (" + status + ")",
  );
  return new LocalStudioConnectionError(status, message, payload);
}

async function connectionRequest<T>(
  path: string,
  init: { method?: "GET" | "POST" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const method = init.method || "GET";

  if (isPackagedDesktop()) {
    const accountId = await resolveDesktopStudioAccountId();
    const response = await invokeStudioService({
      operation: "connections",
      account_id: accountId,
      method,
      path,
      body: init.body,
    });
    const payload = parseJsonBody(response.body);
    if (!response.ok) throw responseError(response.status, payload);
    return payload as T;
  }

  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "X-Agentsam-Oauth": "json",
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  const payload = parseJsonBody(text);
  if (!response.ok) throw responseError(response.status, payload);
  return payload as T;
}

export async function listLocalStudioConnections(): Promise<LocalStudioConnectionsResponse> {
  return connectionRequest<LocalStudioConnectionsResponse>("/api/connections");
}

export async function startLocalStudioProviderConnection(
  provider: string,
  options: { returnTo?: string; packs?: string[]; capabilities?: string[] } = {},
) {
  const providerId = String(provider || "").trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(providerId)) {
    throw new Error("connection_provider_invalid");
  }

  const query = new URLSearchParams();
  if (options.returnTo) query.set("return_to", options.returnTo);
  if (options.packs?.length) query.set("packs", options.packs.join(","));
  if (options.capabilities?.length) {
    query.set("capabilities", options.capabilities.join(","));
  }

  const suffix = query.toString() ? "?" + query.toString() : "";
  const payload = await connectionRequest<{
    ok?: boolean;
    authorize_url?: string;
    error?: string;
  }>("/api/connections/" + encodeURIComponent(providerId) + "/start" + suffix);

  const authorizeUrl = String(payload?.authorize_url || "").trim();
  if (!authorizeUrl) {
    throw new Error(payload?.error || "provider_authorize_url_missing");
  }
  await openExternalUrl(authorizeUrl);
  return payload;
}

export async function disconnectLocalStudioProvider(provider: string) {
  const providerId = String(provider || "").trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(providerId)) {
    throw new Error("connection_provider_invalid");
  }
  return connectionRequest<{ ok?: boolean; error?: string }>(
    "/api/connections/" + encodeURIComponent(providerId) + "/disconnect",
    { method: "POST", body: {} },
  );
}
