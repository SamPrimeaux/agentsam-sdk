/**
 * Provider personalities for the Database Studio surface only.
 * AgentSam shell chrome stays dark/stable outside `.db-editor`.
 */

export type DatabaseProviderTheme = {
  id: "cloudflare" | "supabase" | "local" | "postgres-generic";
  surface: string;
  panel: string;
  panelRaised: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentStrong: string;
  grid: string;
  danger: string;
  chart: string;
  toolbar: string;
};

export const DATABASE_PROVIDER_THEMES: Record<DatabaseProviderTheme["id"], DatabaseProviderTheme> = {
  cloudflare: {
    id: "cloudflare",
    surface: "#f4f5f7",
    panel: "#ffffff",
    panelRaised: "#ffffff",
    text: "#1d1f24",
    muted: "#5b6170",
    border: "rgba(70, 80, 100, 0.14)",
    accent: "#8b5cf6",
    accentStrong: "#6d28d9",
    grid: "rgba(70, 80, 100, 0.08)",
    danger: "#dc2626",
    chart: "#8b5cf6",
    toolbar: "#eceef3",
  },
  supabase: {
    id: "supabase",
    surface: "#0c0f0e",
    panel: "#141918",
    panelRaised: "#1a211f",
    text: "#f4f2ee",
    muted: "rgba(244,242,238,.52)",
    border: "rgba(255,255,255,.09)",
    accent: "#27c67b",
    accentStrong: "#118f59",
    grid: "rgba(255,255,255,.055)",
    danger: "#ef4444",
    chart: "#27c67b",
    toolbar: "#101412",
  },
  local: {
    id: "local",
    surface: "#12141a",
    panel: "#1a1d26",
    panelRaised: "#222632",
    text: "#e8eaef",
    muted: "rgba(232,234,239,.55)",
    border: "rgba(160,168,184,.14)",
    accent: "#8ab4f8",
    accentStrong: "#6b8fc4",
    grid: "rgba(160,168,184,.08)",
    danger: "#f87171",
    chart: "#8ab4f8",
    toolbar: "#0e1016",
  },
  "postgres-generic": {
    id: "postgres-generic",
    surface: "#0f1218",
    panel: "#161b24",
    panelRaised: "#1c2330",
    text: "#eef2f8",
    muted: "rgba(238,242,248,.52)",
    border: "rgba(255,255,255,.09)",
    accent: "#3b82f6",
    accentStrong: "#1d4ed8",
    grid: "rgba(255,255,255,.055)",
    danger: "#ef4444",
    chart: "#3b82f6",
    toolbar: "#0c0f14",
  },
};

export function themeIdForProviderFamily(
  family: string,
): DatabaseProviderTheme["id"] {
  if (family === "cloudflare") return "cloudflare";
  if (family === "supabase") return "supabase";
  if (family === "local") return "local";
  return "postgres-generic";
}

export function cssVarsForTheme(theme: DatabaseProviderTheme): Record<string, string> {
  return {
    "--db-bg": theme.surface,
    "--db-panel": theme.panel,
    "--db-panel-2": theme.panelRaised,
    "--db-text": theme.text,
    "--db-muted": theme.muted,
    "--db-border": theme.border,
    "--db-accent": theme.accent,
    "--db-accent-2": theme.accentStrong,
    "--db-grid": theme.grid,
    "--db-danger": theme.danger,
    "--db-chart": theme.chart,
    "--db-toolbar": theme.toolbar,
  };
}
