import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCapability, listCapabilities } from '../capabilities/manifest.js';
import { repositorySnapshot } from '../capabilities/repository-snapshot.js';
import { runWranglerNative, summarizeCloudflareCpuProfileFile, runCloudflareCpuAudit } from '../cloudflare/index.js';
import { runRepositoryAudit } from './repository-audit.js';

const PACKAGE_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

function loadSchema(value) {
  if (!value) return { type: 'object', properties: {} };
  if (typeof value === 'object' && !Array.isArray(value)) return structuredClone(value);
  const filename = path.resolve(PACKAGE_ROOT, String(value));
  if (filename !== PACKAGE_ROOT && !filename.startsWith(`${PACKAGE_ROOT}${path.sep}`)) throw new Error(`capability_schema_outside_package:${value}`);
  try { return JSON.parse(fs.readFileSync(filename, 'utf8')); }
  catch (error) { throw new Error(`capability_schema_unreadable:${value}:${error?.message || error}`); }
}

export function createCapabilityAdapter({ handlers = {}, reasoner } = {}) {
  const executable = new Map([
    ['repository.snapshot', (input) => repositorySnapshot(input)],
    ['cloudflare.wrangler.native', (input = {}) => runWranglerNative(input.command, input)],
    ['cloudflare.cpu.profile', (input = {}) => summarizeCloudflareCpuProfileFile(input)],
    ...Object.entries(handlers),
  ]);
  if (typeof reasoner === 'function') {
    executable.set('repository.audit', (input = {}) => runRepositoryAudit({ ...input, reasoner }));
    executable.set('cloudflare.cpu.audit', (input = {}) => runCloudflareCpuAudit({ ...input, reasoner }));
  }

  function describe(id) {
    const capability = getCapability(id);
    if (!capability) throw new Error(`unknown_capability:${id}`);
    return capability;
  }

  return Object.freeze({
    list(options = {}) { return listCapabilities(options); },
    describe,
    toolDescriptors({ domain, kind, includeUnavailable = false } = {}) {
      return listCapabilities({ domain, kind }).filter((row) => includeUnavailable || executable.has(row.id)).map((row) => ({
        name: row.id,
        description: row.description,
        category: row.domain,
        risk: row.side_effects === 'none' || row.side_effects === 'network-read' ? 'read' : 'write',
        input_schema: loadSchema(row.input_schema),
        side_effects: row.side_effects,
        deterministic: row.deterministic,
        model_required: row.model_required,
      }));
    },
    canInvoke(id) { return executable.has(String(id || '').trim()); },
    async invoke(id, input = {}) {
      const capability = describe(id);
      const handler = executable.get(capability.id);
      if (!handler) throw new Error(`capability_handler_unavailable:${capability.id}`);
      const value = await handler(input);
      return { capability_id: capability.id, capability_version: capability.version, result: value };
    },
  });
}
