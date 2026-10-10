import { repositoryInspect } from '../operations/repository-inspect.js';
import { brandScanOp } from '../operations/brand-scan.js';
import { securityScanOp } from '../operations/security-scan.js';
import { terminalExecOp } from '../operations/terminal-exec.js';
import { cadBlenderInspectOp } from '../operations/cad-blender-inspect.js';
import { codebaseindexIngestOp } from '../operations/codebaseindex-ingest.js';
import { planningAstarOp } from '../operations/planning-astar.js';
import { planningGoapOp } from '../operations/planning-goap.js';
import { decisionEvaluateOp } from '../operations/decision-evaluate.js';
import { packageAuditOp } from '../operations/package-audit.js';

export const CORE_OPERATIONS = [
  repositoryInspect,
  brandScanOp,
  securityScanOp,
  terminalExecOp,
  cadBlenderInspectOp,
  codebaseindexIngestOp,
  planningAstarOp,
  planningGoapOp,
  decisionEvaluateOp,
  packageAuditOp,
];
