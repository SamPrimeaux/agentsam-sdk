import path from 'node:path';
import { isCancel, select } from '@clack/prompts';
import { listLocalSessions, loadLocalSession } from '../lib/local-sessions.js';
import { runShell } from './shell.js';

function writeLine(write, value = '') { write(`${value}\n`); }
function formatWhen(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleString();
}

export function renderSessionList(sessions = []) {
  if (!sessions.length) return '\n  No resumable Agent Sam sessions found.\n';
  const lines = ['', '  Agent Sam · sessions', ''];
  for (const row of sessions) {
    lines.push(`  ${row.id}  ${row.title}`);
    lines.push(`    ${formatWhen(row.updated_at)} · ${row.model_key || 'no model'} · ${row.cwd}`);
  }
  lines.push('');
  return lines.join('\n');
}

export async function runResume(argv = [], options = {}) {
  const write = options.write || ((text) => process.stdout.write(text));
  const json = argv.includes('--json');
  const listOnly = argv.includes('--list');
  const positional = argv.filter((arg) => !arg.startsWith('-'));
  const unknown = argv.filter((arg) => arg.startsWith('-') && !['--json', '--list'].includes(arg));
  if (unknown.length) throw new Error(`unknown resume option: ${unknown[0]}`);
  if (positional.length > 1) throw new Error('agentsam resume accepts at most one session id');

  if (listOnly || (json && !positional[0])) {
    const sessions = listLocalSessions({ home: options.home, limit: 30 });
    if (json) writeLine(write, JSON.stringify(sessions, null, 2));
    else write(renderSessionList(sessions));
    return sessions;
  }

  let sessionId = positional[0] || '';
  if (!sessionId) {
    const sessions = listLocalSessions({ home: options.home, limit: 30 });
    if (!sessions.length) { write(renderSessionList([])); return null; }
    const interactive = options.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
    if (!interactive) { write(renderSessionList(sessions)); return null; }
    const choice = await select({
      message: 'Resume Agent Sam session',
      options: sessions.map((row) => ({
        value: row.id,
        label: row.title,
        hint: `${path.basename(row.cwd)} · ${formatWhen(row.updated_at)}`,
      })),
    });
    if (isCancel(choice)) return null;
    sessionId = choice;
  }

  const session = loadLocalSession(sessionId, { home: options.home });
  if (!session) throw new Error(`session_not_found:${sessionId}`);
  if (json) { writeLine(write, JSON.stringify(session, null, 2)); return session; }

  writeLine(write, `\n  Resuming ${session.id}`);
  writeLine(write, `  ${session.title}`);
  writeLine(write, `  ${session.cwd}\n`);
  const runner = options.runShellImpl || runShell;
  await runner([], { cwd: session.cwd, intro: 'quiet', session, home: options.home });
  return session;
}
