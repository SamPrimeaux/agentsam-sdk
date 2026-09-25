import pc from 'picocolors';

const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function visibleLength(value) {
  return String(value ?? '').replace(ANSI_RE, '').length;
}

export function padVisible(value, width, align = 'left') {
  const text = String(value ?? '');
  const len = visibleLength(text);
  const pad = Math.max(0, width - len);
  if (align === 'right') return `${' '.repeat(pad)}${text}`;
  if (align === 'center') {
    const left = Math.floor(pad / 2);
    return `${' '.repeat(left)}${text}${' '.repeat(pad - left)}`;
  }
  return `${text}${' '.repeat(pad)}`;
}

export function drawBox(rows, { width = 64, title = '', color = pc.cyan } = {}) {
  const inner = Math.max(24, width - 2);
  const titleText = title ? ` ${title} ` : '';
  const titlePad = Math.max(0, inner - visibleLength(titleText));
  const lines = [
    `${color('┌')}${color(titleText)}${color('─'.repeat(titlePad))}${color('┐')}`,
  ];
  for (const row of rows) {
    if (row === '─') {
      lines.push(`${color('├')}${color('─'.repeat(inner))}${color('┤')}`);
      continue;
    }
    lines.push(`${color('│')}${padVisible(row, inner)}${color('│')}`);
  }
  lines.push(`${color('└')}${color('─'.repeat(inner))}${color('┘')}`);
  return lines.join('\n');
}

/**
 * Architecture explorer — reasoning wireframe, not pixels.
 * Left: tree. Right: package ownership + dependency map.
 */
export function renderArchitectureExplorer(input = {}) {
  const repo = input.repo || 'repository';
  const git = input.git || { branch: 'main', dirty: false };
  const tree = input.tree || ['apps/', 'packages/', 'protocol/', 'src/', 'tooling/'];
  const focus = input.focus || {
    package: 'protocol',
    owns: 'wire contracts',
    runtime: 'none / generated',
    imported_by: 'client, server, runtime',
    files: '.proto .ts .rs generated/...',
  };
  const deps = input.deps || ['protocol ── client ── app', '            ▲', '            └──── server'];
  const tabs = input.tabs || ['contracts', 'runtime', 'persistence', 'commands', 'ownership'];
  const leftW = 18;
  const rightW = 40;
  const width = leftW + rightW + 3;

  const header = ` ${repo}  ${git.branch || 'main'} ${git.dirty ? 'dirty' : 'clean'} `;
  const rows = ['─'];
  const maxRows = Math.max(tree.length, 6 + deps.length);
  for (let i = 0; i < maxRows; i += 1) {
    const left = padVisible(tree[i] ? ` ${tree[i]}` : '', leftW);
    let right = '';
    if (i === 0) right = ` package: ${focus.package}`;
    else if (i === 1) right = ` ${'─'.repeat(Math.min(37, rightW - 2))}`;
    else if (i === 2) right = ` owns: ${focus.owns}`;
    else if (i === 3) right = ` runtime: ${focus.runtime}`;
    else if (i === 4) right = ` imported by: ${focus.imported_by}`;
    else if (i === 5) right = ' DEPENDENCY MAP';
    else if (i >= 6 && deps[i - 6]) right = ` ${deps[i - 6]}`;
    rows.push(`${left}${pc.dim('│')}${padVisible(right, rightW)}`);
  }
  rows.push('─');
  rows.push(` Files: ${focus.files || ''}`);
  rows.push('─');
  rows.push(` ${tabs.map((t) => `[${t}]`).join(' ')}`);

  return drawBox(rows, { width, title: header.trim(), color: pc.cyan });
}

/**
 * Operation inspector — intent → validate → execute → persist → notify.
 */
export function renderOperationInspector(input = {}) {
  const op = input.operation || 'operation';
  const opId = input.op_id || 'op_…';
  const stages = input.stages || ['intent', 'validate', 'execute', 'persist', 'notify'];
  const actors = input.actors || ['user/agent', 'policy', 'adapter', 'artifact', 'event bus'];
  const active = Math.max(0, Math.min(stages.length - 1, Number(input.active_index) || 0));
  const step = input.step || null;
  const receipt = input.receipt || {};

  const dots = stages.map((_, i) => (i <= active ? pc.green('●') : pc.dim('○'))).join(pc.dim('────────'));
  const labels = stages.map((s) => padVisible(s, 10)).join(' ');
  const actorLine = actors.map((a, i) => (i === active ? pc.bold(a) : pc.dim(a))).join(pc.dim('  │  '));

  const rows = [
    ` Operation: ${pc.bold(op)}  ${pc.dim(opId)}`,
    '─',
    ` ${labels}`,
    ` ${dots}`,
    ` ${actorLine}`,
  ];
  if (step) {
    rows.push('─');
    rows.push(` STEP · ${step.name || 'step'}`);
    if (step.detail) rows.push(` ${pc.dim(step.detail)}`);
    if (step.artifact) rows.push(` → ${step.artifact}`);
  }
  rows.push('─');
  rows.push(' Receipt:');
  for (const [key, value] of Object.entries(receipt)) {
    rows.push(`  ${pc.dim(key + ':')} ${value}`);
  }
  return drawBox(rows, { width: 70, title: 'operation inspector', color: pc.magenta });
}

export function renderGoShipScenery({ product, discovery, deploy, build } = {}) {
  const arch = renderArchitectureExplorer({
    repo: 'agentsam-sdk',
    git: discovery?.git || {},
    tree: ['apps/', 'packages/', 'protocol/', 'src/go/', 'src/commands/', 'runtime/'],
    focus: {
      package: product || 'agentsam-go-worker',
      owns: 'Go runtime + CF container edge',
      runtime: 'go/native + worker',
      imported_by: 'agentsam go, deploy adapter',
      files: 'main.go wrangler.jsonc Dockerfile contracts/',
    },
    deps: [
      'protocol/go ── src/go ── commands/go',
      '                 ▲',
      '                 └──── apps/agentsam-go-worker',
    ],
    tabs: ['contracts', 'runtime', 'persistence', 'commands', 'ownership'],
  });

  const stages = ['intent', 'validate', 'execute', 'persist', 'notify'];
  let active = 1;
  if (build?.receipt) active = 2;
  if (deploy?.deployed || deploy?.skipped_deploy || deploy?.receipt) active = 3;
  if (deploy?.probes?.ok || deploy?.productPath) active = 4;

  const op = renderOperationInspector({
    operation: 'go.cloudflare.ship',
    op_id: product || 'agentsam-go-worker',
    stages,
    actors: ['CLI', 'go test', 'container', 'D1/R2 receipts', 'status'],
    active_index: active,
    step: {
      name: 'native Go capability',
      detail: 'hash + inspect over Worker → Container',
      artifact: deploy?.url || 'local binary',
    },
    receipt: {
      'source commit': build?.receipt?.source?.commit || discovery?.git?.commit || '—',
      'build tests': build?.receipt?.tests?.go_test ? 'pass' : '—',
      'live url': deploy?.url || '—',
      health: deploy?.receipt?.health || (deploy?.probes?.ok ? 'healthy' : 'pending'),
    },
  });

  return `${arch}\n\n${op}`;
}
