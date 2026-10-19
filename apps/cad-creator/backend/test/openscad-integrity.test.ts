import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { executeOpenScadCompiler } from '../src/cad/openscad';
import { executeOpenScadDocker } from '../src/cad/docker-executor';
import { discoverOpenScad } from '../src/cad/discovery';

const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const artifact = Buffer.from('solid integration\nendsolid integration\n', 'utf8');
const base = {
  ok: true,
  filename: 'integration.stl',
  format: 'stl',
  size_bytes: artifact.length,
  sha256: digest(artifact),
  artifact_base64: artifact.toString('base64'),
};

function mockFetch(body: object) {
  return async () => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

test('Docker OpenSCAD returns a hash independently verified against exact artifact bytes', async () => {
  const result = await executeOpenScadDocker({
    source: 'cube([1,2,3]);', outputFormat: 'stl',
    serviceUrl: 'http://127.0.0.1:8793', fetchImpl: mockFetch(base) as typeof fetch,
  });
  assert.equal(result.success, true);
  assert.equal(result.sha256, digest(artifact));
  assert.equal(result.sizeBytes, artifact.length);
  assert.equal(result.artifactBase64, artifact.toString('base64'));
});

test('Docker OpenSCAD rejects modified artifact bytes and mismatched size', async () => {
  for (const body of [
    { ...base, artifact_base64: Buffer.from('altered').toString('base64') },
    { ...base, size_bytes: base.size_bytes + 1 },
    { ...base, sha256: null },
  ]) {
    await assert.rejects(
      executeOpenScadDocker({
        source: 'cube([1,2,3]);', outputFormat: 'stl',
        serviceUrl: 'http://127.0.0.1:8793', fetchImpl: mockFetch(body) as typeof fetch,
      }),
      /cad_openscad_artifact_integrity_mismatch/,
    );
  }
});

test('native OpenSCAD produces SHA-256 matching generated artifact bytes', async (t) => {
  if (!discoverOpenScad(process.env).binary) {
    t.skip('Local OpenSCAD executable is not installed');
    return;
  }
  const result = await executeOpenScadCompiler({
    source: 'cube([4,4,4]);', outputFormat: 'stl',
    filename: 'integrity-cube.stl', timeoutMs: 25_000,
  });
  assert.equal(result.success, true);
  assert.equal(result.engine, 'openscad-native');
  const bytes = Buffer.from(result.artifactContent, 'utf8');
  assert.equal(result.sizeBytes, bytes.length);
  assert.equal(result.sha256, digest(bytes));
  assert.match(result.sha256!, /^[a-f0-9]{64}$/);
});
