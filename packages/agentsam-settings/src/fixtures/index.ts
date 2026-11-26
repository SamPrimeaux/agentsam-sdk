import type { AgentSamWidgetProviderData } from '@inneranimalmedia/agentsam-contracts/widgets';
import { WIDGET_GALLERY_DEFINITIONS } from '@inneranimalmedia/agentsam-workbench/widgets';
import type {
  SettingsCapabilities,
  SettingsHost,
  SettingsNotificationProfileUpdate,
  SettingsPlugin,
  SettingsSnapshot,
  SettingsWidget,
} from "../contracts/index";

function fixturePlugin(value: Pick<SettingsPlugin, "id" | "name" | "subtitle" | "status"> & Partial<SettingsPlugin>): SettingsPlugin {
  return {
    pluginKey: value.id,
    providerKey: value.id,
    installationKey: "fixture",
    environment: "fixture",
    kind: "api",
    category: "fixture",
    meta: "Fixture",
    transport: "internal",
    authType: "none",
    setupStatus: "connected",
    healthStatus: value.status === "healthy" ? "healthy" : "unknown",
    healthStrategy: "fixture",
    enabled: true,
    composerVisible: true,
    settingsVisible: true,
    capabilities: [],
    toolLanes: [],
    toolCount: 0,
    ...value,
  };
}

const fixtureWidgets: SettingsWidget[] = WIDGET_GALLERY_DEFINITIONS.map((definition) => {
  const installed = definition.availability === "ready";
  return {
    id: definition.id,
    name: definition.title,
    description: definition.description,
    kind: definition.kind,
    icon: definition.icon,
    sizes: [...definition.sizes],
    visible: installed,
    removable: installed,
    source: installed ? "Packaged Workbench widget" : "Concept preview",
    preferenceScope: "Fixture account · New Tab",
    deeplink: null,
    category: definition.category,
    tags: [...definition.tags],
    availability: definition.availability,
    ownerPackage: definition.ownerPackage,
    installed,
    installable: installed,
    requiredProvider: "requiredProvider" in definition ? definition.requiredProvider : undefined,
    pinned: definition.id === "cloudflare-resources",
    sizeClass: definition.sizes[0] ?? 'medium',
    configuration: {},
  };
});

