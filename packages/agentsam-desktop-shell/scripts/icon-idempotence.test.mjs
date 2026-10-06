import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, statSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { composePlatformAppIcons } from './compose-app-icon.mjs';

function mtimeNs(filePath) {
  return statSync(filePath, { bigint: true }).mtimeNs;
}

test('identical app-icon composition is content-idempotent', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'agentsam-icon-idempotence-'));
  try {
    const iconsDir = path.join(root, 'icons');
    mkdirSync(iconsDir, { recursive: true });

    writeFileSync(
      path.join(root, 'mark.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="currentColor" d="M10 10h80v80H10z"/></svg>\n',
    );

    const manifest = {
      app_icon: {
        mark: 'mark.svg',
        surfaces: {
          default: {
            base: '#12141a',
            raised: '#1a1d26',
            mark_fill: '#e8eaef',
          },
        },
        profiles: {
          macos: {
            surface: 'default',
            size: 1024,
            optical_scale: 0.74,
          },
        },
      },
    };

    const targetIcon = path.join(iconsDir, 'icon.png');
    const master = path.join(iconsDir, 'icon-1024-master.png');

    const first = await composePlatformAppIcons({
      manifest,
      shellRoot: root,
      iconsDir,
      targetIcon,
    });

    assert.equal(first.composed, true);
    assert.equal(first.tauriInputChanged, true);

    const firstTargetBytes = readFileSync(targetIcon);
    const firstMasterBytes = readFileSync(master);
    const firstTargetMtime = mtimeNs(targetIcon);
    const firstMasterMtime = mtimeNs(master);

    const second = await composePlatformAppIcons({
      manifest,
      shellRoot: root,
      iconsDir,
      targetIcon,
    });

    assert.equal(second.composed, true);
    assert.equal(second.tauriInputChanged, false);
    assert.deepEqual(readFileSync(targetIcon), firstTargetBytes);
    assert.deepEqual(readFileSync(master), firstMasterBytes);
    assert.equal(mtimeNs(targetIcon), firstTargetMtime);
    assert.equal(mtimeNs(master), firstMasterMtime);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
