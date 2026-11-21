/**
 * Portable scene/interchange capability contract, shared by AgentSam hosts.
 * Describes format support. It is NOT an importer, exporter, asset store,
 * renderer, tool dispatcher, installation probe, or authorization grant.
 * Specific adapters remain in @inneranimalmedia/iamscene.
 */
export const AGENTSAM_SCENE_FORMAT_CONTRACT = 'agentsam.scene-format.v1' as const;

export const SCENE_FORMAT_OPERATIONS = ['import', 'export', 'live-reference', 'round-trip'] as const;
export type SceneFormatOperation = (typeof SCENE_FORMAT_OPERATIONS)[number];
export type SceneFormatAvailability = 'implemented' | 'unavailable';

export interface SceneFormatCapability {
  /** IAMScene adapter ID; not inferred from a file extension or MIME alone. */
  id: string;
  family: string;
  extensions: readonly string[];
  /** Four independent operations; displayability never grants editability. */
  operations: Readonly<Record<SceneFormatOperation, SceneFormatAvailability>>;
  limitations: readonly string[];
  /** Existing source-types.v2 catalog IDs, not alternate codec declarations. */
  sourceTypeIds?: readonly string[];
}

/** A round-trip report is only evidence for the checked properties. */
export interface SceneFormatRoundTripReceipt {
  format: string;
  passed: boolean;
  preserved: readonly string[];
  lost: readonly string[];
  warnings: readonly string[];
}

/** Exact bytes + cryptographic digest: not proof of a semantic importer. */
export interface SceneFormatReferenceReceipt {
  uri: string;
  /** Filename-only candidate; content identity has not been established. */
  identification: 'extension-hint';
  format: string;
  sha256: string;
  byteLength: number;
  revision?: string;
}

/** Hash receipts are not proof of a decoder or a conversion capability. */
export function assertSceneFormatReferenceReceipt(value: unknown): asserts value is SceneFormatReferenceReceipt {
  const row = value as Partial<SceneFormatReferenceReceipt> | null;
  if (!row || typeof row !== 'object' || Object.keys(row).some(k=>!['uri','identification','format','sha256','byteLength','revision'].includes(k)) ||
    row.identification !== 'extension-hint' || typeof row.uri !== 'string' || !row.uri || typeof row.format !== 'string' || !row.format ||
    typeof row.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.sha256) ||
    !Number.isSafeInteger(row.byteLength) || (row.byteLength ?? -1) < 0 ||
    (row.revision !== undefined && typeof row.revision !== 'string')) {
    throw new Error('agentsam_scene_format_reference_receipt_invalid');
  }
}

/** Descriptors are untrusted until validated by the consumer. */
export function assertSceneFormatCapability(value: unknown): asserts value is SceneFormatCapability {
  const row = value as Partial<SceneFormatCapability> | null;
  if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(row.id) ||
    typeof row.family !== 'string' || !row.family.trim() ||
    !Array.isArray(row.extensions) || !row.extensions.length ||
    row.extensions.some(extension => typeof extension !== 'string' || !/^\.[a-z0-9.]+$/.test(extension)) ||
    !Array.isArray(row.limitations) || row.limitations.some(item => typeof item !== 'string') ||
    !row.operations || typeof row.operations !== 'object') {
    throw new Error('agentsam_scene_format_capability_invalid');
  }
  if (Object.keys(row).some(key => !['id','family','extensions','operations','limitations','sourceTypeIds'].includes(key)) ||
    new Set(row.extensions).size !== row.extensions.length ||
    (row.sourceTypeIds !== undefined && (!Array.isArray(row.sourceTypeIds) || !row.sourceTypeIds.length ||
      row.sourceTypeIds.some(id=>typeof id !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/.test(id)) ||
      new Set(row.sourceTypeIds).size !== row.sourceTypeIds.length))) {
    throw new Error('agentsam_scene_format_capability_invalid');
  }
  const ops = row.operations as Record<string, unknown>;
  if (Object.keys(ops).length !== SCENE_FORMAT_OPERATIONS.length ||
    SCENE_FORMAT_OPERATIONS.some(operation => !['implemented', 'unavailable'].includes(String(ops[operation])))) {
    throw new Error('agentsam_scene_format_operations_invalid');
  }
}

export function assertSceneFormatRoundTripReceipt(value: unknown): asserts value is SceneFormatRoundTripReceipt {
  const row = value as Partial<SceneFormatRoundTripReceipt> | null;
  if (!row || typeof row !== 'object' || Object.keys(row).some(k=>!['format','passed','preserved','lost','warnings'].includes(k)) ||
    typeof row.format !== 'string' || !row.format || typeof row.passed !== 'boolean' ||
    !Array.isArray(row.preserved) || !Array.isArray(row.lost) || !Array.isArray(row.warnings) ||
    [...row.preserved, ...row.lost, ...row.warnings].some(item => typeof item !== 'string') ||
    (row.passed && row.lost.length > 0)) {
    throw new Error('agentsam_scene_format_round_trip_receipt_invalid');
  }
}
