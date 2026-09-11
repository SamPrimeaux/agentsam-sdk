import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SLASH_COMMANDS, SHELL_PHASES } from '../lib/slash-commands.js';
import { runContext } from './context.js';
import { runDb } from './db.js';
import { runDeploy } from './deploy.js';
import { runStatus } from './status.js';
import { runTui } from './tui.js';

function writeLine(write, value = '') {
  write(`${value}\n`);
}

export function tokenizeShellLine(input = '') {
  const source = String(input);
  const tokens = [];
  let token = '';
  let quote = '';
  let started = false;

  const flush = () => {
    if (!started) return;
    tokens.push(token);
    token = '';
    started = false;
  };

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) {
        quote = '';
      } else {
        token += ch;
      }
      started = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    token += ch;
    started = true;
  }
  flush();
  return tokens;
}

export function renderShellCatalog() {
  const next = SHELL_PHASES.find((phase) => phase.status === 'next' || phase.status === 'current');
  const rows = SLASH_COMMANDS.map((row) => `    ${row.cmd.padEnd(14)} ${row.description}`).join('\n');
  return `
  ╔════════════════════════════════╗
  ║        Agent Sam Terminal      ║
  ╚════════════════════════════════╝

  Local PTY   agentsam start-local     ws://127.0.0.1:3099
  ANSI TUI    agentsam tui             zero-dependency Node UI
  Rich TUI    agentsam tui rich        optional richer Python UI
              agentsam tui rich --install
  DB          agentsam db status       local SQLite

  Current milestone: ${next?.label ?? 'local terminal experience'}

  Slash commands (${SLASH_COMMANDS.length} registered):
${rows}
`;
}

function parseDeployOptions(args, cwd) {
  const opts = { cwd, target: '', accountId: '' };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--target') opts.target = args[++i] || '';
    else if (arg === '--account-id') opts.accountId = args[++i] || '';
    else throw new Error(`unknown /deploy option: ${arg}`);
  }
  return opts;
}

async function withProcessCwd(cwd, fn) {
  const previous = process.cwd();
  process.chdir(cwd);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

async function runLocalAgent(goal, write) {
  if (!goal) {
    writeLine(write, '  Usage: /agent <goal>');
    writeLine(write, '  Requires the local Agent Sam dev server (default http://127.0.0.1:8787).');
    return;
  }
  const base = String(process.env.AGENTSAM_LOCAL_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
  let response;
  try {
    response = await fetch(`${base}/api/agentsam/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: goal }),
    });
  } catch (error) {
    throw new Error(`local Agent Sam unavailable at ${base} — run \`npm run dev\` first (${error?.message || error})`);
  }
  const text = await response.text();
  if (!response.ok) throw new Error(`local Agent Sam returned HTTP ${response.status}: ${text.slice(0, 400)}`);
  try {
    writeLine(write, JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    writeLine(write, text);
  }
}

async function showLocalLogs(cwd, write) {
  const dbPath = path.join(cwd, '.agentsam', 'data', 'agentsam.sqlite');
  if (!fs.existsSync(dbPath)) {
    writeLine(write, '  No local Agent Sam DB found. Run `agentsam init . --yes` first.');
    return;
  }
  const { createLocalSqliteDatabase } = await import('../local/sqlite.js');
  const db = await createLocalSqliteDatabase(dbPath);
  try {
    const calls = await db
      .prepare('SELECT id, session_id, tool_name, status, created_at, completed_at FROM agent_tool_calls ORDER BY created_at DESC LIMIT 20')
      .all();
    if (!calls.results.length) {
      writeLine(write, '  No local Agent Sam tool-call events yet.');
      return;
    }
    writeLine(write, '');
    writeLine(write, '  Recent Agent Sam tool calls');
    for (const row of calls.results) {
      writeLine(write, `  ${String(row.created_at || '').padEnd(20)} ${String(row.status || '').padEnd(10)} ${row.tool_name}`);
    }
    writeLine(write, '');
  } finally {
    db.close();
  }
}

export async function dispatchShellLine(line, state = {}) {
  const tokens = tokenizeShellLine(line);
  const write = state.write || ((text) => process.stdout.write(text));
  state.cwd = path.resolve(state.cwd || process.cwd());
  if (!tokens.length) return { handled: true, exit: false, cwd: state.cwd };

  const [command, ...args] = tokens;
  try {
    switch (command.toLowerCase()) {
      case '/help':
        write(renderShellCatalog());
        return { handled: true, exit: false, cwd: state.cwd };
      case '/exit':
      case '/quit':
        return { handled: true, exit: true, cwd: state.cwd };
      case '/status':
        await runStatus(args, { cwd: state.cwd });
        break;
      case '/context':
        await runContext(['--cwd', state.cwd, ...args]);
        break;
      case '/pwd':
        writeLine(write, state.cwd);
        break;
      case '/cd': {
        const destination = args.length ? args.join(' ') : process.env.HOME || process.env.USERPROFILE || state.cwd;
        const next = path.resolve(state.cwd, destination);
        if (!fs.existsSync(next) || !fs.statSync(next).isDirectory()) throw new Error(`directory not found: ${next}`);
        state.cwd = next;
        writeLine(write, state.cwd);
        break;
      }
      case '/git': {
        const gitArgs = args.length ? args : ['status', '--short', '--branch'];
        const result = spawnSync('git', gitArgs, { cwd: state.cwd, stdio: 'inherit', shell: false });
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(`git exited ${result.status}`);
        break;
      }
      case '/db':
        await runDb(args.length ? args : ['status'], { cwd: state.cwd });
        break;
      case '/agent':
        await runLocalAgent(args.join(' '), write);
        break;
      case '/logs':
        await showLocalLogs(state.cwd, write);
        break;
      case '/tui':
        await withProcessCwd(state.cwd, () => runTui(args));
        break;
      case '/deploy':
        await runDeploy(parseDeployOptions(args, state.cwd));
        break;
      default:
        writeLine(write, `  Unknown Agent Sam command: ${command}`);
        writeLine(write, '  Type /help for available commands.');
        return { handled: false, exit: false, cwd: state.cwd };
    }
  } catch (error) {
    writeLine(write, `  ✗ ${error?.message || error}`);
  }

  return { handled: true, exit: false, cwd: state.cwd };
}

export async function runShell(argv = [], options = {}) {
  const write = options.write || ((text) => process.stdout.write(text));
  const state = { cwd: path.resolve(options.cwd || process.cwd()), write };
  const sub = argv[0] || '';

  if (sub === 'list' || sub === 'status') {
    write(renderShellCatalog());
    return;
  }
  if (sub === '--command' || sub === '--once') {
    const line = argv.slice(1).join(' ');
    if (!line) throw new Error(`${sub} requires a slash command`);
    await dispatchShellLine(line, state);
    return;
  }
  if (sub) throw new Error(`unknown shell option: ${sub}`);

  write(renderShellCatalog());
  writeLine(write, '  Interactive shell ready. Type /help for commands; /exit to return to your host shell.');
  writeLine(write, '');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY && process.stdout.isTTY) });
  if (rl.terminal) {
    rl.setPrompt('agentsam> ');
    rl.prompt();
  }

  for await (const line of rl) {
    const result = await dispatchShellLine(line, state);
    if (result.exit) {
      rl.close();
      break;
    }
    if (rl.terminal) rl.prompt();
  }
}
