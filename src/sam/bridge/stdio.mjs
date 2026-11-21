#!/usr/bin/env node
/**
 * Restricted local SAM bridge for other-language clients.
 *
 * An operation opts in through its validated interop.stdio contract. The
 * shared SAM OS remains the single handler registry; no operation-name
 * allowlist or second capability catalog is maintained here.
 *
 * This transport has no host identity, remote credentials, terminal access,
 * or write permission. Those operations require an authorized host API.
 */
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { AgentSamClient } from '../client.js';
import { createSamOS } from '../os.js';
import { stdioMode, assertLocalDecisionInput } from './policy.mjs';

const sam = new AgentSamClient({ os: createSamOS(), cwd: process.cwd(), autoSeed: false });
const modeFor = id => stdioMode(typeof id === 'string' ? sam.os.get(id) : null);

function insideRoot(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('sam_bridge_invalid_input');
  const root = realpathSync(process.cwd());
  const target = realpathSync(path.resolve(root, input.root || input.cwd || root));
  if (target !== root && !target.startsWith(root + path.sep))
    throw new Error('sam_bridge_path_outside_workspace');
  return { ...input, root: target };
}

async function handle(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request))
    throw new Error('sam_bridge_invalid_request');
  switch (request.method) {
    case 'discover': {
      const query = request.query || {};
      const full = await sam.discover({ ...query, limit: Number.MAX_SAFE_INTEGER });
      const permitted = full.operations.filter(operation => modeFor(operation.id));
      const limit = Number.isInteger(query.limit) ? Math.min(1000, Math.max(0, query.limit)) : 20;
      return { ok: true, count: Math.min(limit, permitted.length), operations: permitted.slice(0, limit) };
    }
    case 'describe':
      if (!modeFor(request.id)) throw new Error('sam_bridge_operation_not_allowed');
      return sam.describe(request.id);
    case 'status':
      if (!modeFor(request.id))
        return {
          schema: 'sam.capability.readiness.v1', id: request.id, declared: false,
          registered: false, bound: false, authorized: false, available: false,
          verified: false, ready: false, readiness: 'unavailable',
          reason: 'sam_bridge_operation_not_allowed',
        };
      return sam.status(request.id);
    case 'decide':
      return sam.decide(assertLocalDecisionInput(request.input || {}));
    case 'invoke': {
      const mode = modeFor(request.id);
      if (!mode) throw new Error('sam_bridge_operation_not_allowed');
      const input = request.input || {};
      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new Error('sam_bridge_invalid_input');
      return sam.invoke(request.id,
        mode === 'workspace_read' ? insideRoot(input)
          : mode === 'decision' ? assertLocalDecisionInput(input)
            : input);
    }
    default:
      throw new Error('sam_bridge_unknown_method');
  }
}
try {
  const input = readFileSync(0, 'utf8');
  if (Buffer.byteLength(input) > 1024 * 1024)
    throw new Error('sam_bridge_request_too_large');
  const result = await handle(JSON.parse(input));
  process.stdout.write(JSON.stringify({ ok: true, result }) + '\n');
} catch (error) {
  process.stdout.write(JSON.stringify({
    ok: false, error: { code: error.code || error.message || 'sam_bridge_error' },
  }) + '\n');
  process.exitCode = 1;
}
