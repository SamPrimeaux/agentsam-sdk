import {
  readGoapState,
  listGoapTickets,
  createGoapGoal,
  switchGoapGoal,
  closeGoapGoal,
  renderGoapStatus,
  renderGoapList,
  renderGoapGoal,
  renderGoapWhy,
  renderGoapPlan,
} from '../../packages/agentsam-repository/src/goap.js';
import { readAccountSession } from '../lib/account-session.js';

function parseArgs(args = []) {
  const flags = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') {
      flags.json = true;
    } else if (a.startsWith('--priority=')) {
      flags.priority = a.slice('--priority='.length);
    } else if (a === '--priority' || a === '-p') {
      flags.priority = args[++i];
    } else if (a.startsWith('--subsystem=')) {
      flags.subsystem = a.slice('--subsystem='.length);
    } else if (a === '--subsystem' || a === '-s') {
      flags.subsystem = args[++i];
    } else if (a.startsWith('--status=')) {
      flags.status = a.slice('--status='.length);
    } else if (a === '--status') {
      flags.status = args[++i];
    } else if (a.startsWith('--reason=')) {
      flags.reason = a.slice('--reason='.length);
    } else if (a === '--reason' || a === '-r') {
      flags.reason = args[++i];
    } else if (a.startsWith('--limit=')) {
      flags.limit = parseInt(a.slice('--limit='.length), 10);
    } else if (a === '--limit' || a === '-n') {
      flags.limit = parseInt(args[++i], 10);
    } else if (a.startsWith('--desc=') || a.startsWith('--description=')) {
      flags.description = a.slice(a.indexOf('=') + 1);
    } else if (a === '--desc' || a === '--description') {
      flags.description = args[++i];
    } else if (a.startsWith('--account=')) {
      flags.accountId = a.slice('--account='.length);
    } else if (a === '--account') {
      flags.accountId = args[++i];
    } else if (!a.startsWith('-')) {
      flags._.push(a);
    }
  }
  return flags;
}

/**
 * Handle agentsam goap [status|goal|why|plan|list|new|switch|close] command.
 */
export async function runGoap(subcommand = 'status', options = {}) {
  const cwd = options.cwd || process.cwd();
  const sub = String(subcommand || 'status').trim().toLowerCase();
  const flags = parseArgs(options.args || []);
  const jsonMode = Boolean(options.json || flags.json);
  const accountId = flags.accountId || readAccountSession({ home: options.home })?.account_id || null;

  if (sub === 'list' || sub === 'ls') {
    const res = await listGoapTickets({ cwd, accountId, limit: flags.limit || 20 });
    if (!res.ok) {
      console.error(`Error listing GOAP tickets: ${res.error || 'unknown error'}`);
      return;
    }
    if (jsonMode) {
      console.log(JSON.stringify(res, null, 2));
      return;
    }
    console.log(renderGoapList(res));
    return;
  }

  if (sub === 'new' || sub === 'create') {
    const title = flags._.join(' ').trim();
    if (!title) {
      console.error('Error: Ticket title is required.\nUsage: agentsam goap new "<title>" [--priority P1] [--subsystem sys]');
      return;
    }
    const res = await createGoapGoal({
      cwd,
      accountId,
      title,
      priority: flags.priority || 'P2',
      subsystem: flags.subsystem || 'agent-runtime',
      description: flags.description || null,
    });
    if (!res.ok) {
      console.error(`Error creating GOAP goal: ${res.error || 'unknown error'}`);
      return;
    }
    if (jsonMode) {
      console.log(JSON.stringify(res, null, 2));
      return;
    }
    console.log(`Successfully created and activated GOAP goal: ${res.ticketId}`);
    console.log(`  Title:     ${res.title}`);
    console.log(`  Priority:  ${res.priority} [Subsystem: ${res.subsystem}]`);
    console.log(`  Agent Run: ${res.agentRunId}`);
    return;
  }

  if (sub === 'switch' || sub === 'select') {
    const ticketId = flags._[0]?.trim();
    if (!ticketId) {
      console.error('Error: Ticket ID is required.\nUsage: agentsam goap switch <ticket_id>');
      return;
    }
    const res = await switchGoapGoal({ cwd, accountId, ticketId });
    if (!res.ok) {
      console.error(`Error switching GOAP goal: ${res.error || 'unknown error'}`);
      return;
    }
    if (jsonMode) {
      console.log(JSON.stringify(res, null, 2));
      return;
    }
    console.log(`Successfully switched active GOAP goal to: ${res.ticketId}`);
    return;
  }

  if (sub === 'close') {
    const ticketId = flags._[0]?.trim() || null;
    const res = await closeGoapGoal({
      cwd,
      accountId,
      ticketId,
      status: flags.status || 'shipped',
      statusReason: flags.reason || null,
    });
    if (!res.ok) {
      console.error(`Error closing GOAP goal: ${res.error || 'unknown error'}`);
      return;
    }
    if (jsonMode) {
      console.log(JSON.stringify(res, null, 2));
      return;
    }
    console.log(`Successfully closed GOAP goal: ${res.ticketId} [Status: ${res.status}]`);
    if (res.linkedCommit) console.log(`  Linked Commit: ${res.linkedCommit.slice(0, 10)}`);
    return;
  }

  const state = await readGoapState({ cwd, accountId });
  if (!state.ok) {
    console.error(`Error reading GOAP state: ${state.error || 'unknown error'}`);
    return;
  }

  if (jsonMode) {
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  switch (sub) {
    case 'goal':
      console.log(renderGoapGoal(state));
      break;
    case 'why':
      console.log(renderGoapWhy(state));
      break;
    case 'plan':
      console.log(renderGoapPlan(state));
      break;
    case 'status':
    default:
      console.log(renderGoapStatus(state));
      break;
  }
}
