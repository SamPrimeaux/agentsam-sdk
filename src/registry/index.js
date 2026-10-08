/**
 * AgentSam product inventory. A command, installed package, and agent-callable
 * capability are different entities; this join does not make missing handlers
 * runnable or grant permissions. This is a pure query layer over existing owners.
 */
import { CLI_COMMAND_CATALOG } from '../cli/command-catalog.js';
import { getCapabilityManifest } from '../capabilities/manifest.js';
import generated from './generated/inventory.json' with { type: 'json' };

const stable = (value) => String(value || '').trim().toLowerCase();
const ordered = (items) => [...items].sort((a,b) => a.id.localeCompare(b.id));

export function createRegistry({
  commands = CLI_COMMAND_CATALOG,
  manifest = getCapabilityManifest(),
  packages = generated.packages,
  capabilityAdapter = null,
} = {}) {
  const commandRows = ordered(commands.map((row) => ({
    ...row,
    type: 'command',
    usage: row.usage?.length ? row.usage : ['agentsam ' + row.id],
  })));
  const packageRows = ordered(packages.map((row) => ({
    ...row, type: 'package',
    readiness: 'unverified',
  })));
  const capabilityRows = ordered(Object.values(manifest.capabilities || {}).map((row) => {
    const bound = capabilityAdapter?.canInvoke?.(row.id) === true;
    const callable = !!capabilityAdapter && bound;
    return {
      ...row, type: 'capability',
      handler_bound: callable,
      agent_callable: callable,
      readiness: capabilityAdapter ? (bound ? 'available' : 'unavailable') : 'unverified',
      unavailable_reason: capabilityAdapter && !bound ? 'capability_handler_unavailable' : null,
    };
  }));

  function search(query = '', { type = null, limit = 30 } = {}) {
    const all = [...commandRows, ...capabilityRows, ...packageRows];
    const words = stable(query).split(/\s+/).filter(Boolean);
    return all.filter((row) => (!type || row.type === type) &&
      words.every((word) => [row.id,row.name,row.summary,row.description,row.purpose,
        ...(row.aliases || []),...(row.usage || []),...(row.use_when || [])]
        .filter(Boolean).some((v) => stable(v).includes(word))))
      .sort((a,b) => Number(stable(b.id) === stable(query)) - Number(stable(a.id) === stable(query)))
      .slice(0, Math.max(0, Math.min(500, limit)));
  }

  function describe(id, { type = null } = {}) {
    const key = stable(id).replace(/^@inneranimalmedia\//, '');
    return [...commandRows, ...capabilityRows, ...packageRows]
      .find((row) => (!type || row.type === type) && (stable(row.id) === key ||
        stable(row.name) === stable(id) || (row.aliases || []).some((v) => stable(v) === key))) || null;
  }

  function status(id) {
    const row = describe(id, { type: 'capability' });
    if (!row) return { id, declared: false, agent_callable: false, readiness: 'missing', reason: 'not_declared' };
    return {
      id: row.id, declared: true, agent_callable: row.agent_callable,
      readiness: row.readiness, reason: row.unavailable_reason,
      risk: ['none','network-read'].includes(row.side_effects) ? 'read' : 'write',
    };
  }

  async function invoke(id, input = {}, { authorize } = {}) {
    const row = describe(id, { type: 'capability' });
    if (!row) return { ok: false, error: 'capability_not_declared', capability_id: id };
    if (!row.agent_callable) return {
      ok: false, error: 'capability_handler_unavailable', capability_id: row.id,
    };
    const risk = ['none','network-read'].includes(row.side_effects) ? 'read' : 'write';
    // This is not a new privilege path. All execution requires an explicit host
    // authorization callback, even for reads, and should supply scoped cwd.
    if (typeof authorize !== 'function' || await authorize({ capability: row, input, risk }) !== true) {
      return { ok: false, error: 'capability_not_authorized', capability_id: row.id };
    }
    const execution = await capabilityAdapter.invoke(row.id, input);
    return { ok: true, ...execution, verified: false };
  }

  return Object.freeze({
    commands: () => structuredClone(commandRows),
    capabilities: () => structuredClone(capabilityRows),
    packages: () => structuredClone(packageRows),
    search, describe, status, invoke,
  });
}
