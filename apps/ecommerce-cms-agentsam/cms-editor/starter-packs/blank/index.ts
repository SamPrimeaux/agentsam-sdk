import type { CmsStarterPack } from '../../shared/cms/src/starter-pack';

/**
 * Blank — empty durable site shell. Not demo. Install creates an empty site for authoring.
 */
export const BLANK_STARTER_PACK_ID = 'blank';

export const blankStarterPack: CmsStarterPack = {
  id: BLANK_STARTER_PACK_ID,
  name: 'Blank',
  version: 1,
  description: 'Empty CMS site shell — add pages, sections, and theme yourself.',
  provenance: {
    kind: 'builtin_starter',
    packId: BLANK_STARTER_PACK_ID,
    packVersion: 1,
  },
  site: {
    name: 'Blank site',
    domain: '',
  },
  theme: {
    cssVars: {
      '--brand-primary': '#101014',
      '--brand-secondary': '#3a3a42',
      '--brand-accent': '#cfef5b',
      '--color-bg': '#ffffff',
      '--color-surface': '#ffffff',
      '--color-text': '#101014',
      '--color-text-muted': '#73737f',
      '--font-heading': 'Inter',
      '--font-body': 'Inter',
    },
  },
  schemas: {
    protocol_version: 1,
    sections: [
      { key: 'header', type: 'header', version: 1, label: 'Header' },
      { key: 'hero', type: 'hero', version: 1, label: 'Hero' },
      { key: 'footer', type: 'footer', version: 1, label: 'Footer' },
    ],
    blocks: [{ key: 'text', type: 'text', version: 1, label: 'Text' }],
  },
  pages: [],
};

export function listBuiltinStarterPacksIncludingBlank(): CmsStarterPack[] {
  return [blankStarterPack];
}
