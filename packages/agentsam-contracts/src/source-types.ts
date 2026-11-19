export const AGENT_SOURCE_TYPE_CATALOG = 'agentsam.source-types.v2' as const;

export const AGENT_SOURCE_FORMAT_KINDS = ["source","container","codec","native-project","exchange","dataset","archive","package","sequence","subtitle","font","shader","machine-program","color-profile","database","directory-package"] as const;
export const AGENT_SOURCE_IDENTIFICATION_STATUSES = ['declared', 'identified', 'ambiguous', 'unknown', 'mismatch'] as const;
export const AGENT_SOURCE_IDENTIFICATION_CONFIDENCE = ['high', 'medium', 'low', 'none'] as const;
export const AGENT_SOURCE_IDENTIFICATION_EVIDENCE = ["extension","media-type","signature","container","content","application-context","user-selection","provider-metadata"] as const;

export type AgentSourceFormatKind = typeof AGENT_SOURCE_FORMAT_KINDS[number];
export type AgentSourceIdentificationStatus = typeof AGENT_SOURCE_IDENTIFICATION_STATUSES[number];
export type AgentSourceIdentificationConfidence = typeof AGENT_SOURCE_IDENTIFICATION_CONFIDENCE[number];
export type AgentSourceIdentificationEvidence = typeof AGENT_SOURCE_IDENTIFICATION_EVIDENCE[number];

export interface AgentSourceKindReference {
  catalog: typeof AGENT_SOURCE_TYPE_CATALOG;
  id: string;
}

export interface AgentSourceFormatReference {
  catalog: typeof AGENT_SOURCE_TYPE_CATALOG;
  id: string;
  extension?: string;
  mediaType?: string;
  variant?: string;
  parameters?: Record<string, string | number | boolean>;
}

export interface AgentSourceIdentificationResult {
  status: AgentSourceIdentificationStatus;
  confidence: AgentSourceIdentificationConfidence;
  evidence: AgentSourceIdentificationEvidence[];
  candidates?: AgentSourceFormatReference[];
  notes?: string[];
}

export interface AgentSourceKindRecord {
  id: string;
  label: string;
  transport: string;
  description: string;
  supportsChildren: boolean;
  mayBeLive: boolean;
}

export interface AgentSourceFormatRecord {
  id: string;
  label: string;
  family: string;
  kind: AgentSourceFormatKind;
  extensions: string[];
  mediaTypes: string[];
  identificationSignals: AgentSourceIdentificationEvidence[];
  signatures?: Array<{
    id: string;
    description: string;
    confidence: 'high' | 'medium' | 'low';
    segments: Array<{ offset: number; bytesHex?: string; ascii?: string }>;
  }>;
  proprietary: boolean;
  vendor?: string;
  companionExtensions?: string[];
  codecs?: string[];
  containerFormats?: string[];
  variants?: string[];
  notes?: string;
}

export interface AgentSourceTypeCatalog {
  schema: typeof AGENT_SOURCE_TYPE_CATALOG;
  version: string;
  description: string;
  detectionPolicy: {
    extensionMatching: 'longest-suffix';
    extensionIsHintOnly: true;
    mediaTypeIsHintOnly: true;
    signaturePrecedence: 'stronger-than-extension' | 'signature-first';
    ambiguityHandling: 'return-candidates';
    unknownHandling: 'preserve-opaque-source';
  };
  sourceKinds: AgentSourceKindRecord[];
  families: Array<{ id: string; label: string; description?: string }>;
  formats: AgentSourceFormatRecord[];
  ambiguities: Array<{
    extension: string;
    formatIds: string[];
    resolution: 'signature' | 'container' | 'content' | 'application-context' | 'user-choice' | 'multiple-signals';
    notes: string;
  }>;
  compatibility: {
    previousSchema: 'agentsam.source-types.v1';
    legacyIdMappings: Record<string, string[]>;
  };
}
