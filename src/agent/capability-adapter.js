import { getCapability, listCapabilities } from '../capabilities/manifest.js';
import { repositorySnapshot } from '../capabilities/repository-snapshot.js';
import { runRepositoryAudit } from './repository-audit.js';

export function createCapabilityAdapter({ handlers = {}, reasoner } = {}) {
  const executable = new Map([
    ['repository.snapshot', (input) => repositorySnapshot(input)],
    ...Object.entries(handlers),
  ]);
  if (typeof reasoner === 'function') {
    executable.set('repository.audit', (input = {}) => runRepositoryAudit({ ...input, reasoner }));
  }

  function describe(id) {
    const capability = getCapability(id);
    if (!capability) throw new Error(`unknown_capability:${id}`);
    return capability;
  }

  return Object.freeze({
    list(options = {}) {
      return listCapabilities(options);
    },
    describe,
    toolDescriptors({ domain, kind, includeUnavailable = false } = {}) {
      return listCapabilities({ domain, kind }).filter((row) => includeUnavailable || executable.has(row.id)).map((row) => ({
        name: row.id,
        description: row.description,
        input_schema: row.input_schema || null,
        side_effects: row.side_effects,
        deterministic: row.deterministic,
        model_required: row.model_required,
      }));
    },
    canInvoke(id) {
      return executable.has(String(id || '').trim());
    },
    async invoke(id, input = {}) {
      const capability = describe(id);
      const handler = executable.get(capability.id);
      if (!handler) throw new Error(`capability_handler_unavailable:${capability.id}`);
      const value = await handler(input);
      return {
        capability_id: capability.id,
        capability_version: capability.version,
        result: value,
      };
    },
  });
}
