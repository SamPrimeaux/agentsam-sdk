import pc from 'picocolors';
import { isCancel, select } from '@clack/prompts';
import pkg from '../../../package.json' with { type: 'json' };
import {
  CLI_COMMAND_CATALOG,
  CLI_HELP_TOPICS,
  getCliCommand,
  listCliCommands,
  printAssistTip,
} from '../../cli/command-catalog.js';
import { SLASH_COMMANDS } from '../../lib/slash-commands.js';

const TOPIC_ALIASES = new Map([
  ['models', 'start'], ['model', 'start'], ['provider', 'start'], ['providers', 'start'], ['resume', 'start'],
  ['repo', 'work'], ['repository', 'work'], ['inspect', 'work'], ['index', 'work'], ['security', 'work'],
  ['ingest', 'work'], ['codebaseindex', 'work'], ['codebase-index', 'work'],
  ['terminal', 'runtime'], ['connections', 'runtime'], ['remote', 'runtime'], ['sandbox', 'runtime'], ['deploy', 'runtime'],
  ['mcp', 'runtime'], ['eval', 'runtime'],
  ['slash', 'inside'], ['commands', 'inside'], ['session', 'inside'], ['usage', 'inside'], ['context', 'inside'],
  ['create', 'create'], ['scaffold', 'create'], ['capabilities', 'create'], ['skills', 'create'],
]);

function clean(value) {
  return value == null ? '' : String(value).trim().toLowerCase();
}

function commandsForTopic(topicId) {
  return listCliCommands({ topic: topicId }).map((entry) => {
    const aliases = (entry.aliases || []).filter((a) => !a.startsWith('-')).slice(0, 2);
    const name = aliases.length ? `agentsam ${entry.id}|${aliases.join('|')}` : `agentsam ${entry.id}`;
    const tip = entry.skill ? ` · skill ${entry.skill}` : '';
    return [name, `${entry.summary}${tip}`];
  });
}

function padRows(rows) {
  const width = Math.min(52, Math.max(...rows.map(([command]) => command.length), 0));
  return rows.map(([command, description]) => '    ' + pc.cyan(command.padEnd(width)) + '  ' + pc.dim(description));
}

export function resolveHelpTopic(value) {
  const query = clean(value);
  if (!query) return null;
  const direct = CLI_HELP_TOPICS.find((topic) => topic.id === query || clean(topic.label) === query);
  if (direct) {
    return { ...direct, rows: commandsForTopic(direct.id) };
  }
  const alias = TOPIC_ALIASES.get(query);
  if (alias) {
    const topic = CLI_HELP_TOPICS.find((t) => t.id === alias);
    return topic ? { ...topic, rows: commandsForTopic(topic.id) } : null;
  }
  const command = getCliCommand(query);
  if (command) {
    const topic = CLI_HELP_TOPICS.find((t) => t.id === command.topic);
    return topic ? { ...topic, rows: commandsForTopic(topic.id) } : null;
  }
  return CLI_HELP_TOPICS.map((topic) => ({ ...topic, rows: commandsForTopic(topic.id) }))
    .find((topic) => topic.rows.some(([cmd, description]) => clean(cmd).includes(query) || clean(description).includes(query))) || null;
}

export function renderHelpOverview(version, options = {}) {
  const common = listCliCommands({ common: true });
  const lines = [
    '',
    '  ' + pc.bold('Agent Sam') + ' ' + pc.dim('v' + version),
    '  ' + pc.dim('SAM = Systematic Autonomous Machinery · help is generated from the command catalog.'),
    '',
    '  ' + pc.bold('Start'),
    '    ' + pc.cyan('agentsam') + '                         ' + pc.dim('enter the interactive experience'),
    '    ' + pc.cyan('agentsam resume') + '                  ' + pc.dim('continue saved work'),
    '    ' + pc.cyan('agentsam help <topic>') + '            ' + pc.dim('focused help from catalog'),
    '    ' + pc.cyan('agentsam skills <id>') + '             ' + pc.dim('load how-to skill instructions'),
    '',
    '  ' + pc.bold('Common'),
  ];
  for (const entry of common) {
    lines.push('    ' + pc.cyan(('agentsam ' + entry.id).padEnd(34)) + '  ' + pc.dim(entry.summary));
  }
  lines.push(
    '',
    '  ' + pc.dim('Every command prints: tip: use skill <id>  — machine baseline for in-CLI guidance.'),
    '  ' + pc.dim('Inside Agent Sam: press / for the command picker.'),
  );
  if (options.showTopics !== false) {
    lines.push('', '  ' + pc.dim('Topics: ' + CLI_HELP_TOPICS.map((topic) => topic.id).join(' · ') + ' · all · skills'));
  }
  lines.push('');
  return lines.join('\n');
}

