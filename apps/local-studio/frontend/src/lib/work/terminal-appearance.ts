/**
 * Terminal appearance — one theme authority, per-session overrides on top.
 *
 *   base      account theme projection (`readTheme()` tokens; CMS theme default)
 *   profile   named palette: "cms" (follow base) or a Local/Remote/Sandbox lane
 *   override  per-session background / foreground / font size / line height
 *
 * Lane palettes are the app's published LOCAL / CLOUD(remote) / SANDBOX
 * xterm palettes. Changing one session writes
 * only that session's override; it never touches the app theme or other sessions.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useEffect, useState } from "react";
import { readTheme, type ThemeTokens } from "./theme.ts";

export type TerminalProfileId = "cms" | "local" | "remote" | "sandbox";

export const TERMINAL_PROFILES: ReadonlyArray<{ id: TerminalProfileId; label: string; hint: string }> = [
  { id: "cms", label: "Theme Default", hint: "Follows the account theme" },
  { id: "local", label: "Local", hint: "Current machine · real shell" },
  { id: "remote", label: "Remote", hint: "Connected remote runtime" },
  { id: "sandbox", label: "Sandbox", hint: "Isolated disposable runtime" },
];

export type SessionAppearance = {
  profileId?: TerminalProfileId;
  background?: string;
  foreground?: string;
  fontSize?: number;
  lineHeight?: number;
};

export type XtermPalette = {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  selectionForeground?: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite: string;
};

export type ResolvedAppearance = {
  profileId: TerminalProfileId;
  profileLabel: string;
  theme: XtermPalette;
  fontSize: number;
  lineHeight: number;
  minimumContrastRatio: number;
  /** WCAG contrast of foreground on background; xterm also enforces the minimum per cell. */
  contrast: number;
  customized: boolean;
};

export const DEFAULT_FONT_SIZE = 12.5;
export const DEFAULT_LINE_HEIGHT = 1.35;
export const FONT_SIZE_RANGE = { min: 10, max: 24 } as const;
export const LINE_HEIGHT_RANGE = { min: 1, max: 2 } as const;
export const MIN_CONTRAST_RATIO = 4.5;

/** Lane-specific values from src/ui/theme.js `makeLane`; ANSI colors are shared by every lane. */
export const LANE_PALETTES = {
  local: { background: "#0d0900", primary: "#f59e0b" },
  remote: { background: "#000d0b", primary: "#22d3c8" },
  sandbox: { background: "#06020d", primary: "#a78bfa" },
} as const;

export const LANE_ANSI = {
  foreground: "#e8e8e8",
  black: "#080808",
  brightBlack: "#3d3d3d",
  red: "#ef4444",
  brightRed: "#ff6b6b",
  green: "#22c55e",
  brightGreen: "#4ade80",
  yellow: "#f59e0b",
  brightYellow: "#fbbf24",
  blue: "#38bdf8",
  brightBlue: "#7dd3fc",
  magenta: "#a78bfa",
  brightMagenta: "#c4b5fd",
  cyan: "#22d3c8",
  brightCyan: "#5eead4",
  white: "#aaaaaa",
  brightWhite: "#e8e8e8",
} as const;

const HEX = /^#[0-9a-f]{6}$/i;
const LIGHT_TEXT = "#f3f1ec";
const DARK_TEXT = "#070708";

export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const prefixed = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return HEX.test(prefixed) ? prefixed.toLowerCase() : null;
}

