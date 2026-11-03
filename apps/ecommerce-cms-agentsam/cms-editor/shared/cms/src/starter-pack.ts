import type { CmsEditorAdapter } from './adapter';
import type { CmsEditorZone } from './editor-types';

/**
 * Built-in or harvested starter content. Not ephemeral, not demo-mode.
 * Preview vs install are separate operations — the pack itself is durable product content.
 */
export type CmsStarterPackProvenance = {
  kind: 'builtin_starter' | 'harvested' | 'imported';
  packId: string;
  packVersion: number;
};

export type CmsStarterBlockSeed = {
  type: string;
  data?: Record<string, unknown>;
};

export type CmsStarterSectionSeed = {
  name: string;
  type: string;
  zone?: CmsEditorZone;
  fields?: Record<string, unknown>;
  blocks?: CmsStarterBlockSeed[];
};

export type CmsStarterPageSeed = {
  title: string;
  slug: string;
  type?: string;
  metaTitle?: string;
  metaDescription?: string;
  sections: CmsStarterSectionSeed[];
};

export type CmsStarterSiteSeed = {
  name?: string;
  domain?: string;
  initials?: string;
  color?: string;
};

export type CmsStarterPack = {
  id: string;
  name: string;
  version: number;
  description?: string;
  provenance: CmsStarterPackProvenance;
  /** Initial site shell when installing into an empty adapter (no public domain invented). */
  site?: CmsStarterSiteSeed;
  theme: {
    cssVars: Record<string, string>;
  };
  schemas: {
    protocol_version: number;
    sections: unknown[];
    blocks: unknown[];
    fields?: unknown[];
  };
  templates?: Array<{
    id: string;
    name: string;
    type: string;
    category?: string;
  }>;
  pages: CmsStarterPageSeed[];
};

export type InstallStarterPackResult = {
  siteId: string;
  pageIds: string[];
  packId: string;
  packVersion: number;
};

/**
 * Install a starter pack into a real CmsEditorAdapter (durable path).
 * Uses adapter CRUD + saveDraft — never fabricates success outside the adapter.
 */
function siteInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'CMS'
  );
}

export async function installStarterPack(
  adapter: CmsEditorAdapter,
  pack: CmsStarterPack,
  options?: { siteId?: string },
): Promise<InstallStarterPackResult> {
  const siteId = String(options?.siteId || pack.id).trim();
  if (!siteId) throw new Error('starter_pack_site_id_required');

  const sites = await adapter.listSites();
  const siteExists = sites.some((site) => site.id === siteId);
  if (!siteExists) {
    const siteName = pack.site?.name?.trim() || pack.name;
    await adapter.createSite({
      id: siteId,
      name: siteName,
      domain: pack.site?.domain ?? '',
      initials: pack.site?.initials ?? siteInitials(siteName),
      color: pack.site?.color ?? pack.theme.cssVars['--brand-primary'] ?? '#1e6a6f',
      theme: pack.theme,
      schemas: pack.schemas,
    });
  } else {
    await adapter.updateSite(siteId, {
      theme: pack.theme,
      schemas: pack.schemas,
      name: pack.site?.name?.trim() || undefined,
    });
  }

  const pageIds: string[] = [];
  for (const pageSeed of pack.pages) {
    const page = await adapter.createPage(siteId, {
      title: pageSeed.title,
      slug: pageSeed.slug,
      type: pageSeed.type || 'Interior',
      metaTitle: pageSeed.metaTitle || pageSeed.title,
      metaDescription: pageSeed.metaDescription || '',
    });
    pageIds.push(page.id);

    for (const sectionSeed of pageSeed.sections) {
      const section = await adapter.createSection(page.id, {
        name: sectionSeed.name,
        type: sectionSeed.type,
        zone: sectionSeed.zone || 'BODY',
        fields: { ...(sectionSeed.fields || {}) },
        blocks: [],
      });
      for (const blockSeed of sectionSeed.blocks || []) {
        await adapter.createBlock(section.id, {
          type: blockSeed.type,
          data: { ...(blockSeed.data || {}) },
        });
      }
    }

    const hydrated = await adapter.getPage(page.id);
    await adapter.saveDraft(page.id, { sections: hydrated.sections, theme: pack.theme, schemas: pack.schemas });
  }

  return {
    siteId,
    pageIds,
    packId: pack.provenance.packId,
    packVersion: pack.provenance.packVersion,
  };
}
