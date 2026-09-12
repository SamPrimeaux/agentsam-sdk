import { spawn } from 'node:child_process';
import { createProcessDiagnosticError } from '../errors/index.js';

export function runProcess(command, args, { cwd, timeoutMs = 300_000, signal, env = process.env, maxBytes = 8 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const safeArgs = Array.isArray(args) ? args : [];
    const diagnostic = (code, message, extra = {}) => createProcessDiagnosticError({
      code,
      message,
      command,
      args: safeArgs,
      cwd,
      stdout,
      stderr,
      ...extra,
    });
    let stdout = '', stderr = '', size = 0, failure, hardKill;
    if (signal?.aborted) return reject(createProcessDiagnosticError({ code: 'process_cancelled', message: 'Command cancelled', command, args: safeArgs, cwd }));
    const child = spawn(command, safeArgs, { cwd, env, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    function kill(sig) {
      try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, sig); } catch { /* already exited */ }
    }
    function stop(error) {
      if (failure) return;
      failure = error;
      kill('SIGTERM');
      hardKill = setTimeout(() => kill('SIGKILL'), 1000);
    }
    const timer = setTimeout(() => stop(diagnostic('process_timeout', 'Command timed out', { retriable: false })), timeoutMs);
    const abort = () => stop(diagnostic('process_cancelled', 'Command cancelled'));
    signal?.addEventListener('abort', abort, { once: true });
    const receive = (key) => chunk => {
      size += chunk.length;
      if (size > maxBytes) return stop(diagnostic('process_output_limit', `Command output exceeded ${maxBytes} bytes`));
      if (key === 'stdout') stdout += chunk.toString(); else stderr += chunk.toString();
    };
    child.stdout.on('data', receive('stdout'));
    child.stderr.on('data', receive('stderr'));
    const cleanup = () => { clearTimeout(timer); clearTimeout(hardKill); signal?.removeEventListener('abort', abort); };
    child.on('error', (cause) => {
      cleanup();
      reject(createProcessDiagnosticError({
        code: cause?.code || 'process_spawn_failed',
        message: cause?.message || 'Cannot start requested command',
        command,
        args: safeArgs,
        cwd,
        cause,
      }));
    });
    child.on('close', (code, closeSignal) => {
      cleanup();
      if (failure) return reject(failure);
      resolve({ code: code ?? 1, signal: closeSignal || null, stdout, stderr });
    });
  });
}