function channel(value: number) {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const h = normalizeHex(hex);
  if (!h) return 0;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Keep `preferred` when it is readable on `background`; otherwise pick light or dark text. */
export function readableForeground(background: string, preferred: string): string {
  if (contrastRatio(preferred, background) >= MIN_CONTRAST_RATIO) return preferred;
  return contrastRatio(LIGHT_TEXT, background) >= contrastRatio(DARK_TEXT, background) ? LIGHT_TEXT : DARK_TEXT;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampFontSize(value: number) {
  return Math.round(clamp(value, FONT_SIZE_RANGE.min, FONT_SIZE_RANGE.max) * 2) / 2;
}

export function clampLineHeight(value: number) {
  return Math.round(clamp(value, LINE_HEIGHT_RANGE.min, LINE_HEIGHT_RANGE.max) * 20) / 20;
}

/** The existing Studio terminal palette, now derived from theme tokens instead of hardcoded. */
export function cmsPalette(tokens: Pick<ThemeTokens, "background" | "foreground" | "accent" | "clay" | "destructive">): XtermPalette {
  return {
    background: tokens.background,
    foreground: tokens.foreground,
    cursor: tokens.accent,
    cursorAccent: tokens.background,
    selectionBackground: `${tokens.accent}55`,
    black: tokens.background,
    red: tokens.destructive,
    green: tokens.accent,
    yellow: tokens.accent,
    blue: tokens.clay,
    magenta: tokens.accent,
    cyan: tokens.clay,
    white: tokens.foreground,
    brightBlack: tokens.clay,
    brightWhite: tokens.foreground,
  };
}

export function lanePalette(lane: "local" | "remote" | "sandbox"): XtermPalette {
  const { background, primary } = LANE_PALETTES[lane];
  return {
    ...LANE_ANSI,
    background,
    cursor: primary,
    cursorAccent: background,
    selectionBackground: `${primary}44`,
    selectionForeground: LANE_ANSI.foreground,
  };
}

export type ResolveInput = {
  tokens: Pick<ThemeTokens, "background" | "foreground" | "accent" | "clay" | "destructive">;
  defaultProfileId: TerminalProfileId;
  override?: SessionAppearance;
};

export function resolveAppearance({ tokens, defaultProfileId, override }: ResolveInput): ResolvedAppearance {
  const profileId = override?.profileId ?? defaultProfileId;
  const theme = profileId === "cms" ? cmsPalette(tokens) : lanePalette(profileId);
  const background = normalizeHex(override?.background);
  const foreground = normalizeHex(override?.foreground);
  if (background) {
    theme.background = background;
    theme.cursorAccent = background;
    // A custom background must stay legible without the user also picking a foreground.
    theme.foreground = readableForeground(background, theme.foreground);
    theme.brightWhite = theme.foreground;
    if (profileId === "cms") {
      theme.black = background;
      theme.white = theme.foreground;
    }
  }
  if (foreground) {
    theme.foreground = foreground;
    theme.brightWhite = foreground;
  }
  const label = TERMINAL_PROFILES.find((p) => p.id === profileId)?.label ?? "Theme Default";
  return {
    profileId,
    profileLabel: label,
    theme,
    fontSize: clampFontSize(override?.fontSize ?? DEFAULT_FONT_SIZE),
    lineHeight: clampLineHeight(override?.lineHeight ?? DEFAULT_LINE_HEIGHT),
    minimumContrastRatio: MIN_CONTRAST_RATIO,
    contrast: contrastRatio(theme.foreground, theme.background),
    customized: Boolean(override && Object.values(override).some((v) => v !== undefined)),
  };
}

type AppearanceState = {
  defaultProfileId: TerminalProfileId;
  sessions: Record<string, SessionAppearance>;
  setDefaultProfile(id: TerminalProfileId): void;
  patchSession(sessionId: string, patch: SessionAppearance): void;
  setProfile(sessionId: string, id: TerminalProfileId): void;
  resetSession(sessionId: string): void;
  prune(validSessionIds: string[]): void;
};

const PROFILE_IDS = new Set<string>(TERMINAL_PROFILES.map((p) => p.id));

function sanitize(patch: SessionAppearance): SessionAppearance {
  const out: SessionAppearance = {};
  if (patch.profileId !== undefined && PROFILE_IDS.has(patch.profileId)) out.profileId = patch.profileId;
  const bg = normalizeHex(patch.background);
  if (bg) out.background = bg;
  const fg = normalizeHex(patch.foreground);
  if (fg) out.foreground = fg;
  if (typeof patch.fontSize === "number" && Number.isFinite(patch.fontSize)) out.fontSize = clampFontSize(patch.fontSize);
  if (typeof patch.lineHeight === "number" && Number.isFinite(patch.lineHeight)) out.lineHeight = clampLineHeight(patch.lineHeight);
  return out;
}

export const useTerminalAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      defaultProfileId: "cms",
      sessions: {},
      setDefaultProfile(id) {
        if (PROFILE_IDS.has(id)) set({ defaultProfileId: id });
      },
      patchSession(sessionId, patch) {
        if (!sessionId) return;
        set((state) => ({
          sessions: { ...state.sessions, [sessionId]: { ...state.sessions[sessionId], ...sanitize(patch) } },
        }));
      },
      setProfile(sessionId, id) {
        if (!sessionId || !PROFILE_IDS.has(id)) return;
        set((state) => {
          // Choosing a named profile replaces that session's custom colors only.
          const { fontSize, lineHeight } = state.sessions[sessionId] ?? {};
          return { sessions: { ...state.sessions, [sessionId]: { profileId: id, fontSize, lineHeight } } };
        });
      },
      resetSession(sessionId) {
        set((state) => {
          if (!(sessionId in state.sessions)) return state;
          const { [sessionId]: _removed, ...rest } = state.sessions;
          return { sessions: rest };
        });
      },
      prune(validSessionIds) {
        const valid = new Set(validSessionIds);
        set((state) => {
          const keys = Object.keys(state.sessions);
          if (keys.every((key) => valid.has(key))) return state;
          return { sessions: Object.fromEntries(Object.entries(state.sessions).filter(([key]) => valid.has(key))) };
        });
      },
    }),
    {
      name: "agentsam-terminal-appearance-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ defaultProfileId: state.defaultProfileId, sessions: state.sessions }),
    },
  ),
);

