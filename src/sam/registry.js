/** @type {Map<string, import('./types.js').SamOperationDef>} */
const operations = new Map();

/**
 * @param {import('./types.js').SamOperationDef} def
 */
export function registerSamOperation(def) {
  if (operations.has(def.id)) {
    throw new Error(`sam_operation_already_registered:${def.id}`);
  }
  operations.set(def.id, def);
  return def;
}

/**
 * @param {string} id
 */
export function getSamOperation(id) {
  return operations.get(id) || null;
}

export function listSamOperations() {
  return [...operations.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function clearSamRegistryForTests() {
  operations.clear();
}

/**
 * Compact cards for discover / tool selection.
 * @param {import('./types.js').SamOperationDef} def
 */
export function toSamOperationCard(def) {
  return {
    id: def.id,
    module: def.module,
    action: def.action,
    summary: def.summary,
    model: def.execution.model,
    risk: def.risk,
    network: def.execution.network,
    side_effects: def.execution.sideEffects,
    lanes: [...def.execution.lanes],
    status: def.status || 'stable',
    cli: def.cli?.command || [],
  };
}
