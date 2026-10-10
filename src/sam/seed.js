/**
 * Compatibility layer for consumers importing the original SAM seed.
 * Actual bootstrap is delegated to ensureOS() and versioned operation packs.
 */
import { CORE_OPERATIONS } from './packs/core.js';
import { ensureOS } from './os.js';

export const SEED_OPERATIONS = CORE_OPERATIONS;
export function ensureSeedOperations() {
  ensureOS();
  return CORE_OPERATIONS;
}
export function resetSeedFlagForTests() {
  // No seed flag remains. ensureOS checks the actual registry each time,
  // including after clearSamRegistryForTests().
}