const baseSnapshot: SettingsSnapshot = {
  fixtureName: "populated",
  environmentLabel: "Local · localhost",
  repositoryLabel: "demo-app",
  health: "healthy",
  credentials: [
    {
      id: "cred_account_primary",
      name: "Dev machine · CLI",
      kind: "account",
      status: "active",
      trackingId: "aac_demo_7fc2",
      secretPreview: "aak_••••••••••7fc2",
      created: "Sep 12, 2026",
      expires: "Never",
      lastUsed: "2 min ago",
      createdBy: "You",
      permissions: "All",
      monthlySpend: "$0.84",
    },
    {
      id: "cred_service_studio",
      name: "Demo service",
      kind: "service",
      status: "active",
      trackingId: "brk_demo_93a1",
      secretPreview: "brk_••••••••••93a1",
      created: "Sep 24, 2026",
      expires: "Dec 24, 2026",
      lastUsed: "18 min ago",
      createdBy: "You",
      permissions: "Restricted",
      monthlySpend: "$1.00",
    },
    {
      id: "cred_openai",
      name: "OpenAI · default",
      kind: "provider",
      provider: "OpenAI",
      status: "active",
      trackingId: "sec_openai_12d9",
      secretPreview: "sk-••••••••••12d9",
      created: "Sep 25, 2026",
      expires: "Provider managed",
      lastUsed: "6 min ago",
      createdBy: "You",
      permissions: "Provider key",
      monthlySpend: "External",
    },
  ],
  agents: [
    {
      id: "agent-coder",
      name: "Coder",
      role: "Implementation",
      model: "Gemini 3.8 Flash",
      status: "healthy",
      detail: "Repository write, test, build and release tooling.",
    },
    {
      id: "agent-architect",
      name: "Architect",
      role: "Planning",
      model: "GPT-5.6 Sol",
      status: "healthy",
      detail: "Architecture, contracts, migrations and dependency planning.",
    },
    {
      id: "agent-specialist",
      name: "Specialist",
      role: "Focused task",
      model: "Cursor",
      status: "attention",
      detail: "Available when a Cursor machine credential is healthy.",
    },
  ],
  models: [
    {
      id: "gemini-3.8-flash",
      name: "Gemini 3.8 Flash",
      provider: "Google",
      tier: "Fast",
      context: "Large",
      status: "healthy",
      enabled: true,
    },
    {
      id: "gpt-5.6-sol",
      name: "GPT-5.6 Sol",
      provider: "OpenAI",
      tier: "Reasoning",
      context: "Large",
      status: "healthy",
      enabled: true,
    },
    {
      id: "cursor-auto",
      name: "Cursor Auto",
      provider: "Cursor",
      tier: "Coding",
      context: "Provider",
      status: "attention",
      enabled: true,
    },
  ],
  plugins: [
    fixturePlugin({
      id: "plg_brand_demo",
      pluginKey: "agentsam-brand",
      providerKey: "agentsam-brand",
      name: "Brand workspace",
      subtitle: "Approved brand identities, supporting assets, sources and review records.",
      status: "healthy",
      toolCount: 9,
      capabilities: ["brand.identity.read", "brand.assets.read", "brand.sources.read"],
    }),
    fixturePlugin({
      id: "plugin-github",
      pluginKey: "github",
      providerKey: "github",
      name: "GitHub",
      subtitle: "Repository and pull request operations",
      status: "healthy",
      authType: "oauth",
      transport: "http_rest",
      capabilities: ["repository.read", "pull_request.write"],
      toolCount: 8,
    }),
    fixturePlugin({
      id: "plugin-cloudflare",
      pluginKey: "agentsam-mcp",
      providerKey: "cloudflare",
      name: "AgentSam MCP",
      subtitle: "Cloudflare account tools through OAuth",
      status: "healthy",
      authType: "oauth",
      transport: "http_rest",
      capabilities: ["cloudflare.api.search", "cloudflare.api.execute"],
      toolLanes: ["typed", "mcp", "api", "codemode"],
      toolCount: 3,
    }),
    fixturePlugin({
      id: "plugin-figma",
      pluginKey: "figma",
      providerKey: "figma",
      name: "Figma",
      subtitle: "Design inspection and implementation workflows",
      status: "unknown",
      setupStatus: "unconfigured",
      enabled: false,
    }),
  ],
  widgets: fixtureWidgets,
  mcps: [
    {
      id: "mcp-iam",
      name: "inneranimalmedia-mcp-server",
      subtitle: "AgentSam platform tools",
      status: "healthy",
      meta: "48 tools",
    },
    {
      id: "mcp-local",
      name: "Local machine",
      subtitle: "Terminal and device capabilities",
      status: "healthy",
      meta: "Dev machine",
    },
  ],
  skills: [
    {
      id: "skill-repository",
      name: "Repository intelligence",
      subtitle: "Structure, churn and blast-radius analysis",
      status: "healthy",
      meta: "Built in",
    },
    {
      id: "skill-release",
      name: "Package release",
      subtitle: "Discover, verify, pack and release packages",
      status: "healthy",
      meta: "Built in",
    },
  ],
  subagents: [
    {
      id: "sub-coder",
      name: "coder",
      subtitle: "Implementation lane",
      status: "healthy",
      meta: "Enabled",
    },
    {
      id: "sub-architect",
      name: "architect",
      subtitle: "Architecture lane",
      status: "healthy",
      meta: "Enabled",
    },
    {
      id: "sub-specialist",
      name: "specialist",
      subtitle: "Domain specialist lane",
      status: "healthy",
      meta: "Enabled",
    },
  ],
  rules: [
    {
      id: "rule-account",
      name: "Account authority",
      subtitle: "New owned resources use account_id as authority",
      status: "healthy",
      meta: "Policy",
    },
    {
      id: "rule-fail-closed",
      name: "Fail-closed providers",
      subtitle: "No silent model or provider substitutions",
      status: "healthy",
      meta: "Policy",
    },
  ],
  commands: [
    {
      id: "cmd-verify",
      name: "agentsam verify",
      subtitle: "Run contracts, tests and package checks",
      status: "healthy",
      meta: "CLI",
    },
    {
      id: "cmd-device",
      name: "agentsam device connect",
      subtitle: "Enroll a local machine runtime",
      status: "healthy",
      meta: "CLI",
    },
  ],
  hooks: [
    {
      id: "hook-preflight",
      name: "Preflight",
      subtitle: "Run deterministic checks before agent execution",
      status: "healthy",
      meta: "Enabled",
    },
    {
      id: "hook-receipt",
      name: "Runtime receipts",
      subtitle: "Capture structured execution evidence",
      status: "healthy",
      meta: "Enabled",
    },
  ],
  cloudAgents: [
    {
      id: "cloud-remote",
      name: "Cloud desk",
      subtitle: "Persistent remote AgentSam runtime",
      status: "healthy",
      meta: "Online",
    },
    {
      id: "cloud-sandbox",
      name: "Container sandbox",
      subtitle: "Disposable isolated execution",
      status: "healthy",
      meta: "On demand",
    },
  ],
  themes: [
    {
      id: "theme-local",
      name: "AgentSam Graphite",
      packageName: "@inneranimalmedia/agentsam-brand",
      category: "Product",
      swatches: ["#070708", "#151517", "#f5f5f4", "#7c7c82"],
      active: true,
    },
    {
      id: "theme-fuel",
      name: "Ember Supply",
      packageName: "@inneranimalmedia/theme-ember",
      category: "Commerce",
      swatches: ["#111111", "#f4efe4", "#ccff00", "#665f55"],
    },
    {
      id: "theme-shinshu",
      name: "Summit Practice",
      packageName: "@inneranimalmedia/theme-summit",
      category: "Professional",
      swatches: ["#0e1111", "#f4f4ef", "#8ba09f", "#c7b8a5"],
    },
  ],
  storage: [
    {
      id: "storage-sqlite",
      name: "Local SQLite",
      kind: "Local",
      detail: "Runtime metadata and disposable local state",
      status: "healthy",
    },
    {
      id: "storage-d1",
      name: "Cloudflare D1",
      kind: "Hosted",
      detail: "Platform account data and normalized registries",
      status: "healthy",
    },
    {
      id: "storage-r2",
      name: "Cloudflare R2",
      kind: "Hosted",
      detail: "Artifacts, previews and durable object storage",
      status: "healthy",
    },
  ],
  usage: [
    { label: "Model spend", value: "$1.84", detail: "Today" },
    { label: "Tool calls", value: "146", detail: "Today" },
    { label: "Agent runs", value: "18", detail: "Today" },
    { label: "Storage", value: "2.6 GB", detail: "Across active targets" },
  ],
  notifications: [
    {
      id: "notify-runs",
      label: "Agent run completion",
      description: "Notify when long-running work finishes or needs input.",
      enabled: true,
    },
    {
      id: "notify-security",
      label: "Security findings",
      description: "Notify when credentials, policies or provider health need attention.",
      enabled: true,
    },
    {
      id: "notify-release",
      label: "Release checks",
      description: "Notify when a package or deploy preflight changes state.",
      enabled: false,
    },
  ],
  notificationProfile: {
    email: "you@example.com",
    phone: "+1 337 555 0142",
    loginEmail: "you@example.com",
    channels: { email: true, push: true, imessage: false, in_app: true },
    events: [
      {
        id: "notify-runs",
        label: "Agent run completion",
        description: "Notify when long-running work finishes or needs input.",
        enabled: true,
      },
      {
        id: "notify-security",
        label: "Security findings",
        description: "Notify when credentials, policies or provider health need attention.",
        enabled: true,
      },
      {
        id: "notify-release",
        label: "Release checks",
        description: "Notify when a package or deploy preflight changes state.",
        enabled: false,
      },
    ],
  },
  notificationProfileError: null,
  codebase: {
    indexedFiles: "6,482",
    symbols: "18,942",
    dependencies: "1,264",
    branch: "main",
    policy: "Repository is authority; generated indexes are projections.",
  },
  network: {
    browser: "Available",
    tunnel: "Dev machine · connected",
    oauth: "Cloudflare connected",
    health: "healthy",
  },
  git: {
    provider: "GitHub",
    repository: "example/demo-app",
    branch: "main",
    pullRequests: "No open PR for this branch",
    health: "healthy",
  },
  general: {
    account: "You",
    organization: "Demo Org",
    project: "demo-app",
    runtime: "Desktop · local",
    updateChannel: "Development",
  },
};

