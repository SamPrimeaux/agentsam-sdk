export {
  EMBEDDING_PROVIDER_POLICY,
  createLocalSqliteConnection,
  isVectorsNone,
  METRICS_ADAPTER_IDS,
  metricsCacheKey,
  DATABASE_CAPABILITY_KEYS,
  DATABASE_ENGINES,
  DATABASE_PROVIDERS,
} from './contracts/index.js';

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

export {
  deriveCapabilities,
  withHonestCapabilities,
  toStudioCapabilities,
  sqlKind,
  assertSqlAllowed,
  readTableRows,
  DDL_ACTIONS,
  buildDdlSql,
  applyDdl,
  buildCreateTableSql,
  assertSafeIdent,
  registerAdapterFactory,
  registerSqliteAdapterFactory,
  listRegisteredAdapterKinds,
  createAdapter,
  createAdapterFromConnection,
  createDatabaseRequestHandler,
} from './runtime/index.js';

export { DATABASE_EDITOR_APP } from './manifest.js';
