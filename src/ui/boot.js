import path from 'node:path';
import pc from 'picocolors';
import pkg from '../../package.json' with { type: 'json' };
import { renderHomeScreen } from './home-screen.js';


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
  identity,
  write = process.stderr.write.bind(process.stderr),
}) {
  // Presentation belongs on stderr and never pollutes data-oriented stdout.
  if (!process.stderr.isTTY || process.env.CI) return;
  const color = !process.env.NO_COLOR && process.env.TERM !== 'dumb';
  const rows = process.stderr.rows || 24;
  // Scroll earlier output into scrollback instead of erasing it, then draw from the top.
  write('\n'.repeat(rows) + '\x1b[H' + renderHomeScreen({
    version: pkg.version,
    cwd: compactHome(identity.root),
    branch: identity.branch || '',
    cols: process.stderr.columns || 80,
    rows,
    color,
  }));
}
