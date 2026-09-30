import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cmsBin = path.join(root, 'apps/client-cms-editor/bin/agentsam-cms.mjs');

function scaffold(persistence, extraArgs = []) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-cms-scaffold-'));
  const target = path.join(temp, 'editor');
  execFileSync(process.execPath, [
    cmsBin,
    'scaffold',
    target,
    '--persistence',
    persistence,
    ...extraArgs,
  ], { cwd: root, stdio: 'pipe' });
  return { temp, target };
}

test('CMS editor scaffold is self-contained and records SQLite authority', () => {
  const { temp, target } = scaffold('sqlite');
  try {
    assert.equal(fs.existsSync(path.join(target, 'agentsam.app.json')), true);
    assert.equal(fs.existsSync(path.join(target, 'cms.config.json')), true);
    assert.equal(fs.existsSync(path.join(target, '.agentsam/cms.sqlite')), true);
    assert.equal(fs.existsSync(path.join(target, '.agentsam/assets')), true);
    assert.equal(fs.existsSync(path.join(target, 'public')), true);

    const cfg = JSON.parse(fs.readFileSync(path.join(target, 'cms.config.json'), 'utf8'));
    assert.equal(cfg.schema, 'agentsam.cms.project.v1');
    assert.equal(cfg.persistence, 'sqlite');
    assert.equal(cfg.dbPath, '.agentsam/cms.sqlite');
    assert.equal(cfg.cmsBase, '/cms');
    assert.equal(cfg.auth?.mode, 'local-dev-principal');

    const app = JSON.parse(fs.readFileSync(path.join(target, 'agentsam.app.json'), 'utf8'));
    assert.equal(app.schema, 'agentsam.app.v1');
    assert.equal(app.product_id, 'cms');
    assert.equal(app.package, '@inneranimalmedia/client-cms-editor');

    // Lean project shell — no monorepo package vendoring / file: escapes.
    assert.equal(fs.existsSync(path.join(target, 'packages')), false);
    assert.equal(fs.existsSync(path.join(target, 'frontend/package.json')), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('CMS editor rejects localStorage as persistence authority', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-cms-scaffold-'));
  const target = path.join(temp, 'editor');
  try {
    assert.throws(
      () => execFileSync(process.execPath, [
        cmsBin,
        'scaffold',
        target,
        '--persistence',
        'localStorage',
      ], { cwd: root, stdio: 'pipe', encoding: 'utf8' }),
      (error) => {
        const message = String(error?.stderr || error?.message || error);
        return /unsupported persistence "localStorage"/i.test(message)
          && /choose sqlite or d1/i.test(message);
      },
    );
    assert.equal(fs.existsSync(target), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
