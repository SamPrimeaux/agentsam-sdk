import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const result = spawnSync(python, ['-B', '-m', 'unittest', 'discover', '-s', 'tests', '-v'], {
  cwd: path.join(root, 'python'), stdio: 'inherit', timeout: 120000,
  env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONPATH: path.join(root, 'python') },
});
if (result.error) console.error(`Python verification failed: ${result.error.message}`);
process.exitCode = result.status ?? 1;
