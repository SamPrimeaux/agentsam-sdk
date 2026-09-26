import {
  defineSettingsManifest,
  type SettingsUnitId,
} from "@inneranimalmedia/agentsam-settings/contracts";

export const localStudioSettingsManifest = defineSettingsManifest({
  productName: "Local Studio",
  units: [
    {
      id: "general",
      label: "Account",
      description: "Account, appearance, project, runtime and application preferences.",
      icon: "settings",
    },
    {
      id: "agents",
      label: "Agents",
      description: "Configure agents, cloud execution, model inventory and execution policy.",
      icon: "bot",
      views: [
        { id: "agents", label: "Agents" },
        { id: "cloud", label: "Cloud Agents" },
        { id: "models", label: "Models" },
        { id: "policy", label: "Policy" },
      ],
    },
    {
      id: "customize",
      label: "Customize",
      description: "Plugins, MCPs, skills, subagents, rules, commands and hooks.",
      icon: "sliders",
      views: [
        { id: "plugins", label: "Plugins" },
        { id: "mcps", label: "MCPs" },
        { id: "skills", label: "Skills" },
        { id: "subagents", label: "Subagents" },
        { id: "rules", label: "Rules" },
        { id: "commands", label: "Commands" },
        { id: "hooks", label: "Hooks" },
      ],
    },
    {
      id: "design",
      label: "Brand & Design",
      description: "Semantic brand contracts, visual tokens, editor behavior and design projections.",
      icon: "palette",
    },
    {
      id: "git-prs",
      label: "Git & PRs",
      description: "Repository connection, branch policy, pull requests and verification gates.",
      icon: "git",
    },
    {
      id: "codebase",
      label: "Codebase",
      description: "Repository intelligence, structural indexes and codebase policy.",
      icon: "code",
    },
    {
      id: "network",
      label: "Browser & Network",
      description: "Browser runtime, local device tunnel, provider OAuth and network capability health.",
      icon: "network",
    },
    {
      id: "themes",
      label: "Themes",
      description: "Browse installed visual projections and the active product theme.",
      icon: "theme",
    },
    {
      id: "storage",
      label: "Storage",
      description: "Local and hosted storage targets used by AgentSam products.",
      icon: "storage",
    },
    {
      id: "keys",
      label: "Keys & Secrets",
      description:
        "Account-scoped BYOK for Studio chat, providers, and terminal. You name each secret — no project scope.",
      icon: "key",
    },
    {
      id: "usage",
      label: "Plan & Usage",
      description: "Model spend, tool activity, storage and runtime limits.",
      icon: "usage",
    },
    {
      id: "notifications",
      label: "Notifications",
      description: "Choose which actionable product events should interrupt you.",
      icon: "bell",
    },
    {
      id: "docs",
      label: "Docs",
      description: "Product contracts and documentation for Local Studio capabilities.",
      icon: "docs",
    },
  ],
});

const settingsUnitIds = new Set(
  localStudioSettingsManifest.units.map((unit) => unit.id),
);

export function normalizeSettingsUnit(value: string | undefined): SettingsUnitId {
  return settingsUnitIds.has(value as SettingsUnitId)
    ? (value as SettingsUnitId)
    : "general";
}
