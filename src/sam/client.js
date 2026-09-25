import { getSamOperation, listSamOperations, toSamOperationCard } from './registry.js';
import { buildSamResult } from './result.js';
import { ensureSeedOperations } from './seed.js';

/**
 * Resolve root/cwd from common input shapes.
 * @param {unknown} input
 */
function resolveRoot(input) {
  if (input == null) return process.cwd();
  if (typeof input === 'string') return input;
  if (typeof input === 'object') {
    const o = /** @type {Record<string, unknown>} */ (input);
    if (typeof o.root === 'string') return o.root;
    if (typeof o.cwd === 'string') return o.cwd;
    if (typeof o.projectRoot === 'string') return o.projectRoot;
  }
  return process.cwd();
}

/**
 * AgentSamClient — public facade over Systems Automation Machinery (SAM).
 *
 * `sam` is the conventional variable name for this client. It is machinery,
 * not a human identity.
 *
 * @example
 * import { AgentSamClient } from '@inneranimalmedia/agentsam-sdk';
 * const sam = new AgentSamClient();
 * const result = await sam.invoke('repository.inspect', { root: '.' });
 */
export class AgentSamClient {
  /**
   * @param {object} [options]
   * @param {string} [options.apiKey] Explicit platform credential (AGENTSAM_API_KEY). Local ops do not require it.
   * @param {string} [options.cwd]
   * @param {Record<string, string|undefined>} [options.env]
   * @param {boolean} [options.autoSeed=true]
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey ?? options.env?.AGENTSAM_API_KEY ?? process.env.AGENTSAM_API_KEY ?? null;
    this.cwd = options.cwd ?? process.cwd();
    this.env = options.env ?? process.env;
    if (options.autoSeed !== false) {
      ensureSeedOperations();
    }

    /** Domain projections → sam.invoke(canonicalId, …) */
    this.repository = {
      inspect: (input = {}, opts) => this.invoke('repository.inspect', normalizeRootInput(input), opts),
    };
    this.brand = {
      scan: (input = {}, opts) => this.invoke('brand.scan', normalizeRootInput(input), opts),
    };
    this.security = {
      scan: (input = {}, opts) => this.invoke('security.scan', normalizeRootInput(input), opts),
    };
    this.terminal = {
      exec: (input = {}, opts) => this.invoke('terminal.exec', input, opts),
    };
    this.cad = {
      blender: {
        inspect: (input = {}, opts) => this.invoke('cad.blender.inspect', input, opts),
      },
    };
  }

  /**
   * Universal SAM execution doorway.
   * @param {string} operationId
   * @param {unknown} [input]
   * @param {object} [options]
   * @param {AbortSignal} [options.signal]
   * @param {Record<string, unknown>} [options.execution]
   * @returns {Promise<import('./types.js').SamResult>}
   */
  async invoke(operationId, input = {}, options = {}) {
    ensureSeedOperations();
    const def = getSamOperation(operationId);
    if (!def) {
      return buildSamResult({
        operation: operationId,
        ok: false,
        data: null,
        startedAt: new Date().toISOString(),
        error: { code: 'sam_operation_not_found', message: `Unknown operation: ${operationId}` },
        status: 'failed',
      });
    }

    const startedAt = new Date().toISOString();
    const deterministic = def.execution.model === 'never';
    const sideEffects = def.execution.sideEffects === 'none' ? [] : [def.execution.sideEffects];
    /** @type {import('./types.js').SamOperationContext} */
    const ctx = {
      signal: options.signal,
      execution: options.execution,
      cwd: this.cwd,
      env: this.env,
    };

    try {
      const data = await def.handler(input, ctx);
      const warnings = Array.isArray(/** @type {any} */ (data)?.warnings)
        ? /** @type {any} */ (data).warnings
        : undefined;
      return buildSamResult({
        operation: def.id,
        module: def.module,
        ok: true,
        data,
        startedAt,
        lane: 'local',
        deterministic,
        modelUsed: false,
        sideEffects,
        input,
        warnings,
      });
    } catch (err) {
      return buildSamResult({
        operation: def.id,
        module: def.module,
        ok: false,
        data: null,
        startedAt,
        lane: 'local',
        deterministic,
        modelUsed: false,
        sideEffects,
        input,
        error: {
          code: err?.code || 'sam_operation_failed',
          message: err?.message || String(err),
        },
        status: options.signal?.aborted ? 'cancelled' : 'failed',
      });
    }
  }

  /**
   * Inspect operation metadata without executing.
   * @param {string} operationId
   * @param {{ schema?: boolean }} [options]
   */
  async describe(operationId, options = {}) {
    ensureSeedOperations();
    const def = getSamOperation(operationId);
    if (!def) {
      return {
        ok: false,
        error: { code: 'sam_operation_not_found', message: `Unknown operation: ${operationId}` },
      };
    }
    const info = {
      ok: true,
      id: def.id,
      version: def.version,
      module: def.module,
      action: def.action,
      summary: def.summary,
      description: def.description,
      execution: { ...def.execution, lanes: [...def.execution.lanes] },
      auth: def.auth || {},
      risk: def.risk,
      capabilities: def.capabilities || [],
      cli: def.cli || {},
      docs: def.docs || {},
      status: def.status || 'stable',
      input_schema: def.input_schema || null,
      output_schema: def.output_schema || null,
    };
    if (options.schema) {
      info.schemas_requested = true;
    }
    return info;
  }

  /**
   * Compact operation cards matching a query (substring / token match).
   * @param {{ query?: string, module?: string, model?: string, limit?: number }} [query]
   */
  async discover(query = {}) {
    ensureSeedOperations();
    const q = String(query.query || '').trim().toLowerCase();
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    const limit = Number.isInteger(query.limit) ? query.limit : 20;
    let cards = listSamOperations().map(toSamOperationCard);

    if (query.module) {
      cards = cards.filter((c) => c.module === query.module);
    }
    if (query.model) {
      cards = cards.filter((c) => c.model === query.model);
    }
    if (tokens.length) {
      cards = cards
        .map((card) => {
          const hay = `${card.id} ${card.summary} ${card.module} ${card.action}`.toLowerCase();
          const score = tokens.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
          return { card, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id))
        .map((x) => x.card);
    }

    return {
      ok: true,
      count: Math.min(cards.length, limit),
      operations: cards.slice(0, limit),
    };
  }
}

/**
 * @param {unknown} input
 */
function normalizeRootInput(input) {
  if (typeof input === 'string') {
    return { root: input };
  }
  if (input && typeof input === 'object') {
    const o = /** @type {Record<string, unknown>} */ (input);
    const root = resolveRoot(input);
    return { ...o, root, cwd: o.cwd ?? root };
  }
  return { root: process.cwd(), cwd: process.cwd() };
}

/** Convenience factory matching docs examples. */
export function createAgentSamClient(options) {
  return new AgentSamClient(options);
}
