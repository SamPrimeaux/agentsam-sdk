import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(here, '../../bin/agentsam-rapid-rust');

export async function runRust(argv = [], options = {}) {
  const node = options.node || process.execPath;
  const stdio = options.stdio || 'inherit';
  return await new Promise((resolve, reject) => {
    const child = spawn(node, [entry, ...argv], { stdio, env: process.env });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) return reject(new Error(`agentsam rust terminated by ${signal}`));
      if (code && code !== 0) {
        const error = new Error(`agentsam rust exited with code ${code}`);
        error.exitCode = code;
        return reject(error);
      }
      resolve(code ?? 0);
    });
  });
}
