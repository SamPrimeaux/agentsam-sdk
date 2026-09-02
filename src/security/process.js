import { spawn } from 'node:child_process';

export function runProcess(command, args, { cwd, timeoutMs = 300_000, signal, env = process.env, maxBytes = 8 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Command cancelled'));
    const child = spawn(command, args, { cwd, env, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', size = 0, failure, hardKill;
    function kill(sig) {
      try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, sig); } catch { /* already exited */ }
    }
    function stop(reason) {
      if (failure) return;
      failure = reason;
      kill('SIGTERM');
      hardKill = setTimeout(() => kill('SIGKILL'), 1000);
    }
    const timer = setTimeout(() => stop('Command timed out'), timeoutMs);
    const abort = () => stop('Command cancelled');
    signal?.addEventListener('abort', abort, { once: true });
    const receive = (key) => chunk => {
      size += chunk.length;
      if (size > maxBytes) return stop('Command output exceeded 8 MiB');
      if (key === 'stdout') stdout += chunk.toString(); else stderr += chunk.toString();
    };
    child.stdout.on('data', receive('stdout'));
    child.stderr.on('data', receive('stderr'));
    const cleanup = () => { clearTimeout(timer); clearTimeout(hardKill); signal?.removeEventListener('abort', abort); };
    child.on('error', () => { cleanup(); reject(new Error('Cannot start requested command')); });
    child.on('close', code => { cleanup(); failure ? reject(new Error(failure)) : resolve({ code: code ?? 1, stdout, stderr }); });
  });
}
