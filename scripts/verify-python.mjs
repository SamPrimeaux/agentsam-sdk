import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
function supportsRequiredPython(command) {
  const result = spawnSync(command, ['-c', 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'], { stdio: 'ignore' });
  return !result.error && result.status === 0;
}
const candidates = process.env.PYTHON ? [process.env.PYTHON] : (process.platform === 'win32' ? ['python'] : ['python3.12', 'python3.11', 'python3.10', 'python3']);
const python = candidates.find(supportsRequiredPython);
if (!python) throw new Error('Python 3.10+ is required by python/pyproject.toml; set PYTHON to a compatible interpreter.');

function run(args, cwd, env = {}) {
  const result = spawnSync(python, args, {
    cwd,
    stdio: 'inherit',
    timeout: 120000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', ...env },
  });
  if (result.error) console.error(`Python verification failed: ${result.error.message}`);
  if ((result.status ?? 1) !== 0) process.exitCode = result.status ?? 1;
  return result.status ?? 1;
}

const unitStatus = run(
  ['-B', '-m', 'unittest', 'discover', '-s', 'tests', '-v'],
  path.join(root, 'python'),
  { PYTHONPATH: path.join(root, 'python') },
);

if (unitStatus === 0) {
  const adapter = path.join(root, 'services/cad/blender/adapter.py');
  run(
    ['-B', '-c', 'import pathlib,sys; p=pathlib.Path(sys.argv[1]); compile(p.read_text(encoding="utf-8"), str(p), "exec")', adapter],
    root,
  );
}
