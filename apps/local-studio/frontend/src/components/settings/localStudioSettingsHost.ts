import { listStudioThemes, themeManagement } from "@/lib/themes/inventory";
import { THEME_PROJECTS_CHANGED } from "@/lib/themes/projects";
import type {
  HealthState,
  SettingsCapabilities,
  SettingsCatalogItem,
  SettingsAgent,
  SettingsAgentDraft,
  SettingsAgentPolicy,
  SettingsGeneralPreferences,
  SettingsCatalogKind,
  SettingsHost,
  SettingsModel,
  SettingsPlugin,
  SettingsSnapshot,
  SettingsWidget,
} from "@inneranimalmedia/agentsam-settings/contracts";
import {
  getDesktopWorkspaceContext,
  identitySessionExists,
  isPackagedDesktop,
  invokeStudioService,
  resolveDesktopStudioAccountId,
  openExternalUrl,
} from "@/lib/desktop/tauri";
import {
  MODEL_INVENTORY_CHANGED_EVENT,
  loadEffectiveModelInventory,
} from "@/lib/work/model-inventory";
import type { StudioInventoryModel } from "@/lib/work/models";
import {
  discoverLocalStudioPlugins,
  installLocalStudioPublicPlugin,
  removeLocalStudioPublicPlugin,
  beginLocalStudioPublicPluginOAuth,
  disconnectLocalStudioPublicPlugin,
  disconnectLocalStudioProvider,
  listLocalStudioConnections,
  startLocalStudioProviderConnection,
  updateLocalStudioPlugin,
  type LocalStudioPluginRecord,
} from "@/lib/connections/client";
import {
  listLocalStudioWidgets,
  setLocalStudioWidgetVisible,
  subscribeLocalStudioWidgets,
} from "@/lib/widgets/preferences";

const capabilities: SettingsCapabilities = {
  host: "local-studio",
  capabilities: [
    { id: "settings.read", available: true },
    { id: "settings.write", available: true },
    { id: "agents.read", available: true },
    { id: "agents.write", available: true },
    { id: "agents.policy", available: true },
    { id: "models.inventory", available: true },
    { id: "plugins.read", available: true },
    { id: "plugins.write", available: true },
    { id: "widgets.read", available: true },
    { id: "widgets.write", available: true },
  ],
};

const SETTINGS_CATALOG_CHANGED_EVENT = "agentsam:settings-catalog-changed";

function applyCatalogOverlay(snapshot: SettingsSnapshot): SettingsSnapshot {
  // The old catalog overlay is no longer treated as runtime authority.
  // Only verified host registries can populate Settings inventory.
  return snapshot;
}

