/**
 * Shell modules — site chrome shared across pages.
 */

export const SHELL_KINDS = Object.freeze({
  'shell.adaptive-header': {
    id: 'shell.adaptive-header',
    label: 'Adaptive Header',
    description: 'Glass sticky header; tone follows scene headerTone / scroll.',
    props: ['logo', 'logoInverse', 'nav', 'avatar', 'height'],
  },
  'shell.mobile-navigation': {
    id: 'shell.mobile-navigation',
    label: 'Mobile Navigation',
    description: 'Full-screen overlay nav driven by shell.nav.',
  },
  'shell.work-filter-rail': {
    id: 'shell.work-filter-rail',
    label: 'Work Filter Rail',
    description: 'Optional sticky category filter for work/product galleries.',
    props: ['filters', 'active'],
  },
  'shell.site-footer': {
    id: 'shell.site-footer',
    label: 'Site Footer',
    description: 'Data-driven columns; no hardcoded product links.',
    props: ['brand', 'columns', 'legal', 'version'],
  },
});

export function createShellContent(partial = {}) {
  return {
    header: partial.header ?? 'adaptive',
    footer: partial.footer ?? 'default',
    filterRail: Boolean(partial.filterRail),
    nav: Array.isArray(partial.nav) ? partial.nav : [],
    logo: partial.logo || null,
    logoInverse: partial.logoInverse || null,
    avatar: partial.avatar || null,
    footerColumns: partial.footerColumns || [],
    tagline: partial.tagline || null,
  };
}

export function listShellKinds() {
  return Object.values(SHELL_KINDS);
}
