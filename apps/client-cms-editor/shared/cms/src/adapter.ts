/**
 * Portable CMS persistence/transport contract.
 *
 * The editor depends on this interface — not on any host's private CMS routes
 * or invented Worker binding product sources. Hosts implement adapters:
 *   - SQLite (desktop / offline authority)
 *   - Cloudflare D1 + R2 (cloud authority via OAuth-proven resources)
 *   - custom HTTP backend
 *   - InnerAnimalMedia platform (one consumer implementation)
 *
 * localStorage is never an adapter. It may cache UI chrome only.
 */

import type {
  CmsEditorBlock,
  CmsEditorPage,
  CmsEditorSection,
  CmsEditorSite,
} from './editor-types.js';
import type { CmsPublicationSnapshot } from './publication.js';

export type CmsRevision = {
  id: string;
  pageId: string;
  kind: 'draft' | 'publication';
  createdAt: string;
  label?: string;
  snapshot?: unknown;
};

export type CmsAsset = {
  id: string;
  name: string;
  mimeType?: string;
  size?: number;
  url?: string;
  key?: string;
  createdAt?: string;
};

export type CmsEditorAdapter = {
  loadSite(siteId: string): Promise<CmsEditorSite>;
  listPages(siteId: string): Promise<CmsEditorPage[]>;
  createPage(
    siteId: string,
    input: Partial<CmsEditorPage> & { title: string; slug: string },
  ): Promise<CmsEditorPage>;
  updatePage(pageId: string, patch: Partial<CmsEditorPage>): Promise<CmsEditorPage>;
  deletePage(pageId: string): Promise<void>;

  createSection(
    pageId: string,
    input: Partial<CmsEditorSection> & { name: string },
  ): Promise<CmsEditorSection>;
  updateSection(
    sectionId: string,
    patch: Partial<CmsEditorSection>,
  ): Promise<CmsEditorSection>;
  reorderSections(pageId: string, sectionIds: string[]): Promise<void>;
  setSectionVisibility(sectionId: string, visible: boolean): Promise<void>;

  createBlock?(
    sectionId: string,
    input: Partial<CmsEditorBlock> & { type: string },
  ): Promise<CmsEditorBlock>;
  updateBlock?(
    blockId: string,
    patch: Partial<CmsEditorBlock>,
  ): Promise<CmsEditorBlock>;

  saveDraft(pageId: string, payload: unknown): Promise<CmsRevision>;
  listRevisions(pageId: string): Promise<CmsRevision[]>;
  publish(pageId: string, options?: { revisionId?: string }): Promise<CmsPublicationSnapshot>;

  listAssets?(siteId: string): Promise<CmsAsset[]>;
  uploadAsset?(
    siteId: string,
    file: Blob,
    meta?: { name?: string },
  ): Promise<CmsAsset>;
};

export type CmsAdapterKind = 'sqlite' | 'd1_r2' | 'http' | 'custom';

export type CmsAdapterDescriptor = {
  kind: CmsAdapterKind;
  label: string;
  /** Provenance of the backing store — never invented product resources. */
  provenance: {
    kind: 'native_runtime' | 'oauth_discovery' | 'user_configured' | 'http_endpoint';
    runtimeId?: string;
    connectionId?: string;
    resourceId?: string;
    endpoint?: string;
  };
};