function formatContextWindow(value?: number | null): string {
  const tokens = Number(value || 0);
  if (!Number.isFinite(tokens) || tokens <= 0) return "—";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 ? 1 : 0)}m`;
  return `${Math.round(tokens / 1000)}k`;
}

function settingsModel(
  model: StudioInventoryModel,
  source: string | null,
  selected: boolean,
  verifiedAt: string | null,
): SettingsModel {
  return {
    id: model.provider + ":" + model.model_id,
    name: model.label || model.model_id,
    provider: model.provider,
    tier: model.service_tiers?.[0] || "default",
    context: formatContextWindow(model.context_window),
    status: model.chat_eligible === true ? "healthy" : "unknown",
    enabled: model.chat_eligible === true,
    source,
    selected,
    verifiedAt,
  };
}


function pluginHealthState(plugin: LocalStudioPluginRecord): HealthState {
  if (!plugin.is_enabled || plugin.health_status === "disabled") return "unknown";
  if (plugin.health_status === "healthy") return "healthy";
  if (["auth_error", "degraded", "unhealthy", "unreachable"].includes(plugin.health_status)) {
    return "attention";
  }
  return plugin.setup_status === "connected" ? "unknown" : "attention";
}

function settingsPlugin(plugin: LocalStudioPluginRecord): SettingsPlugin {
  return {
    id: plugin.id,
    pluginKey: plugin.plugin_key,
    providerKey: plugin.provider_key,
    installationKey: plugin.installation_key,
    environment: plugin.environment,
    kind: plugin.plugin_kind,
    category: plugin.category,
    name: plugin.display_name,
    subtitle: plugin.description || plugin.provider_key + " " + plugin.plugin_kind,
    status: pluginHealthState(plugin),
    meta: plugin.setup_status,
    transport: plugin.transport,
    authType: plugin.auth_type,
    setupStatus: plugin.setup_status,
    healthStatus: plugin.health_status,
    healthStrategy: plugin.health_strategy,
    enabled: plugin.is_enabled,
    composerVisible: plugin.composer_visible,
    settingsVisible: plugin.settings_visible,
    setupUrl: plugin.setup_url || null,
    disconnectUrl: plugin.disconnect_url || null,
    iconUrl: plugin.icon_url || null,
    iconDarkUrl: plugin.icon_dark_url || null,
    iconAlt: plugin.icon_alt || null,
    iconFit: plugin.icon_fit || "contain",
    capabilities: plugin.capabilities || [],
    toolLanes: plugin.tool_lanes || [],
    toolCount: plugin.tool_count || 0,
    lastHealthAt: plugin.last_health_at || null,
    lastHealthyAt: plugin.last_healthy_at || null,
    lastErrorCode: plugin.last_error_code || null,
    lastErrorMessage: plugin.last_error_message || null,
  };
}

function settingsWidgets(): SettingsWidget[] {
  return listLocalStudioWidgets().map((widget) => ({
    id: widget.id,
    name: widget.title,
    description: widget.description || "",
    kind: widget.kind,
    icon: widget.icon || null,
    sizes: [...widget.sizes],
    visible: widget.visible,
    removable: widget.removable,
    source: widget.source,
    preferenceScope: widget.preferenceScope,
    deeplink: widget.deeplink || null,
    category: widget.category,
    tags: [...(widget.tags ?? [])],
    availability: widget.availability,
    ownerPackage: widget.ownerPackage,
  }));
}

/**
 * Shared host IO: web session cookie OR desktop Keychain-backed native session.
 * Both hit the same Worker service, authenticated as the current account.
 */
async function settingsRequest<T extends {ok?:boolean;error?:string}>(
  path:string,method:"GET"|"POST"|"PUT"|"DELETE"="GET",body?:unknown,
):Promise<T> {
  let payload:T;
  let status:number;
  if(isPackagedDesktop()){
    const bridged=await invokeStudioService({
      operation:"settings",account_id:await resolveDesktopStudioAccountId(),
      path,method,...(body===undefined?{}:{body}),
    });
    status=bridged.status;
    try{payload=JSON.parse(bridged.body) as T;}catch{throw new Error("settings_invalid_response");}
  }else{
    const response=await fetch(path,{method,credentials:"same-origin",
      headers:{accept:"application/json",...(body===undefined?{}:{"content-type":"application/json"})},
      body:body===undefined?undefined:JSON.stringify(body),
    });
    status=response.status;
    payload=await response.json().catch(()=>({ok:false,error:"settings_invalid_response"} as T));
  }
  if(status>=400||payload.ok!==true)throw new Error(payload.error||"settings_request_failed_"+status);
  return payload;
}
async function skillRequest(path="",init?:RequestInit) {
  const body=init?.body?JSON.parse(String(init.body)):undefined;
  return settingsRequest<{ok:boolean;skills?:unknown[];error?:string}>(
    "/api/settings/skills"+path,(init?.method||"GET") as "GET"|"POST"|"PUT"|"DELETE",body);
}
type AgentApiRecord = SettingsAgent & {modelId:string;active:boolean};
async function loadGeneralSettings():Promise<SettingsGeneralPreferences>{
  const data=await settingsRequest<{ok:boolean;preferences:SettingsGeneralPreferences}>(
    "/api/settings/preferences");
  return data.preferences;
}

async function loadAgentSettings():Promise<{
  agents:SettingsAgent[];templates:SettingsAgent[];policy:SettingsAgentPolicy;
}> {
  const [agents,policy]=await Promise.all([
    settingsRequest<{ok:boolean;agents:AgentApiRecord[];templates:AgentApiRecord[]}>("/api/settings/agents"),
    settingsRequest<{ok:boolean;policy:SettingsAgentPolicy}>("/api/settings/agents/policy"),
  ]);
  const normalize=(item:AgentApiRecord):SettingsAgent=>({
    ...item,role:item.slug||"Agent",
    model:item.modelId||"No model assigned",
    detail:item.description||"Saved agent definition",
    status:"unknown",
  });
  return {agents:(agents.agents||[]).map(normalize),
    templates:(agents.templates||[]).map(normalize),policy:policy.policy};
}

async function loadAccountSkills():Promise<SettingsCatalogItem[]> {
  const data=await skillRequest();
  return (data.skills||[]).map((skill:{
    id:string;name:string;description:string;trigger:string;content:string;
  })=>({
    id:skill.id,name:skill.name,subtitle:skill.description,
    meta:skill.trigger,trigger:skill.trigger,content:skill.content,status:"healthy" as const,
  }));
}

async function loadPluginSettings() {
  return listLocalStudioConnections();
}

function emptySnapshot(): SettingsSnapshot {
  return {
    fixtureName: "local-studio-live",
    environmentLabel: "Local Studio",
    repositoryLabel: "Local runtime",
    health: "unknown",
    credentials: [],
    agents: [],
    agentTemplates: [],
    agentPolicy: null,
    agentError: null,
    models: [],
    plugins: [],
    integrationStatus:undefined,
    widgets: [],
    mcps: [],
    skills: [],
    subagents: [],
    rules: [],
    commands: [],
    hooks: [],
    cloudAgents: [],
    themes: [],
    storage: [],
    usage: [],
    notifications: [],
    codebase: {
      indexedFiles: "Not checked",
      symbols: "Not checked",
      dependencies: "Not checked",
      branch: "—",
      policy: "Not checked",
    },
    network: {
      browser: "Available",
      tunnel: "Not checked",
      oauth: "Not checked",
      health: "unknown",
    },
    git: {
      provider: "Not checked",
      repository: "Not checked",
      branch: "—",
      pullRequests: "Not checked",
      health: "unknown",
    },
    general: {
      account: "Local device",
      organization: "—",
      project: "Local workspace",
      runtime: "Checking…",
      updateChannel: "Not checked",
      preferences:null,
      preferencesError:null,
    },
  };
}

async function liveSnapshot(): Promise<SettingsSnapshot> {
  const snapshot = emptySnapshot();
  const desktop = isPackagedDesktop();
  snapshot.themes = await listStudioThemes();

  const [inventoryResult, pluginResult, skillsResult, agentsResult, prefsResult, signedIn, workspace] = await Promise.all([
    loadEffectiveModelInventory().then(
      (value) => ({ ok: true as const, value }),
      () => ({ ok: false as const, value: null }),
    ),
    loadPluginSettings().then(
      (value) => ({ ok: true as const, value }),
      () => ({ ok: false as const, value: null }),
    ),
    loadAccountSkills().then(
      (value) => ({ ok: true as const, value }),
      () => ({ ok: false as const, value: [] as SettingsCatalogItem[] }),
    ),
    loadAgentSettings().then(
      (value)=>({ok:true as const,value}),
      (error)=>({ok:false as const,error:String(error?.message||"Agent settings unavailable"),value:null}),
    ),
    loadGeneralSettings().then(
      (value)=>({ok:true as const,value}),
      (error)=>({ok:false as const,error:String(error?.message||"Preferences unavailable"),value:null}),
    ),
    desktop ? identitySessionExists().catch(() => false) : Promise.resolve(false),
    desktop ? getDesktopWorkspaceContext().catch(() => null) : Promise.resolve(null),
  ]);

  snapshot.general.runtime = desktop ? "Desktop runtime ready" : "Web runtime ready";
  snapshot.general.account = desktop
    ? signedIn ? "Connected account + local device" : "Local device"
    : "Web session";
  snapshot.general.project = workspace?.default_cwd || (desktop ? "Local workspace" : "Hosted workspace");
  snapshot.widgets = settingsWidgets();
  snapshot.plugins = (pluginResult.value?.plugins||[]).map(settingsPlugin);
  const oauth=pluginResult.value?.oauth_status;
  const repositories=pluginResult.value?.repositories;
  if(oauth||repositories){
    snapshot.integrationStatus={
      available:oauth?.available===true,
      providers:oauth?.providers||[],repositoriesAvailable:repositories?.available===true,
      repositories:repositories?.items||[],
    };
    const github=oauth?.providers.find(provider=>provider.provider==="github");
    const linkedRepo=repositories?.items[0];
    snapshot.git.provider=github?.activeCount?"GitHub OAuth grant recorded":"Not verified";
    snapshot.git.repository=linkedRepo?.fullName||"No registered repository";
    snapshot.git.branch=linkedRepo?.defaultBranch||"—";
    snapshot.git.pullRequests="Not checked";
    snapshot.network.oauth=(pluginResult.value?.connections||[]).some(
      conn=>conn.provider==="cloudflare"&&conn.status==="connected"
    )?"Connected":"Not connected";
  }
  snapshot.skills = skillsResult.value;
  if(prefsResult.ok)snapshot.general.preferences=prefsResult.value;
  else snapshot.general.preferencesError=prefsResult.error;
  if(agentsResult.ok&&agentsResult.value) {
    snapshot.agents=agentsResult.value.agents;
    snapshot.agentTemplates=agentsResult.value.templates;
    snapshot.agentPolicy=agentsResult.value.policy;
  }else{
    snapshot.agentError=agentsResult.error;
  }
  if (!pluginResult.ok) snapshot.health = "attention";

  if (!inventoryResult.ok || !inventoryResult.value) {
    snapshot.health = "attention";
    snapshot.repositoryLabel = desktop ? "Runtime ready · models unavailable" : "Models unavailable";
    return applyCatalogOverlay(snapshot);
  }

  const inventory = inventoryResult.value;
  const providerSources = new Map(
    (inventory.providers || []).map((provider) => [provider.id, provider.source || null]),
  );
  const models = (inventory.availableModels || []).map((model) =>
    settingsModel(
      model,
      providerSources.get(model.provider) || null,
      inventory.selection?.provider === model.provider && inventory.selection?.model_id === model.model_id,
      inventory.generatedAt || null,
    ),
  );
  const runnable = models.filter((model) => model.enabled).length;
  const configuredProviders = (inventory.providers || []).filter((provider) => provider.configured).length;
  const discoveryErrors = Object.values(inventory.discovery || {}).filter(
    (entry) => entry?.attempted && entry.ok === false,
  ).length;
  const health: HealthState = runnable > 0
    ? discoveryErrors > 0 ? "attention" : "healthy"
    : configuredProviders > 0 ? "attention" : "unknown";

  snapshot.health = snapshot.health === "attention" ? "attention" : health;
  snapshot.models = models;
  snapshot.repositoryLabel = !inventory.providers?.length
    ? "Provider inventory unavailable"
    : configuredProviders===0
      ? "No verified provider connections"
      : runnable===0
        ? `${configuredProviders} connected providers · model discovery pending`
        : `${configuredProviders} provider${configuredProviders === 1 ? "" : "s"} · ${runnable} runnable model${runnable === 1 ? "" : "s"}`;
  snapshot.general.runtime = desktop
    ? `Desktop runtime · ${runnable} runnable models`
    : `Web runtime · ${runnable} runnable models`;
  snapshot.network.health = health;

  return applyCatalogOverlay(snapshot);
}

export const localStudioSettingsHost: SettingsHost = {
  ...themeManagement,
  async capabilities() {
    return capabilities;
  },
  async snapshot() {
    return liveSnapshot();
  },
  openSettingsUnit(unit) {
    if(typeof window!=="undefined")
      window.dispatchEvent(new CustomEvent("agentsam:navigate",{detail:{to:"/settings/"+unit}}));
  },
  async updateGeneralPreferences(preferences:SettingsGeneralPreferences){
    await settingsRequest("/api/settings/preferences","PUT",preferences);
    if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent(SETTINGS_CATALOG_CHANGED_EVENT));
  },
  async saveAgent(draft:SettingsAgentDraft,id?:string) {
    const key=id?"/"+encodeURIComponent(id):"";
    await settingsRequest("/api/settings/agents"+key,id?"PUT":"POST",draft);
    if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent(SETTINGS_CATALOG_CHANGED_EVENT));
  },
  async archiveAgent(id:string){
    await settingsRequest("/api/settings/agents/"+encodeURIComponent(id),"DELETE");
    if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent(SETTINGS_CATALOG_CHANGED_EVENT));
  },
  async updateAgentPolicy(policy:SettingsAgentPolicy){
    await settingsRequest("/api/settings/agents/policy","PUT",policy);
    if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent(SETTINGS_CATALOG_CHANGED_EVENT));
  },
  async discoverPlugins() {
    const result = await discoverLocalStudioPlugins();
    return {
      plugins: result.plugins,
      errors: result.errors,
      configuredSources: result.configuredSources,
    };
  },
  async installPluginFromCatalog(pluginKey) {
    await installLocalStudioPublicPlugin(pluginKey);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SETTINGS_CATALOG_CHANGED_EVENT));
    }
  },
  async removeCatalogPlugin(pluginId) {
    await removeLocalStudioPublicPlugin(pluginId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SETTINGS_CATALOG_CHANGED_EVENT));
    }
  },
  async readPluginWorkspace(pluginId) {
    if(!/^plg_[a-z0-9]+$/i.test(pluginId))throw new Error("plugin_id_invalid");
    const path="/api/plugins/"+encodeURIComponent(pluginId)+"/workspace";
    let body:{ok?:boolean;error?:string;pluginKey?:string;contextTool?:string;result?:unknown};
    if(isPackagedDesktop()){
      const native=await invokeStudioService({
        operation:"plugins",account_id:await resolveDesktopStudioAccountId(),method:"GET",path,
      });
      body=JSON.parse(native.body||"{}");
      if(!native.ok||body.ok!==true)throw new Error(body.error||"plugin_workspace_unavailable");
    }else{
      const response=await fetch(path,{credentials:"same-origin"});
      body=await response.json().catch(()=>({ok:false,error:"plugin_workspace_invalid_response"}));
      if(!response.ok||body.ok!==true)throw new Error(body.error||"plugin_workspace_unavailable");
    }
    return {pluginKey:body.pluginKey||"",contextTool:body.contextTool||"",result:body.result};
  },
  async setPluginEnabled(id, enabled) {
    await updateLocalStudioPlugin(id, { enabled });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SETTINGS_CATALOG_CHANGED_EVENT));
    }
  },
  async beginPluginSetup(id, options = {}) {
    const registry = await loadPluginSettings();
    const plugins = (registry.plugins||[]).map(settingsPlugin);
    const plugin = plugins.find((candidate) => candidate.id === id);
    if (!plugin) throw new Error("plugin_not_found");
    if (plugin.installationKey === "catalog-v1") {
      const response = await beginLocalStudioPublicPluginOAuth(plugin.id, options.allowWrites === true);
      if (!response?.authorize_url?.startsWith("https://")) throw new Error("plugin_oauth_url_invalid");
      await openExternalUrl(response.authorize_url);
      return;
    }
    if (!plugin.setupUrl) throw new Error("plugin_setup_unavailable");
    if (plugin.setupUrl.startsWith("/api/connections/") && plugin.providerKey === "cloudflare") {
      await startLocalStudioProviderConnection("cloudflare", {
        returnTo: "/settings/customize?view=plugins",
      });
      return;
    }
    if (/^https:\/\//i.test(plugin.setupUrl)) {
      await openExternalUrl(plugin.setupUrl);
      return;
    }
    throw new Error("plugin_setup_url_unsupported");
  },
  async disconnectPlugin(id) {
    const registry = await loadPluginSettings();
    const plugins = (registry.plugins||[]).map(settingsPlugin);
    const plugin = plugins.find((candidate) => candidate.id === id);
    if (!plugin) throw new Error("plugin_not_found");
    if (plugin.installationKey === "catalog-v1") {
      await disconnectLocalStudioPublicPlugin(plugin.id);
      return;
    }
    if (!plugin.disconnectUrl || plugin.providerKey !== "cloudflare") {
      throw new Error("plugin_disconnect_unavailable");
    }
    await disconnectLocalStudioProvider("cloudflare");
  },
  async setWidgetVisible(id, visible) {
    setLocalStudioWidgetVisible(id, visible);
  },
  openWidget(id) {
    if (typeof window === "undefined") return;
    const widget = settingsWidgets().find((candidate) => candidate.id === id);
    if (!widget?.deeplink) return;
    window.dispatchEvent(
      new CustomEvent("agentsam:navigate", { detail: { to: widget.deeplink } }),
    );
  },
  async upsertCatalogItem(kind, item) {
    if(kind==="skills") {
      const path=item.id.startsWith("skill_")?"/"+encodeURIComponent(item.id):"";
      const trigger=(item.trigger||item.meta||"").trim();
      await skillRequest(path,{
        method:path?"PUT":"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({name:item.name,description:item.subtitle,
          trigger,content:item.content||""}),
      });
      if(typeof window!=="undefined")
        window.dispatchEvent(new CustomEvent(SETTINGS_CATALOG_CHANGED_EVENT));
      return;
    }
    throw new Error("settings_catalog_kind_requires_verified_adapter:"+kind);
  },
  async removeCatalogItem(kind, id) {
    if(kind==="skills") {
      await skillRequest("/"+encodeURIComponent(id),{method:"DELETE"});
      if(typeof window!=="undefined")
        window.dispatchEvent(new CustomEvent(SETTINGS_CATALOG_CHANGED_EVENT));
      return;
    }
    throw new Error("settings_catalog_kind_requires_verified_adapter:"+kind);
  },
  subscribe(_unitId, callback) {
    if (typeof window === "undefined") return () => {};
    const onChanged = () => callback();
    window.addEventListener(MODEL_INVENTORY_CHANGED_EVENT, onChanged);
    window.addEventListener(SETTINGS_CATALOG_CHANGED_EVENT, onChanged);
    window.addEventListener("focus", onChanged);
    window.addEventListener(THEME_PROJECTS_CHANGED, onChanged);
    const unsubscribeWidgets = subscribeLocalStudioWidgets(onChanged);
    return () => {
      window.removeEventListener(MODEL_INVENTORY_CHANGED_EVENT, onChanged);
      window.removeEventListener(SETTINGS_CATALOG_CHANGED_EVENT, onChanged);
      window.removeEventListener("focus", onChanged);
      window.removeEventListener(THEME_PROJECTS_CHANGED, onChanged);
      unsubscribeWidgets();
    };
  },
};

