/**
 * File storage is a projection of ContentAsset, never a second asset catalog.
 * Targets identify WHERE bytes live; providerRefs identify WHICH objects.
 * Hosts resolve OAuth, native filesystem grants, D1/SQLite and R2 bindings.
 */
import type { ContentAsset } from '../core/asset.js';
import type { ActorRef } from '../core/actor.js';
import type { ContentRevision } from '../core/revision.js';
import type { ContentQuery } from '../core/collection.js';
import type { ProviderRef, ContentProviderName } from '../core/source.js';
import type { ContentVariant } from '../core/variant.js';

export type FileStorageKind = 'native-filesystem' | 'browser-file-handle' | 'browser-indexeddb'
  | 'cloud-object' | 'cloud-drive' | (string & {});
export type FileOperation = 'read' | 'write' | 'list' | 'search' | 'copy' | 'move'
  | 'export' | 'delete' | 'restore';
export type FileStorageState = 'connected' | 'requires-connection' | 'permission-required'
  | 'unavailable' | 'error';

export interface FileStorageTarget {
  /** Opaque host-resolved target identity. For R2 this maps to r2_buckets.id. */
  id: string;
  accountId: string;
  provider: ContentProviderName;
  kind: FileStorageKind;
  label: string;
  state: FileStorageState;
  capabilities: FileOperation[];
  /** Host-only device permission handle when the target is local/browser-backed. */
  deviceId?: string;
  /** Descriptive only; hosts resolve physical locations through the target identity. */
  description?: string;
}

export interface FilePermissions {
  /** Permission policy is evaluated server/native-side; this is a metadata projection. */
  ownerAccountId: string;
  visibility: 'private' | 'shared';
  grants?: Array<{ principalId: string; operations: FileOperation[] }>;
}

export interface FileTrash {
  deletedAt: string;
  deletedBy: ActorRef;
}

export interface FileLocation {
  targetId: string;
  ref: ProviderRef;
  kind: FileStorageKind;
  online: boolean;
}

export interface FileRecord {
  /** The existing canonical ContentAsset; not copied into another model. */
  asset: ContentAsset;
  locations: FileLocation[];
  permissions: FilePermissions;
  derivatives: ContentVariant[];
  deleted: boolean;
}

export interface FileListResult {
  files: FileRecord[];
  cursor?: string;
  total: number;
}

/** Query and metadata are explicitly account-scoped by the host database. */
export interface AccountFileMetadata {
  get(accountId: string, assetId: string): Promise<ContentAsset | null>;
  list(accountId: string, query?: ContentQuery & { includeDeleted?: boolean }): Promise<{ assets: ContentAsset[]; cursor?: string; total: number }>;
  /**
   * Atomic compare-and-swap of account-scoped metadata AND its revision receipt.
   * D1/SQLite hosts implement one transaction; conflicts fail without mutating either.
   */
  commit(accountId: string, expectedRevision: number, asset: ContentAsset, revision: ContentRevision): Promise<void>;
}

export interface FileWriteInput {
  ref?: string;
  name: string;
  mime?: string;
  bytes: AsyncIterable<Uint8Array>;
}

/**
 * Actual bytes must flow through the provider. No fake "local" memory store.
 * Large originals can stream without base64 or full-buffer allocation.
 */
export interface FileByteAdapter {
  readonly targetId: string;
  /** Report ONLY verified executable operations. */
  readonly capabilities: readonly FileOperation[];
  read(ref: string): AsyncIterable<Uint8Array>;
  write(input: FileWriteInput): Promise<{ ref: string; bytes?: number; mime?: string }>;
  /** Used only after a confirmed durable destination write for move. */
  delete(ref: string): Promise<void>;
}

export interface FileExport {
  name: string;
  mime?: string;
  bytes: AsyncIterable<Uint8Array>;
  targetId: string;
}
