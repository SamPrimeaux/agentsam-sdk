import type { CmsStarterPack } from '../../shared/cms/src/starter-pack';

/**
 * IASF — stock Inner Animal Storefront starter.
 * Normalized from studio-cms-editor `theme_layout_donor` (see packages/theme-iasf).
 * Keep in sync with `@inneranimalmedia/theme-iasf` `createIasfStarterPackSeed()`.
 */
export const IASF_STARTER_PACK_ID = 'iasf';

const cssVars = {
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
};

const nav = [
  { label: 'Shop', href: '/shop' },
  { label: 'Archetypes', href: '/collections/wolf' },
  { label: 'Field Journal', href: '/journal' },
  { label: 'Our Code', href: '/story' },
];

const products = [
  {
    title: 'Wolf Heavyweight Tee',
    price: '$58',
    slug: 'wolf-heavyweight-tee',
    category: 'Everyday',
    image:
      'https://images.unsplash.com/photo-1581009137042-c552e485697a?auto=format&fit=crop&w=1400&q=85',
    meta: 'Relaxed / 280 GSM / Bone / Coal',
  },
  {
    title: 'Panther Training Short',
    price: '$72',
    slug: 'panther-training-short',
    category: 'Train',
    image:
      'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?auto=format&fit=crop&w=1400&q=85',
    meta: 'Athletic / 142 GSM / Obsidian',
  },
  {
    title: 'Bear Recovery Hoodie',
    price: '$118',
    slug: 'bear-recovery-hoodie',
    category: 'Recover',
    image:
      'https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=1400&q=85',
    meta: 'Oversized / 480 GSM / Iron',
  },
  {
    title: 'Bull Utility Pant',
    price: '$132',
    slug: 'bull-utility-pant',
    category: 'Roam',
    image:
      'https://images.unsplash.com/photo-1506629905607-d9c297d8dc3c?auto=format&fit=crop&w=1400&q=85',
    meta: 'Relaxed / 310 GSM / Field Black',
  },
];

