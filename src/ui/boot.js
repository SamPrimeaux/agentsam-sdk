import path from 'node:path';
import pc from 'picocolors';
import pkg from '../../package.json' with { type: 'json' };
import { brandedTerminalHeader } from './companion-art.js';


function compactHome(value) {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (home && value.startsWith(home)) return `~${value.slice(home.length)}`;
  return value;
}

function modelLine(preferences) {
  const model = preferences.modelPreference && preferences.modelPreference !== 'auto' ? preferences.modelPreference : 'auto';
  const reasoning = preferences.reasoningEffort && preferences.reasoningEffort !== 'auto' ? preferences.reasoningEffort : 'auto';
  const tier = preferences.serviceTier || 'default';
  return `${model} · ${reasoning} · ${tier}`;
}

export function renderBootSummary({ identity, preferences }) {
  const branch = identity.branch ? ` · ${pc.cyan(identity.branch)}` : '';
  const runtime = preferences.runtime || 'local';
  const terminal = preferences.terminal || path.basename(process.env.SHELL || '') || 'shell';
  return [
    '',
    `  ${pc.bold('Agent Sam')}  ${pc.green('●')}`,
    `  ${pc.cyan(identity.project)}${branch}`,
    `  ${pc.white(modelLine(preferences))}`,
    `  ${pc.dim(compactHome(identity.root))}`,
    `  ${pc.green('✓')} ${pc.dim(runtime)} · ${pc.dim(terminal)} · ready`,
    `  ${pc.dim('Tip: /model changes model + reasoning + processing; / shows the command menu.')}`,
    '',
  ].join('\n');
}

export async function runBootScene({
  identity, preferences,
  write = process.stderr.write.bind(process.stderr),
}) {
  // Presentation belongs on stderr and never pollutes data-oriented stdout.
  if (!process.stderr.isTTY || process.env.CI) return;
  const useColor = !process.env.NO_COLOR && process.env.TERM !== 'dumb';
  const heading = brandedTerminalHeader({
    project: identity.project + (identity.branch ? ' · ' + identity.branch : ''),
    model: modelLine(preferences),
    cwd: compactHome(identity.root),
    version: pkg.version,
    width: process.stderr.columns || 80,
    color: useColor,
  });
  write('\n' + heading + '\n');
  write('  ' + (preferences.runtime || 'local') + ' · ' +
    (preferences.terminal || path.basename(process.env.SHELL || '') || 'shell') + '\n');
  write('  Type / and press Enter for the command menu.\n\n');
}
