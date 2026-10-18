/**
 * SAM — Systematic Autonomous Machinery
 *
 * agentsam = machine-level API / CLI
 * AgentSam = AI wrapper over SAM; AgentSamClient is the developer facade
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
export { ensureOS, getOSStatus, registerOSPack, createSamOS } from './os.js';
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
export {
  evaluate as evaluateDecisions,
  evaluateDependentStages,
  buildDecisionState,
  defineChoose,
  defineScore,
  defineCheck,
  applyDecisionPolicy,
  composeUtility,
  createDecisionReceipt,
  appendOutcome,
  attachAction,
  QUESTION_REGISTRY,
  getRegisteredQuestion,
  brierScore,
  logLoss,
  expectedCalibrationError,
  hierarchicalChoose,
  beamRetain,
  createSemanticEvaluator,
  DECISION_STATE_SCHEMA,
  DECISION_RECEIPT_SCHEMA,
} from './decision/index.js';
export {
  createActivityEvent,
  createActivityStore,
  activityFromDecision,
  ACTIVITY_SCHEMA,
  ACTIVITY_PHASES,
  ACTIVITY_EVENTS,
  DECISION_ACTIVITY_LABELS,
} from './activity/index.js';

export { createSamCapabilityAdapter } from './model-adapter.js';
export { createLocalMediaStore } from './adapters/local-media-store.js';
export { createObjectMediaStore } from './adapters/object-media-store.js';
export { inspectMediaEnvironment, readMediaStorageSelection, MEDIA_SELECTION_PATH } from './media/environment.js';

export { createCmsOperations, validateCmsSchema } from './packs/cms/machine.js';
export { CMS_OPERATION_CONTRACTS, CMS_CONTRACTS_BY_NAME } from './packs/cms/contracts.js';
export { CMS_COMPATIBILITY_ALIASES } from './packs/cms/aliases.js';

export { createAuthoringOperations } from './packs/authoring/index.js';
export { createEvidenceOperations } from './packs/evidence/index.js';
export { createLocalEvidenceStore } from './packs/evidence/store.js';
export { createFfprobeMedia } from './packs/evidence/media.js';
export { createPlaywrightSource } from './packs/evidence/driver-playwright.js';
export { createBlenderSource, createLocalBlenderExec } from './packs/evidence/driver-blender.js';
export { createDeriver } from './packs/evidence/derive.js';
export { createCoproExporter } from './packs/evidence/exporter-copro.js';
export { createGitFacts } from './packs/evidence/facts.js';
export { createLocalEvidenceHost } from './packs/evidence/host-local.js';
export { EVIDENCE_VIEWPORTS, JOURNEY_VIEWPORTS, RESPONSIVE_VIEWPORTS } from './packs/evidence/viewports.js';

export { createCadOperations, CAD_DONOR_OPERATOR_MAPPINGS } from './packs/cad/index.js';

export { createCadHttpPorts } from "./packs/cad/http-ports.js";
export { createCadModelTools } from "./packs/cad/model-tools.js";
export { CAD_RUN_MODES, executeCadRunMode } from "./packs/cad/modes.js";
