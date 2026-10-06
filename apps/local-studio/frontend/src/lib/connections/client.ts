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

export type LocalStudioPluginRecord = {
  id: string;
  plugin_key: string;
  provider_key: string;
  installation_key: string;
  environment: string;
  plugin_kind: string;
  category: string;
  display_name: string;
  short_name?: string | null;
  description?: string | null;
  transport: string;
  auth_type: string;
  setup_url?: string | null;
  disconnect_url?: string | null;
  icon_url?: string | null;
  icon_dark_url?: string | null;
  icon_alt?: string | null;
  icon_fit?: "contain" | "cover";
  composer_visible: boolean;
  settings_visible: boolean;
  is_enabled: boolean;
  setup_status: string;
  health_strategy: string;
  health_status: string;
  last_health_at?: number | null;
  last_healthy_at?: number | null;
  consecutive_failures: number;
  avg_latency_ms?: number | null;
  error_rate_24h: number;
  last_error_code?: string | null;
  last_error_message?: string | null;
  capabilities: string[];
  tool_lanes: string[];
  tool_count: number;
};

export type LocalStudioConnectionsResponse = {
  ok?: boolean;
  connections?: LocalStudioConnectionRecord[];
  items?: LocalStudioConnectionRecord[];
  plugins?: LocalStudioPluginRecord[];
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


export async function updateLocalStudioPlugin(
  pluginId: string,
  patch: {
    enabled?: boolean;
    composer_visible?: boolean;
    settings_visible?: boolean;
  },
) {
  const id = String(pluginId || "").trim();
  if (!/^plg_[a-z0-9]+$/i.test(id)) throw new Error("plugin_id_invalid");
  const path = "/api/plugins/" + encodeURIComponent(id);

  if (isPackagedDesktop()) {
    const accountId = await resolveDesktopStudioAccountId();
    const response = await invokeStudioService({
      operation: "plugins",
      account_id: accountId,
      method: "PATCH",
      path,
      body: patch,
    });
    const payload = parseJsonBody(response.body);
    if (!response.ok) throw responseError(response.status, payload);
    return payload as { ok?: boolean; plugin?: LocalStudioPluginRecord; error?: string };
  }

  const response = await fetch(path, {
    method: "PATCH",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(patch),
  });
  const payload = parseJsonBody(await response.text());
  if (!response.ok) throw responseError(response.status, payload);
  return payload as { ok?: boolean; plugin?: LocalStudioPluginRecord; error?: string };
}

// Public plugin discovery is host configured and account authenticated.
// A discovered manifest is not a granted connection or executable tool.
export type LocalStudioDiscoveredPlugin = {
  pluginKey: string;
  version: string;
  name: string;
  subtitle: string;
  description: string;
  publisher: string;
  iconUrl: string | null;
  category: string;
  keywords: string[];
  capabilities: string[];
  examples: string[];
  tools: string[];
  toolCount: number;
  skillCount: number;
  oauthScopes: string[];
  readOnlyScopes: string[];
  oauthResource: string | null;
  toolPermissions: {id:string;title:string;scopes:string[];readOnly:boolean;requiresApproval:boolean}[];
  endpointUrl: string;
  catalogUrl: string;
  transport: string;
  authType: string;
  websiteUrl: string | null;
  privacyUrl: string | null;
  termsUrl: string | null;
  supportUrl: string | null;
  repositoryUrl: string | null;
  installationId: string | null;
  setupStatus: string;
  enabled: boolean;
  healthStatus: string;
  availability: 'available' | 'requires_connection' | 'connected';
};

export type PluginDiscoveryResponse = {
  ok?: boolean;
  schema: string;
  plugins: LocalStudioDiscoveredPlugin[];
  errors: { source: string; reason: string }[];
  configuredSources: number;
};

async function pluginCatalogRequest<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: Record<string, unknown>): Promise<T> {
  if (isPackagedDesktop()) {
    const accountId = await resolveDesktopStudioAccountId();
    const response = await invokeStudioService({
      operation: "plugins",
      account_id: accountId,
      method,
      path,
      ...(body ? { body } : {}),
    });
    const result = parseJsonBody(response.body);
    if (!response.ok) throw responseError(response.status, result);
    return result as T;
  }
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = parseJsonBody(await response.text());
  if (!response.ok) throw responseError(response.status, result);
  return result as T;
}

export function discoverLocalStudioPlugins() {
  return pluginCatalogRequest<PluginDiscoveryResponse>('GET','/api/plugins/catalog');
}
export function installLocalStudioPublicPlugin(pluginKey: string) {
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(pluginKey)) throw new Error('plugin_key_invalid');
  return pluginCatalogRequest<{ok:true;pluginId:string;status:string}>(
    'POST','/api/plugins/install',{plugin_key:pluginKey}
  );
}
export function removeLocalStudioPublicPlugin(pluginId: string) {
  if (!/^plg_[a-z0-9]+$/i.test(pluginId)) throw new Error('plugin_id_invalid');
  return pluginCatalogRequest<{ok:true;removed:true}>('DELETE','/api/plugins/'+encodeURIComponent(pluginId));
}


export function beginLocalStudioPublicPluginOAuth(pluginId:string,allowWrites=false) {
  if(!/^plg_[a-z0-9]+$/i.test(pluginId))throw new Error('plugin_id_invalid');
  return pluginCatalogRequest<{ok:boolean;authorize_url:string;status:string}>(
    'POST','/api/plugins/'+encodeURIComponent(pluginId)+'/oauth/start',
    {allow_writes:allowWrites,desktop:isPackagedDesktop()},
  );
}
export function disconnectLocalStudioPublicPlugin(pluginId:string) {
  if(!/^plg_[a-z0-9]+$/i.test(pluginId))throw new Error('plugin_id_invalid');
  return pluginCatalogRequest<{ok:boolean;disconnected:boolean}>(
    'POST','/api/plugins/'+encodeURIComponent(pluginId)+'/oauth/disconnect',{}
  );
}
