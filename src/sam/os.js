/**
 * SAM OS bootstrap. Local packaged operations never require D1/network calls.
 * Hosts may register independently installed operation packs; a D1 tool record
 * alone does not bind a handler or grant an execution permission.
 */
import { CORE_OPERATIONS } from './packs/core.js';
import { getSamOperation, registerSamOperation, listSamOperations } from './registry.js';
import { createGeneratedSamOperations } from './operation-packs/generated-v2/operation-pack.js';
import { defineSamOperation } from './define.js';
import { createCmsOperations } from './packs/cms/machine.js';
import { createAuthoringOperations } from './packs/authoring/index.js';
import { createCadOperations } from './packs/cad/index.js';

const packs = new Map();

export function registerOSPack({ id, install }) {
  if (typeof id !== 'string' || !id.trim() || typeof install !== 'function') {
    throw new TypeError('sam_os_pack_requires_id_and_sync_install');
  }
  if (packs.has(id)) throw new Error('sam_os_pack_already_registered:' + id);
  packs.set(id, { id, install, result: null });
  return id;
}

export function ensureOS() {
  for (const op of CORE_OPERATIONS) {
    if (!getSamOperation(op.id)) registerSamOperation(op);
  }
  for (const pack of packs.values()) {
    if (pack.result) continue;
    const result = pack.install();
    if (result?.then) throw new TypeError('sam_os_pack_install_must_be_synchronous:' + pack.id);
    pack.result = result ?? { registered: [], unavailable: [] };
  }
  return getOSStatus();
}

export function getOSStatus() {
  const operations = listSamOperations();
  return {
    schema: 'agentsam.os.status.v1',
    available: operations.map(op => op.id),
    core_count: CORE_OPERATIONS.filter(op => operations.some(item => item.id === op.id)).length,
    pack_status: [...packs.values()].map(({ id, result }) => ({
      id, installed: result !== null,
      registered: result?.registered || [],
      unavailable: result?.unavailable || [],
    })),
  };
}


/**
 * Isolated SAM OS for an SDK installation/tenant.
 * Unlike the legacy global registry, no state is shared with other OS instances.
 * The host must inject a real resource-scoped store, identity and authorization.
 */
export function createSamOS({ core = true, generated = null, cms = null, authoring = null, cad = null } = {}) {
  const registry = new Map();
  const unavailable = [];
  const aliases = new Map();
  // Compatibility aliases resolve to their canonical handler without creating
  // duplicate model tools or relaxing the canonical execution authorization.
  const get = (id) => registry.get(id) || registry.get(aliases.get(id)) || null;
  const register = (def) => {
    if (registry.has(def.id) || aliases.has(def.id)) throw new Error('sam_os_duplicate_operation:' + def.id);
    registry.set(def.id, def);
    return def;
  };
  if (core) for (const op of CORE_OPERATIONS) register(op);
  if (cms) for (const op of createCmsOperations(cms)) register(op);
  if (authoring) for (const op of createAuthoringOperations(authoring)) register(op);
  if (cad) for (const op of createCadOperations(cad)) register(op);
  if (generated) {
    const result = createGeneratedSamOperations({
      defineSamOperation, getSamOperation: get,
      registerSamOperation: register,
      ...generated,
    });
    unavailable.push(...result.unavailable);
    for (const alias of result.aliases || []) {
      if (registry.has(alias.name) || aliases.has(alias.name)) {
        throw new Error('sam_os_duplicate_operation:' + alias.name);
      }
      aliases.set(alias.name, alias.aliasFor);
    }
  }
  const os = {
    get,
    list: () => [...registry.values()].sort((a,b)=>a.id.localeCompare(b.id)),
    status: () => ({
      schema:'agentsam.os.status.v1',
      core_count: CORE_OPERATIONS.filter(op => registry.has(op.id)).length,
      available: [...registry.keys()].sort(),
      generated_unavailable: [...unavailable],
      generated_aliases: [...aliases].map(([name, aliasFor]) => ({
        name, aliasFor, bound: registry.has(aliasFor),
      })),
    }),
    // Explicitly installed adapters may register additional real SAM operations.
    install: (defs) => {
      // Validate the entire pack before modifying this instance. A duplicate ID
      // inside the batch must not leave a partially installed capability set.
      const pending = [...defs].map(def => defineSamOperation(def));
      const seen = new Set(registry.keys());
      for (const def of pending) {
        if (seen.has(def.id)) throw new Error('sam_os_duplicate_operation:' + def.id);
        seen.add(def.id);
      }
      for (const def of pending) registry.set(def.id, def);
      return os.status();
    },
  };
  return Object.freeze(os);
}
