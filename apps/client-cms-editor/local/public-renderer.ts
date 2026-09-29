/**
 * Public storefront renderer — published CMS revisions → HTML.
 * Same CmsEditorAdapter authority as the dashboard. Not donor HTML masquerading as storefront.
 */
import type { CmsEditorAdapter, CmsPublicationSnapshot } from '../shared/cms/src/adapter';
import type { CmsEditorPage, CmsEditorSection, CmsEditorSite } from '../shared/cms/src/editor-types';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cssVarsStyle(vars: Record<string, string> | undefined): string {
  if (!vars) return '';
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

function renderSection(section: CmsEditorSection): string {
  const fields = section.fields || {};
  const blocks = section.blocks || [];
  if (section.type === 'header') {
    const nav = Array.isArray(fields.nav) ? fields.nav : [];
    const links = nav
      .map((item: any) => `<a href="${escapeHtml(item.href || '#')}">${escapeHtml(item.label || item.href)}</a>`)
      .join(' · ');
    return `<header class="cms-header" data-section-id="${escapeHtml(section.id)}">
  <strong>${escapeHtml(fields.brand || 'Site')}</strong>
  <nav>${links}</nav>
</header>`;
  }
  if (section.type === 'footer') {
    const note = fields.note || blocks[0]?.data?.text || '';
    return `<footer class="cms-footer" data-section-id="${escapeHtml(section.id)}">${escapeHtml(note)}</footer>`;
  }
  if (section.type === 'hero' || section.type === 'imported-html') {
    return `<section class="cms-section cms-${escapeHtml(section.type)}" data-section-id="${escapeHtml(section.id)}">
  ${fields.eyebrow ? `<p class="eyebrow">${escapeHtml(fields.eyebrow)}</p>` : ''}
  <h1>${escapeHtml(fields.headline || section.name)}</h1>
  ${fields.subline || fields.body ? `<p>${escapeHtml(fields.subline || fields.body)}</p>` : ''}
  ${fields.cta_text ? `<p><a class="cta" href="#">${escapeHtml(fields.cta_text)}</a></p>` : ''}
</section>`;
  }
  if (section.type === 'product-grid') {
    const cards = blocks
      .map(
        (b) =>
          `<article class="card"><h3>${escapeHtml(b.data?.title)}</h3><p>${escapeHtml(b.data?.price)}</p></article>`,
      )
      .join('\n');
    return `<section class="cms-section cms-product-grid" data-section-id="${escapeHtml(section.id)}">
  <h2>${escapeHtml(fields.title || section.name)}</h2>
  <div class="grid">${cards}</div>
</section>`;
  }
  return `<section class="cms-section" data-section-id="${escapeHtml(section.id)}">
  <h2>${escapeHtml(section.name)}</h2>
  <pre>${escapeHtml(JSON.stringify(fields, null, 2))}</pre>
</section>`;
}

export function renderPublishedPageHtml(input: {
  site: CmsEditorSite;
  page: CmsEditorPage;
  publication?: CmsPublicationSnapshot | null;
}): string {
  const theme = input.site.theme?.cssVars || {};
  const sections = input.page.sections || [];
  const body = sections.map(renderSection).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.page.metaTitle || input.page.title)}</title>
  ${input.page.metaDescription ? `<meta name="description" content="${escapeHtml(input.page.metaDescription)}" />` : ''}
  <style>
    :root { ${cssVarsStyle(theme)} }
    body { margin:0; font-family: var(--font-body, system-ui, sans-serif); color: var(--color-text, #101014); background: var(--color-bg, #fff); }
    a { color: var(--brand-primary, #1e6a6f); }
    .cms-header, .cms-footer, .cms-section { padding: 1.25rem 1.5rem; max-width: 960px; margin: 0 auto; }
    .cms-header { display:flex; gap:1rem; align-items:center; justify-content:space-between; border-bottom:1px solid rgba(0,0,0,.08); }
    .cms-footer { border-top:1px solid rgba(0,0,0,.08); color: var(--color-text-muted, #73737f); }
    .grid { display:grid; grid-template-columns: repeat(auto-fit,minmax(160px,1fr)); gap:1rem; }
    .card { border:1px solid rgba(0,0,0,.08); border-radius:12px; padding:1rem; background: var(--color-surface, #fff); }
    .eyebrow { text-transform:uppercase; letter-spacing:.08em; font-size:.75rem; color: var(--color-text-muted, #73737f); }
    .cta { display:inline-block; margin-top:.75rem; padding:.6rem 1rem; border-radius:999px; background: var(--brand-primary, #1e6a6f); color:#fff; text-decoration:none; }
  </style>
</head>
<body data-cms-page="${escapeHtml(input.page.id)}" data-cms-slug="${escapeHtml(input.page.slug)}">
${body}
</body>
</html>`;
}

export function normalizePublicPath(pathname: string): string {
  const clean = `/${String(pathname || '').split('?')[0].split('#')[0].split('/').filter(Boolean).join('/')}`.replace(/\/$/, '') || '/';
  return clean === '' ? '/' : clean;
}

export async function resolvePublishedPage(
  adapter: CmsEditorAdapter,
  siteId: string,
  pathname: string,
): Promise<{ site: CmsEditorSite; page: CmsEditorPage; publication: CmsPublicationSnapshot } | null> {
  const slug = normalizePublicPath(pathname);
  const site = await adapter.loadSite(siteId);
  const page = site.pages.find((p) => normalizePublicPath(p.slug) === slug);
  if (!page) return null;
  const publication = await adapter.getPublishedRevision(page.id);
  // Public storefront serves published revision only. If never published, return null.
  if (!publication) return null;
  const publishedPage: CmsEditorPage = {
    ...page,
    sections: (publication.sections || []).map((section, index) => {
      const props = (section.props || {}) as Record<string, unknown>;
      const blocks = Array.isArray(props.blocks) ? (props.blocks as CmsEditorSection['blocks']) : [];
      const { blocks: _blocks, name, zone, ...fields } = props;
      return {
        id: section.id || `${page.id}_pub_${index}`,
        name: String(name || section.type || 'Section'),
        type: section.type,
        zone: (zone as CmsEditorSection['zone']) || 'BODY',
        visible: true,
        color: String(props.color || ''),
        fields: { ...fields },
        blocks: blocks || [],
      };
    }),
  };
  return {
    site,
    page: publishedPage,
    publication,
  };
}

export function renderCmsShellHtml(input: { siteName: string; cmsBase?: string }): string {
  const base = input.cmsBase || '/cms';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CMS · ${escapeHtml(input.siteName)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; background: #0f1115; color: #f4f1ea; }
    main { max-width: 720px; margin: 4rem auto; padding: 0 1.5rem; }
    a { color: #cfef5b; }
    code { background: rgba(255,255,255,.08); padding: .1rem .35rem; border-radius: 4px; }
  </style>
</head>
<body>
  <main>
    <p>Protected CMS surface</p>
    <h1>${escapeHtml(input.siteName)}</h1>
    <p>This <code>${escapeHtml(base)}</code> route is backed by the same local CmsEditorAdapter / SQLite authority as the public storefront.</p>
    <p>Mount the full React <code>CmsEditor</code> here from the package root export. Auth is enforced through <code>CmsAuthHost</code>.</p>
    <p><a href="/">← Open public site</a></p>
  </main>
</body>
</html>`;
}
