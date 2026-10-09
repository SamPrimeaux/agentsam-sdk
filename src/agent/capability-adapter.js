import fs from 'node:fs';
import { CAD_PROJECT_TOOLS } from '../lib/cad/project-runtime.js';
import { localProjectRuntime } from '../lib/cad/project-cli.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCapability, listCapabilities } from '../capabilities/manifest.js';
import { repositorySnapshot } from '../capabilities/repository-snapshot.js';
import { runWranglerNative, summarizeCloudflareCpuProfileFile, runCloudflareCpuAudit } from '../cloudflare/index.js';
import { runRepositoryAudit } from './repository-audit.js';
import { terminalExec } from '../capabilities/terminal-exec.js';
import { runKnowledgeSearch } from '../commands/knowledge.js';
import { createRegistry } from '../registry/index.js';
import { workspaceRead, workspaceWrite } from '../capabilities/workspace-files.js';
import { machineInspect, machineAvailable } from '../capabilities/machine-inspect.js';
import { testRun } from '../capabilities/test-run.js';

const PACKAGE_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

function loadSchema(value) {
  if (!value) return { type: 'object', properties: {}, required: [], additionalProperties: false };
  if (typeof value === 'object' && !Array.isArray(value)) return structuredClone(value);
  const filename = path.resolve(PACKAGE_ROOT, String(value));
  if (filename !== PACKAGE_ROOT && !filename.startsWith(`${PACKAGE_ROOT}${path.sep}`)) throw new Error(`capability_schema_outside_package:${value}`);
  try { return JSON.parse(fs.readFileSync(filename, 'utf8')); }
  catch (error) { throw new Error(`capability_schema_unreadable:${value}:${error?.message || error}`); }
}

export function createCapabilityAdapter({ handlers = {}, reasoner, projectRoot = process.cwd(), authorizeCapability = null } = {}) {
  const cad = localProjectRuntime(projectRoot);
  const cadDescriptors = CAD_PROJECT_TOOLS.map(t=>({...t,id:t.name,version:'1.0.0',domain:'design',kind:'tool',status:'active',side_effects:['design_project_get','design_project_validate','design_model_inspect'].includes(t.name)?'none':'filesystem-write',deterministic:true,model_required:false}));
  const executable = new Map([
    ['repository.snapshot', (input) => repositorySnapshot(input)],
    ['workspace.read', (input = {}) => workspaceRead(input,projectRoot)],
    ['workspace.write', (input = {}) => workspaceWrite(input,projectRoot)],
    ['machine.inspect', (input = {}) => machineInspect(input,projectRoot)],
    ['test.run', (input = {}) => testRun(input,projectRoot)],
    ['terminal.exec', (input = {}) => terminalExec({ ...input, cwd: projectRoot }, { cwd: projectRoot })],
    ['cloudflare.wrangler.native', (input = {}) => runWranglerNative(input.command, input)],
    ['cloudflare.cpu.profile', (input = {}) => summarizeCloudflareCpuProfileFile(input)],
    ['knowledge.search', (input = {}) => runKnowledgeSearch(input)],
    ...cadDescriptors.map(t=>[t.id,(input)=>cad.execute(t.id,input)]),
    ...Object.entries(handlers),
  ]);
  // Registry exposes only the first, genuinely bound operation families.
  // invoke is not a shell escape hatch: it requires the host to authorize the
  // underlying operation with its actual side-effect profile.
  const allowAgentInvoke = new Set(['repository.snapshot','knowledge.search','workspace.read','workspace.write','machine.inspect','terminal.exec','test.run']);
  const registry = createRegistry({ capabilityAdapter: {
    canInvoke: (id) => executable.has(id) && (id !== 'machine.inspect' || machineAvailable()),
    invoke: async (id, input) => ({
      capability_id: id, capability_version: getCapability(id)?.version || 1,
      result: await executable.get(id)(input),
    }),
  } });
  executable.set('capability.search', (input = {}) =>
    registry.search(input.query || '', { type: input.type || null, limit: input.limit || 20 })
      .map(row => ({ id: row.id, type: row.type, description: row.description || row.summary || row.purpose,
        readiness: row.readiness || 'unverified', agent_callable: row.agent_callable === true })));
  executable.set('capability.describe', (input = {}) => registry.describe(input.id, { type: input.type || null }) ||
    { ok: false, error: 'registry_item_not_found', id: input.id });
  executable.set('capability.status', (input = {}) => registry.status(input.id));
  executable.set('capability.invoke', async (input = {}) => {
    if (!allowAgentInvoke.has(input.capability_id)) return {
      ok: false, error: 'capability_not_allowlisted', capability_id: input.capability_id,
    };
    return registry.invoke(input.capability_id, input.input || {}, {
      authorize: async (request) =>
        typeof authorizeCapability === 'function' &&
        await authorizeCapability(request) === true,
    });
  });

  if (typeof reasoner === 'function') {
    executable.set('repository.audit', (input = {}) => runRepositoryAudit({ ...input, reasoner }));
    executable.set('cloudflare.cpu.audit', (input = {}) => runCloudflareCpuAudit({ ...input, reasoner }));
  }

  function describe(id) {
    const capability = cadDescriptors.find(t=>t.id===id) || getCapability(id);
    if (!capability) throw new Error(`unknown_capability:${id}`);
    return capability;
  }

  return Object.freeze({
    list(options = {}) { return [...listCapabilities(options),...cadDescriptors.filter(t=>(!options.domain||options.domain==='design')&&(!options.kind||options.kind==='tool')&&(!options.status||options.status==='active'))]; },
    describe,
    toolDescriptors({ domain, kind, includeUnavailable = false } = {}) {
      return [...listCapabilities({ domain, kind, status: null }), ...cadDescriptors.filter(t=>(!domain||domain==='design')&&(!kind||kind==='tool'))].filter((row) => includeUnavailable || (executable.has(row.id) && (row.id !== 'machine.inspect' || machineAvailable()))).map((row) => ({
        name: row.id,
        description: row.description,
        category: row.domain,
        risk: row.side_effects === 'none' || row.side_effects === 'network-read' ? 'read' : 'write',
        input_schema: loadSchema(row.input_schema),
        strict: row.strict !== false,
        side_effects: row.side_effects,
        deterministic: row.deterministic,
        model_required: row.model_required,
      }));
    },
    canInvoke(id) { const name=String(id || '').trim(); return executable.has(name) && (name !== 'machine.inspect' || machineAvailable()); },
    async invoke(id, input = {}) {
      const capability = describe(id);
      const handler = executable.get(capability.id);
      if (!handler) throw new Error(`capability_handler_unavailable:${capability.id}`);
      const value = await handler(input);
      return { capability_id: capability.id, capability_version: capability.version, result: value };
    },
  });
}
