import type { ActorRef } from "./actor.js";

/**
 * Provenance never gets lost. An imported asset that goes live is still
 * historically an import; a generated asset keeps its model/prompt evidence.
 */
export interface GenerationProvenance {
  model?: string;
  promptHash?: string;
  prompt?: string;
  jobId?: string;
  sourceAssetIds?: string[];
  brandContext?: string;
}

export interface ImportProvenance {
  batch?: string;
  sourceUrl?: string;
  archive?: string;
  crawledFrom?: string;
}

export interface ProvenanceEntry {
  at: string;
  action:
    | "uploaded"
    | "generated"
    | "imported"
    | "derived-from"
    | "edited"
    | "renamed"
    | "optimized"
    | "state-changed"
    | "rated"
    | (string & {});
  actor?: ActorRef;
  detail?: Record<string, unknown>;
}

export interface ContentProvenance {
  generation?: GenerationProvenance;
  import?: ImportProvenance;
  /** Parent asset when this was derived (crop, transcode, poster...). */
  derivedFrom?: string;
  history: ProvenanceEntry[];
}

export function appendProvenance(
  p: ContentProvenance,
  entry: Omit<ProvenanceEntry, "at"> & { at?: string },
): ContentProvenance {
  return {
    ...p,
    history: [...p.history, { at: entry.at ?? new Date().toISOString(), ...entry }],
  };
}
