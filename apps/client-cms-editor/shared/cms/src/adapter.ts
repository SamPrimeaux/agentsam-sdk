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
 *
 * Required methods are authoring CRUD. Adapters that cannot support a method
 * must throw a typed capability error — never silently drop editor actions.
 */

import type {
  CmsEditorBlock,
  CmsEditorPage,
  CmsEditorSection,
  CmsEditorSite,
} from './editor-types';
import type { CmsPublicationSnapshot } from './publication';

export type { CmsPublicationSnapshot } from './publication';

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
  metadata?: Record<string, unknown>;
};

export type CmsCapabilityErrorCode =
  | 'cms_capability_unsupported'
  | 'cms_adapter_not_configured'
  | 'cms_source_not_found'
  | 'cms_permission_denied';

export class CmsCapabilityError extends Error {
  readonly code: CmsCapabilityErrorCode;
  readonly capability: string;

  constructor(capability: string, message?: string, code: CmsCapabilityErrorCode = 'cms_capability_unsupported') {
    super(message || `CMS adapter does not support ${capability}`);
    this.name = 'CmsCapabilityError';
    this.code = code;
    this.capability = capability;
  }
}

/**
 * Required content-authoring contract for a real CMS editor.
 * Optional methods must not be used as a way to dilute CRUD.
 */
export type CmsEditorAdapter = {
  // Site
  loadSite(siteId: string): Promise<CmsEditorSite>;

  // Pages
  listPages(siteId: string): Promise<CmsEditorPage[]>;
  getPage(pageId: string): Promise<CmsEditorPage>;
  createPage(
    siteId: string,
    input: Partial<CmsEditorPage> & { title: string; slug: string },
  ): Promise<CmsEditorPage>;
  updatePage(pageId: string, patch: Partial<CmsEditorPage>): Promise<CmsEditorPage>;
  deletePage(pageId: string): Promise<void>;

  // Sections
  listSections(pageId: string): Promise<CmsEditorSection[]>;
  getSection(sectionId: string): Promise<CmsEditorSection>;
  createSection(
    pageId: string,
    input: Partial<CmsEditorSection> & { name: string },
  ): Promise<CmsEditorSection>;
  updateSection(
    sectionId: string,
    patch: Partial<CmsEditorSection>,
  ): Promise<CmsEditorSection>;
  deleteSection(sectionId: string): Promise<void>;
  reorderSections(pageId: string, sectionIds: string[]): Promise<void>;
  setSectionVisibility(sectionId: string, visible: boolean): Promise<void>;

  // Blocks
  listBlocks(sectionId: string): Promise<CmsEditorBlock[]>;
  getBlock(blockId: string): Promise<CmsEditorBlock>;
  createBlock(
    sectionId: string,
    input: Partial<CmsEditorBlock> & { type: string },
  ): Promise<CmsEditorBlock>;
  updateBlock(
    blockId: string,
    patch: Partial<CmsEditorBlock>,
  ): Promise<CmsEditorBlock>;
  deleteBlock(blockId: string): Promise<void>;
  reorderBlocks?(sectionId: string, blockIds: string[]): Promise<void>;

  // Draft / revisions
  saveDraft(pageId: string, payload: unknown): Promise<CmsRevision>;
  getRevision(revisionId: string): Promise<CmsRevision>;
  listRevisions(pageId: string): Promise<CmsRevision[]>;
  restoreRevision(pageId: string, revisionId: string): Promise<CmsEditorPage>;

  // Publication
  previewDraft(pageId: string): Promise<{ previewUrl?: string; snapshot: unknown }>;
  publish(pageId: string, options?: { revisionId?: string }): Promise<CmsPublicationSnapshot>;
  getPublishedRevision(pageId: string): Promise<CmsPublicationSnapshot | null>;

  // Assets
  listAssets(siteId: string): Promise<CmsAsset[]>;
  getAsset(assetId: string): Promise<CmsAsset>;
  uploadAsset(
    siteId: string,
    file: Blob,
    meta?: { name?: string; metadata?: Record<string, unknown> },
  ): Promise<CmsAsset>;
  updateAsset(
    assetId: string,
    patch: Partial<Pick<CmsAsset, 'name' | 'metadata' | 'url' | 'key'>>,
  ): Promise<CmsAsset>;
  deleteAsset(assetId: string): Promise<void>;
};

/** Capability ids used when reporting honest unsupported operations. */
export const CMS_ADAPTER_CAPABILITIES = Object.freeze([
  'loadSite',
  'listPages',
  'getPage',
  'createPage',
  'updatePage',
  'deletePage',
  'listSections',
  'getSection',
  'createSection',
  'updateSection',
  'deleteSection',
  'reorderSections',
  'setSectionVisibility',
  'listBlocks',
  'getBlock',
  'createBlock',
  'updateBlock',
  'deleteBlock',
  'reorderBlocks',
  'saveDraft',
  'getRevision',
  'listRevisions',
  'restoreRevision',
  'previewDraft',
  'publish',
  'getPublishedRevision',
  'listAssets',
  'getAsset',
  'uploadAsset',
  'updateAsset',
  'deleteAsset',
] as const);

export type CmsAdapterCapability = (typeof CMS_ADAPTER_CAPABILITIES)[number];

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
  /** Explicit list of supported capabilities; omit only when fully implementing CmsEditorAdapter. */
  capabilities?: CmsAdapterCapability[];
};
