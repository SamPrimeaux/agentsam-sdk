import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, before, after } from 'node:test';
import {
  createLocalFilesystem,
  createTempWorkspaceRoot,
  LOCAL_FS_ENGINE,
} from '../../src/local-fs/index.js';
import { resolveContainedPath } from '../../src/local-fs/paths.js';

describe('local-fs path containment', () => {
  /** @type {string} */
  let root;
  before(() => {
    root = createTempWorkspaceRoot();
    fs.writeFileSync(path.join(root, 'ok.txt'), 'hello\n');
    fs.mkdirSync(path.join(root, 'sub'));
  });
  after(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('resolves relative paths inside root', () => {
    const r = resolveContainedPath(root, 'ok.txt');
    assert.equal(r.ok, true);
    assert.equal(r.rel, 'ok.txt');
  });

  it('rejects traversal', () => {
    const r = resolveContainedPath(root, '../outside.txt');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'path_escape');
  });

  it('rejects NUL', () => {
    const r = resolveContainedPath(root, 'a\0b.txt');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'invalid_path');
  });

  it('rejects symlink escape when possible', () => {
    const outside = createTempWorkspaceRoot('agentsam-fs-out-');
    try {
      fs.writeFileSync(path.join(outside, 'secret.txt'), 'nope');
      const link = path.join(root, 'escape-link');
      try {
        fs.symlinkSync(path.join(outside, 'secret.txt'), link);
      } catch {
        // Windows may lack symlink privilege — skip
        return;
      }
      const r = resolveContainedPath(root, 'escape-link');
      assert.equal(r.ok, false);
      assert.equal(r.code, 'path_escape');
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('local-fs operations', () => {
  /** @type {string} */
  let root;
  /** @type {ReturnType<typeof createLocalFilesystem>} */
  let fsApi;

  before(() => {
    root = createTempWorkspaceRoot();
    fsApi = createLocalFilesystem(root);
  });
  after(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('create / read / write with version conflict detection', () => {
    assert.equal(fsApi.engine, LOCAL_FS_ENGINE);
    const created = fsApi.create('README.md', '# one\n');
    assert.equal(created.ok, true);
    const v1 = created.version;

    const read1 = fsApi.read('README.md');
    assert.equal(read1.ok, true);
    assert.equal(read1.content, '# one\n');
    assert.equal(read1.version, v1);

    const conflict = fsApi.write('README.md', '# stale\n', { expectedVersion: 'sha256:dead' });
    assert.equal(conflict.ok, false);
    assert.equal(conflict.code, 'version_conflict');

    const wrote = fsApi.write('README.md', '# two\n', { expectedVersion: v1 });
    assert.equal(wrote.ok, true);
    assert.notEqual(wrote.version, v1);
    assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), '# two\n');
  });

  it('list / rename / remove', () => {
    fsApi.create('a.txt', 'a');
    fsApi.mkdir('dir');
    const listed = fsApi.list('.');
    assert.equal(listed.ok, true);
    assert.ok(listed.entries.some((e) => e.path === 'a.txt'));

    const renamed = fsApi.rename('a.txt', 'b.txt');
    assert.equal(renamed.ok, true);
    assert.ok(fs.existsSync(path.join(root, 'b.txt')));
    assert.equal(fs.existsSync(path.join(root, 'a.txt')), false);

    const removed = fsApi.remove('b.txt');
    assert.equal(removed.ok, true);
    assert.equal(fs.existsSync(path.join(root, 'b.txt')), false);
  });
});
