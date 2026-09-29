/**
 * Deterministic HTML/theme directory → ThemePack / CmsStarterPack.
 * Does not pretend Liquid/arbitrary markup is already CmsEditorSection.
 * Unsupported pieces remain donorCandidates with provenance.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import type { CmsStarterPack, CmsStarterPageSeed } from '../shared/cms/src/starter-pack';
import type { SourceIntake } from './ingest';
import { packageThemePackToFs } from './ingest';
import type { ThemePack, ThemePackDonorCandidate } from './theme-pack';

function slugFromHtmlPath(rel: string): string {
  const base = basename(rel).replace(/\.html?$/i, '');
  if (base === 'index' || base === 'home') return '/';
  return `/${base.toLowerCase().replace(/\s+/g, '-')}`;
}

function titleFromHtml(html: string, fallback: string): string {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (m?.[1]) return m[1].replace(/\s+/g, ' ').trim();
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1?.[1]) return h1[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return fallback;
}

function metaDescription(html: string): string {
  const m = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  return m?.[1]?.trim() || '';
}

function extractCssVars(html: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const rootBlocks = html.matchAll(/:root\s*\{([^}]+)\}/gi);
  for (const block of rootBlocks) {
    const body = block[1];
    for (const match of body.matchAll(/(--[a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g)) {
      vars[match[1]] = match[2].trim();
    }
  }
  // Map common extracted tokens onto CMS brand vars when present
  if (vars['--brand-blue'] && !vars['--brand-primary']) vars['--brand-primary'] = vars['--brand-blue'];
  if (vars['--brand-blue-dark'] && !vars['--brand-secondary']) vars['--brand-secondary'] = vars['--brand-blue-dark'];
  if (vars['--text-primary'] && !vars['--color-text']) vars['--color-text'] = vars['--text-primary'];
  if (!vars['--color-bg']) vars['--color-bg'] = '#f8fafc';
  if (!vars['--brand-primary']) vars['--brand-primary'] = '#2563eb';
  if (!vars['--font-body']) vars['--font-body'] = 'Inter';
  if (!vars['--font-heading']) vars['--font-heading'] = 'Inter';
  return vars;
}

function extractNavLinks(html: string): Array<{ label: string; href: string }> {
  const links: Array<{ label: string; href: string }> = [];
  const nav = html.match(/<nav[\s\S]*?<\/nav>/i)?.[0] || '';
  for (const m of nav.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1].trim();
    const label = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!label || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    links.push({ label, href });
  }
  return links;
}

function extractMainText(html: string): string {
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0]
    || html.match(/<header[\s\S]*?<\/header>/i)?.[0]
    || html;
  const text = main
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 600);
}

function readThemeJson(contentRoot: string): { name?: string; description?: string; pages?: string[] } | null {
  for (const candidate of [join(contentRoot, 'theme.json'), join(dirname(contentRoot), 'theme.json')]) {
    if (!existsSync(candidate)) continue;
    try {
      return JSON.parse(readFileSync(candidate, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Normalize an ingested HTML/theme directory into a ThemePack + CmsStarterPack.
 */
