import pc from 'picocolors';
import { isCancel, select } from '@clack/prompts';
import pkg from '../../../package.json' with { type: 'json' };

const HELP_TOPICS = Object.freeze([
  {
    id: 'start',
    label: 'Start / resume',
    summary: 'Enter Agent Sam, resume work, inspect identity, and choose a model.',
    rows: [
      ['agentsam', 'Enter the interactive Agent Sam experience'],
      ['agentsam resume [session]', 'Resume a saved Agent Sam session'],
      ['agentsam whoami', 'Show authenticated account and credential status'],
      ['agentsam models', 'Probe account-visible hosted/local models'],
      ['agentsam env init <provider>', 'Create a secure local provider profile'],
    ],
  },
  {
    id: 'work',
    label: 'Build / inspect',
    summary: 'Repository intelligence and normal project work.',
    rows: [
      ['agentsam inspect', 'Bounded repository index / authority view'],
      ['agentsam index', 'Incremental AST and optional embeddings'],
      ['agentsam search "query"', 'Search indexed code/text'],
      ['agentsam repo snapshot', 'Git composition/churn snapshot'],
      ['agentsam security', 'Dependency and trust-boundary scan'],
      ['agentsam merkle', 'Integrity snapshots and comparisons'],
    ],
  },
  {
    id: 'runtime',
    label: 'Runtime / terminal',
    summary: 'Local, remote, sandbox, and deployment controls.',
    rows: [
      ['agentsam status', 'Project, Git, DB, API, and PTY status'],
      ['agentsam start-local', 'Start the local PTY service'],
      ['agentsam connections', 'Inspect available execution connections'],
      ['agentsam tunnel', 'Expose local PTY only when remote access is wanted'],
      ['agentsam deploy', 'Graduate intentionally to cloud infrastructure'],
      ['agentsam cloudflare', 'Wrangler and Cloudflare runtime diagnostics'],
    ],
  },
  {
    id: 'inside',
    label: 'Inside Agent Sam',
    summary: 'Commands available while the interactive session is running.',
    rows: [
      ['/', 'Open the keyboard command picker'],
      ['/model', 'Choose model, reasoning, and processing tier'],
      ['/context', 'Show live context economics'],
      ['/usage', 'Show token/cost/session receipt'],
      ['/settings', 'Change runtime, terminal, and model policy'],
      ['/status', 'Show project/runtime health'],
      ['/help [topic]', 'Show in-session help'],
      ['/exit', 'Return to the host shell'],
    ],
  },
  {
    id: 'create',
    label: 'Create / extend',
    summary: 'Scaffold and add reusable capabilities.',
    rows: [
      ['agentsam create <name> --preset <preset>', 'Create a new AgentSam project'],
      ['agentsam add <capability>', 'Add a supported capability'],
      ['agentsam capabilities [id]', 'Inspect capability contracts'],
      ['agentsam skills [id]', 'Inspect packaged skills'],
      ['agentsam identity init', 'Add reusable identity surfaces'],
      ['agentsam dockerize', 'Build supported container targets'],
    ],
  },
]);

const TOPIC_ALIASES = new Map([
  ['models', 'start'], ['model', 'start'], ['provider', 'start'], ['providers', 'start'], ['resume', 'start'],
  ['repo', 'work'], ['repository', 'work'], ['inspect', 'work'], ['index', 'work'], ['security', 'work'],
  ['terminal', 'runtime'], ['connections', 'runtime'], ['remote', 'runtime'], ['sandbox', 'runtime'], ['deploy', 'runtime'],
  ['slash', 'inside'], ['commands', 'inside'], ['session', 'inside'], ['usage', 'inside'], ['context', 'inside'],
  ['create', 'create'], ['scaffold', 'create'], ['capabilities', 'create'], ['skills', 'create'],
]);

function clean(value) {
  return value == null ? '' : String(value).trim().toLowerCase();
}

function padRows(rows) {
  const width = Math.min(42, Math.max(...rows.map(([command]) => command.length), 0));
  return rows.map(([command, description]) => '    ' + pc.cyan(command.padEnd(width)) + '  ' + pc.dim(description));
}

