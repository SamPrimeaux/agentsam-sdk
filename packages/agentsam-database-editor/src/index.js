export {
  EMBEDDING_PROVIDER_POLICY,
} from './contracts/embeddings-policy.js';
export {
  AGENTSAM_ICON_KEYS,
  ICON_ALIASES,
  ICON_CATALOG,
  CLI_ICON_GLYPHS,
  normalizeIconKey,
  isAgentsamIconKey,
  resolveCliIconGlyph,
  resolveIconMeta,
  createIconRenderer,
  resolveTerminalIcon,
} from './contracts/icon-vocabulary.js';
export {
  createLocalSqliteConnection,
  isVectorsNone,
} from './contracts/connection.js';
export {
  METRICS_ADAPTER_IDS,
  metricsCacheKey,
} from './contracts/metrics-adapter.js';

export { createSqliteAdapter } from './adapters/sqlite.js';

export { DATABASE_EDITOR_APP } from './manifest.js';

export function createD1Adapter(_opts) {
  throw new Error('createD1Adapter: Phase 1.1 — use createSqliteAdapter for local first');
}
export function createPostgresAdapter(_opts) {
  throw new Error('createPostgresAdapter: Phase 1.1');
}
export function createSupabaseAdapter(_opts) {
  throw new Error('createSupabaseAdapter: Phase 1.1');
}
