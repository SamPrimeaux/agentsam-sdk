/**
 * SAM OS CLI: inspect executable truth, not the optimistic D1/catalog flags.
 * Builtins work offline; remote and v2 host operation packs are opt-in.
 */
import { AgentSamClient } from '../sam/client.js';
import { ensureOS, getOSStatus } from '../sam/os.js';
import { listSamOperations, toSamOperationCard } from '../sam/registry.js';
import { OPERATION_CATALOG } from '../sam/operation-packs/generated-v2/catalog.js';
import { createShellSamAdapter, resolveShellSamIdentity } from '../sam/shell-host.js';

export async function runSam(argv = [], options = {}) {
  const json = argv.includes('--json');
  const args = argv.filter(arg => arg !== '--json');
  const sub = args[0] || 'status';
  const write = options.write || ((value) => process.stdout.write(value));
  ensureOS();
  const sam = new AgentSamClient();
  // Use the same authenticated host loader as the real CLI model runtime.
  // This command never grants execution permission.
  const shellState = options.state || {
    cwd:process.cwd(),projectRoot:process.cwd(),home:process.env.HOME,
  };
  const verifiedIdentity = await (options.identityLoader || resolveShellSamIdentity)({state:shellState});
  const host = createShellSamAdapter({
    state:shellState,trustedIdentity:verifiedIdentity,authorize:async()=>false,
  });
  const hostDescriptors = host?.toolDescriptors() || [];
  const bound = new Set(hostDescriptors.map(item=>item.name));
  const status = getOSStatus();
  const proposed = OPERATION_CATALOG.filter(item => !item.aliasFor);
  const unbound = proposed.filter(item => !status.available.includes(item.name) && !bound.has(item.name));

  let result;
  if (sub === 'status' || sub === 'doctor') {
    result = {
      ...status, ok: true,
      bound_count: status.available.length + hostDescriptors.length,
      host_model_operations: hostDescriptors.map(item=>item.name),
      generated_candidates: proposed.length,
      generated_unbound: unbound.length,
      offline_core_ready: status.core_count > 0,
      note: 'Installed handlers only. D1 active flags, credentials and source-file existence are not execution proofs.',
    };
    if (sub === 'doctor') result.generated_unbound_names = unbound.map(item => item.name);
  } else if (sub === 'list') {
    result = { ok: true, operations: listSamOperations().map(toSamOperationCard) };
  } else if (sub === 'describe') {
    const id = args[1];
    if (!id) throw new Error('usage: agentsam sam describe <operation-id>');
    result = await sam.describe(id);
    if (!result.ok) {
      const candidate = OPERATION_CATALOG.find(item => item.name === id);
      const active = hostDescriptors.find(item=>item.name===id);
      if (active) result = {ok:true,id,handler_bound:true,authorization:'required_at_invocation',input_schema:active.input_schema,capability_key:OPERATION_CATALOG.find(item=>item.name===id)?.capability_key||null};
      else if (candidate) result = { ok: false, id, declared: true, executable: false, reason: 'handler_not_installed', capability_key: candidate.capability_key };
    }
  } else if (sub === 'discover') {
    result = await sam.discover({ query: args.slice(1).join(' ') });
    const needle=args.slice(1).join(' ').toLowerCase().trim();
    const installed=hostDescriptors.filter(item=>!needle || needle.split(/\s+/).some(term=>(item.name+' '+item.description).toLowerCase().includes(term)));
    result.operations.push(...installed.map(item=>({id:item.name,summary:item.description,model:'never',risk:item.risk,handler_bound:true})));
    result.count=result.operations.length;
  } else if (sub === 'help' || sub === '--help' || sub === '-h') {
    result = { ok: true, help: 'agentsam sam [status|doctor|list|describe <id>|discover <query>] [--json]' };
  } else {
    throw new Error('unknown SAM OS subcommand: ' + sub);
  }
  if (json) write(JSON.stringify(result, null, 2) + '\n');
  else if (result.help) write(result.help + '\n');
  else if (sub === 'status' || sub === 'doctor') {
    write(`SAM OS · ${result.bound_count} installed · ${result.core_count} packaged core · ${result.host_model_operations.length} authorized-host media handlers · ${result.generated_unbound} other proposals unbound\n`);
    write('Executable tools require a bound handler; hosted D1/third-party installations are not implied by CLI login.\n');
    if (result.pack_status.length) write('Installed packs: ' + result.pack_status.map(p => p.id).join(', ') + '\n');
    if (sub === 'doctor' && unbound.length) write('Awaiting host integration: ' + unbound.map(x => x.name).join(', ') + '\n');
  } else if (sub === 'list') {
    for (const op of result.operations) write(`${op.id}  [${op.risk}]  ${op.summary}\n`);
  } else if (sub === 'discover') {
    write(`Found ${result.count} registered operations\n`);
    for (const op of result.operations) write(`${op.id}  ${op.summary}\n`);
  } else {
    write(JSON.stringify(result, null, 2) + '\n');
  }
  return result;
}