export function resolveSessionAppearance(sessionId: string): ResolvedAppearance {
  const { defaultProfileId, sessions } = useTerminalAppearanceStore.getState();
  return resolveAppearance({ tokens: readTheme().tokens, defaultProfileId, override: sessions[sessionId] });
}

/** Re-resolve when this session's override, the default profile, or the account theme changes. */
export function watchSessionAppearance(sessionId: string, apply: (next: ResolvedAppearance) => void): () => void {
  let last = JSON.stringify(resolveSessionAppearance(sessionId));
  const check = () => {
    const next = resolveSessionAppearance(sessionId);
    const key = JSON.stringify(next);
    if (key === last) return;
    last = key;
    apply(next);
  };
  const unsubscribe = useTerminalAppearanceStore.subscribe(check);
  // The shell applies the theme in its own listener for this event; re-read after it ran.
  const onTheme = () => setTimeout(check, 0);
  if (typeof window !== "undefined") {
    window.addEventListener("agentsam:shell-appearance", onTheme);
    window.addEventListener("agentsam:theme-registry-changed", onTheme);
  }
  return () => {
    unsubscribe();
    if (typeof window !== "undefined") {
      window.removeEventListener("agentsam:shell-appearance", onTheme);
      window.removeEventListener("agentsam:theme-registry-changed", onTheme);
    }
  };
}

export function useSessionAppearance(sessionId: string): ResolvedAppearance {
  const [appearance, setAppearance] = useState(() => resolveSessionAppearance(sessionId));
  useEffect(() => {
    setAppearance(resolveSessionAppearance(sessionId));
    return watchSessionAppearance(sessionId, setAppearance);
  }, [sessionId]);
  return appearance;
}

/** Native NSColorPanel (and the in-app picker) write a live background for one session. */
export function applySessionBackground(sessionId: string, hex: string) {
  const normalized = normalizeHex(hex);
  if (!normalized) return false;
  useTerminalAppearanceStore.getState().patchSession(sessionId, { background: normalized });
  return true;
}
