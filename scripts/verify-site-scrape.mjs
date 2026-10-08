import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'packages/agentsam-site-scrape');
const packageJSON = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if(!packageJSON.files?.includes('packages/agentsam-site-scrape')){
  throw new Error('site.scrape is absent from the published SDK package files list');
}
for(const publicExport of ['./site-scrape','./site-scrape/worker','./site-scrape/client','./site-scrape/index']){
  const target = packageJSON.exports?.[publicExport];
  if(!target || !fs.existsSync(path.join(root,target)))throw new Error(`Missing published site.scrape export: ${publicExport}`);
}

const native = spawnSync(process.execPath, ['--test', 'runtime/test/runtime.test.mjs', 'runtime/test/knowledge-handoff.test.mjs', 'worker/test/worker.test.mjs'], {
  cwd: directory,
  stdio: 'inherit',
  timeout: 120000,
});
if (native.error || native.status !== 0) {
  throw new Error(`Native site.scrape tests failed: ${native.error?.message || native.status}`);
}

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
