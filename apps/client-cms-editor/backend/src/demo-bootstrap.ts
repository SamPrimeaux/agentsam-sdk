/**
 * Offline first-run CMS site for localhost preview — feeds the real CmsEditor shell.
 * Not a separate “scaffold UI”. Migrations/API stay authoritative in production.
 */

export function buildDemoCmsBootstrap(projectSlug = 'demo') {
  const pageId = 'page_home';
  const heroId = 'sec_hero';
  const gridId = 'sec_products';
  const footerId = 'sec_footer';
  const textBlockId = 'blk_join';

  return {
    tenant: {
      name: 'Heuristic Theme',
      domain: 'demo.localhost',
      primary_color: '#1e6a6f',
    },
    public_domain: 'demo.localhost',
    workspace_label: 'Heuristic Theme',
    home_page: { id: pageId },
    protocol_version: 1,
    active_theme: {
      css_vars: {
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
    pages: [
      {
        id: pageId,
        title: 'Home page',
        slug: '/',
        route_path: '/',
        page_type: 'Home',
        status: 'draft',
        seo_title: 'Heuristic Theme',
        meta_description: 'Stock CMS theme preview for AgentSam scaffolding.',
      },
    ],
    sections_by_page: {
      [pageId]: [
        {
          id: heroId,
          section_name: 'Editorial hero',
          section_type: 'hero',
          is_visible: 1,
          sort_order: 10,
          section_data: {
            headline: 'My Store',
            subline: 'Stock heuristic-theme · first-run CMS surface',
            cta_text: 'Shop collection',
            eyebrow: 'Heuristic Theme',
            bg_color: '#101014',
          },
        },
        {
          id: gridId,
          section_name: 'Product grid',
          section_type: 'product-grid',
          is_visible: 1,
          sort_order: 20,
          section_data: {
            title: 'Featured',
            columns: 2,
          },
        },
        {
          id: footerId,
          section_name: 'Footer',
          section_type: 'footer',
          is_visible: 1,
          sort_order: 30,
          section_data: {
            zone: 'FOOTER',
            bg_color: '#F3F0E8',
          },
        },
      ],
    },
    blocks_by_section: {
      [heroId]: [],
      [gridId]: [
        {
          id: 'blk_card_1',
          section_id: gridId,
          block_type: 'product-card',
          is_visible: 1,
          sort_order: 10,
          block_data: { title: 'Classic tee', price: '$19.99' },
        },
        {
          id: 'blk_card_2',
          section_id: gridId,
          block_type: 'product-card',
          is_visible: 1,
          sort_order: 20,
          block_data: { title: 'Soft tee', price: '$19.99' },
        },
      ],
      [footerId]: [
        {
          id: textBlockId,
          section_id: footerId,
          block_type: 'text',
          is_visible: 1,
          sort_order: 10,
          block_data: {
            text: 'Join our email list',
            typography_preset: 'Heading 4',
            width: 'fit',
            max_width: 'normal',
            align: 'left',
          },
        },
      ],
    },
    component_templates: [
      { id: 'tpl_baseline_landing', template_name: 'Landing page', template_type: 'page', category: 'Marketing' },
      { id: 'tpl_baseline_hero', template_name: 'Editorial hero', template_type: 'section', category: 'Portfolio' },
      { id: 'tpl_baseline_footer', template_name: 'Utility footer', template_type: 'section', category: 'Agency' },
    ],
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
    _demo: true,
    _project_slug: projectSlug,
  };
}
