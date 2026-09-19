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
    `  ${status.ready ? pc.green('Ready for authenticated model + terminal work') : status.local_ready ? pc.green('Local Agent Sam available · connected features need setup') : pc.yellow('Local state needs setup or repair')}`,
    '',
    `  account      ${yesNo(status.checks?.account, status.identity?.active_auth?.kind || 'authenticated', 'not authenticated')}`,
  ];
  if (status.state_storage) {
    lines.push(`  state        SQLite · ${status.state_storage.migrated ? 'migrated' : 'not initialized'} · ${status.state_storage.path}`);
    lines.push(`  actor       ${pc.dim(status.state_storage.actor_runtime || 'none')}`);
  }
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

    const hasLive = Array.isArray(cloudflare.bindings?.live) && cloudflare.bindings.live.length > 0;
    const summary = hasLive
      ? (cloudflare.bindings.match
          ? pc.green(`${cloudflare.bindings.live.length} live · declared contract satisfied`)
          : pc.yellow(`${cloudflare.bindings?.missing?.length || 0} missing`))
      : pc.dim(`${(cloudflare.bindings?.declared || []).length} declared contract bindings`);
    lines.push(`  bindings     ${summary}`);

    const liveBindings = cloudflare.bindings?.live || [];
    const declaredBindings = cloudflare.bindings?.declared || [];
    const declaredMap = new Map((Array.isArray(declaredBindings) ? declaredBindings : []).map((row) => [row.name, row]));

    const rawResources = (cloudflare.bindings?.resources && cloudflare.bindings.resources.length > 0)
      ? cloudflare.bindings.resources
      : (liveBindings.length > 0 ? liveBindings : declaredBindings).filter(
          (r) => r.type !== 'plain_text' && r.type !== 'json' && r.type !== 'secret_text' && r.type !== 'secret_key'
        );

    const sortedResources = [...rawResources].sort((a, b) => {
      if (a.name === 'DB') return -1;
      if (b.name === 'DB') return 1;
      return a.name.localeCompare(b.name);
    });

    for (const b of sortedResources) {
      const decl = declaredMap.get(b.name) || {};
      const detail = b.database_name || decl.database_name || b.bucket_name || decl.bucket_name || b.service || decl.service || b.id || decl.id || '';
      const typeDisplay = b.type === 'r2_bucket' ? 'r2' : b.type;
      const detailStr = detail ? pc.dim(` (${detail})`) : '';
      lines.push(`               • ${pc.bold(b.name)} · ${typeDisplay}${detailStr}`);
    }

    const varCount = cloudflare.bindings?.runtime_variables?.length
      ?? (liveBindings.length > 0 ? liveBindings : declaredBindings).filter((r) => r.type === 'plain_text' || r.type === 'json').length;
    const secretCount = cloudflare.bindings?.runtime_secrets?.length
      ?? (liveBindings.length > 0 ? liveBindings : declaredBindings).filter((r) => r.type === 'secret_text' || r.type === 'secret_key').length;
    if (varCount > 0 || secretCount > 0) {
      lines.push(`               • ${pc.dim(`${varCount} vars · ${secretCount} secrets`)}`);
    }

    if (cloudflare.bindings?.missing?.length) {
      lines.push(`               ${pc.red(`✗ missing: ${cloudflare.bindings.missing.map((b) => b.name).join(', ')}`)}`);
    }

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
