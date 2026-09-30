/**
 * @inneranimalmedia/theme-iasf — stock Inner Animal Storefront theme.
 *
 * Canonical id: `iasf`. Donor provenance: studio-cms-editor theme_layout_donor.
 * Normalized into an installable CMS starter + public storefront shell.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { products, archetypes, journal, nav, brand } from './content.js';
import { IASF_CSS_VARS, themeToCssVars } from './tokens.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const harvest = JSON.parse(readFileSync(join(HERE, 'harvest.json'), 'utf8'));

const THEME = Object.freeze({
  id: 'theme.iasf',
  slug: 'iasf',
  lineage: 'iasf',
  family: 'editorial-commerce',
  displayName: 'IASF Storefront',
  version: '0.1.0',
  kind: 'stock-theme',
  icon: 'theme',
  package: '@inneranimalmedia/theme-iasf',
  category: 'Commerce',
  industries: ['Retail', 'Lifestyle', 'Apparel'],
  tags: ['storefront', 'shop', 'journal', 'archetypes', 'stock'],
  description:
    'Stock Inner Animal Storefront — multipage commerce/editorial shell normalized from the studio-cms-editor harvest.',
  features: ['Commerce', 'CMS', 'Journal', 'Collections'],
  pages: ['Home', 'Shop', 'Collections', 'Product', 'Journal', 'Story'],
  preview: {
    kind: 'pack',
    card: null,
    desktop: null,
    mobile: null,
  },
  installable: true,
  stock: true,
  galleryPath: null,
  capabilityHints: ['theme.storefront.shell', 'cms.pages', 'commerce.catalog'],
  cssEntry: './styles/storefront.css',
  donor: harvest.source_repository,
  harvest,
});

export function createTheme() {
  return structuredClone(THEME);
}

export default createTheme;

export { products, archetypes, journal, nav, brand, IASF_CSS_VARS, themeToCssVars, harvest };

/** Absolute path helper for consumers that mount the CSS file. */
export function resolveStorefrontCssPath() {
  return join(HERE, 'styles', 'storefront.css');
}

export function readStorefrontCss() {
  return readFileSync(resolveStorefrontCssPath(), 'utf8');
}

/**
 * agentsam_products UPSERT payload (caller resolves repository_id).
 */
export function createProductRow({ accountId = null, repositoryId = null, status = 'production' } = {}) {
  const theme = createTheme();
  return {
    account_id: accountId,
    slug: theme.slug,
    name: theme.displayName,
    kind: 'app',
    status,
    repository_id: repositoryId,
    canonical_path: 'packages/theme-iasf',
    package_name: theme.package,
    metadata: {
      origin: 'stock_theme',
      normalization_state: 'promoted_stock',
      lineage: theme.lineage,
      family: theme.family,
      package: theme.package,
      preview_kind: theme.preview?.kind || 'pack',
      capabilities: theme.capabilityHints || [],
      donor_name: 'Inner Animals storefront',
      stock: true,
      aliases: ['inneranimals-site', 'theme-inneranimals-site'],
    },
    relationships: [
      { relationship_type: 'packaged_as', target_type: 'sdk-package', target_slug: 'theme-iasf' },
      { relationship_type: 'depends_on', target_type: 'capability', target_slug: 'theme.storefront.shell' },
    ],
  };
}

/**
 * Portable CmsStarterPack-shaped seed (no React / Next deps).
 * Consumed by apps/client-cms-editor/starter-packs/iasf.
 */
