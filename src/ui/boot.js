import path from 'node:path';
import pc from 'picocolors';

const FRAMES = ['◔', '◑', '◕', '●'];
const CLEAR_LINE = '\x1b[2K';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function compactHome(value) {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (home && value.startsWith(home)) return `~${value.slice(home.length)}`;
  return value;
}

export function renderBootSummary({ identity, preferences }) {
  const branch = identity.branch ? ` · ${pc.cyan(identity.branch)}` : '';
  const model = preferences.modelPreference && preferences.modelPreference !== 'auto'
    ? preferences.modelPreference
    : 'auto';
  const runtime = preferences.runtime || 'local';
  const terminal = preferences.terminal || path.basename(process.env.SHELL || '') || 'shell';
  return [
    '',
    `  ${pc.bold('Agent Sam')}  ${pc.green('●')}`,
    `  ${pc.cyan(identity.project)}${branch} · ${pc.white(model)}`,
    `  ${pc.dim(compactHome(identity.root))}`,
    `  ${pc.green('✓')} ${pc.dim(runtime)} · ${pc.dim(terminal)} · ready`,
    '',
  ].join('\n');
}

export async function runBootScene({ identity, preferences, animate = true, write = process.stdout.write.bind(process.stdout) }) {
  const interactive = Boolean(animate && process.stdout.isTTY);
  if (!interactive) {
    write(renderBootSummary({ identity, preferences }));
    return;
  }

  write(HIDE_CURSOR);
  try {
    write(`\n  ${pc.bold('Agent Sam')}\n  ${pc.cyan(identity.project)}${identity.branch ? ` · ${pc.cyan(identity.branch)}` : ''}\n\n`);
    const checks = ['project', 'runtime', 'model'];
    for (const label of checks) {
      for (let i = 0; i < FRAMES.length; i += 1) {
        write(`\r${CLEAR_LINE}  ${pc.cyan(FRAMES[i])} ${pc.dim(`checking ${label}`)}`);
        await sleep(i === FRAMES.length - 1 ? 45 : 55);
      }
      write(`\r${CLEAR_LINE}  ${pc.green('✓')} ${pc.dim(label)}\n`);
    }
    write(`\n  ${pc.green('●')} ${pc.bold('ready')}  ${pc.dim(compactHome(identity.root))}\n\n`);
  } finally {
    write(SHOW_CURSOR);
  }
}
