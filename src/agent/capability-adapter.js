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
import { createRegistry } from '../registry/index.js';
import { workspaceRead, workspaceWrite } from '../capabilities/workspace-files.js';
import { machineInspect, machineAvailable } from '../capabilities/machine-inspect.js';
import { testRun } from '../capabilities/test-run.js';
import { PLAN_READ_OPERATIONS, PLAN_WRITE_OPERATIONS } from '../capabilities/plan-operation-ids.js';
import { inspectRemoteD1Schema } from '../knowledge/d1-schema.js';
import { repositoryIntelligence, repositoryCrawl, repositoryMine } from '../capabilities/repository-awareness.js';
import { discoverProjectCapabilities } from './project-discovery.js';
import { createMcpD1Bridge, MCP_D1_TOOLS } from '../capabilities/mcp-d1-bridge.js';
import { knowledgeIndex, knowledgeSearch, contextResolve, knowledgeStatus, knowledgeGenerationStatus } from '../capabilities/knowledge-operations.js';

const PACKAGE_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

function loadSchema(value) {
  if (!value) return { type: 'object', properties: {}, required: [], additionalProperties: false };
  if (typeof value === 'object' && !Array.isArray(value)) return structuredClone(value);
  const filename = path.resolve(PACKAGE_ROOT, String(value));
  if (filename !== PACKAGE_ROOT && !filename.startsWith(`${PACKAGE_ROOT}${path.sep}`)) throw new Error(`capability_schema_outside_package:${value}`);
  try { return JSON.parse(fs.readFileSync(filename, 'utf8')); }
  catch (error) { throw new Error(`capability_schema_unreadable:${value}:${error?.message || error}`); }
}

