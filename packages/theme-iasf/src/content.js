/**
 * Normalized IASF catalog content (from studio-cms-editor storefront-data).
 * Durable product content for the stock theme — not demo chrome.
 */

/** @typedef {{ slug: string, name: string, category: string, price: number, fit: string, weight: string, uses: string[], color: string, image: string, statement: string }} IasfProduct */

/** @type {readonly IasfProduct[]} */
export const products = Object.freeze([
  {
    slug: 'wolf-heavyweight-tee',
    name: 'Wolf Heavyweight Tee',
    category: 'Everyday',
    price: 58,
    fit: 'Relaxed',
    weight: '280 GSM',
    uses: ['Lift', 'Everyday'],
    color: 'Bone / Coal',
    image:
      'https://images.unsplash.com/photo-1581009137042-c552e485697a?auto=format&fit=crop&w=1400&q=85',
    statement: 'Built for the hours nobody sees.',
  },
  {
    slug: 'panther-training-short',
    name: 'Panther Training Short',
    category: 'Train',
    price: 72,
    fit: 'Athletic',
    weight: '142 GSM',
    uses: ['Lift', 'Run'],
    color: 'Obsidian',
    image:
      'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?auto=format&fit=crop&w=1400&q=85',
    statement: 'Quiet movement. Sudden power.',
  },
  {
    slug: 'bear-recovery-hoodie',
    name: 'Bear Recovery Hoodie',
    category: 'Recover',
    price: 118,
    fit: 'Oversized',
    weight: '480 GSM',
    uses: ['Recover', 'Everyday'],
    color: 'Iron',
    image:
      'https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=1400&q=85',
    statement: 'Heavy enough to disappear into.',
  },
  {
    slug: 'bull-utility-pant',
    name: 'Bull Utility Pant',
    category: 'Roam',
    price: 132,
    fit: 'Relaxed',
    weight: '310 GSM',
    uses: ['Outdoor', 'Everyday'],
    color: 'Field Black',
    image:
      'https://images.unsplash.com/photo-1506629905607-d9c297d8dc3c?auto=format&fit=crop&w=1400&q=85',
    statement: 'Made to take the long way home.',
  },
]);

export const archetypes = Object.freeze([
  { name: 'Wolf', line: 'Endurance / instinct / the pack', className: 'wolf', slug: 'wolf' },
  { name: 'Bear', line: 'Strength / recovery / resilience', className: 'bear', slug: 'bear' },
  { name: 'Panther', line: 'Speed / precision / control', className: 'panther', slug: 'panther' },
  { name: 'Bull', line: 'Force / work / conviction', className: 'bull', slug: 'bull' },
]);

export const journal = Object.freeze([
  {
    slug: 'training-after-the-noise',
    kind: 'Field Note 001',
    title: 'Training After the Noise',
    copy: 'What remains when motivation leaves the room.',
    image:
      'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=1400&q=85',
  },
  {
    slug: 'uniform-for-the-work',
    kind: 'Material Study',
    title: 'A Uniform for the Work',
    copy: 'Why weight, texture and restraint matter more than trends.',
    image:
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=85',
  },
  {
    slug: 'lafayette-5am',
    kind: 'Pack Profile',
    title: 'Lafayette, 5:04 A.M.',
    copy: 'Before the traffic, before the heat, before the excuses.',
    image:
      'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1400&q=85',
  },
]);

export const nav = Object.freeze([
  { label: 'Shop', href: '/shop' },
  { label: 'Archetypes', href: '/collections/wolf' },
  { label: 'Field Journal', href: '/journal' },
  { label: 'Our Code', href: '/story' },
]);

export const brand = Object.freeze({
  name: 'Inner Animals',
  dropbar: 'FIELD ISSUE 001 — FIRST ACCESS OPENS SOON',
  tagline: 'Civilized enough to function. Wild enough to matter.',
});
