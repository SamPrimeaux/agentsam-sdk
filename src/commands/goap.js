import {
  readGoapState,
  renderGoapStatus,
  renderGoapGoal,
  renderGoapWhy,
  renderGoapPlan,
} from '../../packages/agentsam-repository/src/goap.js';

/**
 * Handle agentsam goap [status|goal|why|plan] command.
 */
export async function runGoap(subcommand = 'status', options = {}) {
  const cwd = options.cwd || process.cwd();
  const sub = String(subcommand || 'status').trim().toLowerCase();

  const state = await readGoapState({ cwd });
  if (!state.ok) {
    console.error(`Error reading GOAP state: ${state.error || 'unknown error'}`);
    return;
  }

  if (options.json) {
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
