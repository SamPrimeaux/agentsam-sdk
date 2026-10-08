export type SettingsUnitId =
  | "general"
  | "agents"
  | "customize"
  | "design"
  | "git-prs"
  | "codebase"
  | "network"
  | "runtime"
  | "themes"
  | "storage"
  | "keys"
  | "usage"
  | "notifications"
  | "docs";

export type SettingsIconKey =
  | "settings"
  | "bot"
  | "sliders"
  | "palette"
  | "git"
  | "code"
  | "network"
  | "runtime"
  | "theme"
  | "storage"
  | "key"
  | "usage"
  | "bell"
  | "docs";

export type SettingsViewDefinition = {
  id: string;
  label: string;
};

export type SettingsUnitDefinition = {
  id: SettingsUnitId;
  label: string;
  description: string;
  icon: SettingsIconKey;
  views?: SettingsViewDefinition[];
};

export type SettingsManifest = {
  productName: string;
  units: SettingsUnitDefinition[];
};

export type HealthState = "healthy" | "attention" | "blocked" | "unknown";

export type SettingsCapability = {
  id: string;
  available: boolean;
  reason?: string;
};

export type SettingsCapabilities = {
  host: string;
  capabilities: SettingsCapability[];
};

export type CredentialKind = "account" | "service" | "provider";

export type SettingsCredential = {
  id: string;
  name: string;
  kind: CredentialKind;
  provider?: string;
  status: "active" | "revoked" | "expired";
  trackingId: string;
  secretPreview: string;
  created: string;
  expires: string;
  lastUsed: string;
  createdBy: string;
  permissions: string;
  monthlySpend: string;
};

export type SettingsAgent = {
  id: string;
  name: string;
  role: string;
  model: string;
  status: HealthState;
  detail: string;
};

export type SettingsModel = {
  id: string;
  name: string;
  provider: string;
  tier: string;
  context: string;
  status: HealthState;
  enabled: boolean;
  source?: string | null;
  selected?: boolean;
  verifiedAt?: string | null;
};

export type SettingsCatalogItem = {
  id: string;
  name: string;
  subtitle: string;
  status: HealthState;
  meta?: string;
  /** Account-owned instruction body, not a generated template. */
  content?: string;
  trigger?: string;
};

export type SettingsPlugin = SettingsCatalogItem & {
  pluginKey: string;
  providerKey: string;
  installationKey: string;
  environment: string;
  kind: string;
  category: string;
  transport: string;
  authType: string;
  setupStatus: string;
  healthStatus: string;
  healthStrategy: string;
  enabled: boolean;
  composerVisible: boolean;
  settingsVisible: boolean;
  setupUrl?: string | null;
  disconnectUrl?: string | null;
  iconUrl?: string | null;
  iconDarkUrl?: string | null;
  iconAlt?: string | null;
  iconFit?: "contain" | "cover";
  capabilities: string[];
  toolLanes: string[];
  toolCount: number;
  lastHealthAt?: number | null;
  lastHealthyAt?: number | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
};

/** Operator-reviewed plugin catalog entries, never implicit permission grants. */
export type SettingsDiscoveredPlugin = {
  pluginKey: string;
  name: string;
  subtitle: string;
  description: string;
  publisher: string;
  iconUrl: string | null;
  publisherIconUrl?: string | null;
  category: string;
  version: string;
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
export type SettingsPluginDiscovery = {
  plugins: SettingsDiscoveredPlugin[];
  errors: { source: string; reason: string }[];
  configuredSources: number;
};

export type SettingsWidget = {
  id: string;
  name: string;
  description: string;
  kind: string;
  icon?: string | null;
  sizes: string[];
  visible: boolean;
  removable: boolean;
  source: string;
  preferenceScope: string;
  deeplink?: string | null;
  /** Portable widget gallery metadata; undefined means a legacy ready widget. */
  category?: string;
  tags?: string[];
  availability?: "ready" | "demo";
  ownerPackage?: string;
};

export type SettingsCatalogKind =
  | "plugins"
  | "mcps"
  | "skills"
  | "subagents"
  | "rules"
  | "commands"
  | "hooks";

export type SettingsTheme = {
  id: string;
  name: string;
  packageName: string;
  category: string;
  swatches: string[];
  version?: string;
  source?: 'bundled' | 'installed' | 'workspace' | 'local' | 'imported';
  status?: string;
  previewUrl?: string;
  capabilities?: { preview: boolean; editable: boolean; duplicable: boolean; publishable: boolean };
  active?: boolean;
};

export type SettingsStorageTarget = {
  id: string;
  name: string;
  kind: string;
  detail: string;
  status: HealthState;
};

export type SettingsUsage = {
  label: string;
  value: string;
  detail: string;
};

export type SettingsNotification = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
};

export type SettingsSnapshot = {
  fixtureName: string;
  environmentLabel: string;
  repositoryLabel: string;
  health: HealthState;
  credentials: SettingsCredential[];
  agents: SettingsAgent[];
  models: SettingsModel[];
  plugins: SettingsPlugin[];
  widgets: SettingsWidget[];
  mcps: SettingsCatalogItem[];
  skills: SettingsCatalogItem[];
  subagents: SettingsCatalogItem[];
  rules: SettingsCatalogItem[];
  commands: SettingsCatalogItem[];
  hooks: SettingsCatalogItem[];
  cloudAgents: SettingsCatalogItem[];
  themes: SettingsTheme[];
  storage: SettingsStorageTarget[];
  usage: SettingsUsage[];
  notifications: SettingsNotification[];
  codebase: {
    indexedFiles: string;
    symbols: string;
    dependencies: string;
    branch: string;
    policy: string;
  };
  network: {
    browser: string;
    tunnel: string;
    oauth: string;
    health: HealthState;
  };
  git: {
    provider: string;
    repository: string;
    branch: string;
    pullRequests: string;
    health: HealthState;
  };
  general: {
    account: string;
    organization: string;
    project: string;
    runtime: string;
    updateChannel: string;
  };
};

export interface SettingsHost {
  capabilities(): Promise<SettingsCapabilities>;
  snapshot(): Promise<SettingsSnapshot>;
  upsertCatalogItem?(kind: SettingsCatalogKind, item: SettingsCatalogItem): Promise<void>;
  removeCatalogItem?(kind: SettingsCatalogKind, id: string): Promise<void>;
  discoverPlugins?(): Promise<SettingsPluginDiscovery>;
  installPluginFromCatalog?(pluginKey: string): Promise<void>;
  removeCatalogPlugin?(pluginId: string): Promise<void>;
  readPluginWorkspace?(pluginId: string): Promise<{pluginKey:string;contextTool:string;result:unknown}>;
  setPluginEnabled?(id: string, enabled: boolean): Promise<void>;
  beginPluginSetup?(id: string, options?: {allowWrites?: boolean}): Promise<void>;
  disconnectPlugin?(id: string): Promise<void>;
  setWidgetVisible?(id: string, visible: boolean): Promise<void>;
  openWidget?(id: string): void;
  removeWidget?(id: string): Promise<void>;
  activateTheme?(id: string): Promise<void>;
  editTheme?(id: string): Promise<void>;
  duplicateTheme?(id: string, name: string): Promise<void>;
  createTheme?(name: string): Promise<void>;
  importTheme?(project: unknown): Promise<void>;
  exportTheme?(id: string): Promise<void>;
  subscribe?(unitId: SettingsUnitId, callback: () => void): () => void;
}

export function defineSettingsManifest(manifest: SettingsManifest): SettingsManifest {
  return manifest;
}

