import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'packages/agentsam-site-scrape');
const candidates = process.env.PYTHON ? [process.env.PYTHON] :
  (process.platform === 'win32' ? ['python'] : ['python3.14', 'python3.13', 'python3.12', 'python3.11', 'python3.10', 'python3']);
const python = candidates.find(command => {
  const result = spawnSync(command, ['-c', 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'], { stdio: 'ignore' });
  return !result.error && result.status === 0;
});
if (!python) throw new Error('Python 3.10+ required; set PYTHON to a supported interpreter.');
const dependencies = spawnSync(python, ['-c', 'import requests'], { stdio: 'ignore' });
if (dependencies.status !== 0) {
  throw new Error(`Scraper Python dependencies missing. Run ${python} -m pip install -e packages/agentsam-site-scrape`);
}
const result = spawnSync(python, ['-B', '-m', 'unittest', 'discover', '-s', 'tests', '-v'], {
  cwd: directory,
  stdio: 'inherit',
  timeout: 120000,
  env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONPATH: directory },
});
if (result.error) console.error(`site.scrape tests failed: ${result.error.message}`);
process.exit(result.status ?? 1);
