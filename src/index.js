// @inneranimalmedia/agentsam-sdk — public API

import pkg from '../package.json' with { type: 'json' };

export { AgentSam } from './AgentSam.js';
export { routeIntent } from './lib/router.js';
export { searchToolCards, toToolCard, hydrateToolSchemas } from './tools/index.js';
export { getToolCatalog } from './lib/tools.js';
export { scaffoldProject } from './lib/scaffold.js';
export {
  DEFAULT_DEPLOY_EXCLUDES,
  captureDeployReceipt,
  finalizeDeployReceipt,
  showLatestDeployReceipt,
  captureCheckpoint,
  promoteCheckpoint,
} from './lib/deploy-receipt/index.js';
export {
  normalizeGitRemote,
  resolveGitContext,
  tryResolveGitContext,
} from '../packages/agentsam-repository/src/git-context.js';
export {
  resolveAgentSamBaseUrl,
  resolveBridgeKey,
  buildBridgeHeaders,
  createBridgeClient,
} from './lib/bridge-client.js';
export {
  SLASH_COMMANDS,
  SHELL_THEMES,
  SHELL_PHASES,
  listSlashCommands,
} from './lib/slash-commands.js';
export {
  CAPABILITY_MANIFEST_VERSION,
  getCapability,
  getCapabilityManifest,
  listCapabilities,
  repositorySnapshot,
} from './capabilities/index.js';
export { getPreset, listPresets, resolvePreset, getAddon, listAddons } from './presets/index.js';
export {
  COMPANY_REPOSITORY_GRAPH_SCHEMA_VERSION,
  REPOSITORY_STATUSES,
  REPOSITORY_CONTRACT_TYPES,
  REPOSITORY_CONTRACT_STATUSES,
  REPOSITORY_DEPENDENCY_TYPES,
  REPOSITORY_DEPENDENCY_CRITICALITIES,
  REPOSITORY_FAILURE_POLICIES,
  createRepositoryIdentity,
  createRepositoryContract,
  createRepositoryDependency,
} from './repository/contracts.js';
export {
  DEFAULT_CONTEXT_RATIOS,
  DEFAULT_RESULT_POLICY,
  createContextBudget,
  assessContextUsage,
  normalizeResultPolicy,
  resolveContext,
  resolveProjectContext,
  compactConsumedToolResult,
  rehydrateContextRef,
  loadProjectRules,
  compileAgentInstructions,
  AGENT_INSTRUCTION_PRECEDENCE,
} from './context/index.js';
export {
  assertRepositoryKnowledgeProvider,
  createRepositoryKnowledgeClient,
  describeRepositoryKnowledgeProvider,
} from './indexing/index.js';
export {
  MODEL_CATALOG_SCHEMA,
  MODEL_CATALOG,
  listModelCatalog,
  getModelRecord,
  calculateModelCost,
} from './models/index.js';
export {
  AGENT_EVENT_TYPES,
  RUNTIME_RECEIPT_SCHEMA_VERSION,
  createAgentEvent,
  createUsageSnapshot,
  createRunReceipt,
  createUsageReceipt,
  createApprovalReceipt,
  createTerminalJobReceipt,
} from './telemetry/index.js';
export {
  createOpenAIResponsesAdapter,
  extractOpenAIOutputText,
  extractOpenAIFunctionCalls,
} from './providers/index.js';
export {
  AgentSamDiagnosticError,
  classifyOpenAIError,
  createOpenAIHttpError,
  createProcessDiagnosticError,
  diagnosticFromError,
  redactDiagnosticValue,
  renderDiagnosticError,
} from './errors/index.js';
export {
  WRANGLER_NATIVE_COMMANDS,
  WRANGLER_OPERATION_FAMILIES,
  buildWranglerInvocation,
  listWranglerNativeCommands,
  parseWranglerErrorEvidence,
  runWranglerNative,
  summarizeCloudflareCpuProfile,
  summarizeCloudflareCpuProfileFile,
  buildCloudflareCpuAuditPacket,
  runCloudflareCpuAudit,
} from './cloudflare/index.js';
export {
  createCapabilityAdapter,
  buildAgentToolSurface,
  capabilityFunctionName,
  runResponsesAgent,
} from './agent/index.js';
export { listContextEvalFixtures, evaluateContextFixture } from './eval/index.js';

export {
  createIdentityClient,
  createIdentity,
  GoogleProvider,
  GithubProvider,
  IamProvider,
  GcpProvider,
  EmailProvider,
  getIdentityProvider,
  listIdentityProviders,
  AuthError,
  AUTH_COOKIE_NAME,
  buildSessionKvPayload,
  isInboundOAuthSuccess,
  finalizeInboundOAuth,
} from '../packages/identity/src/index.js';

export const version = pkg.version;
export const name = pkg.name;
