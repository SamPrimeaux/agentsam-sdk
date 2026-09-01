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

  lines.push(row('lane', `${status.lane} · ${status.agent}`, width));
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
