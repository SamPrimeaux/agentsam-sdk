/**
 * SAM — Systematic Autonomous Machinery
 * @see docs/architecture/SAM_KERNEL.md
 */

export const SAM_RESULT_SCHEMA = 'agentsam.result.v1';
export const SAM_EXPANSION = 'Systematic Autonomous Machinery';

/** @typedef {import('../../packages/agentsam-contracts/src/operations').AgentOperationLane} SamLane */
/** @typedef {import('../../packages/agentsam-contracts/src/operations').AgentOperationModelPolicy} SamModelPolicy */
/** @typedef {import('../../packages/agentsam-contracts/src/operations').AgentOperationNetworkPolicy} SamNetworkPolicy */
/** @typedef {import('../../packages/agentsam-contracts/src/operations').AgentOperationSideEffects} SamSideEffects */
/** @typedef {import('../../packages/agentsam-contracts/src/operations').AgentOperationRisk} SamRisk */
/** @typedef {import('../../packages/agentsam-contracts/src/operations').AgentOperationSpendPolicy} SamSpendPolicy */
/** @typedef {import('../../packages/agentsam-contracts/src/operations').AgentCapabilityReference} SamCapabilityRef */
/** @typedef {import('../../packages/agentsam-contracts/src/operations').AgentMcpProjection} SamMcpProjection */
/** @typedef {import('../../packages/agentsam-contracts/src/operations').AgentOperationExecution} SamExecutionMeta */
/** @typedef {import('../../packages/agentsam-contracts/src/operations').AgentOperationReceipt} SamReceipt */
/** @typedef {import('../../packages/agentsam-contracts/src/operations').AgentOperationResult} SamResult */

/**
 * Runtime-only context supplied by the SAM host. It is never serialized as an
 * operation contract; host paths and environment values stay out of portable metadata.
 * @typedef {object} SamOperationContext
 * @property {AbortSignal} [signal]
 * @property {Record<string, unknown>} [execution]
 * @property {string} [cwd]
 * @property {Record<string, string|undefined>} [env]
 * @property {{ mcp?: SamMcpProjection, capability_refs?: SamCapabilityRef[] }} [projection]
 */

/**
 * Runtime operation = shared portable contract + host-bound handler.
 * @typedef {import('../../packages/agentsam-contracts/src/operations').AgentOperationDefinition<unknown, unknown, SamOperationContext>} SamOperationDef
 */
