import { cmsConfig } from "../../cms.config";

export interface CMSThemeRecord {
  slug: string;
  name: string;
  theme_family: "light" | "dark";
  css_vars_json: Record<string, string>;
  tokens_json?: Record<string, unknown>;
  typography_json?: Record<string, unknown>;
  motion_json?: Record<string, unknown>;
}

// Default fallback theme matching template extracted values
export const plainJaneTheme: CMSThemeRecord = {
  slug: "plain-jane",
  name: "Plain Jane",
  theme_family: "light",
  css_vars_json: {
    "--bg": "#F9F8F6",
    "--text": "#1A1A1A",
    "--text-muted": "#4A4A4A",
    "--accent": "#D96C4A",
    "--border-subtle": "rgba(26, 26, 26, 0.05)",
    "--border-divider": "rgba(26, 26, 26, 0.10)",
    "--border-input": "rgba(26, 26, 26, 0.20)",
    "--overlay-scrim": "rgba(26, 26, 26, 0.60)",
    "--hero-gradient": "rgba(26, 26, 26, 0.80)",
    "--lightbox-bg": "rgba(26, 26, 26, 0.95)",
    "--selection-bg": "rgba(217, 108, 74, 0.20)",
  },
  tokens_json: {
    radius: {
      none: "0px",
      sm: "2px",
      full: "9999px",
    },
    spacing: {
      xs: "4px",
      sm: "8px",
      md: "16px",
      lg: "24px",
      xl: "32px",
      "2xl": "48px",
      "3xl": "64px",
      "4xl": "96px",
    },
    shadows: {
      subtle: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
      card: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
      overlay: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
    },
  },
  typography_json: {
    font_sans: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
    font_serif: '"Playfair Display", ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
    scale: {
      xs: "0.75rem",
      sm: "0.875rem",
      base: "1rem",
      lg: "1.125rem",
      xl: "1.25rem",
      "2xl": "1.5rem",
      "3xl": "1.875rem",
      "4xl": "2.25rem",
      "5xl": "3rem",
      "6xl": "3.75rem",
      "7xl": "4.5rem",
    },
  },
  motion_json: {
    easing: [0.16, 1, 0.3, 1],
    durations: {
      fast: "0.3s",
      normal: "0.6s",
      slow: "0.8s",
    },
  },
};

/**
 * Loads the theme by slug and writes css_vars_json onto :root. Nothing else.
 */
export async function applyTheme(themeSlug: string = cmsConfig.themeSlug): Promise<void> {
  let theme: CMSThemeRecord = plainJaneTheme;

  try {
    const res = await fetch(`${cmsConfig.apiBase}/themes/${encodeURIComponent(themeSlug)}`);
    if (res.ok) {
      const data = (await res.json()) as CMSThemeRecord;
      if (data && data.css_vars_json) {
        theme = data;
      }
    }
  } catch {
    // Non-fatal: fallback to bundled theme
  }

  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.css_vars_json)) {
    root.style.setProperty(key, value);
  }
}
