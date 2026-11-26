import sourceCatalog from '../schemas/source-types.v2.json' with { type: 'json' };
import {
  AGENT_SOURCE_TYPE_CATALOG,
  AGENT_SOURCE_IDENTIFICATION_STATUSES,
  AGENT_SOURCE_IDENTIFICATION_CONFIDENCE,
  AGENT_SOURCE_IDENTIFICATION_EVIDENCE,
} from './source-types';
import type {
  AgentSourceFormatReference,
  AgentSourceKindReference,
  AgentSourceIdentificationResult,
} from './source-types';

const formatsById = new Map(sourceCatalog.formats.map(format => [format.id, format]));
const kindsById = new Set(sourceCatalog.sourceKinds.map(kind => kind.id));
const statuses = new Set<string>(AGENT_SOURCE_IDENTIFICATION_STATUSES);
const confidences = new Set<string>(AGENT_SOURCE_IDENTIFICATION_CONFIDENCE);
const evidenceKinds = new Set<string>(AGENT_SOURCE_IDENTIFICATION_EVIDENCE);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** True only for a format ID present in the canonical source catalog. */
export function isAgentSourceFormatReference(value: unknown): value is AgentSourceFormatReference {
  if (!isRecord(value) || value.catalog !== AGENT_SOURCE_TYPE_CATALOG || typeof value.id !== 'string') return false;
  const format = formatsById.get(value.id);
  if (!format) return false;
  if (value.extension !== undefined && (typeof value.extension !== 'string' || !format.extensions.includes(value.extension.toLowerCase()))) return false;
  if (value.mediaType !== undefined && (typeof value.mediaType !== 'string' || !format.mediaTypes.some(type => type.toLowerCase() === value.mediaType.toLowerCase()))) return false;
  if (value.variant !== undefined && (typeof value.variant !== 'string' || !format.variants?.includes(value.variant))) return false;
  if (value.parameters !== undefined && (!isRecord(value.parameters) || !Object.values(value.parameters).every(item => typeof item === 'string' || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))))) return false;
  return Object.keys(value).every(key => ['catalog','id','extension','mediaType','variant','parameters'].includes(key));
}

/** True only for a source-kind ID present in the canonical source catalog. */
export function isAgentSourceKindReference(value: unknown): value is AgentSourceKindReference {
  return isRecord(value)
    && value.catalog === AGENT_SOURCE_TYPE_CATALOG
    && typeof value.id === 'string'
    && kindsById.has(value.id)
    && Object.keys(value).every(key => ['catalog','id'].includes(key));
}

/** Create a validated reference without copying the source-kind catalog. */
export function createAgentSourceKindReference(id: string): AgentSourceKindReference {
  const reference = { catalog: AGENT_SOURCE_TYPE_CATALOG, id };
  if (!isAgentSourceKindReference(reference)) throw new Error('agent_source_kind_unknown:' + id);
  return reference;
}

/** Validate the portable identification result and every candidate ID. */
export function isAgentSourceIdentificationResult(value: unknown): value is AgentSourceIdentificationResult {
  return isRecord(value)
    && statuses.has(String(value.status))
    && confidences.has(String(value.confidence))
    && Array.isArray(value.evidence)
    && value.evidence.every(item => typeof item === 'string' && evidenceKinds.has(item))
    && (value.candidates === undefined || (Array.isArray(value.candidates) && value.candidates.every(isAgentSourceFormatReference)))
    && (value.notes === undefined || (Array.isArray(value.notes) && value.notes.every(item => typeof item === 'string')))
    && Object.keys(value).every(key => ['status','confidence','evidence','candidates','notes'].includes(key));
}

export type { AgentSourceFormatReference, AgentSourceKindReference, AgentSourceIdentificationResult } from './source-types';