export const populatedSettingsFixture = baseSnapshot;

export const firstRunSettingsFixture: SettingsSnapshot = {
  ...baseSnapshot,
  fixtureName: "first-run",
  health: "unknown",
  credentials: [],
  agents: [],
  models: [],
  plugins: [],
  widgets: fixtureWidgets.map((widget) => ({ ...widget, installed: false, visible: false, removable: false, pinned: false })),
  mcps: [],
  themes: baseSnapshot.themes.slice(0, 1),
  storage: baseSnapshot.storage.slice(0, 1),
  usage: baseSnapshot.usage.map((item) => ({ ...item, value: "—" })),
  notifications: baseSnapshot.notifications.map((item) => ({ ...item, enabled: false })),
  notificationProfile: {
    email: "",
    phone: "",
    loginEmail: null,
    channels: { email: false, push: false, imessage: false, in_app: true },
    events: baseSnapshot.notifications.map((item) => ({ ...item, enabled: false })),
  },
  network: { browser: "Not checked", tunnel: "Not connected", oauth: "Not connected", health: "unknown" },
  git: { ...baseSnapshot.git, repository: "Not connected", branch: "—", pullRequests: "—", health: "unknown" },
};

export const degradedSettingsFixture: SettingsSnapshot = {
  ...baseSnapshot,
  fixtureName: "degraded",
  health: "attention",
  network: { ...baseSnapshot.network, tunnel: "Reconnect required", health: "attention" },
  storage: baseSnapshot.storage.map((target) =>
    target.id === "storage-r2" ? { ...target, status: "attention", detail: "Credentials need verification" } : target,
  ),
  models: baseSnapshot.models.map((model) =>
    model.provider === "Cursor" ? { ...model, status: "blocked", enabled: false } : model,
  ),
};

