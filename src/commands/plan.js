import { runBrand } from './brand.js';
import {
  addPlanStep,
  createPlan,
  getPlan,
  listPlans,
  openPlanLedger,
  setPlanStatus,
  setPlanStepStatus,
} from './plan-ledger.js';

function parse(argv = []) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith('--')) {
      opts._.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      opts[key] = next;
      i += 1;
    } else {
      opts[key] = true;
    }
  }
  return opts;
}

function renderPlan(plan) {
  if (!plan) return 'No active local plan.\n';
  const lines = [
    '',
    'AgentSam plan',
    '',
    '  id        ' + plan.id,
    '  title     ' + plan.title,
    '  type      ' + plan.plan_type,
    '  status    ' + plan.status,
    '  goal      ' + (plan.metadata?.goal || plan.summary_text || ''),
    '  repo      ' + (plan.metadata?.repository_id || 'unknown'),
    '  revision  ' + (plan.metadata?.revision || 'uncommitted/unknown'),
    '  progress  ' + plan.tasks_done + '/' + plan.tasks_total + ' complete - ' + plan.tasks_blocked + ' blocked',
  ];
  if (plan.tasks?.length) {
    lines.push('', '  steps');
    for (const step of plan.tasks) {
      const marker = step.status === 'complete' ? '[x]' : step.status === 'blocked' ? '[!]' : step.status === 'running' ? '[>]' : '[ ]';
      lines.push('    ' + marker + ' ' + step.id + '  [' + step.status + '] ' + step.title);
    }
  }
  return lines.join('\n') + '\n';
}

function help() {
  console.log([
    '',
    'agentsam plan - durable project-local work plans',
    '',
    '  agentsam plan new "<title>" [--goal "..."] [--type feature|sprint|refactor|incident|daily|run]',
    '  agentsam plan list [--all] [--json]',
    '  agentsam plan show [current|PLAN_ID] [--json]',
    '  agentsam plan add "<step>" [--plan PLAN_ID] [--kind inspect|implement|verify|deploy|decision]',
    '  agentsam plan start TODO_ID',
    '  agentsam plan done TODO_ID',
    '  agentsam plan block TODO_ID [--reason "..."]',
    '  agentsam plan cancel TODO_ID',
    '  agentsam plan complete [PLAN_ID]',
    '  agentsam plan abandon [PLAN_ID]',
    '',
    'Existing domain plan:',
    '  agentsam plan brand [--goap] [--json] [--write]',
    '',
  ].join('\n'));
}

export async function runPlan(argv = []) {
  const opts = parse(argv);
  const [sub, ...rest] = opts._;
  if (!sub || sub === 'help' || opts.help) return help();
  if (sub === 'brand') {
    return runBrand(['plan', ...rest, ...(opts.json ? ['--json'] : []), ...(opts.goap ? ['--goap'] : []), ...(opts.write ? ['--write'] : [])]);
  }

  const ctx = openPlanLedger(process.cwd());
  try {
    let result;
    if (sub === 'new') {
      result = createPlan(ctx, {
        title: rest.join(' '),
        goal: opts.goal,
        planType: opts.type || 'feature',
        tokenBudget: opts.budget ? Number(opts.budget) : null,
      });
    } else if (sub === 'list') {
      result = listPlans(ctx, { all: Boolean(opts.all) });
    } else if (sub === 'show') {
      result = getPlan(ctx, rest[0] || 'current');
    } else if (sub === 'add') {
      result = addPlanStep(ctx, {
        planId: opts.plan || 'current',
        title: rest.join(' '),
        description: opts.description || null,
        priority: opts.priority || 'medium',
        kind: opts.kind || 'work',
        tokenBudget: opts.budget ? Number(opts.budget) : null,
        requiresApproval: Boolean(opts.approval),
      });
    } else if (['start', 'done', 'block', 'cancel'].includes(sub)) {
      const taskId = rest[0];
      if (!taskId) throw new Error('TODO_ID is required');
      const status = { start: 'running', done: 'complete', block: 'blocked', cancel: 'cancelled' }[sub];
      result = setPlanStepStatus(ctx, taskId, status, { reason: opts.reason || null });
    } else if (sub === 'complete' || sub === 'abandon') {
      result = setPlanStatus(ctx, rest[0] || 'current', sub === 'complete' ? 'complete' : 'abandoned');
    } else {
      return help();
    }

    if (opts.json) console.log(JSON.stringify(result, null, 2));
    else if (sub === 'list') {
      if (!result.length) console.log('\nNo local plans for this repository.\n');
      else {
        console.log('\nAgentSam plans\n');
        for (const plan of result) console.log('  ' + plan.id + '  [' + plan.status + '] ' + plan.title + '  ' + plan.tasks_done + '/' + plan.tasks_total);
        console.log('');
      }
    } else if (sub === 'add' || ['start', 'done', 'block', 'cancel'].includes(sub)) {
      console.log('\n  ' + result.id + '  [' + result.status + '] ' + result.title + '\n');
    } else {
      console.log(renderPlan(result));
    }
    return result;
  } finally {
    ctx.close();
  }
}
