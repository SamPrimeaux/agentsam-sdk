/**
 * Editable CMS v2 page seeds for the Resolve 2.6.13 theme package.
 * These are tenant-owned draft specifications; no customer records or live
 * commerce data are embedded in the theme package.
 */
export const RESOLVE_STOREFRONT_TEMPLATES = Object.freeze([
  {
    slug: 'home', path: '', title: 'Home', template_key: 'resolve/home',
    sections: [
      { key: 'header', type: 'header', content: { brand: 'RESOLVE', nav: ['Shop', 'Wardrobe', 'Bundles', 'Editorial'], showSearch: true, showCart: true, visible: true } },
      { key: 'hero', type: 'hero', content: { visible: true, eyebrow: 'AUTUMN / WINTER 26 CAMPAIGN', heading: 'EFFORTLESS BY DESIGN', description: 'Considered silhouettes and quiet textures engineered from 380gsm English wool crepe and glove-grade calfskin.', button_label: 'EXPLORE WARDROBE', secondary_button_label: 'DISCOVER THE EDIT', media: '/assets/generated/social-card.webp', media_alt: 'Resolve Autumn / Winter editorial campaign', padding: 48 } },
      { key: 'collections', type: 'collection-grid', content: { visible: true, heading: 'THE WARDROBE', description: 'CORE CATEGORY ARCHITECTURE FOR AUTUMN / WINTER 26', layout: 'editorial-grid', padding: 48, collection_ids: [] } },
      { key: 'editorial', type: 'editorial', content: { visible: true, heading: 'Made to be worn.', description: 'Considered pieces. A lasting point of view.', button_label: 'READ THE STORY', media: '/assets/generated/social-card.webp', padding: 48 } },
      { key: 'newsletter', type: 'newsletter', content: { visible: true, heading: 'FIRST ACCESS, ALWAYS.', description: 'Receive considered notes on new collections, stories and private releases.', button_label: 'JOIN THE LIST', padding: 40 } },
      { key: 'footer', type: 'footer', content: { visible: true, brand: 'RESOLVE', tagline: 'Objects of lasting desire.', nav: ['Shop', 'Editorial', 'Contact'] } },
    ],
  },
  {
    slug: 'shop', path: 'collections/all', title: 'Shop', template_key: 'resolve/shop',
    sections: [
      { key: 'header', type: 'header', content: { brand: 'RESOLVE', nav: ['Shop', 'Wardrobe', 'Bundles', 'Editorial'], showSearch: true, showCart: true, visible: true } },
      { key: 'collection-hero', type: 'collection-hero', content: { visible: true, heading: 'THE WARDROBE', description: 'A considered edit of enduring silhouettes.', padding: 40 } },
      { key: 'filters', type: 'filters', content: { visible: true, filters: ['Category', 'Size', 'Color', 'Availability'] } },
      { key: 'product-grid', type: 'product-grid', content: { visible: true, heading: 'All pieces', product_source: 'catalog', columns: 3 } },
      { key: 'footer', type: 'footer', content: { visible: true, brand: 'RESOLVE', tagline: 'Objects of lasting desire.' } },
    ],
  },
  {
    slug: 'lookbook', path: 'pages/lookbook', title: 'Lookbook', template_key: 'resolve/lookbook',
    sections: [
      { key: 'header', type: 'header', content: { brand: 'RESOLVE', nav: ['Shop', 'Wardrobe', 'Bundles', 'Editorial'], showSearch: true, showCart: true, visible: true } },
      { key: 'hero', type: 'editorial-hero', content: { visible: true, eyebrow: 'AUTUMN / WINTER 26', heading: 'A study in silhouette', description: 'Form, texture and quiet confidence.', padding: 48 } },
      { key: 'lookbook-grid', type: 'lookbook-grid', content: { visible: true, heading: 'THE EDIT', media_source: 'theme-assets', columns: 2 } },
      { key: 'newsletter', type: 'newsletter', content: { visible: true, heading: 'FIRST ACCESS, ALWAYS.', description: 'Notes on new collections and private releases.', button_label: 'JOIN THE LIST' } },
      { key: 'footer', type: 'footer', content: { visible: true, brand: 'RESOLVE', tagline: 'Objects of lasting desire.' } },
    ],
  },
  {
    slug: 'product', path: 'products/sable-blazer', title: 'Product detail', template_key: 'resolve/product',
    sections: [
      { key: 'header', type: 'header', content: { brand: 'RESOLVE', nav: ['Shop', 'Wardrobe', 'Bundles', 'Editorial'], showSearch: true, showCart: true, visible: true } },
      { key: 'product-gallery', type: 'product-gallery', content: { visible: true, media_source: 'product', gallery_layout: 'editorial' } },
      { key: 'product-info', type: 'product-info', content: { visible: true, heading: 'Sable blazer', description: 'A precise silhouette in English wool crepe.', price: 720, currency: 'USD' } },
      { key: 'product-actions', type: 'product-actions', content: { visible: true, primary_label: 'ADD TO CART', secondary_label: 'SAVE FOR LATER', size_required: true } },
      { key: 'recommendations', type: 'recommendations', content: { visible: true, heading: 'Complete the wardrobe', product_source: 'related' } },
      { key: 'footer', type: 'footer', content: { visible: true, brand: 'RESOLVE', tagline: 'Objects of lasting desire.' } },
    ],
  },
  {
    slug: 'stories', path: 'blogs', title: 'Stories', template_key: 'resolve/stories',
    sections: [
      { key: 'header', type: 'header', content: { brand: 'RESOLVE', nav: ['Shop', 'Wardrobe', 'Bundles', 'Editorial'], showSearch: true, showCart: true, visible: true } },
      { key: 'editorial-heading', type: 'editorial-heading', content: { visible: true, eyebrow: 'THE RESOLVE JOURNAL', heading: 'Stories in material and motion', description: 'Notes on craft, culture and the considered wardrobe.' } },
      { key: 'editorial-list', type: 'editorial-list', content: { visible: true, article_source: 'published', layout: 'editorial-list' } },
      { key: 'newsletter', type: 'newsletter', content: { visible: true, heading: 'FIRST ACCESS, ALWAYS.', description: 'Receive the latest stories and releases.', button_label: 'JOIN THE LIST' } },
      { key: 'footer', type: 'footer', content: { visible: true, brand: 'RESOLVE', tagline: 'Objects of lasting desire.' } },
    ],
  },
  {
    slug: 'journal', path: 'blogs/material-patina', title: 'Journal article', template_key: 'resolve/journal',
    sections: [
      { key: 'header', type: 'header', content: { brand: 'RESOLVE', nav: ['Shop', 'Wardrobe', 'Bundles', 'Editorial'], showSearch: true, showCart: true, visible: true } },
      { key: 'article-title', type: 'article-title', content: { visible: true, eyebrow: 'MATERIAL NOTES', heading: 'Material, patina and time', summary: 'On the beauty of pieces that improve with wear.' } },
      { key: 'article-cover', type: 'article-cover', content: { visible: true, media_source: 'theme-assets', media_alt: 'Material study from the Resolve archive' } },
      { key: 'article-body', type: 'article-body', content: { visible: true, body: 'Good design makes room for use, memory and time. The best materials do not stand still; they gather character with every wear.' } },
      { key: 'footer', type: 'footer', content: { visible: true, brand: 'RESOLVE', tagline: 'Objects of lasting desire.' } },
    ],
  },
]);

export const RESOLVE_DEFAULT_THEME_SETTINGS = Object.freeze({
  brand: { name: 'RESOLVE', tagline: 'Objects of lasting desire.' },
  palette: { accent: '#8B181B', surface: '#F5F1EC', ink: '#171413', muted: '#756B67' },
  typography: { display: 'Editorial', body: 'Inter' },
  layout: { contentWidth: 1440, sectionGap: 48 },
});

export function cloneResolveStorefrontTemplates() {
  return structuredClone(RESOLVE_STOREFRONT_TEMPLATES);
}
