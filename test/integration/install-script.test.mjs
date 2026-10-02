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
  assert.match(source, /--app-id/);
  assert.match(source, /--app/);
  assert.doesNotMatch(source, /APP_SELECTOR=\"\\$\\{AGENTSAM_DEFAULT_APP/);
  assert.match(source, /@inneranimalmedia\/agentsam-local-studio/);
  assert.match(source, /@inneranimalmedia\/agentsam-cad-creator/);
  assert.match(source, /@inneranimalmedia\/client-cms-editor/);
  assert.match(source, /@inneranimalmedia\/ecommerce-cms-agentsam/);
  assert.match(source, /agentsam\.install\.v2/);
  assert.match(source, /resolved_version/);
  assert.match(source, /executable/);
  assert.match(source, /standalone_ready/);
  assert.match(source, /checksum_contract/);
});

test('install.sh passes bash syntax validation', () => {
  const result = spawnSync('bash', ['-n', installScript], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('install.sh installs selected app packages directly instead of manufacturing SDK wrappers', () => {
  const cases = [
    ['cad', 'cad-creator', 'agentsam-cad-creator', '@inneranimalmedia/agentsam-cad-creator'],
    ['cms', 'client-cms-editor', 'agentsam-cms', '@inneranimalmedia/client-cms-editor'],
    ['studio', 'local-studio', 'agentsam-studio', '@inneranimalmedia/agentsam-local-studio'],
    ['ecommerce', 'ecommerce-cms-agentsam', 'agentsam-ecommerce', '@inneranimalmedia/ecommerce-cms-agentsam'],
  ];

  for (const [alias, appId, executable, packageName] of cases) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), `agentsam-install-${alias}-`));
    const fakeBin = path.join(temp, 'fake-bin');
    const installRoot = path.join(temp, 'home');
    const binDir = path.join(temp, 'bin');
    const npmLog = path.join(temp, 'npm.log');
    fs.mkdirSync(fakeBin, { recursive: true });

    fs.writeFileSync(
      path.join(fakeBin, 'uname'),
      '#!/usr/bin/env bash\ncase "$1" in -s) echo Darwin ;; -m) echo arm64 ;; esac\n',
      { mode: 0o755 },
    );
    fs.writeFileSync(
      path.join(fakeBin, 'node'),
      '#!/usr/bin/env bash\ncase "$*" in *split*) echo 22 ;; -p*) echo 22.14.0 ;; *) cat >/dev/null; echo 2.6.10 ;; esac\n',
      { mode: 0o755 },
    );
    fs.writeFileSync(
      path.join(fakeBin, 'npm'),
      '#!/usr/bin/env bash\necho "$*" >> "$NPM_LOG"\nif [ "$1" = "list" ]; then echo "{\\"dependencies\\":{}}"; fi\nexit 0\n',
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
          NPM_LOG: npmLog,
        },
      });
      assert.equal(result.status, 0, result.stderr);

      const npmCalls = fs.readFileSync(npmLog, 'utf8');
      assert.match(npmCalls, new RegExp(`install --global ${packageName.replaceAll('/', '\\/')}@latest`));

      const launcherPath = path.join(binDir, executable);
      assert.equal(fs.existsSync(launcherPath), false, `${appId} should use its package bin, not a generated SDK wrapper`);

      const receipt = JSON.parse(fs.readFileSync(path.join(installRoot, 'install-receipt.json'), 'utf8'));
      assert.equal(receipt.schema, 'agentsam.install.v2');
      assert.equal(receipt.app_id, appId);
      assert.equal(receipt.package, packageName);
      assert.equal(receipt.distribution, 'npm-global');
      assert.equal(receipt.requested_channel, 'latest');
      assert.equal(receipt.requested_version, null);
      assert.equal(receipt.executable, executable);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }
});

