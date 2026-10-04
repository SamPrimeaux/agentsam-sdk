/**
 * @inneranimalmedia/agentsam-abs — Theme Tokens and Utilities
 *
 * Selected Palette:
 * Canvas:      #090A0E
 * Surface:     #101117
 * Raised:      #171822
 * Text:        #F7F5FB
 * Muted:       #B5B1C0
 * Accent:      #8B5CF6
 * Accent soft: #B69AF8
 * Positive:    #4ADE9B
 */

export interface AbsThemeTokens {
  appBg: string;
  appCanvasBg: string;
  appSurface1: string;
  appSurface2: string;
  appSurface3: string;
  appBorder: string;
  appTextPrimary: string;
  appTextSecondary: string;
  appTextMuted: string;
  appAccent: string;
  appAccentSoft: string;
  appAccentGlow: string;
  appSuccess: string;
  appWarning: string;
  appError: string;
  appRadiusBase: string;
  appRadiusCard: string;
}

export const AGENTSAM_ABS_THEME_TOKENS: AbsThemeTokens = {
  appBg: '#090A0E',
  appCanvasBg: '#090A0E',
  appSurface1: '#101117',
  appSurface2: '#171822',
  appSurface3: '#1f202d',
  appBorder: '#252636',
  appTextPrimary: '#F7F5FB',
  appTextSecondary: '#B5B1C0',
  appTextMuted: '#7e798e',
  appAccent: '#8B5CF6',
  appAccentSoft: '#B69AF8',
  appAccentGlow: 'rgba(139, 92, 246, 0.35)',
  appSuccess: '#4ADE9B',
  appWarning: '#fbbc04',
  appError: '#f28b82',
  appRadiusBase: '10px',
  appRadiusCard: '16px',
};

/**
 * Returns CSS custom properties dictionary for the packaged theme
 */
export function getAbsThemeCssVariables(tokens: Partial<AbsThemeTokens> = {}): Record<string, string> {
  const merged = { ...AGENTSAM_ABS_THEME_TOKENS, ...tokens };
  return {
    '--app-bg': merged.appBg,
    '--app-canvas-bg': merged.appCanvasBg,
    '--app-surface-1': merged.appSurface1,
    '--app-surface-2': merged.appSurface2,
    '--app-surface-3': merged.appSurface3,
    '--app-border': merged.appBorder,
    '--app-text-primary': merged.appTextPrimary,
    '--app-text-secondary': merged.appTextSecondary,
    '--app-text-muted': merged.appTextMuted,
    '--app-accent': merged.appAccent,
    '--app-accent-soft': merged.appAccentSoft,
    '--app-accent-hover': merged.appAccentSoft,
    '--app-accent-glow': merged.appAccentGlow,
    '--app-success': merged.appSuccess,
    '--app-warning': merged.appWarning,
    '--app-error': merged.appError,
    '--app-radius-base': merged.appRadiusBase,
    '--app-radius-card': merged.appRadiusCard,
  };
}

/**
 * Injects or applies theme variables to target HTML element (defaults to documentElement)
 */
export function applyAbsTheme(tokens: Partial<AbsThemeTokens> = {}, targetElement?: HTMLElement): void {
  if (typeof document === 'undefined') return;
  const target = targetElement || document.documentElement;
  const vars = getAbsThemeCssVariables(tokens);
  Object.entries(vars).forEach(([key, val]) => {
    target.style.setProperty(key, val);
  });
}