export function normalizeHtmlTheme(
  intake: SourceIntake,
  options?: { packId?: string; outDir?: string },
): ThemePack {
  const themeMeta = readThemeJson(intake.contentRoot);
  const htmlFiles = intake.files.filter((f) => f.category === 'html');
  if (!htmlFiles.length) {
    throw new Error('normalizeHtmlTheme: no HTML pages found in intake');
  }

  const donorCandidates: ThemePackDonorCandidate[] = [];
  for (const file of intake.files) {
    if (file.category === 'js') {
      donorCandidates.push({ path: file.path, reason: 'script_not_normalized_to_cms_block', hash: file.hash });
    } else if (file.category === 'other' && !/\.(md|txt|liquid)$/i.test(file.path)) {
      donorCandidates.push({ path: file.path, reason: 'unsupported_donor_file', hash: file.hash });
    } else if (/\.liquid$/i.test(file.path)) {
      donorCandidates.push({ path: file.path, reason: 'liquid_not_pretended_as_cms_section', hash: file.hash });
    }
  }

  // Prefer site/*.html over help/ duplicates; de-dupe by slug
  const preferred = htmlFiles.filter((f) => !f.path.includes('/help/') || f.path.endsWith('help.html'));
  const bySlug = new Map<string, (typeof preferred)[0]>();
  for (const file of preferred) {
    const slug = slugFromHtmlPath(file.path);
    const existing = bySlug.get(slug);
    if (!existing || file.path.includes('/site/') || file.path.startsWith('site/')) {
      bySlug.set(slug, file);
    }
  }

  let cssVars: Record<string, string> = {};
  const pages: CmsStarterPageSeed[] = [];
  const assets: ThemePack['assets'] = [];
  const packId = options?.packId || `imported-${intake.id}`;

  for (const file of [...bySlug.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    const abs = join(intake.contentRoot, file.path);
    const html = readFileSync(abs, 'utf8');
    if (!Object.keys(cssVars).length) cssVars = extractCssVars(html);
    const slug = slugFromHtmlPath(file.path);
    const title = titleFromHtml(html, basename(file.path, extname(file.path)));
    const nav = extractNavLinks(html);
    const bodyText = extractMainText(html);
    const hasHeader = /<header[\s\S]*?<\/header>/i.test(html);
    const hasFooter = /<footer[\s\S]*?<\/footer>/i.test(html);

    const sections: CmsStarterPageSeed['sections'] = [];
    if (hasHeader || nav.length) {
      sections.push({
        name: 'Global header',
        type: 'header',
        zone: 'HEADER',
        fields: {
          nav: nav.slice(0, 12),
          brand: themeMeta?.name || title,
        },
      });
    }
    sections.push({
      name: 'Imported content',
      type: 'imported-html',
      zone: 'BODY',
      fields: {
        headline: title,
        body: bodyText,
        donorPath: file.path,
        donorHash: file.hash,
        sourceKind: 'html_normalized',
      },
      blocks: [
        {
          type: 'text',
          data: {
            text: bodyText.slice(0, 280) || title,
            typography_preset: 'Body',
          },
        },
      ],
    });
    if (hasFooter) {
      sections.push({
        name: 'Global footer',
        type: 'footer',
        zone: 'FOOTER',
        fields: {
          note: 'Imported footer structure — refine in CMS',
          donorPath: file.path,
        },
      });
    }

    pages.push({
      title: title.split(' - ')[0].trim() || title,
      slug,
      type: slug === '/' ? 'Home' : 'Interior',
      metaTitle: title,
      metaDescription: metaDescription(html) || themeMeta?.description || '',
      sections,
    });
  }

  // Canonicalize image assets
  const imageFiles = intake.files.filter((f) => f.category === 'image');
  const assetsOut = options?.outDir ? join(options.outDir, 'assets') : null;
  if (assetsOut) mkdirSync(assetsOut, { recursive: true });
  for (const img of imageFiles) {
    const abs = join(intake.contentRoot, img.path);
    const id = `asset_${img.hash.slice(0, 12)}`;
    const destName = `${id}${extname(img.path) || '.bin'}`;
    const canonicalPath = assetsOut ? join(assetsOut, destName) : destName;
    if (assetsOut) cpSync(abs, canonicalPath);
    assets.push({
      id,
      sourcePath: img.path,
      canonicalPath: assetsOut ? relative(options!.outDir!, canonicalPath).replace(/\\/g, '/') : destName,
      hash: img.hash,
      mimeType: extname(img.path) === '.svg' ? 'image/svg+xml' : undefined,
    });
  }

  const siteName = themeMeta?.name || pages.find((p) => p.slug === '/')?.title || 'Imported theme';
  const starterPack: CmsStarterPack = {
    id: packId,
    name: siteName,
    version: 1,
    description: themeMeta?.description || `Normalized from ${intake.sourceKind} ${intake.sourcePath}`,
    provenance: {
      kind: 'imported',
      packId,
      packVersion: 1,
    },
    site: {
      name: siteName,
      domain: '',
      color: cssVars['--brand-primary'] || '#2563eb',
    },
    theme: { cssVars },
    schemas: {
      protocol_version: 1,
      sections: [
        { key: 'header', type: 'header', version: 1, label: 'Header' },
        { key: 'imported-html', type: 'imported-html', version: 1, label: 'Imported HTML content' },
        { key: 'footer', type: 'footer', version: 1, label: 'Footer' },
      ],
      blocks: [{ key: 'text', type: 'text', version: 1, label: 'Text' }],
    },
    pages,
  };

  const pack: ThemePack = {
    manifest: {
      schema: 'agentsam.theme-pack.v1',
      id: packId,
      name: siteName,
      version: 1,
      description: starterPack.description,
      provenance: {
        kind: 'imported',
        sourceKind: intake.sourceKind,
        sourcePath: intake.sourcePath,
        sourceHash: intake.sourceHash,
        ingestedAt: intake.ingestedAt,
        packId,
        packVersion: 1,
      },
      site: starterPack.site,
      pages: pages.map((p) => p.slug),
      assetCount: assets.length,
      donorCandidates,
    },
    starterPack,
    assets,
    donorCandidates,
  };

  if (options?.outDir) {
    packageThemePackToFs(options.outDir, pack);
    writeFileSync(join(options.outDir, 'INTAKE_LINK.json'), `${JSON.stringify({
      intakeId: intake.id,
      quarantineDir: intake.quarantineDir,
      sourceHash: intake.sourceHash,
    }, null, 2)}\n`);
  }

  return pack;
}
