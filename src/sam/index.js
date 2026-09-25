/**
 * SAM — Systematic Autonomous Machinery
 *
 * AgentSam = product / SDK / CLI
 * SAM = execution architecture underneath AgentSam
 * sam = conventional AgentSamClient variable (machinery, not a person)
 *
 * @see docs/architecture/SAM_KERNEL.md
 */

export { SAM_RESULT_SCHEMA, SAM_EXPANSION } from './types.js';
export { defineSamOperation } from './define.js';
export {
  registerSamOperation,
  getSamOperation,
  listSamOperations,
  toSamOperationCard,
  clearSamRegistryForTests,
} from './registry.js';
export { buildSamResult, hashJson } from './result.js';
export { AgentSamClient, createAgentSamClient } from './client.js';
export { ensureSeedOperations, SEED_OPERATIONS, resetSeedFlagForTests } from './seed.js';
export {
  planAStar,
  planGoap,
  ASTAR_ENGINE,
  GOAP_ENGINE,
  stableStateKey,
  cloneState,
  applyEffects,
  goalSatisfied,
  preconditionsMet,
} from './planning/index.js';
