import pc from 'picocolors';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function healthUrl(status) {
  return clean(
    status?.cloudflare?.health?.url ||
    status?.cloudflare?.contract?.health_url ||
    status?.local?.live?.url
  );
}

function liveAppUrl(status) {
  const explicit = clean(
    status?.cloudflare?.public_url ||
    status?.cloudflare?.contract?.public_url
  );
  if (explicit) return explicit;

  const health = healthUrl(status);
  if (!health) return '';

  return health.replace(/\/(?:api\/)?health\/?$/i, '');
}

export function buildStatusActionPlan(status = {}) {
  const actions = [];
  const tips = [];
  const checks = status.checks || {};
  const cloudflare = status.cloudflare || {};
  const liveOk = cloudflare.configured === true && cloudflare.health?.ok === true;
  const liveHealth = healthUrl(status);
  const liveApp = liveAppUrl(status);
  const localApiOnline = status.local?.api?.online === true;
  const deployTarget = clean(
    status.local?.deployTarget || status.local?.deploy_target
  );

  if (!checks.account) {
    actions.push({
      id: 'auth_login',
      label: 'Sign in to IAM',
      command: 'agentsam login',
      why: 'Account auth is required for connected models, terminal authority, and deploy receipts.',
      kind: 'auth',
    });
    tips.push('Not signed in — run agentsam login, or use AGENTSAM_API_KEY for headless access.');
  } else {
    actions.push({
      id: 'whoami',
      label: 'Inspect account / auth source',
      command: 'agentsam whoami',
      why: 'See which AgentSam credential is currently authoritative.',
      kind: 'inspect',
    });
  }

  if (cloudflare.configured) {
    if (liveOk && liveApp) {
      actions.push({
        id: 'open_health',
        label: `Open live app (${liveApp})`,
        command: liveApp,
        why: 'Open the healthy deployed project rather than localhost.',
        kind: 'deploy',
      });
    }

    actions.push({
      id: 'cf_status',
      label: 'Inspect Cloudflare Worker + bindings',
      command: 'agentsam cloudflare status',
      why: 'Inspect the active Worker version, routes, bindings, and deployment evidence.',
      kind: 'inspect',
    });

    if (!liveOk) {
      tips.push(
        cloudflare.health?.error
          ? `Live health failed: ${cloudflare.health.error}`
          : 'Cloudflare deployment is configured but live health is not verified.',
      );
      actions.push({
        id: 'deploy',
        label: 'Deploy / refresh Cloudflare Worker',
        command: 'agentsam deploy',
        why: 'Bring live health and bindings back in sync with this repository.',
        kind: 'deploy',
      });
    } else {
      tips.push(`Live API healthy · ${liveHealth || cloudflare.worker_name}`);
    }
  } else if (deployTarget === 'cloudflare') {
    tips.push('Cloudflare is the deploy target but its deployment contract is incomplete.');
    actions.push({
      id: 'cf_wire',
      label: 'Inspect Cloudflare deployment contract',
      command: 'agentsam cloudflare status',
      why: 'Resolve Worker/config/health URL before recommending localhost.',
      kind: 'fix',
    });
  } else if (!localApiOnline) {
    tips.push('No live deployment contract is active; localhost is optional.');
    actions.push({
      id: 'local_dev',
      label: 'Start local API',
      command: 'npm run dev',
      why: 'Use only for local-first projects without a healthy hosted deployment.',
      kind: 'local',
    });
  }

  if (!checks.models) {
    actions.push({
      id: 'models',
      label: 'Inspect models',
      command: 'agentsam models',
      why: 'Inspect account-visible and local models.',
      kind: 'fix',
    });
  }

  if (!checks.terminal) {
    actions.push({
      id: 'terminal',
      label: 'Inspect terminal authority',
      command: 'agentsam status --json',
      why: 'Inspect local PTY and enrolled execution connections.',
      kind: 'inspect',
    });
  }

  if (status.local?.db?.ready === false && status.local?.db?.exists === false) {
    actions.push({
      id: 'db_init',
      label: 'Initialize AgentSam SQLite',
      command: 'agentsam db init',
      why: 'Initialize the project-local runtime state database.',
      kind: 'local',
    });
  }

  actions.push({
    id: 'inspect',
    label: 'Inspect repository',
    command: 'agentsam inspect',
    why: 'Capture repository identity and structural evidence.',
    kind: 'inspect',
  });

  actions.push({
    id: 'refresh',
    label: 'Refresh status',
    command: 'agentsam status',
    why: 'Re-probe account, models, terminal, and deployment health.',
    kind: 'inspect',
  });

  let headline = 'Project awareness';
  if (status.ready) headline = liveOk ? 'Live project healthy' : 'Ready';
  else if (!checks.account) headline = 'Sign in to unlock connected features';
  else if (cloudflare.configured && !liveOk) headline = 'Deploy / health needs attention';
  else headline = 'Setup remaining';

  return { headline, tips, actions };
}

export function formatStatusNextSteps(plan) {
  const lines = ['', `  ${pc.bold('next')}        ${plan.headline}`];

  for (const tip of plan.tips.slice(0, 4)) {
    lines.push(`               ${pc.dim('•')} ${tip}`);
  }

  const primary = plan.actions.filter((action) => action.kind !== 'inspect').slice(0, 3);
  const inspect = plan.actions.filter((action) => action.kind === 'inspect').slice(0, 2);

  for (const action of [...primary, ...inspect].slice(0, 5)) {
    const command = action.id === 'open_health'
      ? `open ${action.command}`
      : action.command;

    lines.push(`               ${pc.cyan('$')} ${command}`);
    lines.push(`                 ${pc.dim(action.why)}`);
  }

  lines.push(`               ${pc.dim('Interactive menu: agentsam status -i')}`);

  return lines.join('\n');
}
