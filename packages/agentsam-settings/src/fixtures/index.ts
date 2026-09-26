import type {
  SettingsCapabilities,
  SettingsHost,
  SettingsSnapshot,
} from "../contracts/index";

const baseSnapshot: SettingsSnapshot = {
  fixtureName: "populated",
  environmentLabel: "Local Studio · localhost",
  repositoryLabel: "agentsam-sdk",
  health: "healthy",
  credentials: [
    {
      id: "cred_account_primary",
      name: "Sams-iMac · CLI",
      kind: "account",
      status: "active",
      trackingId: "aac_demo_7fc2",
      secretPreview: "aak_••••••••••7fc2",
      created: "Sep 12, 2026",
      expires: "Never",
      lastUsed: "2 min ago",
      createdBy: "Sam",
      permissions: "All",
      monthlySpend: "$0.84",
    },
    {
      id: "cred_service_studio",
      name: "Local Studio prod",
      kind: "service",
      status: "active",
      trackingId: "brk_demo_93a1",
      secretPreview: "brk_••••••••••93a1",
      created: "Sep 24, 2026",
      expires: "Dec 24, 2026",
      lastUsed: "18 min ago",
      createdBy: "Sam",
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
      createdBy: "Sam",
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
    {
      id: "plugin-github",
      name: "GitHub",
      subtitle: "Repository and pull request operations",
      status: "healthy",
      meta: "Connected",
    },
    {
      id: "plugin-cloudflare",
      name: "Cloudflare",
      subtitle: "Workers, D1, R2, DNS and account resources",
      status: "healthy",
      meta: "OAuth",
    },
    {
      id: "plugin-figma",
      name: "Figma",
      subtitle: "Design inspection and implementation workflows",
      status: "unknown",
      meta: "Optional",
    },
  ],
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
      meta: "Sams-iMac",
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
      name: "Fuel N Free",
      packageName: "@inneranimalmedia/theme-fuelnfree-site",
      category: "Commerce",
      swatches: ["#111111", "#f4efe4", "#ccff00", "#665f55"],
    },
    {
      id: "theme-shinshu",
      name: "Shinshu Solutions",
      packageName: "@inneranimalmedia/theme-shinshu-site",
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
  codebase: {
    indexedFiles: "6,482",
    symbols: "18,942",
    dependencies: "1,264",
    branch: "feat/settings-v2-localhost-20260926",
    policy: "Repository is authority; generated indexes are projections.",
  },
  network: {
    browser: "Available",
    tunnel: "Sams-iMac · connected",
    oauth: "Cloudflare connected",
    health: "healthy",
  },
  git: {
    provider: "GitHub",
    repository: "SamPrimeaux/agentsam-sdk",
    branch: "feat/settings-v2-localhost-20260926",
    pullRequests: "No open PR for this branch",
    health: "healthy",
  },
  general: {
    account: "Sam",
    organization: "InnerAnimalMedia",
    project: "agentsam-sdk",
    runtime: "Local Studio · Mac",
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
  mcps: [],
  themes: baseSnapshot.themes.slice(0, 1),
  storage: baseSnapshot.storage.slice(0, 1),
  usage: baseSnapshot.usage.map((item) => ({ ...item, value: "—" })),
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
      return fixture;
    },
  };
}
