/**
 * Capability honesty — never advertise what the adapter cannot do.
 */

/**
 * @param {import('../contracts/adapter.js').DatabaseAdapter} adapter
 * @param {Partial<import('../contracts/adapter.js').DatabaseCapabilities>} [declared]
 * @returns {import('../contracts/adapter.js').DatabaseCapabilities}
 */
export function deriveCapabilities(adapter, declared = {}) {
  const hasQuery = typeof adapter?.query === 'function';
  const hasList = typeof adapter?.listTables === 'function';
  const hasDescribe = typeof adapter?.describeTable === 'function';
  const hasInsert = typeof adapter?.insert === 'function';
  const hasUpdate = typeof adapter?.update === 'function';
  const hasDelete = typeof adapter?.delete === 'function';
  const hasMigration = typeof adapter?.applyMigration === 'function';
  const hasTransaction = typeof adapter?.transaction === 'function';
  const hasExport = typeof adapter?.export === 'function';

  const migrationMode = hasMigration
    ? (declared.migrationApply === 'batch' ? 'batch' : 'statement')
    : 'none';

  return {
    schemaIntrospection: hasList && hasDescribe,
    sqlQuery: hasQuery,
    rowMutations: hasInsert && hasUpdate && hasDelete,
    export: hasExport,
    transactions: hasTransaction,
    multiStatement: Boolean(declared.multiStatement),
    migrationApply: migrationMode,
    ddl: hasQuery && (declared.ddl !== false),
  };
}

/**
 * Wrap an adapter so capabilities() always reflects implemented methods.
 * Declared aspirational flags cannot override missing implementations.
 *
 * @param {import('../contracts/adapter.js').DatabaseAdapter} adapter
 * @returns {import('../contracts/adapter.js').DatabaseAdapter}
 */
export function withHonestCapabilities(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new Error('adapter_required');
  const declared =
    typeof adapter.capabilities === 'function' ? (adapter.capabilities() || {}) : {};
  const honest = deriveCapabilities(adapter, declared);
  return {
    ...adapter,
    capabilities: () => ({ ...honest }),
  };
}

/**
 * Map adapter capabilities → Studio UI wire vocabulary
 * (read_rows / query / schema / insert / …).
 *
 * @param {import('../contracts/adapter.js').DatabaseCapabilities} caps
 * @param {{ metrics?: boolean, writable?: boolean }} [opts]
 */
export function toStudioCapabilities(caps, opts = {}) {
  const writable = opts.writable !== false && caps.rowMutations;
  return {
    read_rows: caps.schemaIntrospection || caps.sqlQuery,
    query: caps.sqlQuery,
    schema: caps.schemaIntrospection,
    insert: writable,
    update: writable,
    delete: writable,
    metrics: opts.metrics === true,
    export: caps.export === true,
    transactions: caps.transactions === true,
  };
}
