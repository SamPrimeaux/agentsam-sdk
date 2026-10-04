import type {
  HealthState,
  SettingsCapabilities,
  SettingsCatalogItem,
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
  openExternalUrl,
} from "@/lib/desktop/tauri";
import {
  MODEL_INVENTORY_CHANGED_EVENT,
  loadEffectiveModelInventory,
} from "@/lib/work/model-inventory";
import type { StudioInventoryModel } from "@/lib/work/models";
import {
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
    { id: "models.inventory", available: true },
    { id: "plugins.read", available: true },
    { id: "plugins.write", available: true },
    { id: "widgets.read", available: true },
    { id: "widgets.write", available: true },
  ],
};

const SETTINGS_CATALOG_KEY = "agentsam-settings-catalog-v1";
const SETTINGS_CATALOG_CHANGED_EVENT = "agentsam:settings-catalog-changed";
const CATALOG_KINDS: Exclude<SettingsCatalogKind, "plugins">[] = [
  "mcps",
  "skills",
  "subagents",
  "rules",
  "commands",
  "hooks",
];

type CatalogOverlayEntry = {
  items: SettingsCatalogItem[];
  removedIds: string[];
};

type CatalogOverlay = Partial<Record<SettingsCatalogKind, CatalogOverlayEntry>>;

function readCatalogOverlay(): CatalogOverlay {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SETTINGS_CATALOG_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CatalogOverlay;
  } catch {
    return {};
  }
}

function writeCatalogOverlay(overlay: CatalogOverlay) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_CATALOG_KEY, JSON.stringify(overlay));
  window.dispatchEvent(new CustomEvent(SETTINGS_CATALOG_CHANGED_EVENT));
}

function applyCatalogOverlay(snapshot: SettingsSnapshot): SettingsSnapshot {
  const overlay = readCatalogOverlay();
  for (const kind of CATALOG_KINDS) {
    const entry = overlay[kind];
    if (!entry) continue;
    const removed = new Set(entry.removedIds || []);
    const overrides = new Map((entry.items || []).map((item) => [item.id, item]));
    const base = snapshot[kind]
      .filter((item) => !removed.has(item.id))
      .map((item) => overrides.get(item.id) ?? item);
    const baseIds = new Set(base.map((item) => item.id));
    snapshot[kind] = [
      ...base,
      ...(entry.items || []).filter((item) => !baseIds.has(item.id)),
    ];
  }
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
  }));
}

async function loadPluginSettings() {
  const response = await listLocalStudioConnections();
  return (response.plugins || []).map(settingsPlugin);
}

function emptySnapshot(): SettingsSnapshot {
  return {
    fixtureName: "local-studio-live",
    environmentLabel: "Local Studio",
    repositoryLabel: "Local runtime",
    health: "unknown",
    credentials: [],
    agents: [],
    models: [],
    plugins: [],
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
    },
  };
}

async function liveSnapshot(): Promise<SettingsSnapshot> {
  const snapshot = emptySnapshot();
  const desktop = isPackagedDesktop();

  const [inventoryResult, pluginResult, signedIn, workspace] = await Promise.all([
    loadEffectiveModelInventory().then(
      (value) => ({ ok: true as const, value }),
      () => ({ ok: false as const, value: null }),
    ),
    loadPluginSettings().then(
      (value) => ({ ok: true as const, value }),
      () => ({ ok: false as const, value: [] as SettingsPlugin[] }),
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
  snapshot.plugins = pluginResult.value;
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
  snapshot.repositoryLabel = `${configuredProviders} provider${configuredProviders === 1 ? "" : "s"} · ${runnable} runnable model${runnable === 1 ? "" : "s"}`;
  snapshot.general.runtime = desktop
    ? `Desktop runtime · ${runnable} runnable models`
    : `Web runtime · ${runnable} runnable models`;
  snapshot.network.health = health;

  return applyCatalogOverlay(snapshot);
}

export const localStudioSettingsHost: SettingsHost = {
  async capabilities() {
    return capabilities;
  },
  async snapshot() {
    return liveSnapshot();
  },
  async setPluginEnabled(id, enabled) {
    await updateLocalStudioPlugin(id, { enabled });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SETTINGS_CATALOG_CHANGED_EVENT));
    }
  },
  async beginPluginSetup(id) {
    const plugins = await loadPluginSettings();
    const plugin = plugins.find((candidate) => candidate.id === id);
    if (!plugin) throw new Error("plugin_not_found");
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
    const plugins = await loadPluginSettings();
    const plugin = plugins.find((candidate) => candidate.id === id);
    if (!plugin) throw new Error("plugin_not_found");
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
    const overlay = readCatalogOverlay();
    const entry = overlay[kind] ?? { items: [], removedIds: [] };
    entry.items = [
      ...entry.items.filter((candidate) => candidate.id !== item.id),
      item,
    ];
    entry.removedIds = entry.removedIds.filter((id) => id !== item.id);
    overlay[kind] = entry;
    writeCatalogOverlay(overlay);
  },
  async removeCatalogItem(kind, id) {
    const overlay = readCatalogOverlay();
    const entry = overlay[kind] ?? { items: [], removedIds: [] };
    entry.items = entry.items.filter((candidate) => candidate.id !== id);
    if (!entry.removedIds.includes(id)) entry.removedIds.push(id);
    overlay[kind] = entry;
    writeCatalogOverlay(overlay);
  },
  subscribe(_unitId, callback) {
    if (typeof window === "undefined") return () => {};
    const onChanged = () => callback();
    window.addEventListener(MODEL_INVENTORY_CHANGED_EVENT, onChanged);
    window.addEventListener(SETTINGS_CATALOG_CHANGED_EVENT, onChanged);
    window.addEventListener("focus", onChanged);
    const unsubscribeWidgets = subscribeLocalStudioWidgets(onChanged);
    return () => {
      window.removeEventListener(MODEL_INVENTORY_CHANGED_EVENT, onChanged);
      window.removeEventListener(SETTINGS_CATALOG_CHANGED_EVENT, onChanged);
      window.removeEventListener("focus", onChanged);
      unsubscribeWidgets();
    };
  },
};
