/**
 * Stock preset for the default merchant experience.
 * Brand/customer content belongs to separately installed site revisions,
 * not to the reusable starter package.
 */
import packageInfo from '../package.json' with { type: 'json' };
import { createStorefrontShellTheme } from './theme.js';

const shell = createStorefrontShellTheme();

export const heuristicStarterPreset = {
  schema: 'agentsam.website-starter-preset.v1',
  id: 'heuristic-starter',
  theme: {
    slug: 'heuristic',
    name: 'Heuristic Starter',
    packageName: packageInfo.name,
    packageVersion: packageInfo.version,
    shell: shell.id,
  },
  tokens: shell.tokens,
  pages: [
    {
      slug: 'home', title: 'Home',
      sections: [
        { type: 'hero', eyebrow: 'Welcome', heading: '{{site.name}}', body: 'A starting point for the people, products, and ideas behind your brand.', ctaLabel: 'Explore our shop', ctaHref: '/shop' },
        { type: 'products', eyebrow: 'Explore', heading: 'Your next collection starts here', body: 'A few illustrated samples to help you shape your storefront. Replace them with your own products when you are ready.', ctaLabel: 'Browse the shop', ctaHref: '/shop' },
        { type: 'content', eyebrow: 'Our story', heading: 'Make this space your own', body: 'Introduce your business, share what makes it different, and tell visitors what to expect.', ctaLabel: 'About us', ctaHref: '/about' },
      ],
    },
    {
      slug: 'shop', title: 'Shop',
      sections: [
        { type: 'hero', eyebrow: 'Collections', heading: 'Shop {{site.name}}', body: 'Your storefront is ready for your catalog. Add products through the existing Products area.', ctaLabel: 'Back home', ctaHref: '/' },
        { type: 'products', eyebrow: 'Featured', heading: 'Your products belong here', body: 'Explore the layout with illustrated samples, then add your own catalog through Products.', ctaLabel: 'Our story', ctaHref: '/about' },
      ],
    },
    {
      slug: 'about', title: 'About',
      sections: [
        { type: 'hero', eyebrow: 'Our story', heading: 'Meet {{site.name}}', body: 'Start with who you are, what you do, and why it matters to your customers.', ctaLabel: 'Explore the shop', ctaHref: '/shop' },
        { type: 'content', eyebrow: 'Our values', heading: 'Built around your point of view', body: 'Add your own story, photos, team, and values. Everything in this section is editable.', ctaLabel: 'Back home', ctaHref: '/' },
      ],
    },
  ],
};