export const securityFindingsSettingsFixture: SettingsSnapshot = {
  ...baseSnapshot,
  fixtureName: "security-findings",
  health: "attention",
  credentials: baseSnapshot.credentials.map((credential, index) =>
    index === 1 ? { ...credential, status: "expired", expires: "Expired yesterday" } : credential,
  ),
};


const providerWidgetFixtures: Record<string, AgentSamWidgetProviderData> = {
  "queues": {
    provider: "cloudflare", status: "ready", source: "fixture", accountLabel: "Example Cloudflare account",
    updatedAt: "2026-11-25T12:00:00.000Z",
    data: { collected_at: "2026-11-25T12:00:00.000Z", queues: [{
      queue_id: "demo-orders-queue", queue_name: "orders", environment: "production", owner_app: "storefront",
      delivery_status: "active", producers_total_count: 2, consumers_total_count: 3,
      metrics: { state: "ready", backlog_count: 14, backlog_bytes: 4096, oldest_message_timestamp_ms: Date.now() - 120_000 },
    }] },
  },
  "cloudflare-resources": {
    provider: "cloudflare", status: "ready", source: "fixture", accountLabel: "Example Cloudflare account",
    updatedAt: "2026-11-25T12:00:00.000Z",
    data: { r2: { count: 3, buckets: [{ name: "brand-assets", location: "WNAM" }, { name: "theme-store", location: "ENAM" }, { name: "media-library", location: "WNAM" }] }, images: { count: 12 }, stream: { count: 4 } },
  },
  "github-activity": {
    provider: "github", status: "ready", source: "fixture", accountLabel: "Example GitHub account",
    updatedAt: "2026-11-25T12:00:00.000Z",
    data: { totalCount: 3, repositories: [
      { id: "demo-1", fullName: "example/platform", htmlUrl: "https://github.com/example/platform", private: true, defaultBranch: "main", updatedAt: "2026-11-25T11:20:00Z" },
      { id: "demo-2", fullName: "example/theme-store", htmlUrl: "https://github.com/example/theme-store", private: true, defaultBranch: "main", updatedAt: "2026-11-24T18:10:00Z" },
      { id: "demo-3", fullName: "example/workbench", htmlUrl: "https://github.com/example/workbench", private: false, defaultBranch: "main", updatedAt: "2026-11-23T09:40:00Z" },
    ] },
  },
  "google-drive-recent": {
    provider: "google_drive", status: "ready", source: "fixture", accountLabel: "Example Google Drive account",
    updatedAt: "2026-11-25T12:00:00.000Z",
    data: { files: [
      { id: "drive-demo-1", name: "Brand guidelines.pdf", mimeType: "application/pdf", webViewUrl: "https://drive.google.com/file/d/demo-guide/view", updatedAt: "2026-11-25T09:00:00Z" },
      { id: "drive-demo-2", name: "Homepage concept.fig", mimeType: "application/octet-stream", webViewUrl: "https://drive.google.com/file/d/demo-figma/view", updatedAt: "2026-11-24T16:30:00Z" },
      { id: "drive-demo-3", name: "Product photography.zip", mimeType: "application/zip", webViewUrl: "https://drive.google.com/file/d/demo-photos/view", updatedAt: "2026-11-22T13:10:00Z" },
    ] },
  },
};

