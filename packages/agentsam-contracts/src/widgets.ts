import type { AgentSamErrorEnvelope } from './errors';

export type AgentSamWidgetSize = 'small' | 'medium' | 'large';

export type AgentSamWidgetKind =
  | 'countdown'
  | 'clock'
  | 'metric'
  | 'list'
  | 'launcher'
  | 'brand'
  | (string & {});

export interface AgentSamWidgetDataSource {
  /** Existing route key, tool operation id, or host-owned projection id. */
  source: string;
  /** Host-defined refresh class, such as realtime, short, medium, or manual. */
  refresh?: string;
}

export interface AgentSamWidgetDefinition {
  id: string;
  kind: AgentSamWidgetKind;
  title: string;
  description?: string;
  icon?: string;
  sizes: readonly AgentSamWidgetSize[];
  /** Gallery taxonomy; layout and presentation must not depend on route names. */
  category?: 'utility' | 'glance' | 'navigation' | 'content' | 'agent/runtime' | 'weather';
  tags?: readonly string[];
  /** Preview-only items must never be offered as live/installed capabilities. */
  availability?: 'ready' | 'demo';
  /** Proposed package authority for graduating a donor widget. */
  ownerPackage?: string;
  data?: AgentSamWidgetDataSource;
  /** Route key or host-resolved deep link. Do not put credentials or raw provider secrets here. */
  deeplink?: string;
}

export interface AgentSamWidgetReadyState {
  status: 'ready';
  updated_at?: string;
}

export interface AgentSamWidgetStaleState {
  status: 'stale';
  updated_at: string;
  error: AgentSamErrorEnvelope;
}

export interface AgentSamWidgetEmptyState {
  status: 'empty';
  updated_at?: string;
}

export interface AgentSamWidgetErrorState {
  status: 'error';
  error: AgentSamErrorEnvelope;
}

export type AgentSamWidgetState =
  | AgentSamWidgetReadyState
  | AgentSamWidgetStaleState
  | AgentSamWidgetEmptyState
  | AgentSamWidgetErrorState;