export function renderHelpTopic(topic, version) {
  if (!topic) return renderHelpOverview(version);
  const skillHint = topic.rows?.[0]?.[1]?.includes('skill')
    ? ''
    : '';
  return [
    '',
    '  ' + pc.bold('Agent Sam') + ' ' + pc.dim('v' + version) + ' ' + pc.dim('·') + ' ' + pc.bold(topic.label),
    '  ' + pc.dim(topic.summary),
    '',
    ...padRows(topic.rows || []),
    '',
    '  ' + pc.dim('Tip: agentsam skills <id> loads how-to instructions for that command’s skill.'),
    skillHint,
    '',
  ].join('\n');
}

export function renderAllHelp(version) {
  const lines = [renderHelpOverview(version, { showTopics: false })];
  for (const topic of CLI_HELP_TOPICS) {
    lines.push(renderHelpTopic({ ...topic, rows: commandsForTopic(topic.id) }, version));
  }
  lines.push(
    '',
    '  ' + pc.bold('Inside shell (slash)'),
    ...padRows(SLASH_COMMANDS.slice(0, 16).map((row) => [row.cmd, row.description])),
    '    ' + pc.dim(`… ${SLASH_COMMANDS.length} slash commands total · /help inside the shell`),
    '',
    '  ' + pc.bold('Catalog'),
    '    ' + pc.dim(`${CLI_COMMAND_CATALOG.length} top-level commands · source: src/cli/command-catalog.js`),
    '',
  );
  return lines.join('');
}

export async function runHelp(argv = [], options = {}) {
  const version = String(options.version || pkg.version || 'unknown');
  const write = options.write || ((value) => process.stdout.write(value));
  const args = argv.filter((arg) => arg !== '--interactive');

  printAssistTip('help', { write: (s) => process.stderr.write(s) });

  if (args.includes('--all') || args.some((arg) => clean(arg) === 'all')) {
    write(renderAllHelp(version));
    return;
  }

  if (args.some((arg) => clean(arg) === 'skills' || clean(arg) === 'skill')) {
    write([
      '',
      '  ' + pc.bold('Skills') + ' ' + pc.dim('· how-to instructions per surface'),
      '    ' + pc.cyan('agentsam skills') + '                      ' + pc.dim('list portable skills'),
      '    ' + pc.cyan('agentsam skills <id>') + '               ' + pc.dim('print skill instructions'),
      '    ' + pc.cyan('agentsam skills <id> --references') + '  ' + pc.dim('include reference docs'),
      '',
      '  ' + pc.dim('Every CLI command tip points at a skill id — that is the machine baseline.'),
      '',
    ].join('\n'));
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
    message: 'Agent Sam help (catalog-driven)',
    options: [
      ...CLI_HELP_TOPICS.map((topic) => ({ value: topic.id, label: topic.label, hint: topic.summary })),
      { value: 'skills', label: 'Skills', hint: 'How-to instructions loaded via agentsam skills' },
      { value: 'all', label: 'All commands', hint: 'Print the complete catalog map' },
      { value: 'exit', label: 'Back', hint: 'Return without printing more help' },
    ],
  });
  if (isCancel(choice) || choice === 'exit') return;
  if (choice === 'all') write(renderAllHelp(version));
  else if (choice === 'skills') {
    write([
      '',
      '  Run ' + pc.cyan('agentsam skills') + ' to list, or ' + pc.cyan('agentsam skills agentsam-codebaseindex') + ' for ingest how-to.',
      '',
    ].join('\n'));
  } else write(renderHelpTopic(resolveHelpTopic(choice), version));
}

export function listHelpTopics() {
  return CLI_HELP_TOPICS.map((topic) => ({ id: topic.id, label: topic.label, summary: topic.summary }));
}
