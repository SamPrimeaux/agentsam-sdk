import { usageError } from '../../packages/agentsam-errors/src/cli.js';
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
import { requestSharedGoals } from './goals.js';
import { tryResolveGitContext } from '../../packages/agentsam-repository/src/git-context.js';
import { buildLocalGoapState } from './goap-world.js';

function parseArgs(args = []) {
  const flags = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') {
      flags.json = true;
    } else if (a === '--shared') {
      flags.shared = true;
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

const SHARED_ACTIONS = {
  new: 'create', create: 'create', switch: 'activate', select: 'activate', close: 'close',
};

async function runSharedGoap(sub, flags, options) {
  const git = tryResolveGitContext({ cwd: options.cwd });
  if (git?.remoteHost !== 'github.com' || !git.repoFullName) {
    throw usageError('Shared GOAP requires a registered GitHub repository.',{command:'agentsam goap'});
  }
  const repositoryId = 'github:' + git.repoFullName.toLowerCase();
  const route = '/goap?' + new URLSearchParams({ repository: repositoryId, limit: String(flags.limit || 20) });
  const action = Object.hasOwn(SHARED_ACTIONS,sub) ? SHARED_ACTIONS[sub] : null;
  const body = action ? {
    action,
    ...(action === 'create'
      ? { title: flags._.join(' ').trim(), priority: flags.priority, subsystem: flags.subsystem, description: flags.description }
      : { ticketId: flags._[0], status: flags.status, reason: flags.reason }),
  } : undefined;
  const result = await requestSharedGoals(route, { ...options, command: 'agentsam goap', method: action ? 'POST' : 'GET', body });
  if (options.json) { console.log(JSON.stringify(result,null,2)); return; }
  if (action) {
    console.log(`${action === 'close' ? 'Closed' : 'Activated'} ${result.ticketId} [${result.status}]`);
  } else if (sub === 'list' || sub === 'ls') {
    console.log(renderGoapList(result));
  } else {
    const current = result.tickets.find(ticket => ticket.focused);
    console.log(current ? `${current.title} [${current.goal_status}]  ${current.id}` : 'No current shared GOAP goal.');
  }
}

/**
 * Handle agentsam goap [status|goal|why|plan|list|new|switch|close] command.
 */
export async function runGoap(subcommand = 'status', options = {}) {
  const cwd = options.cwd || process.cwd();
  const sub = String(subcommand || 'status').trim().toLowerCase();
  const flags = parseArgs(options.args || []);
  const jsonMode = Boolean(options.json || flags.json);
  const accountSession = readAccountSession({ home: options.home });
  const accountId = flags.accountId || accountSession?.account_id || null;
  if (flags.shared && !['status','goal','list','ls',...Object.keys(SHARED_ACTIONS)].includes(sub)) {
    throw usageError('Shared GOAP supports status, list and ticket actions.',{
      command:'agentsam goap',hints:{next:'Run agentsam goap plan for the project-local plan.'},
    });
  }
  if (flags.shared || (!flags.accountId && (Object.hasOwn(SHARED_ACTIONS,sub) || sub === 'list' || sub === 'ls'))) {
    return runSharedGoap(sub, flags, { ...options, cwd, json: jsonMode });
  }

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
    if (res.agentRunId) console.log(`  Agent Run: ${res.agentRunId}`);
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

  let state = null;
  try {
    state = await buildLocalGoapState({ cwd });
  } catch (error) {
    if (jsonMode && options.debug) console.error(error?.stack || error);
  }
  if (!state && !flags.accountId && accountSession && ['status','goal'].includes(sub)) {
    return runSharedGoap(sub, flags, { ...options, cwd, json: jsonMode });
  }
  if (!state && accountId) state = await readGoapState({ cwd, accountId });
  if (!state?.ok) {
    console.error(`Error reading GOAP state: ${state?.error || 'no local plan or remote GOAP state available'}`);
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