export type SettingsFixtureName = "populated" | "first-run" | "degraded" | "security-findings";

export function getSettingsFixture(name: SettingsFixtureName | string | undefined): SettingsSnapshot {
  if (name === "first-run") return firstRunSettingsFixture;
  if (name === "degraded") return degradedSettingsFixture;
  if (name === "security-findings") return securityFindingsSettingsFixture;
  return populatedSettingsFixture;
}

export function createFixtureSettingsHost(
  fixture: SettingsSnapshot = populatedSettingsFixture,
): SettingsHost {
  let current = structuredClone(fixture);
  const subscribers = new Set<() => void>();
  const capabilities: SettingsCapabilities = {
    host: "fixture",
    capabilities: [
      { id: "settings.read", available: true },
      { id: "settings.write", available: true },
      { id: "vault.reveal", available: true },
      { id: "vault.rotate", available: true },
    ],
  };

  return {
    async capabilities() {
      return capabilities;
    },
    async snapshot() {
      return current;
    },
    async setPluginEnabled(id, enabled) {
      current = {
        ...current,
        plugins: current.plugins.map((plugin) =>
          plugin.id === id ? { ...plugin, enabled } : plugin,
        ),
      };
      subscribers.forEach((callback) => callback());
    },
    async updateNotificationSettings(settings: SettingsNotificationProfileUpdate) {
      const events = (current.notificationProfile?.events || current.notifications).map((event) => {
        const next = settings.events.find((row) => row.id === event.id);
        return next ? { ...event, enabled: next.enabled } : event;
      });
      current = {
        ...current,
        notifications: events,
        notificationProfile: {
          email: settings.email,
          phone: settings.phone,
          loginEmail: current.notificationProfile?.loginEmail ?? null,
          channels: { ...settings.channels },
          events,
        },
        notificationProfileError: null,
      };
      subscribers.forEach((callback) => callback());
    },
    async beginPluginSetup() {},
    async disconnectPlugin() {},
    async setWidgetVisible(id, visible) {
      current = {
        ...current,
        widgets: current.widgets.map((widget) =>
          widget.id === id ? { ...widget, visible } : widget,
        ),
      };
      subscribers.forEach((callback) => callback());
    },
    async readWidgetData(id, configuration = {}) {
      const fixture = providerWidgetFixtures[id];
      if (!fixture) return { provider: "cloudflare", status: "unsupported", source: "fixture", message: "No provider fixture is registered." };
      if (current.fixtureName === "first-run") return { provider: fixture.provider, status: "not_connected", source: "fixture", message: "No provider is connected in this first-run fixture." };
      if (current.fixtureName === "degraded") return { provider: fixture.provider, status: "error", source: "fixture", message: "The degraded fixture simulates an unavailable provider read." };
      if (id === "queues" && configuration.history === "24h") return {
        provider: "cloudflare", status: "ready", source: "fixture",
        data: { history: { state: "ready", points: [
          { at: "2026-11-25T08:00:00Z", backlog_count: 2 },
          { at: "2026-11-25T09:00:00Z", backlog_count: 5 },
          { at: "2026-11-25T10:00:00Z", backlog_count: 3 },
          { at: "2026-11-25T11:00:00Z", backlog_count: 14 },
        ] } },
      };
      return structuredClone(fixture);
    },
    async installWidget(id) {
      current = { ...current, widgets: current.widgets.map(widget => widget.id === id ? { ...widget, installed: true, visible: true, removable: true } : widget) };
      subscribers.forEach((callback) => callback());
    },
    async updateWidget(id, update) {
      current = { ...current, widgets: current.widgets.map(widget => widget.id === id ? { ...widget, ...update } : widget) };
      subscribers.forEach((callback) => callback());
    },
    async removeWidget(id) {
      current = { ...current, widgets: current.widgets.map(widget => widget.id === id ? { ...widget, installed: false, visible: false, removable: false, pinned: false } : widget) };
      subscribers.forEach((callback) => callback());
    },
    openWidget() {},
    async upsertCatalogItem(kind, item) {
      current = {
        ...current,
        [kind]: [
          ...current[kind].filter((candidate) => candidate.id !== item.id),
          item,
        ],
      };
      subscribers.forEach((callback) => callback());
    },
    async removeCatalogItem(kind, id) {
      current = {
        ...current,
        [kind]: current[kind].filter((candidate) => candidate.id !== id),
      };
      subscribers.forEach((callback) => callback());
    },
    subscribe(_unitId, callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
  };
}
