import { createAgentControlClient } from '../acp/client.js';

function clean(value) { return value == null ? '' : String(value).trim(); }
function number(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function parse(argv = []) {
  const out = {
    command: clean(argv[0]) || 'help',
    id: null,
    json: false,
    local: false,
    url: '',
    once: false,
    after: -1,
    limit: 200,
    intervalMs: 1000,
    objective: '',
    role: '',
    workItemId: '',
    stepId: '',
    modelKey: '',
    runtimeRequirements: {},
  };
  let i = 1;
  if (out.command !== 'help' && argv[i] && !String(argv[i]).startsWith('-')) out.id = String(argv[i++]);
  for (; i < argv.length; i += 1) {
    const arg = String(argv[i]);
    if (arg === '--json') out.json = true;
    else if (arg === '--local') out.local = true;
    else if (arg === '--once') out.once = true;
    else if (arg === '--url') out.url = String(argv[++i] || '');
    else if (arg.startsWith('--url=')) out.url = arg.slice(6);
    else if (arg === '--after') out.after = number(argv[++i], -1);
    else if (arg.startsWith('--after=')) out.after = number(arg.slice(8), -1);
    else if (arg === '--limit') out.limit = number(argv[++i], 200);
    else if (arg.startsWith('--limit=')) out.limit = number(arg.slice(8), 200);
    else if (arg === '--interval-ms') out.intervalMs = number(argv[++i], 1000);
    else if (arg.startsWith('--interval-ms=')) out.intervalMs = number(arg.slice(14), 1000);
    else if (arg === '--objective') out.objective = String(argv[++i] || '');
    else if (arg.startsWith('--objective=')) out.objective = arg.slice(12);
    else if (arg === '--role') out.role = String(argv[++i] || '');
    else if (arg.startsWith('--role=')) out.role = arg.slice(7);
    else if (arg === '--work-item') out.workItemId = String(argv[++i] || '');
    else if (arg.startsWith('--work-item=')) out.workItemId = arg.slice(12);
    else if (arg === '--step') out.stepId = String(argv[++i] || '');
    else if (arg.startsWith('--step=')) out.stepId = arg.slice(7);
    else if (arg === '--model') out.modelKey = String(argv[++i] || '');
    else if (arg.startsWith('--model=')) out.modelKey = arg.slice(8);
    else if (arg === '--runtime-json') out.runtimeRequirements = JSON.parse(String(argv[++i] || '{}'));
    else if (arg.startsWith('--runtime-json=')) out.runtimeRequirements = JSON.parse(arg.slice(15) || '{}');
    else throw new Error(`unknown_run_option:${arg}`);
  }
  return out;
}

function help() {
  return [
    'Agent Sam · run',
    'Provider-neutral Agent Control Plane inspection and control.',
    '',
    'Usage:',
    '  agentsam run get <run_id> [--json] [--local | --url <base-url>]',
    '  agentsam run tree <run_id> [--json]',
    '  agentsam run events <run_id> [--after <seq>] [--limit <n>] [--json]',
    '  agentsam run watch <run_id> [--after <seq>] [--interval-ms <ms>] [--once] [--json]',
    '  agentsam run spawn <parent_run_id> --objective <text> [--role <slug>] [--runtime-json <json>] [--json]',
    '  agentsam run cancel <run_id> [--json]',
    '  agentsam run receipt <run_id> [--json]',
    '',
    'Host selection:',
    '  local SQLite is the default.',
    '  AGENTSAM_CONTROL_PLANE_URL or --url selects any HTTP ACP host.',
    '  AGENTSAM_CONTROL_PLANE_TOKEN supplies hosted bearer auth without putting secrets in shell history.',
    '  --local forces the project-local SQLite control plane.',
  ].join('\n');
}

function formatRun(run, clientKind) {
  if (!run) return 'run not found';
  return [
    'Agent Sam · run',
    `source   ${clientKind}`,
    `id       ${run.id}`,
    `status   ${run.status}${run.cancelRequested ? ' · cancel requested' : ''}`,
    `mode     ${run.mode || 'unknown'}`,
    `parent   ${run.parentRunId || '—'}`,
    `model    ${run.modelKey || '—'}`,
    `calls    model ${run.modelCallCount || 0} · tool ${run.toolCallCount || 0}`,
    `cost     $${Number(run.costUsd || 0).toFixed(6)}`,
    run.suspension ? `wait     ${run.suspension.state} · ${run.suspension.reason}` : null,
  ].filter(Boolean).join('\n');
}

function treeLines(node, depth = 0, rows = []) {
  if (!node) return rows;
  const indent = '  '.repeat(depth);
  rows.push(`${indent}${depth ? '└─ ' : ''}${node.id} · ${node.status} · ${node.mode || 'agent'}`);
  for (const child of node.children || []) treeLines(child, depth + 1, rows);
  return rows;
}

function eventLine(event) {
  const at = event.createdAt ? new Date(event.createdAt).toISOString() : '';
  return `#${event.seq} ${event.eventType}${event.phase ? ` · ${event.phase}` : ''}${event.label ? ` · ${event.label}` : ''}${at ? ` · ${at}` : ''}`;
}

function requireId(args) {
  if (!clean(args.id)) {
    const error = new Error(`run_id_required:${args.command}`);
    error.hint = `Usage: agentsam run ${args.command} <run_id>`;
    throw error;
  }
}

export async function runRun(argv = [], options = {}) {
  const args = parse(argv);
  const write = options.write || ((value) => process.stdout.write(String(value)));
  if (args.command === 'help' || args.command === '--help' || args.command === '-h') {
    write(help() + '\n');
    return { ok: true, command: 'help' };
  }
  if (!['get', 'tree', 'events', 'watch', 'spawn', 'cancel', 'receipt'].includes(args.command)) {
    throw new Error(`unknown_run_command:${args.command}`);
  }
  requireId(args);

  const client = options.client || createAgentControlClient({
    cwd: options.cwd || process.cwd(),
    url: args.url || options.url,
    token: options.token,
    local: args.local,
    fetchImpl: options.fetchImpl,
  });

  if (args.command === 'get') {
    const run = await client.getRun(args.id);
    if (!run) throw new Error(`run_not_found:${args.id}`);
    write(args.json ? JSON.stringify(run, null, 2) + '\n' : formatRun(run, client.kind) + '\n');
    return run;
  }

  if (args.command === 'tree') {
    const tree = await client.tree(args.id);
    if (!tree) throw new Error(`run_not_found:${args.id}`);
    write(args.json ? JSON.stringify(tree, null, 2) + '\n' : treeLines(tree).join('\n') + '\n');
    return tree;
  }

  if (args.command === 'events') {
    const events = await client.events(args.id, { after: args.after, limit: args.limit });
    write(args.json ? JSON.stringify(events, null, 2) + '\n' : (events.map(eventLine).join('\n') || 'no events') + '\n');
    return events;
  }

  if (args.command === 'spawn') {
    if (!clean(args.objective)) {
      const error = new Error('child_run_objective_required');
      error.hint = 'Usage: agentsam run spawn <parent_run_id> --objective <text>';
      throw error;
    }
    const spawned = await client.spawn(args.id, {
      objective: args.objective,
      role: clean(args.role) || null,
      work_item_id: clean(args.workItemId) || null,
      step_id: clean(args.stepId) || null,
      model_key: clean(args.modelKey) || null,
      runtime_requirements: args.runtimeRequirements,
    });
    if (args.json) write(JSON.stringify(spawned, null, 2) + '\n');
    else {
      write([
        'Agent Sam · child run',
        `parent   ${spawned.parent_run_id || args.id}`,
        `child    ${spawned.child_run_id || '—'}`,
        `queue    ${spawned.queue || 'host-managed'}`,
        `status   ${spawned.dependency_status || 'pending'}`,
      ].join('\n') + '\n');
    }
    return spawned;
  }

  if (args.command === 'cancel') {
    const run = await client.cancel(args.id);
    if (!run) throw new Error(`run_not_found:${args.id}`);
    write(args.json ? JSON.stringify(run, null, 2) + '\n' : formatRun(run, client.kind) + '\n');
    return run;
  }

  if (args.command === 'receipt') {
    const receipt = await client.receipt(args.id);
    if (!receipt) throw new Error(`run_not_found:${args.id}`);
    if (args.json) write(JSON.stringify(receipt, null, 2) + '\n');
    else {
      write([
        'Agent Sam · run receipt',
        `id       ${receipt.runId}`,
        `status   ${receipt.status}`,
        `terminal ${receipt.terminal ? 'yes' : 'no'}`,
        `events   ${receipt.eventCount}`,
        `children ${receipt.childRunCount}`,
        `cost     $${Number(receipt.usage?.costUsd || 0).toFixed(6)}`,
      ].join('\n') + '\n');
    }
    return receipt;
  }

  let after = args.after;
  const seen = [];
  const wait = options.sleep || sleep;
  do {
    const events = await client.events(args.id, { after, limit: args.limit });
    for (const event of events) {
      seen.push(event);
      after = Math.max(after, Number(event.seq));
      write(args.json ? JSON.stringify(event) + '\n' : eventLine(event) + '\n');
    }
    const run = await client.getRun(args.id);
    if (!run) throw new Error(`run_not_found:${args.id}`);
    if (args.once || ['completed', 'failed', 'cancelled', 'timed_out'].includes(run.status)) {
      return { run, events: seen, after };
    }
    await wait(Math.max(100, args.intervalMs));
  } while (true);
}
