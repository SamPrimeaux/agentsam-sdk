export type ThemeTokens = {
  background: string;
  foreground: string;
  card: string;
  popover: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  input: string;
  ring: string;
  sidebar: string;
  stone: string;
  clay: string;
  paper: string;
  ink: string;
  destructive: string;
};

export type ThemePresetId = "studio-dark" | "bone-paper" | "graphite";

export const THEME_FIELDS: Array<{ key: keyof ThemeTokens; label: string; hint: string }> = [
  { key: "background", label: "Background", hint: "App canvas" },
  { key: "foreground", label: "Foreground", hint: "Primary text" },
  { key: "card", label: "Card", hint: "Panels and composer" },
  { key: "popover", label: "Popover", hint: "Menus and dialogs" },
  { key: "muted", label: "Muted surface", hint: "Chips, rails" },
  { key: "mutedForeground", label: "Muted text", hint: "Secondary copy" },
  { key: "accent", label: "Accent", hint: "Highlights" },
  { key: "accentForeground", label: "Accent text", hint: "On accent" },
  { key: "border", label: "Border", hint: "Hairlines" },
  { key: "input", label: "Input", hint: "Field wells" },
  { key: "ring", label: "Focus ring", hint: "Composer and handles" },
  { key: "sidebar", label: "Sidebar", hint: "Nav rail" },
  { key: "stone", label: "Stone", hint: "Warm highlight" },
  { key: "clay", label: "Clay", hint: "Quiet text" },
  { key: "paper", label: "Paper", hint: "Light surfaces" },
  { key: "ink", label: "Ink", hint: "Deep charcoal" },
  { key: "destructive", label: "Destructive", hint: "Danger" },
];

export const THEME_PRESETS: Record<ThemePresetId, { label: string; tokens: ThemeTokens }> = {
  "studio-dark": {
    label: "Studio dark",
    tokens: {
      background: "#070708",
      foreground: "#f3f1ec",
      card: "#101011",
      popover: "#171718",
      muted: "#171718",
      mutedForeground: "#8a7f72",
      accent: "#c4b8a8",
      accentForeground: "#070708",
      border: "#221f1c",
      input: "#2a2622",
      ring: "#c4b8a8",
      sidebar: "#0b0b0c",
      stone: "#c4b8a8",
      clay: "#8a7f72",
      paper: "#f3f1ec",
      ink: "#070708",
      destructive: "#c45c4a",
    },
  },
  "bone-paper": {
    label: "Bone paper",
    tokens: {
      background: "#f3f1ec",
      foreground: "#070708",
      card: "#ebe7df",
      popover: "#ffffff",
      muted: "#e4dfd6",
      mutedForeground: "#8a7f72",
      accent: "#8a7f72",
      accentForeground: "#f3f1ec",
      border: "#d5cec3",
      input: "#ddd6cb",
      ring: "#8a7f72",
      sidebar: "#ece8e0",
      stone: "#c4b8a8",
      clay: "#8a7f72",
      paper: "#f3f1ec",
      ink: "#070708",
      destructive: "#c45c4a",
    },
  },
  graphite: {
    label: "Graphite",
    tokens: {
      background: "#111214",
      foreground: "#eceff1",
      card: "#181a1d",
      popover: "#1e2125",
      muted: "#1e2125",
      mutedForeground: "#9aa0a6",
      accent: "#8ab4f8",
      accentForeground: "#0b1220",
      border: "#2a2e33",
      input: "#2f343a",
      ring: "#8ab4f8",
      sidebar: "#141618",
      stone: "#c4b8a8",
      clay: "#9aa0a6",
      paper: "#eceff1",
      ink: "#111214",
      destructive: "#e06c5c",
    },
  },
};

export const CSS_VAR_MAP: Record<keyof ThemeTokens, string[]> = {
  background: ["--color-background"],
  foreground: ["--color-foreground", "--color-card-foreground", "--color-popover-foreground", "--color-primary", "--color-secondary-foreground"],
  card: ["--color-card"],
  popover: ["--color-popover", "--color-secondary", "--color-muted"],
  muted: ["--color-muted"],
  mutedForeground: ["--color-muted-foreground"],
  accent: ["--color-accent"],
  accentForeground: ["--color-accent-foreground"],
  border: ["--color-border"],
  input: ["--color-input"],
  ring: ["--color-ring"],
  sidebar: ["--color-sidebar"],
  stone: ["--color-stone"],
  clay: ["--color-clay"],
  paper: ["--color-paper"],
  ink: ["--color-ink", "--color-primary-foreground"],
  destructive: ["--color-destructive"],
};

const STORAGE_KEY = "agentsam.theme.v1";

export type StoredTheme = {
  preset: ThemePresetId | "custom";
  tokens: ThemeTokens;
  monacoBase: "vs-dark" | "vs";
};

export function defaultTheme(): StoredTheme {
  return {
    preset: "studio-dark",
    tokens: { ...THEME_PRESETS["studio-dark"].tokens },
    monacoBase: "vs-dark",
  };
}

export function readTheme(): StoredTheme {
  if (typeof window === "undefined") return defaultTheme();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultTheme();
    const parsed = JSON.parse(raw) as Partial<StoredTheme>;
    return {
      ...defaultTheme(),
      ...parsed,
      tokens: { ...defaultTheme().tokens, ...(parsed.tokens ?? {}) },
    };
  } catch {
    return defaultTheme();
  }
}

export function writeTheme(theme: StoredTheme) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
}

export function applyTheme(theme: StoredTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [key, vars] of Object.entries(CSS_VAR_MAP) as Array<[keyof ThemeTokens, string[]]>) {
    const value = theme.tokens[key];
    for (const name of vars) root.style.setProperty(name, value);
  }
  root.dataset.themePreset = theme.preset;
  root.dataset.monacoBase = theme.monacoBase;
}

export function hexNoHash(hex: string) {
  return hex.replace("#", "").toUpperCase();
}
