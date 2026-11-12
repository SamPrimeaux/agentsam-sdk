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
  account_selection_required?: boolean;
  preferred_connection_id?: string | null;
  accounts?: Array<{
    connection_id?: string;
    connectionId?: string;
    cloudflare_account_id?: string;
    cloudflareAccountId?: string;
    account_label?: string;
    accountLabel?: string;
    preferred?: boolean;
  }>;
  connection?: {
    connectionId?: string;
    connection_id?: string;
    scopes?: string[];
    cloudflareAccountId?: string;
    cloudflare_account_id?: string;
    account_label?: string;
    preferred?: boolean;
  };
};

export type LocalStudioPluginRecord = {
  id: string;
  plugin_key: string;
  provider_key: string;
  installation_key: string;
  connection_ref?: string | null;
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

export type LocalStudioSideStageRecord = {
  id: string;
  pluginId: string;
  stageId: string;
  label: string;
  description: string;
  icon: string;
  iconUrl: string | null;
  tabKind: string;
  renderer: "builtin" | "embed" | "workspace";
  href?: string;
  ready: true;
  enabled?: boolean;
};

export type LocalStudioConnectionsResponse = {
  side_stages?: LocalStudioSideStageRecord[];
  side_stage_catalog?: LocalStudioSideStageRecord[];
  ok?: boolean;
  connections?: LocalStudioConnectionRecord[];
  items?: LocalStudioConnectionRecord[];
  plugins?: LocalStudioPluginRecord[];
  composer_plugins?: LocalStudioPluginRecord[];
  oauth_status?: {available:boolean;providers:{provider:string;activeCount:number;status:string}[]};
  repositories?: {available:boolean;items:{
    id:string;provider:string;owner:string|null;name:string;fullName:string|null;defaultBranch:string|null;
  }[]};
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

/** Native panel preferences share the canonical plugin installation registry,
 * but must remain readable when unrelated OAuth/plugin health checks fail. */
export async function listLocalStudioSideStages(): Promise<LocalStudioSideStageRecord[]> {
  const response = await connectionRequest<Pick<LocalStudioConnectionsResponse, "ok" | "side_stage_catalog">>(
    "/api/connections/side-stages",
  );
  if (response.ok !== true || !Array.isArray(response.side_stage_catalog)) {
    throw new Error("Panel preferences are not available on this host.");
  }
  return response.side_stage_catalog;
}

/** Controls only personal panel visibility, never OAuth, install or permissions. */
export async function updateSideStageVisibility(pluginId: string, enabled: boolean) {
  if (!/^plg_[a-f0-9]{8,}$/i.test(pluginId)) throw new Error("side_stage_plugin_invalid");
  const result = await connectionRequest<{ok:boolean;pluginId:string;enabled:boolean}>(
    "/api/connections/side-stages/" + encodeURIComponent(pluginId),
    {method:"POST",body:{enabled}},
  );
  return result;
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

export async function disconnectLocalStudioProvider(
  provider: string,
  options: { accountId?: string; connectionId?: string } = {},
) {
  const providerId = String(provider || "").trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(providerId)) {
    throw new Error("connection_provider_invalid");
  }
  const accountId = String(options.accountId || options.connectionId || "").trim();
  return connectionRequest<{ ok?: boolean; error?: string }>(
    "/api/connections/" + encodeURIComponent(providerId) + "/disconnect",
    {
      method: "POST",
      body: accountId
        ? { account_id: accountId, connection_id: accountId }
        : {},
    },
  );
}

export async function selectLocalStudioCloudflareAccount(accountId: string) {
  const id = String(accountId || "").trim();
  if (!/^[a-f0-9]{32}$/i.test(id)) {
    throw new Error("cloudflare_account_identifier_required");
  }
  return connectionRequest<{
    ok?: boolean;
    preferred_connection_id?: string;
    connection?: LocalStudioConnectionRecord["connection"];
    accounts?: LocalStudioConnectionRecord["accounts"];
    error?: string;
  }>("/api/connections/cloudflare/select", {
    method: "POST",
    body: { account_id: id, connection_id: id },
  });
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

// The desktop shell allowlists paths per operation: /api/plugins/* -> "plugins", /api/work/* -> "work".
async function pluginCatalogRequest<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: Record<string, unknown>): Promise<T> {
  if (isPackagedDesktop()) {
    const accountId = await resolveDesktopStudioAccountId();
    const response = await invokeStudioService({
      operation: path.startsWith('/api/work/') ? "work" : "plugins",
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

export function readLocalStudioPluginWorkspace(pluginId: string) {
  if (!/^plg_[a-f0-9]{8,}$/i.test(pluginId)) throw new Error("plugin_id_invalid");
  return pluginCatalogRequest<{ok: boolean; pluginKey?: string; contextTool?: string; result?: unknown}>(
    "GET", "/api/plugins/" + encodeURIComponent(pluginId) + "/workspace",
  );
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
/** Repository visibility is checked server-side against this account's sealed GitHub grant. */
export function listLocalStudioGitHubRepositories(connectionRef: string) {
  if (!/^github:[a-zA-Z0-9-]{1,39}$/.test(connectionRef)) throw new Error("github_connection_invalid");
  return pluginCatalogRequest<{
    ok: boolean;
    account: string;
    repositories: Array<{
      id:string; fullName:string; description:string; private:boolean; defaultBranch:string;
      updatedAt:string; htmlUrl:string; permissions:{pull:boolean;push:boolean;admin:boolean};
    }>;
    limitedTo:number;
    hasMore:boolean;
  }>("GET","/api/work/github/repos?connection_id="+encodeURIComponent(connectionRef));
}

export function beginLocalStudioGmailConnection(returnTo: string) {
  return pluginCatalogRequest<{ok:boolean;authorize_url:string}>(
    'POST','/api/work/gmail/oauth/start',{return_to:returnTo},
  );
}
export function beginLocalStudioConnectorOAuth(providerKey: string, returnTo: string) {
  if (!/^(google_drive|google_calendar|github)$/.test(providerKey)) throw new Error('connector_provider_invalid');
  return pluginCatalogRequest<{ok:boolean;authorize_url:string}>(
    'POST','/api/work/connect/'+providerKey+'/start',{return_to:returnTo},
  );
}
export function disconnectLocalStudioConnector(connectionRef: string) {
  const providerKey = connectionRef.split(':')[0] || '';
  if (!/^(google_drive|google_calendar|github)$/.test(providerKey)) throw new Error('connector_provider_invalid');
  return pluginCatalogRequest<{ok:boolean}>(
    'POST','/api/work/connect/'+providerKey+'/disconnect',{connection_id:connectionRef},
  );
}
export function disconnectLocalStudioGmail(connectionRef: string) {
  return pluginCatalogRequest<{ok:boolean}>(
    'POST','/api/work/gmail/disconnect',{connection_id:connectionRef},
  );
}
export function disconnectLocalStudioPublicPlugin(pluginId:string) {
  if(!/^plg_[a-z0-9]+$/i.test(pluginId))throw new Error('plugin_id_invalid');
  return pluginCatalogRequest<{ok:boolean;disconnected:boolean}>(
    'POST','/api/plugins/'+encodeURIComponent(pluginId)+'/oauth/disconnect',{}
  );
}
