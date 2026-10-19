import assert from 'node:assert/strict';
import test from 'node:test';
import { createCadHttpPorts } from '../../src/sam/packs/cad/http-ports.js';
import { handleCadArtifact } from '../../apps/cad-creator/backend/worker/cad-storage.js';

test('SAM authenticated CAD ports write, read, list, delete through existing Worker R2/D1 routes', async () => {
  const files = new Map(), statements = [];
  const env = {
    CAD_AUTH_VERIFIER: { fetch: async () => Response.json({
      active: true, sub: 'au_verified', aud: 'cad-creator', projects: ['project-test'],
      scope: 'cad:artifact.read cad:artifact.write cad:artifact.delete',
      tenant_id: 'tenant-from-verifier', workspace_id: 'workspace-from-verifier',
    }) },
    WEBSITE_ASSETS: {
      get: async k => files.get(k) ?? null, head: async k => files.get(k) ?? null,
      delete: async k => { files.delete(k); },
      put: async (k, buffer, opts) => { files.set(k, {
        key: k, size: buffer.byteLength, customMetadata: opts.customMetadata,
        httpMetadata: opts.httpMetadata, arrayBuffer: async () => buffer,
      }); },
      list: async ({ prefix }) => ({ objects: [...files.values()].filter(x => x.key.startsWith(prefix)), truncated: false }),
    },
    DB: { prepare: sql => ({ bind: (...args) => ({
      run: async () => { statements.push({ sql, args }); return { success: true }; },
    }) }) },
  };
  const ports = createCadHttpPorts({
    request: (url, init, principal) => {
      assert.deepEqual(principal, { id: 'trusted-session' });
      return handleCadArtifact(new Request('https://cad.test' + url, {
        ...init, headers: { ...init.headers, authorization: 'Bearer token-resolved-by-host' },
      }), env);
    },
  });
  const scope = { principal: { id: 'trusted-session' } };
  const bytes = Buffer.from('ISO-10303-21;\nEND-ISO-10303-21;\n');
  const args = { project_id: 'project-test', revision: 1, file: 'model.step' };
  const put = await ports.artifacts.put({ ...args, bytes }, scope);
  assert.equal(put.db.registered, true);
  assert.equal((await ports.artifacts.get(args, scope)).bytes.toString(), bytes.toString());
  assert.equal((await ports.artifacts.list({ project_id: args.project_id, revision: args.revision }, scope))[0].name, 'model.step');
  await assert.rejects(ports.artifacts.put({ ...args, bytes }, scope), /cad_revision_artifact_exists/);
  const updated = Buffer.from('ISO-10303-21;\nDATA;\nEND-ISO-10303-21;\n');
  assert.equal((await ports.artifacts.put({ ...args, bytes: updated, ifMatchSha256: put.sha256 }, scope)).bytes, updated.length);
  assert.equal((await ports.artifacts.get(args, scope)).bytes.toString(), updated.toString());
  assert.equal((await ports.artifacts.delete(args, scope)).deleted, true);
  assert.equal(files.size, 0);
  assert.ok(statements.length >= 3);
  await assert.rejects(ports.artifacts.get({ ...args, project_id: '../escape' }, scope), /sam_cad_artifact_path_invalid/);
});
