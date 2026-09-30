/** IASF design tokens — mapped from donor storefront CSS variables. */

export const IASF_CSS_VARS = Object.freeze({
  '--brand-primary': '#080908',
  '--brand-secondary': '#10110f',
  '--brand-accent': '#d6ff3f',
  '--brand-rust': '#a54528',
  '--color-bg': '#080908',
  '--color-surface': '#10110f',
  '--color-text': '#e8e4d9',
  '--color-text-muted': '#888888',
  '--color-line': 'rgba(232,228,217,.2)',
  '--font-heading': '"Archivo Black", sans-serif',
  '--font-body': 'Inter, sans-serif',
  '--font-mono': '"DM Mono", monospace',
  '--ia-black': '#080908',
  '--ia-ink': '#10110f',
  '--ia-bone': '#e8e4d9',
  '--ia-acid': '#d6ff3f',
  '--ia-rust': '#a54528',
  '--ia-line': 'rgba(232,228,217,.2)',
});

export function themeToCssVars(overrides = {}) {
  return { ...IASF_CSS_VARS, ...overrides };
}
