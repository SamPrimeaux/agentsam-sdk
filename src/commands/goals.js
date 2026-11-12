import { processError, usageError } from '../../packages/agentsam-errors/src/cli.js';
import { resolveAccountAuthority } from '../lib/auth.js';
import { resolveLocalStudioHostOrigin } from '../lib/app-authority.js';
import { getCliCommand } from '../cli/command-catalog.js';

export async function requestSharedGoals(path = '', { method = 'GET', body, command = 'agentsam goals', ...options } = {}) {
  const loginHint = { command, hints: { next: 'Run agentsam login.' } };
  const authority = await resolveAccountAuthority({ ...options, explicit: '', env: {
    ...process.env, ...options.env, AGENTSAM_API_KEY: '',
  } });
  if (authority.kind !== 'agentsam_browser_oauth' || !authority.value) {
    throw processError('Shared goals require AgentSam account sign-in.',loginHint);
  }
  const url = new URL('/api/studio/living-plan' + path,resolveLocalStudioHostOrigin());
  const response = await (options.fetchImpl || fetch)(url, {
    method, redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { authorization: 'Bearer ' + authority.value, accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 401) throw processError('Studio rejected the account session.',loginHint);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw processError(data?.error || `Goals request failed (HTTP ${response.status}).`,{command});
  return data;
}

export async function runGoals(args = [], options = {}) {
  const usage = getCliCommand('goals').usage.join('\n');
  const flags = args.filter(arg => arg.startsWith('--'));
  if (flags.includes('--help') || args.includes('-h')) { console.log(usage); return; }
  const positional = args.filter(arg => !['--json','--personal'].includes(arg));
  const descriptionIndex = positional.indexOf('--description');
  if (descriptionIndex !== -1 && (!positional[descriptionIndex + 1] || positional[descriptionIndex + 1].startsWith('--'))) {
    throw usageError('--description requires text.',{command:'agentsam goals'});
  }
  const [,description] = descriptionIndex === -1 ? [] : positional.splice(descriptionIndex,2);
  const [action = 'list', ...values] = positional;
  const request = (path, method, body) => requestSharedGoals(path,{ ...options, method, body });
  let result;
  if (action === 'list' && values.length === 0) {
    result = await request('');
  } else if (['set','new','create'].includes(action) && values.length && values.every(arg => !arg.startsWith('--'))) {
    result = await request('/goals','POST',{ title: values.join(' '), description,
      goal_type: flags.includes('--personal') ? 'personal' : 'platform' });
  } else if (values[0] && values[1] && ['status','step','link'].includes(action)) {
    const goal = '/goals/' + encodeURIComponent(values[0]);
    if (action === 'status' && values.length === 2) result = await request(goal,'PATCH',{ status: values[1] });
    if (action === 'step') result = await request(goal + '/steps','POST',{ title: values.slice(1).join(' ') });
    if (action === 'link' && values.length === 2) result = await request(goal + '/tickets','POST',{ ticket_id: values[1] });
  }
  if (!result) throw usageError(usage,{command:'agentsam goals',hints:{example:'agentsam goals list'}});
  if (flags.includes('--json')) { console.log(JSON.stringify(result,null,2)); return; }
  if (action !== 'list') { console.log(result.id ? `Saved ${result.id}` : 'Saved'); return; }
  const goals = [...result.goals, ...(result.goapGoals || [])];
  if (!goals.length) { console.log('No account goals yet.'); return; }
  for (const goal of goals) {
    console.log(`${goal.id}  ${goal.goal_status || goal.status}${goal.focused ? ' (current)' : ''}  ${goal.title}`);
  }
}
