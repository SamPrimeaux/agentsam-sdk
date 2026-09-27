/**
 * Theme tokens — semantic only. Scenes consume CSS vars / token keys, never raw hex in components.
 */

export const FOUNDATION_THEME = Object.freeze({
  id: 'foundation',
  label: 'Foundation',
  description: 'Neutral multi-brand base. Customer brands extend this.',
  tokens: {
    color: {
      'color.surface.canvas': { css: '--scene-surface', value: '#FFFFFF' },
      'color.surface.raised': { css: '--scene-surface-raised', value: '#F8FAFC' },
      'color.surface.inverse': { css: '--scene-surface-inverse', value: '#0F172A' },
      'color.text.primary': { css: '--scene-text', value: '#1E293B' },
      'color.text.muted': { css: '--scene-text-muted', value: '#64748B' },
      'color.text.inverse': { css: '--scene-text-inverse', value: '#F8FAFC' },
      'color.border.subtle': { css: '--scene-border', value: '#E2E8F0' },
      'color.brand.primary': { css: '--scene-accent', value: '#2563EB' },
      'color.brand.secondary': { css: '--scene-accent-secondary', value: '#1FAAAD' },
      'color.focus.ring': { css: '--scene-focus', value: '#2563EB' },
    },
    type: {
      'type.display.xl': { size: 'clamp(3.5rem, 8vw, 7rem)', lineHeight: 1.05, tracking: '-0.04em' },
      'type.display.lg': { size: 'clamp(2.75rem, 5vw, 5rem)', lineHeight: 1.08, tracking: '-0.03em' },
      'type.section': { size: 'clamp(2rem, 3.5vw, 3.5rem)', lineHeight: 1.15, tracking: '-0.02em' },
      'type.body.lg': { size: 'clamp(1.05rem, 1.3vw, 1.25rem)', lineHeight: 1.6 },
      'type.mono': { family: 'ui-monospace, monospace' },
    },
    space: {
      'space.section.y.desktop': '144px',
      'space.section.y.mobile': '80px',
      'space.scene.gap': '80px',
      'space.content.max': '1280px',
    },
    motion: {
      'motion.intensity.default': 0.35,
      'motion.reveal.duration': '800ms',
      'motion.reduce': 'crossfade',
    },
  },
});

export const INNERANIMAL_THEME = Object.freeze({
  id: 'inneranimal',
  extends: 'foundation',
  label: 'InnerAnimal Media',
  description: 'Quiet institutional parent — navy / blue / teal discipline.',
  tokens: {
    color: {
      'color.brand.primary': { css: '--scene-accent', value: '#2563EB' },
      'color.brand.secondary': { css: '--scene-accent-secondary', value: '#1FAAAD' },
      'color.surface.inverse': { css: '--scene-surface-inverse', value: '#0F172A' },
      'color.text.primary': { css: '--scene-text', value: '#1E293B' },
    },
  },
});

export const AGENTSAM_THEME = Object.freeze({
  id: 'agentsam',
  extends: 'inneranimal',
  label: 'AgentSam',
  description: 'Technical product skin on InnerAnimal spacing/type discipline.',
  tokens: {
    color: {
      'color.brand.primary': { css: '--scene-accent', value: '#4F8CFF' },
      'color.brand.secondary': { css: '--scene-accent-secondary', value: '#8FD7FF' },
      'color.surface.inverse': { css: '--scene-surface-inverse', value: '#0A0F18' },
      'color.surface.raised': { css: '--scene-surface-raised', value: '#172333' },
    },
  },
});

export const AUTODIDACT_THEME = Object.freeze({
  id: 'autodidact',
  extends: 'inneranimal',
  label: 'InnerAutodidact',
  description: 'Learning surface — same grid/motion, softer accent.',
  tokens: {
    color: {
      'color.brand.primary': { css: '--scene-accent', value: '#1FAAAD' },
      'color.brand.secondary': { css: '--scene-accent-secondary', value: '#2563EB' },
    },
  },
});

const REGISTRY = Object.freeze({
  foundation: FOUNDATION_THEME,
  inneranimal: INNERANIMAL_THEME,
  agentsam: AGENTSAM_THEME,
  autodidact: AUTODIDACT_THEME,
});

export function getTheme(id) {
  return REGISTRY[id] || null;
}

export function listThemes() {
  return Object.values(REGISTRY);
}

/** Deep-merge token maps along extends chain. */
export function resolveTheme(id) {
  const theme = REGISTRY[id];
  if (!theme) return resolveTheme('foundation');
  if (!theme.extends) {
    return structuredClone(theme);
  }
  const parent = resolveTheme(theme.extends);
  return {
    ...parent,
    ...theme,
    tokens: {
      color: { ...parent.tokens?.color, ...theme.tokens?.color },
      type: { ...parent.tokens?.type, ...theme.tokens?.type },
      space: { ...parent.tokens?.space, ...theme.tokens?.space },
      motion: { ...parent.tokens?.motion, ...theme.tokens?.motion },
    },
  };
}

/** Emit CSS custom properties for a resolved theme. */
export function themeToCssVars(themeOrId) {
  const theme = typeof themeOrId === 'string' ? resolveTheme(themeOrId) : themeOrId;
  const vars = {};
  for (const token of Object.values(theme.tokens?.color || {})) {
    if (token.css && token.value) vars[token.css] = token.value;
  }
  return vars;
}
