import type { SettingsCapabilities, SettingsHost, SettingsSnapshot } from "@inneranimalmedia/agentsam-settings/contracts";

const snapshot: SettingsSnapshot = {
  fixtureName: "production",
  environmentLabel: "Local Studio",
  repositoryLabel: "Not connected",
  health: "unknown",
  credentials: [],
  agents: [],
  models: [],
  plugins: [],
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
    browser: "Not checked",
    tunnel: "Not connected",
    oauth: "Not connected",
    health: "unknown",
  },
  git: {
    provider: "Not connected",
    repository: "Not connected",
    branch: "—",
    pullRequests: "Not checked",
    health: "unknown",
  },
  general: {
    account: "Not connected",
    organization: "Not connected",
    project: "Not connected",
    runtime: "Not checked",
    updateChannel: "Not checked",
  },
};

const capabilities: SettingsCapabilities = {
  host: "local-studio",
  capabilities: [{ id: "settings.read", available: true }],
};

export const localStudioSettingsHost: SettingsHost = {
  async capabilities() {
    return capabilities;
  },
  async snapshot() {
    return snapshot;
  },
};
