import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  GO_WORKER_PACKAGE,
  discoverGoRuntime,
  resolveProductRoot,
} from '../../src/go/discover.js';

const SDK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PRODUCT_ROOT = path.join(SDK_ROOT, 'apps', 'agentsam-go-worker');

test('installed Go Worker package is discovered outside the monorepo', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-go-distribution-'));
  const packageRoot = path.join(temp, 'node_modules', ...GO_WORKER_PACKAGE.split('/'));
  fs.mkdirSync(path.dirname(packageRoot), { recursive: true });
  fs.symlinkSync(PRODUCT_ROOT, packageRoot, 'dir');

  const discovery = discoverGoRuntime(temp);
  assert.equal(discovery.schema, 'agentsam.go-discovery.v2');
  assert.equal(discovery.runtime?.origin, 'installed_package');
  assert.equal(discovery.distribution?.package_name, GO_WORKER_PACKAGE);
  assert.equal(discovery.distribution?.package_version, '0.1.0');
  assert.equal(fs.realpathSync(resolveProductRoot(discovery)), fs.realpathSync(PRODUCT_ROOT));
});
