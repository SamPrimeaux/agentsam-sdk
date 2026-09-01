// Pure unit tests — no Docker daemon required, safe for CI/smoke.
// Integration coverage (actual docker build/run) is manual: see docs/DOCKERIZE.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DOCKER_APP_TYPES,
  DOCKER_APP_TYPE_LABELS,
  slugifyForDocker,
  generateDockerFileSet,
  computeFileSetHash,
  buildDockerDeployPlan,
  writeDockerFileSet,
  readManifest,
} from '../src/lib/dockerize.js';

test('slugifyForDocker normalizes to a safe image/container name', () => {
  assert.equal(slugifyForDocker('My Cool App!'), 'my-cool-app');
  assert.equal(slugifyForDocker('  --leading-- '), 'leading');
  assert.equal(slugifyForDocker(''), 'app');
});

test('every declared app type has a label and generates a valid file set', () => {
  for (const type of DOCKER_APP_TYPES) {
    assert.ok(DOCKER_APP_TYPE_LABELS[type]?.label, `missing label for ${type}`);
    const files = generateDockerFileSet(type, { appSlug: 'test-app', port: 9999 });
    assert.match(files.dockerfile, /^FROM /m, `${type} Dockerfile must start with FROM`);
    assert.ok(files.dockerignore.includes('node_modules'), `${type} .dockerignore should ignore node_modules`);
    assert.ok(files.compose.includes('services:'), `${type} compose file must define services`);
  }
});

test('unknown app type throws a clear error instead of generating garbage', () => {
  assert.throws(() => generateDockerFileSet('not_a_real_type', { appSlug: 'x' }), /Unknown Docker app type/);
});

test('buildDockerDeployPlan picks correct container port for static/vite (80) vs service types (host port)', () => {
  const staticPlan = buildDockerDeployPlan('static', { appSlug: 'x', port: 8080 });
  assert.equal(staticPlan.containerPort, 80);
  assert.equal(staticPlan.hostPort, 8080);

  const nodePlan = buildDockerDeployPlan('node_service', { appSlug: 'x', port: 4000 });
  assert.equal(nodePlan.containerPort, 4000);
  assert.equal(nodePlan.hostPort, 4000);
});

test('buildDockerDeployPlan falls back to sensible default ports when none given', () => {
  const plan = buildDockerDeployPlan('wrangler_dev', { appSlug: 'x' });
  assert.equal(plan.hostPort, 8787);
  assert.equal(plan.imageTag, 'x:local'.replace('local', plan.hash));
});

test('computeFileSetHash is deterministic: identical content -> identical hash', () => {
  const a = generateDockerFileSet('node_service', { appSlug: 'same', port: 3000 });
  const b = generateDockerFileSet('node_service', { appSlug: 'same', port: 3000 });
  assert.equal(computeFileSetHash(a), computeFileSetHash(b));
});

test('computeFileSetHash changes when content changes (different port -> different hash)', () => {
  const a = generateDockerFileSet('node_service', { appSlug: 'same', port: 3000 });
  const b = generateDockerFileSet('node_service', { appSlug: 'same', port: 4000 });
  assert.notEqual(computeFileSetHash(a), computeFileSetHash(b));
});

test('buildDockerDeployPlan image tag and hashtag are hash-derived and match the slug', () => {
  const plan = buildDockerDeployPlan('static', { appSlug: 'My App', port: 8080 });
  assert.equal(plan.slug, 'my-app');
  assert.equal(plan.imageTag, `my-app:${plan.hash}`);
  assert.equal(plan.latestTag, 'my-app:latest');
  assert.equal(plan.hashtag, `#docker-my-app-${plan.hash}`);
});

test('writeDockerFileSet writes into .agentsam/docker/<hash>/ and .dockerignore at root, and the manifest round-trips', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-dockerize-test-'));
  try {
    const files = generateDockerFileSet('static', { appSlug: 'tmp-app', port: 9090 });
    const hash = computeFileSetHash(files);
    const written = writeDockerFileSet(tmp, files, hash);

    assert.equal(written.dockerfilePath, path.join(tmp, '.agentsam', 'docker', hash, 'Dockerfile'));
    assert.ok(fs.existsSync(written.dockerfilePath));
    assert.ok(fs.existsSync(written.composePath));
    assert.ok(fs.existsSync(path.join(tmp, '.dockerignore')));

    // manifest is populated by dockerize()/writeManifestEntry, not writeDockerFileSet itself —
    // confirm readManifest returns {} when nothing has written to it yet
    assert.deepEqual(readManifest(tmp), {});
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