export function createIasfStarterPackSeed() {
  const cssVars = themeToCssVars();
  return {
    id: 'iasf',
    name: 'IASF Storefront',
    version: 1,
    description:
      'Stock Inner Animal Storefront — home, shop, archetypes, journal, and story routes.',
    provenance: {
      kind: 'builtin_starter',
      packId: 'iasf',
      packVersion: 1,
      donor: harvest.source_repository,
      harvestBatch: harvest.harvest_batch,
    },
    site: {
      name: brand.name,
      domain: '',
      initials: 'IA',
      color: cssVars['--brand-accent'],
    },
    theme: { cssVars },
    schemas: {
      protocol_version: 1,
      sections: [
        { key: 'header', type: 'header', version: 1, label: 'Store header' },
        { key: 'hero', type: 'hero', version: 1, label: 'Cinematic hero' },
        { key: 'instinct-nav', type: 'feature-grid', version: 1, label: 'Shop by instinct' },
        { key: 'product-grid', type: 'product-grid', version: 1, label: 'Product grid' },
        { key: 'manifesto', type: 'cta', version: 1, label: 'Manifesto' },
        { key: 'archetypes', type: 'feature-grid', version: 1, label: 'Archetypes' },
        { key: 'journal-grid', type: 'project-gallery', version: 1, label: 'Field journal' },
        { key: 'footer', type: 'footer', version: 1, label: 'Store footer' },
      ],
      blocks: [
        { key: 'text', type: 'text', version: 1, label: 'Text' },
        { key: 'product-card', type: 'product-card', version: 1, label: 'Product card' },
        { key: 'journal-card', type: 'journal-card', version: 1, label: 'Journal card' },
      ],
    },
    templates: [
      { id: 'tpl_iasf_home', name: 'IASF Home', type: 'page', category: 'Commerce' },
      { id: 'tpl_iasf_shop', name: 'IASF Shop', type: 'page', category: 'Commerce' },
      { id: 'tpl_iasf_story', name: 'IASF Story', type: 'page', category: 'Editorial' },
    ],
    catalog: { products, archetypes, journal, nav, brand },
    pages: [
      {
        title: 'Home',
        slug: '/',
        type: 'Home',
        metaTitle: 'Inner Animals — Field Issue 001',
        metaDescription: brand.tagline,
        sections: [
          {
            name: 'Store header',
            type: 'header',
            zone: 'HEADER',
            fields: { brand: brand.name, nav, dropbar: brand.dropbar },
          },
          {
            name: 'Cinematic hero',
            type: 'hero',
            zone: 'BODY',
            fields: {
              eyebrow: 'FIELD ISSUE 001 / THE UNDOMESTICATED',
              headline: 'THE WILD IS STILL IN THERE.',
              subline: 'Training goods and field uniforms for people becoming harder to domesticate.',
              primary_cta: 'Shop the drop',
              primary_cta_url: '/shop',
              secondary_cta: 'Enter the story',
              secondary_cta_url: '/story',
              location: '01 / 04 · LAFAYETTE, LA',
            },
          },
          {
            name: 'Shop by instinct',
            type: 'feature-grid',
            zone: 'BODY',
            fields: {
              section_label: 'SHOP BY INSTINCT',
              title: 'WHAT DOES THE DAY REQUIRE?',
              items: ['Train', 'Recover', 'Roam', 'Everyday'],
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
            blocks: products.map((p) => ({
              type: 'product-card',
              data: {
                title: p.name,
                price: `$${p.price}`,
                slug: p.slug,
                category: p.category,
                image: p.image,
                meta: `${p.fit} / ${p.weight} / ${p.color}`,
              },
            })),
          },
          {
            name: 'Manifesto',
            type: 'cta',
            zone: 'BODY',
            fields: {
              eyebrow: 'THE INNER ANIMAL IS NOT AN EXCUSE.',
              heading: 'CIVILIZED ENOUGH TO FUNCTION. WILD ENOUGH TO MATTER.',
              body: 'We make fewer things, with more weight, for people who understand that discipline and instinct are not opposites.',
              button_label: 'Read our code',
              button_url: '/story',
            },
          },
          {
            name: 'Archetypes',
            type: 'feature-grid',
            zone: 'BODY',
            fields: {
              section_label: 'CHOOSE YOUR ARCHETYPE',
              title: 'FOUR NATURES. NO MASCOTS.',
              items: archetypes.map((a) => ({
                title: a.name,
                body: a.line,
                href: `/collections/${a.slug}`,
                className: a.className,
              })),
            },
          },
          {
            name: 'Field journal',
            type: 'project-gallery',
            zone: 'BODY',
            fields: {
              section_label: 'THE FIELD JOURNAL',
              title: 'NOT CONTENT. EVIDENCE.',
              layout: 'Editorial',
            },
            blocks: journal.map((j) => ({
              type: 'journal-card',
              data: {
                title: j.title,
                kind: j.kind,
                copy: j.copy,
                slug: j.slug,
                image: j.image,
              },
            })),
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
            fields: { brand: brand.name, nav },
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
            blocks: products.map((p) => ({
              type: 'product-card',
              data: {
                title: p.name,
                price: `$${p.price}`,
                slug: p.slug,
                category: p.category,
                image: p.image,
              },
            })),
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
            fields: { brand: brand.name, nav },
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
            name: 'Journal grid',
            type: 'project-gallery',
            zone: 'BODY',
            fields: { layout: 'Editorial' },
            blocks: journal.map((j) => ({
              type: 'journal-card',
              data: { title: j.title, kind: j.kind, copy: j.copy, slug: j.slug, image: j.image },
            })),
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
        metaDescription: brand.tagline,
        sections: [
          {
            name: 'Store header',
            type: 'header',
            zone: 'HEADER',
            fields: { brand: brand.name, nav },
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
            name: 'Code principles',
            type: 'feature-grid',
            zone: 'BODY',
            fields: {
              items: [
                { title: 'Use over display', body: 'The finest objects get better through work, wear and memory.' },
                { title: 'Fewer, heavier things', body: 'No endless catalog. Each issue earns the right to exist.' },
                { title: 'The pack is practice', body: 'Community is showing up for one another.' },
                { title: 'Leave proof', body: 'Train, make, travel, recover. Bring back something true.' },
              ],
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
}