export function resolveHelpTopic(value) {
  const query = clean(value);
  if (!query) return null;
  const direct = HELP_TOPICS.find((topic) => topic.id === query || clean(topic.label) === query);
  if (direct) return direct;
  const alias = TOPIC_ALIASES.get(query);
  if (alias) return HELP_TOPICS.find((topic) => topic.id === alias) || null;
  return HELP_TOPICS.find((topic) =>
    topic.rows.some(([command, description]) => clean(command).includes(query) || clean(description).includes(query))) || null;
}

export function renderHelpOverview(version, options = {}) {
  const lines = [
    '',
    '  ' + pc.bold('Agent Sam') + ' ' + pc.dim('v' + version),
    '  ' + pc.dim('Type normally to work with Agent Sam. Use help only when you need the map.'),
    '',
    '  ' + pc.bold('Start'),
    '    ' + pc.cyan('agentsam') + '                         ' + pc.dim('enter the interactive experience'),
    '    ' + pc.cyan('agentsam resume') + '                  ' + pc.dim('continue saved work'),
    '    ' + pc.cyan('agentsam help <topic>') + '            ' + pc.dim('focused help'),
    '',
    '  ' + pc.bold('Common'),
    '    ' + pc.cyan('agentsam inspect') + '                 ' + pc.dim('understand this repository'),
    '    ' + pc.cyan('agentsam models') + '                  ' + pc.dim('see account-visible models'),
    '    ' + pc.cyan('agentsam status') + '                  ' + pc.dim('check project/runtime health'),
    '    ' + pc.cyan('agentsam security') + '                ' + pc.dim('scan dependency + trust boundaries'),
    '    ' + pc.cyan('agentsam deploy') + '                  ' + pc.dim('graduate intentionally'),
    '',
    '  ' + pc.dim('Inside Agent Sam: press / for the command picker. Ask the selected model for natural-language help at any time.'),
  ];
  if (options.showTopics !== false) {
    lines.push('', '  ' + pc.dim('Topics: ' + HELP_TOPICS.map((topic) => topic.id).join(' · ') + ' · all'));
  }
  lines.push('');
  return lines.join('\n');
}

export function renderHelpTopic(topic, version) {
  if (!topic) return renderHelpOverview(version);
  return [
    '',
    '  ' + pc.bold('Agent Sam') + ' ' + pc.dim('v' + version) + ' ' + pc.dim('·') + ' ' + pc.bold(topic.label),
    '  ' + pc.dim(topic.summary),
    '',
    ...padRows(topic.rows),
    '',
    '  ' + pc.dim('Tip: run agentsam help for the map, or agentsam to return to the interactive experience.'),
    '',
  ].join('\n');
}

export function renderAllHelp(version) {
  const lines = [renderHelpOverview(version, { showTopics: false })];
  for (const topic of HELP_TOPICS) lines.push(renderHelpTopic(topic, version));
  return lines.join('');
}

export async function runHelp(argv = [], options = {}) {
  const version = String(options.version || pkg.version || 'unknown');
  const write = options.write || ((value) => process.stdout.write(value));
  const args = argv.filter((arg) => arg !== '--interactive');

  if (args.includes('--all')) {
    write(renderAllHelp(version));
    return;
  }

  const topicArg = args.find((arg) => !arg.startsWith('-'));
  if (topicArg) {
    const topic = resolveHelpTopic(topicArg);
    if (!topic) {
      write(renderHelpOverview(version));
      write('  ' + pc.yellow('No exact help topic matched') + ' ' + topicArg + '\n\n');
      return;
    }
    write(renderHelpTopic(topic, version));
    return;
  }

  const interactive = options.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!interactive) {
    write(renderHelpOverview(version));
    return;
  }

  const choice = await select({
    message: 'Agent Sam help',
    options: [
      ...HELP_TOPICS.map((topic) => ({ value: topic.id, label: topic.label, hint: topic.summary })),
      { value: 'all', label: 'All commands', hint: 'Print the complete deterministic help map' },
      { value: 'exit', label: 'Back', hint: 'Return without printing more help' },
    ],
  });
  if (isCancel(choice) || choice === 'exit') return;
  if (choice === 'all') write(renderAllHelp(version));
  else write(renderHelpTopic(resolveHelpTopic(choice), version));
}

export function listHelpTopics() {
  return HELP_TOPICS.map((topic) => ({ id: topic.id, label: topic.label, summary: topic.summary }));
}