export const iasfStarterPack: CmsStarterPack = {
  id: IASF_STARTER_PACK_ID,
  name: 'IASF Storefront',
  version: 1,
  description:
    'Stock Inner Animal Storefront — home, shop, journal, and story routes normalized from the studio harvest.',
  provenance: {
    kind: 'builtin_starter',
    packId: IASF_STARTER_PACK_ID,
    packVersion: 1,
  },
  site: {
    name: 'Inner Animals',
    domain: '',
    initials: 'IA',
    color: '#d6ff3f',
  },
  theme: { cssVars },
  schemas: {
    protocol_version: 1,
    sections: [
      { key: 'header', type: 'header', version: 1, label: 'Store header' },
      { key: 'hero', type: 'hero', version: 1, label: 'Cinematic hero' },
      { key: 'product-grid', type: 'product-grid', version: 1, label: 'Product grid' },
      { key: 'footer', type: 'footer', version: 1, label: 'Store footer' },
    ],
    blocks: [
      { key: 'product-card', type: 'product-card', version: 1, label: 'Product card' },
      { key: 'journal-card', type: 'journal-card', version: 1, label: 'Journal card' },
    ],
  },
  templates: [
    { id: 'tpl_iasf_home', name: 'IASF Home', type: 'page', category: 'Commerce' },
    { id: 'tpl_iasf_shop', name: 'IASF Shop', type: 'page', category: 'Commerce' },
  ],
  pages: [
    {
      title: 'Home',
      slug: '/',
      type: 'Home',
      metaTitle: 'Inner Animals — Field Issue 001',
      metaDescription: 'Civilized enough to function. Wild enough to matter.',
      sections: [
        {
          name: 'Store header',
          type: 'header',
          zone: 'HEADER',
          fields: {
            brand: 'Inner Animals',
            nav,
            dropbar: 'FIELD ISSUE 001 — FIRST ACCESS OPENS SOON',
          },
        },
        {
          name: 'Cinematic hero',
          type: 'hero',
          zone: 'BODY',
          fields: {
            eyebrow: 'FIELD ISSUE 001 / THE UNDOMESTICATED',
            headline: 'THE WILD IS STILL IN THERE.',
            subline:
              'Training goods and field uniforms for people becoming harder to domesticate.',
            primary_cta: 'Shop the drop',
            primary_cta_url: '/shop',
            secondary_cta: 'Enter the story',
            secondary_cta_url: '/story',
          },
        },
        {
          name: 'Current drop',
          type: 'product-grid',
          zone: 'BODY',
          fields: {
            section_label: 'CURRENT DROP / ISSUE 001',
            title: 'UNIFORMS FOR THE INNER LIFE.',
            columns: 4,
          },
          blocks: products.map((p) => ({ type: 'product-card', data: p })),
        },
        {
          name: 'Store footer',
          type: 'footer',
          zone: 'FOOTER',
          fields: {
            heading: 'STAY CLOSE TO THE WILD.',
            copyright_text: '© 2026 Inner Animals. Built in Lafayette, Louisiana.',
            footer_links: nav.map((n) => n.label),
          },
        },
      ],
    },
    {
      title: 'Shop',
      slug: '/shop',
      type: 'Interior',
      metaTitle: 'Shop · Inner Animals',
      metaDescription: 'Field store / Issue 001',
      sections: [
        {
          name: 'Store header',
          type: 'header',
          zone: 'HEADER',
          fields: { brand: 'Inner Animals', nav },
        },
        {
          name: 'Shop hero',
          type: 'hero',
          zone: 'BODY',
          fields: {
            eyebrow: 'FIELD STORE / ISSUE 001',
            headline: 'GEAR FOR THE WORK.',
            subline: 'Concept collection. Four archetypes, considered materials, no filler.',
          },
        },
        {
          name: 'Shop grid',
          type: 'product-grid',
          zone: 'BODY',
          fields: {
            title: 'All pieces',
            filters: ['All', 'Train', 'Recover', 'Roam', 'Everyday'],
            columns: 4,
          },
          blocks: products.map((p) => ({ type: 'product-card', data: p })),
        },
        {
          name: 'Store footer',
          type: 'footer',
          zone: 'FOOTER',
          fields: { copyright_text: '© 2026 Inner Animals.' },
        },
      ],
    },
    {
      title: 'Journal',
      slug: '/journal',
      type: 'Interior',
      metaTitle: 'Field Journal · Inner Animals',
      metaDescription: 'Transmissions from the field.',
      sections: [
        {
          name: 'Store header',
          type: 'header',
          zone: 'HEADER',
          fields: { brand: 'Inner Animals', nav },
        },
        {
          name: 'Journal hero',
          type: 'hero',
          zone: 'BODY',
          fields: {
            eyebrow: 'TRANSMISSIONS FROM THE FIELD',
            headline: 'THE FIELD JOURNAL.',
            subline: 'Training, materials, profiles, films, place and the inner life behind the work.',
          },
        },
        {
          name: 'Store footer',
          type: 'footer',
          zone: 'FOOTER',
          fields: { copyright_text: '© 2026 Inner Animals.' },
        },
      ],
    },
    {
      title: 'Our Code',
      slug: '/story',
      type: 'Interior',
      metaTitle: 'Our Code · Inner Animals',
      metaDescription: 'Civilized enough to function. Wild enough to matter.',
      sections: [
        {
          name: 'Store header',
          type: 'header',
          zone: 'HEADER',
          fields: { brand: 'Inner Animals', nav },
        },
        {
          name: 'Story hero',
          type: 'hero',
          zone: 'BODY',
          fields: {
            eyebrow: 'THE INNER ANIMALS CODE / 2026',
            headline: 'INSTINCT WITHOUT DISCIPLINE IS JUST NOISE.',
          },
        },
        {
          name: 'Store footer',
          type: 'footer',
          zone: 'FOOTER',
          fields: { copyright_text: '© 2026 Inner Animals.' },
        },
      ],
    },
  ],
};

export function listIasfStarterPacks(): CmsStarterPack[] {
  return [iasfStarterPack];
}
