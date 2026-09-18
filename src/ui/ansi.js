import pc from 'picocolors';

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function visibleLength(value) {
  return String(value).replace(ANSI_RE, '').length;
}

function trimMiddle(value, max = 44) {
  const text = String(value ?? '');
  if (text.length <= max) return text;
  const left = Math.ceil((max - 1) / 2);
  const right = Math.floor((max - 1) / 2);
  return `${text.slice(0, left)}…${text.slice(-right)}`;
}

function row(label, value, width = 58) {
  const body = ` ${pc.dim(label.padEnd(11))} ${value}`;
  const pad = Math.max(0, width - 2 - visibleLength(body));
  return `${pc.cyan('│')}${body}${' '.repeat(pad)}${pc.cyan('│')}`;
}

function state(ok, yes = 'ready', no = 'offline') {
  return ok ? pc.green(`● ${yes}`) : pc.dim(`○ ${no}`);
}

export function renderLocalStatus(status) {
  const width = 58;
  const title = ` Agent Sam · ${status.configured ? status.project : 'unconfigured directory'} `;
  const topFill = Math.max(0, width - 2 - title.length);
  const lines = [
    `${pc.cyan('╭')}${pc.bold(title)}${pc.cyan('─'.repeat(topFill))}${pc.cyan('╮')}`,
  ];

  if (!status.configured) {
    lines.push(row('project', pc.yellow('no .agentsam/config.json'), width));
    lines.push(row('root', trimMiddle(status.root), width));
    lines.push(row('next', pc.bold('agentsam init'), width));
    lines.push(`${pc.cyan('╰')}${pc.cyan('─'.repeat(width - 2))}${pc.cyan('╯')}`);
    return lines.join('\n');
  }

  lines.push(row('profile', `${status.lane || 'custom'} · ${status.agent || 'default'}`, width));
  lines.push(
    row(
      'git',
      status.git
        ? `${status.git.branch || 'detached'} · ${status.git.dirty ? pc.yellow('dirty') : pc.green('clean')} · ${String(status.git.revision || '').slice(0, 8)}`
        : pc.dim('not a git repository'),
      width,
    ),
  );
  lines.push(row('sqlite', `${state(status.db.ready)} · ${status.db.tables.length} tables`, width));
  lines.push(row('api', `${state(status.api.online)} · ${status.api.url}`, width));
  lines.push(row('pty', `${state(status.pty.online)} · ${status.pty.url.replace('/health', '')}`, width));
  lines.push(row('deploy', status.deployTarget || pc.dim('local only'), width));
  lines.push(`${pc.cyan('├')}${pc.cyan('─'.repeat(width - 2))}${pc.cyan('┤')}`);

  const actions = [];
  if (!status.db.ready) actions.push('agentsam db init');
  if (!status.api.online) actions.push('npm run dev');
  if (!status.pty.online) actions.push('npm run pty');
  if (!actions.length) actions.push('local stack healthy');
  lines.push(row('next', pc.bold(actions.join(' · ')), width));
  lines.push(`${pc.cyan('╰')}${pc.cyan('─'.repeat(width - 2))}${pc.cyan('╯')}`);
  return lines.join('\n');
}

function yesNo(value, yes = 'ready', no = 'not ready') {
  return value ? pc.green(`● ${yes}`) : pc.yellow(`○ ${no}`);
}

export function renderRuntimeStatus(status) {
  const lines = [
    `  ${pc.bold(`Agent Sam · ${status.local?.project || 'runtime'}`)}`,
    `  ${status.ready ? pc.green('Ready for authenticated model + terminal work') : pc.yellow('Setup or repair required')}`,
    '',
    `  account      ${yesNo(status.checks?.account, status.identity?.active_auth?.kind || 'authenticated', 'not authenticated')}`,
  ];
  if (status.identity?.identity?.email) lines.push(`  identity     ${status.identity.identity.email}`);
  if (status.identity?.api_key?.valid === false && status.identity?.active_auth?.kind === 'browser_oauth') {
    lines.push(`  auth note    ${pc.yellow('invalid environment API key ignored; browser OAuth is active')}`);
  }

  const configuredProviders = status.model_summary?.configured_providers || [];
  lines.push(`  models       ${yesNo(status.checks?.models, `${status.model_summary?.verified_provider_models || 0} provider-verified`, 'no verified model')}`);
  lines.push(`  providers    ${configuredProviders.length ? configuredProviders.join(', ') : pc.dim('none configured')}`);

  const terminal = status.terminal || {};
  lines.push(`  terminal     ${yesNo(status.checks?.terminal, `${terminal.active_connection_count || 0} active remote · local PTY ${terminal.local_pty?.online ? 'online' : 'offline'}`, 'no usable connection')}`);
  for (const connection of (terminal.connections || []).filter((row) => row.active).slice(0, 6)) {
    lines.push(`    ${connection.default ? '★' : '•'} ${connection.name || connection.id} · ${connection.kind || 'terminal'} · ${connection.health || 'unknown'}`);
  }
  if (terminal.error && !status.offline) lines.push(`  terminal err ${pc.yellow(terminal.error)}`);

  const cloudflare = status.cloudflare || {};
  if (cloudflare.configured) {
    const version = cloudflare.version?.number != null ? `v${cloudflare.version.number}` : 'version unknown';
    lines.push(`  deployment   ${yesNo(status.checks?.cloudflare, `${cloudflare.worker_name} · ${version}`, `${cloudflare.worker_name || 'Worker'} not verified`)}`);
    lines.push(`  bindings     ${cloudflare.bindings?.match ? pc.green(`${cloudflare.bindings.live.length} live · declared contract satisfied`) : pc.yellow(`${cloudflare.bindings?.missing?.length || 0} missing`)}`);
    lines.push(`  health       ${cloudflare.health?.ok ? pc.green(`HTTP ${cloudflare.health.status}`) : pc.yellow(cloudflare.health?.error || 'not verified')}`);
    if (cloudflare.error) lines.push(`  cloud error  ${pc.yellow(cloudflare.error)}`);
  } else {
    lines.push(`  deployment   ${pc.dim('not configured for this project')}`);
  }

  lines.push('');
  lines.push(`  git          ${status.local?.git ? `${status.local.git.branch || 'detached'} · ${status.local.git.dirty ? pc.yellow('dirty') : pc.green('clean')} · ${String(status.local.git.revision || '').slice(0, 8)}` : pc.dim('not a git repository')}`);
  lines.push(`  project      ${status.local?.root || ''}`);
  if (status.offline) lines.push(`  mode         ${pc.dim('offline snapshot; live identity/models/terminal/deployment not verified')}`);
  return lines.join('\n');
}
