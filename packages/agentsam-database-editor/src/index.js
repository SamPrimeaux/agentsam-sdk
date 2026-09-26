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
export {
  createD1Adapter,
  createD1BindingAdapter,
} from './adapters/d1.js';
export {
  createPostgresAdapter,
  createHyperdriveAdapter,
} from './adapters/postgres.js';
export { createSupabaseAdapter } from './adapters/supabase.js';

export { readD1Metrics } from './metrics/d1.js';
export { readPostgresMetrics } from './metrics/postgres.js';

export { DATABASE_EDITOR_APP } from './manifest.js';
