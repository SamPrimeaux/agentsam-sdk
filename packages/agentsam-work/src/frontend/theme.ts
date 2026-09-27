import {
  WORK_THEME_CSS_VARS,
  type WorkThemeTokens,
} from "../contracts/index";

export const WORK_THEME_STORAGE_KEY = "agentsam.work.theme.tokens";

export const GCP_WORK_THEME: WorkThemeTokens = Object.freeze({
  canvas: "#f8fbff",
  panel: "#ffffff",
  panelSubtle: "#f0f5fb",
  text: "#202124",
  muted: "#5f6368",
  border: "#d7dee8",
  accent: "#1a73e8",
  accentSoft: "#e8f0fe",
  navActive: "#d2e3fc",
  danger: "#d93025",
  success: "#188038",
  warning: "#f9ab00",
  radius: "16px",
});

export function applyWorkThemeTokens(
  tokens: Partial<WorkThemeTokens>,
  target?: HTMLElement,
) {
  if (typeof document === "undefined" && !target) return;
  const root = target ?? document.documentElement;
  for (const [key, value] of Object.entries(tokens) as Array<
    [keyof WorkThemeTokens, string | undefined]
  >) {
    if (value == null) continue;
    root.style.setProperty(WORK_THEME_CSS_VARS[key], value);
  }
}

export function clearWorkThemeTokens(target?: HTMLElement) {
  if (typeof document === "undefined" && !target) return;
  const root = target ?? document.documentElement;
  for (const cssVar of Object.values(WORK_THEME_CSS_VARS)) {
    root.style.removeProperty(cssVar);
  }
}

export function readStoredWorkThemeTokens(
  storage?: Pick<Storage, "getItem">,
): Partial<WorkThemeTokens> | null {
  const source =
    storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!source) return null;

  try {
    const raw = source.getItem(WORK_THEME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkThemeTokens>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function storeWorkThemeTokens(
  tokens: Partial<WorkThemeTokens>,
  storage?: Pick<Storage, "setItem">,
) {
  const target =
    storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  target?.setItem(WORK_THEME_STORAGE_KEY, JSON.stringify(tokens));
}
