export type SettingsUnitId =
  | "general"
  | "agents"
  | "customize"
  | "design"
  | "git-prs"
  | "codebase"
  | "network"
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
};

export type SettingsCatalogItem = {
  id: string;
  name: string;
  subtitle: string;
  status: HealthState;
  meta?: string;
};

export type SettingsTheme = {
  id: string;
  name: string;
  packageName: string;
  category: string;
  swatches: string[];
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
  plugins: SettingsCatalogItem[];
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
}

export function defineSettingsManifest(manifest: SettingsManifest): SettingsManifest {
  return manifest;
}
