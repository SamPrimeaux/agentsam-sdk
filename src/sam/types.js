/**
 * SAM — Systems Automation Machinery
 * Kernel seed: operation definition, registry, invoke/describe/discover.
 * @see docs/architecture/SAM_KERNEL.md
 */

export const SAM_RESULT_SCHEMA = 'agentsam.result.v1';
export const SAM_EXPANSION = 'Systems Automation Machinery';

/** @typedef {'local'|'remote'|'sandbox'|'platform'} SamLane */
/** @typedef {'never'|'optional'|'required'} SamModelPolicy */
/** @typedef {'none'|'optional'|'required'} SamNetworkPolicy */
/** @typedef {'none'|'local_write'|'remote_read'|'remote_write'|'deploy'|'billable'} SamSideEffects */
/** @typedef {'read_only'|'write'|'privileged'} SamRisk */

/**
 * @typedef {object} SamExecutionMeta
 * @property {SamLane[]} lanes
 * @property {SamModelPolicy} model
 * @property {SamNetworkPolicy} network
 * @property {SamSideEffects} sideEffects
 */

/**
 * @typedef {object} SamOperationDef
 * @property {string} id
 * @property {number} version
 * @property {string} module
 * @property {string} action
 * @property {string} summary
 * @property {string} [description]
 * @property {SamExecutionMeta} execution
 * @property {{ account?: boolean, provider?: string[] }} [auth]
 * @property {SamRisk} risk
 * @property {string} [input_schema]
 * @property {string} [output_schema]
 * @property {string[]} [capabilities]
 * @property {{ command?: string[][] }} [cli]
 * @property {{ section?: string, examples?: string[] }} [docs]
 * @property {'stable'|'experimental'|'stub'|'deprecated'} [status]
 * @property {(input: unknown, ctx: SamOperationContext) => Promise<unknown>|unknown} handler
 */

/**
 * @typedef {object} SamOperationContext
 * @property {AbortSignal} [signal]
 * @property {Record<string, unknown>} [execution]
 * @property {string} [cwd]
 * @property {Record<string, string|undefined>} [env]
 */

/**
 * @typedef {object} SamReceipt
 * @property {string} id
 * @property {string} operation
 * @property {string} [module]
 * @property {string} started_at
 * @property {string} completed_at
 * @property {{ lane: SamLane, deterministic: boolean, model_used: boolean }} execution
 * @property {string[]} [side_effects]
 * @property {string|null} [input_hash]
 * @property {string|null} [output_hash]
 * @property {'completed'|'failed'|'cancelled'} status
 */

/**
 * @typedef {object} SamResult
 * @property {'agentsam.result.v1'} schema
 * @property {string} operation
 * @property {boolean} ok
 * @property {unknown} data
 * @property {SamReceipt} receipt
 * @property {unknown[]} [evidence]
 * @property {unknown[]} [artifacts]
 * @property {{ provider_calls: number, input_tokens?: number, output_tokens?: number, cost_usd?: number }} [usage]
 * @property {unknown[]} [warnings]
 * @property {unknown[]} [diagnostics]
 * @property {unknown} [error]
 */
