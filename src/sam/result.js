import { createHash, randomUUID } from 'node:crypto';
import { SAM_RESULT_SCHEMA } from './types.js';

/**
 * @param {unknown} value
 */
export function hashJson(value) {
  try {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  } catch {
    return null;
  }
}

/**
 * @param {object} opts
 * @param {string} opts.operation
 * @param {string} [opts.module]
 * @param {boolean} opts.ok
 * @param {unknown} opts.data
 * @param {string} opts.startedAt
 * @param {import('./types.js').SamLane} [opts.lane]
 * @param {boolean} [opts.deterministic]
 * @param {boolean} [opts.modelUsed]
 * @param {string[]} [opts.sideEffects]
 * @param {unknown} [opts.input]
 * @param {unknown} [opts.error]
 * @param {unknown[]} [opts.warnings]
 * @param {import('./types.js').SamReceipt['status']} [opts.status]
 * @returns {import('./types.js').SamResult}
 */
export function buildSamResult({
  operation,
  module,
  ok,
  data,
  startedAt,
  lane = 'local',
  deterministic = true,
  modelUsed = false,
  sideEffects = [],
  input,
  error,
  warnings,
  status,
}) {
  const completedAt = new Date().toISOString();
  /** @type {import('./types.js').SamResult} */
  const result = {
    schema: SAM_RESULT_SCHEMA,
    operation,
    ok,
    data: ok ? data : (data ?? null),
    receipt: {
      id: `samr_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
      operation,
      module,
      started_at: startedAt,
      completed_at: completedAt,
      execution: {
        lane,
        deterministic,
        model_used: modelUsed,
      },
      side_effects: sideEffects,
      input_hash: input === undefined ? null : hashJson(input),
      output_hash: ok ? hashJson(data) : null,
      status: status || (ok ? 'completed' : 'failed'),
    },
  };
  if (warnings?.length) result.warnings = warnings;
  if (error !== undefined) result.error = error;
  if (!modelUsed) {
    result.usage = { provider_calls: 0, cost_usd: 0 };
  }
  return result;
}
