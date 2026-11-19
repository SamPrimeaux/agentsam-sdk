/**
 * SAM — Systematic Autonomous Machinery
 * @see docs/architecture/SAM_KERNEL.md
 */

export const SAM_RESULT_SCHEMA = 'agentsam.result.v1';
export const SAM_EXPANSION = 'Systematic Autonomous Machinery';

/** @typedef {import('@inneranimalmedia/agentsam-contracts').AgentOperationLane} SamLane */
/** @typedef {import('@inneranimalmedia/agentsam-contracts').AgentOperationModelPolicy} SamModelPolicy */
/** @typedef {import('@inneranimalmedia/agentsam-contracts').AgentOperationNetworkPolicy} SamNetworkPolicy */
/** @typedef {import('@inneranimalmedia/agentsam-contracts').AgentOperationSideEffects} SamSideEffects */
/** @typedef {import('@inneranimalmedia/agentsam-contracts').AgentOperationRisk} SamRisk */
/** @typedef {import('@inneranimalmedia/agentsam-contracts').AgentOperationSpendPolicy} SamSpendPolicy */
/** @typedef {import('@inneranimalmedia/agentsam-contracts').AgentCapabilityReference} SamCapabilityRef */
/** @typedef {import('@inneranimalmedia/agentsam-contracts').AgentMcpProjection} SamMcpProjection */
/** @typedef {import('@inneranimalmedia/agentsam-contracts').AgentOperationExecution} SamExecutionMeta */
/** @typedef {import('@inneranimalmedia/agentsam-contracts').AgentOperationReceipt} SamReceipt */
/** @typedef {import('@inneranimalmedia/agentsam-contracts').AgentOperationResult} SamResult */

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
 * @typedef {import('@inneranimalmedia/agentsam-contracts').AgentOperationDefinition<unknown, unknown, SamOperationContext>} SamOperationDef
 */
