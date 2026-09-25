import { registerSamOperation, getSamOperation } from './registry.js';
import { repositoryInspect } from './operations/repository-inspect.js';
import { brandScanOp } from './operations/brand-scan.js';
import { securityScanOp } from './operations/security-scan.js';
import { terminalExecOp } from './operations/terminal-exec.js';
import { cadBlenderInspectOp } from './operations/cad-blender-inspect.js';
import { codebaseindexIngestOp } from './operations/codebaseindex-ingest.js';
import { planningAstarOp } from './operations/planning-astar.js';
import { planningGoapOp } from './operations/planning-goap.js';
import { decisionEvaluateOp } from './operations/decision-evaluate.js';

export const SEED_OPERATIONS = [
  repositoryInspect,
  brandScanOp,
  securityScanOp,
  terminalExecOp,
  cadBlenderInspectOp,
  codebaseindexIngestOp,
  planningAstarOp,
  planningGoapOp,
  decisionEvaluateOp,
];

let seeded = false;

/**
 * Register seed SAM operations (idempotent).
 * Handlers reuse existing capability implementations — no duplicate machinery.
 */
export function ensureSeedOperations() {
  if (seeded) return SEED_OPERATIONS;
  for (const op of SEED_OPERATIONS) {
    if (!getSamOperation(op.id)) {
      registerSamOperation(op);
    }
  }
  seeded = true;
  return SEED_OPERATIONS;
}

/** @internal */
export function resetSeedFlagForTests() {
  seeded = false;
}