test('database-editor retains the legacy SDK wrapper until its package exposes a bin', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-install-database-'));
  const fakeBin = path.join(temp, 'fake-bin');
  const installRoot = path.join(temp, 'home');
  const binDir = path.join(temp, 'bin');
  const npmLog = path.join(temp, 'npm.log');
  fs.mkdirSync(fakeBin, { recursive: true });

  fs.writeFileSync(
    path.join(fakeBin, 'uname'),
    '#!/usr/bin/env bash\ncase "$1" in -s) echo Darwin ;; -m) echo arm64 ;; esac\n',
    { mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(fakeBin, 'node'),
    '#!/usr/bin/env bash\ncase "$*" in *split*) echo 22 ;; -p*) echo 22.14.0 ;; *) cat >/dev/null; echo 2.6.10 ;; esac\n',
    { mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(fakeBin, 'npm'),
    '#!/usr/bin/env bash\necho "$*" >> "$NPM_LOG"\nif [ "$1" = "list" ]; then echo "{\\"dependencies\\":{}}"; fi\nexit 0\n',
    { mode: 0o755 },
  );
  fs.writeFileSync(path.join(fakeBin, 'agentsam'), '#!/usr/bin/env bash\necho "agentsam 2.6.10"\n', {
    mode: 0o755,
  });

  try {
    const result = spawnSync('bash', [installScript, '--app-id', 'database-editor', '--prefix', binDir], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        HOME: temp,
        AGENTSAM_HOME: installRoot,
        NPM_LOG: npmLog,
      },
    });
    assert.equal(result.status, 0, result.stderr);

    const npmCalls = fs.readFileSync(npmLog, 'utf8');
    assert.match(npmCalls, /install --global @inneranimalmedia\/agentsam-sdk@latest/);

    const launcherPath = path.join(binDir, 'agentsam-database-editor');
    const launcher = fs.readFileSync(launcherPath, 'utf8');
    assert.match(launcher, /app preview database-editor/);

    const receipt = JSON.parse(fs.readFileSync(path.join(installRoot, 'install-receipt.json'), 'utf8'));
    assert.equal(receipt.app_id, 'database-editor');
    assert.equal(receipt.package, '@inneranimalmedia/agentsam-sdk');
    assert.equal(receipt.executable, launcherPath);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('install.sh rejects unknown --app-id values before installation', () => {
  const result = spawnSync('bash', [installScript, '--app-id', 'unknown'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown app/);
});

test('Local Studio Worker serves installer without AGENTSAM_DEFAULT_APP mutation', () => {
  const worker = fs.readFileSync(
    path.join(root, 'apps/local-studio/backend/worker/index.js'),
    'utf8',
  );
  const wrangler = fs.readFileSync(
    path.join(root, 'apps/local-studio/backend/wrangler.jsonc'),
    'utf8',
  );

  assert.match(worker, /import installScript from "\.\.\/\.\.\/\.\.\/\.\.\/scripts\/install\.sh"/);
  assert.doesNotMatch(worker, /APP_SELECTOR=\"\\\\\\$\\{AGENTSAM_DEFAULT_APP/);
  assert.match(worker, /text\/x-shellscript/);
  assert.match(wrangler, /\"type\": \"Text\"/);
  assert.match(wrangler, /\"\\*\\*\/\\*\.sh\"/);
});

test('desktop updater uses the InnerAnimalMedia update authority and has no active agentsam.dev endpoint', () => {
  const tauri = fs.readFileSync(
    path.join(root, 'packages/agentsam-desktop-shell/src-tauri/tauri.conf.json'),
    'utf8',
  );
  const updater = fs.readFileSync(
    path.join(root, 'packages/agentsam-desktop-shell/src-tauri/src/commands/updater.rs'),
    'utf8',
  );

  assert.match(tauri, /https:\/\/updates\.inneranimalmedia\.com\/updates\/local-studio/);
  assert.doesNotMatch(tauri, /updates\.agentsam\.dev/);
  assert.doesNotMatch(updater, /isn't configured yet|isn't set in tauri\.conf\.json/);
});
