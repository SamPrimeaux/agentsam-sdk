import { assertAgentOperationContract } from '@inneranimalmedia/agentsam-contracts';

/**
 * @param {import('./types.js').SamOperationDef} def
 * @returns {import('./types.js').SamOperationDef}
 */
export function defineSamOperation(def) {
  if (!def || typeof def !== 'object') {
    throw new TypeError('defineSamOperation requires an operation definition object');
  }
  if (typeof def.id !== 'string' || !def.id.includes('.')) {
    throw new TypeError('defineSamOperation: id must be a dotted operation id (e.g. brand.scan)');
  }
  if (typeof def.handler !== 'function') {
    throw new TypeError(`defineSamOperation(${def.id}): handler must be a function`);
  }
  if (!def.module || !def.action) {
    throw new TypeError(`defineSamOperation(${def.id}): module and action are required`);
  }
  if (!def.execution?.lanes?.length || !def.execution.model || !def.execution.network || !def.execution.sideEffects) {
    throw new TypeError(`defineSamOperation(${def.id}): execution.{lanes,model,network,sideEffects} required`);
  }
  if (!def.risk) {
    throw new TypeError(`defineSamOperation(${def.id}): risk is required`);
  }
  if (!def.summary) {
    throw new TypeError(`defineSamOperation(${def.id}): summary is required`);
  }

  // Validate portable metadata through the contracts package. Handler and any
  // host/runtime-only extensions are not part of the serialized contract.
  assertAgentOperationContract({ ...def, version: def.version ?? 1 });

  const skill = typeof def.skill === 'string'
    ? { id: def.skill, help: true }
    : def.skill === null
      ? null
      : (def.skill || undefined);

  const providerSpend = def.execution.provider_spend ??
    (def.execution.model === 'never' ? 'never' : 'optional');

  return {
    ...def,
    version: def.version ?? 1,
    status: def.status ?? 'stable',
    purpose: def.purpose || def.description || def.summary,
    outcome: def.outcome || undefined,
    accepts: Array.isArray(def.accepts) ? [...def.accepts] : [],
    phases: Array.isArray(def.phases) ? [...def.phases] : [],
    artifacts: Array.isArray(def.artifacts) ? [...def.artifacts] : [],
    skill,
    execution: {
      ...def.execution,
      embedding: def.execution.embedding ?? 'never',
      provider_spend: providerSpend,
      lanes: [...def.execution.lanes],
    },
  };
}
