#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const separator = path.sep;
const isWithin = (candidate, parent) => {
  const relative = path.relative(parent, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${separator}`) && !path.isAbsolute(relative));
};
const signalExitCode = (signal) => ({ SIGHUP: 129, SIGINT: 130, SIGTERM: 143 })[signal] ?? 1;

const separatorIndex = process.argv.indexOf('--');
const [command, ...args] = separatorIndex < 0 ? [] : process.argv.slice(separatorIndex + 1);
if (!command) {
  console.error('Usage: with-ephemeral-tmpdir.mjs -- <command> [args...]');
  process.exit(2);
}

const home = path.resolve(process.env.HOME || homedir());
const inheritedTmp = process.env.AGENTSAM_RUN_TMPDIR;
let runTmp;
let ownsTmp = false;

if (inheritedTmp) {
  runTmp = path.resolve(inheritedTmp);
  if (isWithin(runTmp, home)) throw new Error('AGENTSAM_RUN_TMPDIR must not be inside the user home directory');
  if (!existsSync(runTmp) || !statSync(runTmp).isDirectory()) {
    throw new Error(`AGENTSAM_RUN_TMPDIR does not exist: ${runTmp}`);
  }
} else {
  let base = path.resolve(process.platform === 'darwin' ? '/private/tmp' : tmpdir());
  if (isWithin(base, home)) base = path.resolve(process.platform === 'darwin' ? '/private/tmp' : '/tmp');
  if (isWithin(base, home)) throw new Error('Could not find a temporary directory outside the user home directory');
  runTmp = mkdtempSync(path.join(base, 'agentsam-run-'));
  ownsTmp = true;
}

const env = {
  ...process.env,
  TMPDIR: runTmp,
  TMP: runTmp,
  TEMP: runTmp,
  AGENTSAM_RUN_TMPDIR: runTmp,
  npm_config_logs_max: '0',
};
let child;
const signalHandlers = new Map();
let cleaned = false;
const cleanup = () => {
  if (!ownsTmp || cleaned) return;
  cleaned = true;
  rmSync(runTmp, { recursive: true, force: true });
};

try {
  child = spawn(command, args, {
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    detached: process.platform !== 'win32',
  });

  let terminationRequested = false;
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    const handler = () => {
      if (!child || terminationRequested) return;
      terminationRequested = true;
      if (process.platform !== 'win32' && child.pid) {
        try {
          process.kill(-child.pid, signal);
        } catch (error) {
          if (error.code !== 'ESRCH') console.error(`[ephemeral-run] could not forward ${signal}: ${error.message}`);
        }
      } else {
        child.kill(signal);
      }
    };
    signalHandlers.set(signal, handler);
    process.on(signal, handler);
  }

  const status = await new Promise((resolve) => {
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      resolve(code);
    };
    child.once('error', (error) => {
      console.error(`[ephemeral-run] ${command}: ${error.message}`);
      finish(127);
    });
    child.once('exit', (code, signal) => finish(code ?? signalExitCode(signal)));
  });
  process.exitCode = status;
} catch (error) {
  console.error(`[ephemeral-run] ${error.message}`);
  process.exitCode = 1;
} finally {
  for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
  try {
    cleanup();
  } catch (error) {
    console.error(`[ephemeral-run] temporary cleanup failed: ${error.message}`);
    process.exitCode ||= 1;
  }
}