export function createCapabilityAdapter({ handlers = {}, reasoner, projectRoot = process.cwd(), authorizeCapability = null, samAdapter = null, mcpD1Bridge = null, allowedRepositories = [projectRoot] } = {}) {
  const d1Bridge = mcpD1Bridge || createMcpD1Bridge();
  const cad = localProjectRuntime(projectRoot);
  const cadDescriptors = CAD_PROJECT_TOOLS.map(t=>({...t,id:t.name,version:'1.0.0',domain:'design',kind:'tool',status:'active',side_effects:['design_project_get','design_project_validate','design_model_inspect'].includes(t.name)?'none':'filesystem-write',deterministic:true,model_required:false}));
  const executable = new Map([
    ...[...PLAN_READ_OPERATIONS, ...PLAN_WRITE_OPERATIONS].map(id =>
      [id, async (input = {}) => (await import('../capabilities/plan-operations.js')).invokePlanOperation(id, input, projectRoot)]),
    ['project.discover', () => discoverProjectCapabilities(projectRoot)],
    ['repository.snapshot', (input = {}) => {
      const days=Number(input.churnDays??input.churn_days??30);
      if(!Number.isInteger(days)||days<1||days>3650)throw new Error('repository_churn_days_invalid');
      return repositorySnapshot({cwd:projectRoot,churnDays:days});
    }],
    ['repository.intelligence', (input = {}) => repositoryIntelligence(input,projectRoot)],
    ['repository.crawl', (input = {}) => {
      const output=repositoryCrawl(input,projectRoot);
      if(!output.ok)return output;
      const {graph,provenance}=output;
      return {ok:true,repository:graph.repository,counts:graph.counts,
        resources_sample:graph.resources?.slice(0,12),edges_sample:graph.edges?.slice(0,12),
        errors:graph.errors?.slice(0,12),provenance,
        detail:'Full graph remains local; use knowledge search or targeted inspection.'};
    }],
    ['repository.mine', (input = {}) => repositoryMine(input,projectRoot,{allowedRoots:allowedRepositories})],
    ['workspace.read', (input = {}) => workspaceRead(input,projectRoot)],
    ['workspace.write', (input = {}) => workspaceWrite(input,projectRoot)],
    ['machine.inspect', (input = {}) => machineInspect(input,projectRoot)],
    ['test.run', (input = {}) => testRun(input,projectRoot)],
    ['cloudflare.d1.schema', (input = {}) => inspectRemoteD1Schema(projectRoot,{...input,remote:true})],
    ['terminal.exec', (input = {}) => terminalExec({ ...input, cwd: projectRoot }, { cwd: projectRoot })],
    ['cloudflare.wrangler.native', (input = {}) => runWranglerNative(input.command, input)],
    ['cloudflare.cpu.profile', (input = {}) => summarizeCloudflareCpuProfileFile(input)],
    ['knowledge.search', (input = {}) => knowledgeSearch(input,projectRoot)],
    ['knowledge.index', (input = {}) => knowledgeIndex(input,projectRoot)],
    ['context.resolve', (input = {}) => contextResolve(input)],
    ...cadDescriptors.map(t=>[t.id,(input)=>cad.execute(t.id,input)]),
    ...Object.entries(handlers),
  ]);
  // Registry exposes only the first, genuinely bound operation families.
  // invoke is not a shell escape hatch: it requires the host to authorize the
  // underlying operation with its actual side-effect profile.
  const allowAgentInvoke = new Set([
    ...PLAN_READ_OPERATIONS, ...PLAN_WRITE_OPERATIONS,
    'project.discover',
    'repository.snapshot','repository.intelligence','repository.crawl','repository.mine',
    'knowledge.index','knowledge.search','context.resolve',
    'workspace.read','workspace.write','machine.inspect','terminal.exec','test.run',
    'cloudflare.d1.schema',
  ]);
  const registry = createRegistry({ capabilityAdapter: {
    canInvoke: (id) => executable.has(id) && (!['machine.inspect','repository.crawl','repository.mine'].includes(id) || machineAvailable()),
    availability: (id) => {
      if(id==='cloudflare.d1.schema')return {readiness:'unverified',reason:'remote_credentials_not_probed',next:'agentsam db sources'};
      if (['machine.inspect','repository.crawl','repository.mine'].includes(id) && !machineAvailable())
        return {readiness:'unavailable',reason:'machine_runtime_not_installed',next:'agentsam machine install'};
      if(id==='knowledge.index'){
        const state=knowledgeStatus(projectRoot);
        if(['knowledge_not_configured','external_knowledge_host_adapter_required'].includes(state.reason))
          return {readiness:'needs_setup',reason:state.reason,next:state.next||null};
      }
      if(id==='knowledge.search'){
        const state=knowledgeStatus(projectRoot);
        if(!state.available)return {readiness:'needs_setup',reason:state.reason,next:state.next||null};
        return {readiness:'unverified',reason:'active_generation_not_checked',
          next:'capability.status knowledge.search'};
      }
      return null;
    },
    invoke: async (id, input) => ({
      capability_id: id, capability_version: getCapability(id)?.version || 1,
      result: await executable.get(id)(input),
    }),
  } });
  // One registry drives both capability and legacy tool discovery.
  const searchRegistry = (input = {}) => registry.search(input.query || '', {
    type: input.type || 'capability', limit: Number(input.limit || 20),
  }).map(row => ({ id: row.id, type: row.type,
    description: row.description || row.summary || row.purpose,
    readiness: row.readiness || 'unverified', agent_callable: row.agent_callable === true,
    reason: row.unavailable_reason || null,
    next: row.next || null,
  }));
  executable.set('capability.search', searchRegistry);
  executable.set('tools.search', searchRegistry);
  executable.set('capability.describe', (input = {}) => registry.describe(input.id, { type: input.type || null }) ||
    { ok: false, error: 'registry_item_not_found', id: input.id });
  executable.set('capability.status', async (input = {}) => {
    const state=registry.status(input.id);
    if(input.id==='knowledge.index'){
      const base=knowledgeStatus(projectRoot);
      if(['knowledge_not_configured','external_knowledge_host_adapter_required'].includes(base.reason))
        return {...state,readiness:'needs_setup',reason:base.reason,next:base.next||null};
      return {...state,readiness:'available',note:'Explicit index plan or approved run; no automatic embedding'};
    }
    if(input.id==='knowledge.search'){
      const probe=await knowledgeGenerationStatus(projectRoot);
      if(!probe.available)return {...state,readiness:'needs_setup',reason:probe.reason,
        next:probe.next||null,existing_generations:probe.existing_generations||0};
      return {...state,readiness:'available',active_generation:probe.generation_id};
    }
    return state;
  });
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
    list(options = {}) { return [...listCapabilities(options),...cadDescriptors.filter(t=>(!options.domain||options.domain==='design')&&(!options.kind||options.kind==='tool')&&(!options.status||options.status==='active')),...(samAdapter?.toolDescriptors?.({domain:options.domain,kind:options.kind})||[]).map(t=>({...t,id:t.name,domain:t.category,handler_bound:true,agent_callable:true,readiness:'available'}))]; },
    describe(id) { if (samAdapter?.canInvoke?.(id)) return samAdapter.toolDescriptors().find(t=>t.name===id); return describe(id); },
    toolDescriptors({ domain, kind, includeUnavailable = false } = {}) {
      const native = [...listCapabilities({ domain, kind, status: null }), ...cadDescriptors.filter(t=>(!domain||domain==='design')&&(!kind||kind==='tool'))].filter((row) => includeUnavailable || (executable.has(row.id) && (!['machine.inspect','repository.crawl','repository.mine'].includes(row.id) || machineAvailable()))).map((row) => ({
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
      const sam = (samAdapter?.toolDescriptors?.({domain,kind,includeUnavailable})||[])
        .filter(t=>(!domain||domain===t.category)&&(!kind||kind==='tool'));
      return [...native.filter(row=>!sam.some(tool=>tool.name===row.name)),...sam];
    },
    canInvoke(id) { const name=String(id || '').trim(); return samAdapter?.canInvoke?.(name) === true || (executable.has(name) && (!['machine.inspect','repository.crawl','repository.mine'].includes(name) || machineAvailable())); },
    async invoke(id, input = {}) {
      if (samAdapter?.canInvoke?.(id)) return samAdapter.invoke(id,input);
      const capability = describe(id);
      const handler = executable.get(capability.id);
      if (!handler) throw new Error(`capability_handler_unavailable:${capability.id}`);
      const value = await handler(input);
      return { capability_id: capability.id, capability_version: capability.version, result: value };
    },
  });
}
