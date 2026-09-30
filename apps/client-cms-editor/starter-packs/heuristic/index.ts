import type { CmsStarterPack } from '../../shared/cms/src/starter-pack';

/**
 * Heuristic — stock/starter CMS pack shipped with the package.
 * First-run recommended workspace. Not demo, not ephemeral, not test-only.
 */
export const HEURISTIC_STARTER_PACK_ID = 'heuristic';

export const heuristicStarterPack: CmsStarterPack = {
  id: HEURISTIC_STARTER_PACK_ID,
  name: 'Heuristic',
  version: 1,
  description:
    'Stock starter theme with Home page, editorial hero, product grid, footer, and baseline schemas.',
  provenance: {
    kind: 'builtin_starter',
    packId: HEURISTIC_STARTER_PACK_ID,
    packVersion: 1,
  },
  site: {
    name: 'Heuristic',
    domain: '',
  },
  theme: {
    cssVars: {
      '--brand-primary': '#1e6a6f',
      '--brand-secondary': '#123f42',
      '--brand-accent': '#cfef5b',
      '--color-bg': '#f5f2ea',
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
      { key: 'hero', type: 'hero', version: 1, label: 'Editorial hero' },
      { key: 'product-grid', type: 'product-grid', version: 1, label: 'Product grid' },
      { key: 'footer', type: 'footer', version: 1, label: 'Footer' },
    ],
    blocks: [
      { key: 'text', type: 'text', version: 1, label: 'Text' },
      { key: 'product-card', type: 'product-card', version: 1, label: 'Product card' },
    ],
  },
  templates: [
    { id: 'tpl_baseline_landing', name: 'Landing page', type: 'page', category: 'Marketing' },
    { id: 'tpl_baseline_hero', name: 'Editorial hero', type: 'section', category: 'Portfolio' },
    { id: 'tpl_baseline_footer', name: 'Utility footer', type: 'section', category: 'Agency' },
  ],
  pages: [
    {
      title: 'Home page',
      slug: '/',
      type: 'Home',
      metaTitle: 'Heuristic',
      metaDescription: 'Stock starter CMS workspace.',
      sections: [
        {
          name: 'Global header',
          type: 'header',
          zone: 'HEADER',
          fields: {
            brand: 'Heuristic',
            nav: [
              { label: 'Home', href: '/' },
              { label: 'About', href: '/about' },
              { label: 'Contact', href: '/contact' },
            ],
          },
        },
        {
          name: 'Editorial hero',
          type: 'hero',
          zone: 'BODY',
          fields: {
            headline: 'My Store',
            subline: 'Heuristic starter · edit, save draft, publish',
            cta_text: 'Shop collection',
            eyebrow: 'Heuristic',
            bg_color: '#101014',
          },
        },
        {
          name: 'Product grid',
          type: 'product-grid',
          zone: 'BODY',
          fields: {
            title: 'Featured',
            columns: 2,
          },
          blocks: [
            { type: 'product-card', data: { title: 'Classic tee', price: '$19.99' } },
            { type: 'product-card', data: { title: 'Soft tee', price: '$19.99' } },
          ],
        },
        {
          name: 'Footer',
          type: 'footer',
          zone: 'FOOTER',
          fields: {
            zone: 'FOOTER',
            bg_color: '#F3F0E8',
          },
          blocks: [
            {
              type: 'text',
              data: {
                text: 'Join our email list',
                typography_preset: 'Heading 4',
                width: 'fit',
                max_width: 'normal',
                align: 'left',
              },
            },
          ],
        },
      ],
    },
    {
      title: 'About',
      slug: '/about',
      type: 'Interior',
      metaTitle: 'About · Heuristic',
      metaDescription: 'About this Heuristic starter site.',
      sections: [
        {
          name: 'Global header',
          type: 'header',
          zone: 'HEADER',
          fields: {
            brand: 'Heuristic',
            nav: [
              { label: 'Home', href: '/' },
              { label: 'About', href: '/about' },
              { label: 'Contact', href: '/contact' },
            ],
          },
        },
        {
          name: 'About body',
          type: 'hero',
          zone: 'BODY',
          fields: {
            headline: 'About',
            subline: 'A multi-page local starter — edit this page in the CMS.',
            eyebrow: 'Heuristic',
          },
        },
        {
          name: 'Footer',
          type: 'footer',
          zone: 'FOOTER',
          fields: { zone: 'FOOTER', bg_color: '#F3F0E8' },
        },
      ],
    },
    {
      title: 'Contact',
      slug: '/contact',
      type: 'Interior',
      metaTitle: 'Contact · Heuristic',
      metaDescription: 'Contact page for the Heuristic starter.',
      sections: [
        {
          name: 'Global header',
          type: 'header',
          zone: 'HEADER',
          fields: {
            brand: 'Heuristic',
            nav: [
              { label: 'Home', href: '/' },
              { label: 'About', href: '/about' },
              { label: 'Contact', href: '/contact' },
            ],
          },
        },
        {
          name: 'Contact body',
          type: 'hero',
          zone: 'BODY',
          fields: {
            headline: 'Contact',
            subline: 'Reach us — this route is a real published CMS page.',
            eyebrow: 'Heuristic',
          },
        },
        {
          name: 'Footer',
          type: 'footer',
          zone: 'FOOTER',
          fields: { zone: 'FOOTER', bg_color: '#F3F0E8' },
        },
      ],
    },
  ],
};

export function listBuiltinStarterPacks(): CmsStarterPack[] {
  // Blank / IASF are separate modules; CLI and root exports compose the full catalog.
  return [heuristicStarterPack];
}
