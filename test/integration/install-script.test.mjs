import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const installScript = path.join(root, 'scripts/install.sh');

test('install.sh is a bash npm bootstrap with platform detection', () => {
  const source = fs.readFileSync(installScript, 'utf8');
  assert.match(source, /AgentSam installer/);
  assert.match(source, /npm install --global/);
  assert.match(source, /Darwin-arm64/);
  assert.match(source, /--version/);
  assert.match(source, /--app/);
  assert.match(source, /standalone_ready/);
  assert.match(source, /checksum_contract/);
});

test('install.sh passes bash syntax validation', () => {
  const result = spawnSync('bash', ['-n', installScript], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('install.sh maps --app aliases to executable launchers', () => {
  const cases = [
    ['cad', 'cad-creator', 'agentsam-cad-creator'],
    ['cms', 'client-cms-editor', 'agentsam-cms'],
    ['studio', 'local-studio', 'agentsam-studio'],
  ];

  for (const [alias, appId, executable] of cases) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), `agentsam-install-${alias}-`));
    const fakeBin = path.join(temp, 'fake-bin');
    const installRoot = path.join(temp, 'home');
    const binDir = path.join(temp, 'bin');
    fs.mkdirSync(fakeBin, { recursive: true });

    fs.writeFileSync(
      path.join(fakeBin, 'uname'),
      '#!/usr/bin/env bash\ncase "$1" in -s) echo Darwin ;; -m) echo arm64 ;; esac\n',
      { mode: 0o755 },
    );
    fs.writeFileSync(
      path.join(fakeBin, 'node'),
      '#!/usr/bin/env bash\ncase "$*" in *split*) echo 22 ;; *) echo 22.14.0 ;; esac\n',
      { mode: 0o755 },
    );
    fs.writeFileSync(path.join(fakeBin, 'npm'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
    fs.writeFileSync(
      path.join(fakeBin, 'agentsam'),
      '#!/usr/bin/env bash\necho "agentsam 2.6.2"\n',
      { mode: 0o755 },
    );

    try {
      const result = spawnSync('bash', [installScript, '--app', alias, '--prefix', binDir], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH}`,
          HOME: temp,
          AGENTSAM_HOME: installRoot,
        },
      });
      assert.equal(result.status, 0, result.stderr);

      const launcherPath = path.join(binDir, executable);
      const launcher = fs.readFileSync(launcherPath, 'utf8');
      assert.match(launcher, new RegExp(`app preview ${appId}`));
      assert.ok((fs.statSync(launcherPath).mode & 0o111) !== 0);

      const receipt = JSON.parse(fs.readFileSync(path.join(installRoot, 'install-receipt.json'), 'utf8'));
      assert.equal(receipt.app, appId);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }
});

test('install.sh rejects unknown --app values before installation', () => {
  const result = spawnSync('bash', [installScript, '--app', 'unknown'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /expected cad, cms, or studio/);
});

test('Local Studio Worker serves standalone installer routes', () => {
  const worker = fs.readFileSync(
    path.join(root, 'apps/local-studio/backend/worker/index.js'),
    'utf8',
  );
  const wrangler = fs.readFileSync(
    path.join(root, 'apps/local-studio/backend/wrangler.jsonc'),
    'utf8',
  );

  assert.match(worker, /import installScript from "\.\.\/\.\.\/\.\.\/\.\.\/scripts\/install\.sh"/);
  assert.match(worker, /"\/install\/cad": "cad-creator"/);
  assert.match(worker, /"\/install\/cms": "client-cms-editor"/);
  assert.match(worker, /"\/install\/studio": "local-studio"/);
  assert.match(worker, /text\/x-shellscript/);
  assert.match(wrangler, /"type": "Text"/);
  assert.match(wrangler, /"\*\*\/\*\.sh"/);
});
