import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalStudioPath, isStudioAdminPath, STUDIO_ADMIN_MOUNTS } from '../shared/studio-admin-routes.mjs';
import { resolveConsoleFile } from '../backend/worker/packaged-console.js';

const source = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('canonical Projects owns one host-neutral Work UI; old flat paths redirect without leaks', () => {
  assert.deepEqual(STUDIO_ADMIN_MOUNTS.map((mount) => mount.canonical), ['/admin/projects']);
  assert.equal(canonicalStudioPath('/projects'), '/admin/projects');
  assert.equal(canonicalStudioPath('/projects/proj_123'), '/admin/projects/proj_123');
  assert.equal(canonicalStudioPath('/projects-other'), null);
  assert.equal(canonicalStudioPath('/public/projects'), null);
  assert.equal(canonicalStudioPath('/api/projects'), null);
  assert.ok(isStudioAdminPath('/admin/projects'));
  assert.ok(isStudioAdminPath('/admin/projects/proj_123'));
  assert.equal(isStudioAdminPath('/admin/projects-other'), false);
  assert.equal(isStudioAdminPath('/admin/agentsam'), false);
});
test('the Ecommerce mount does not capture Studio Projects; existing product pages keep their owner', () => {
  assert.equal(resolveConsoleFile('/admin/projects'), null);
  assert.equal(resolveConsoleFile('/admin/projects/proj_123'), null);
  assert.equal(resolveConsoleFile('/admin/home'), 'home.html');
  assert.equal(resolveConsoleFile('/admin/pages'), 'pages.html');
  assert.equal(resolveConsoleFile('/admin/growth'), 'growth.html');
});
test('Projects route uses the existing Work product and authenticated HTTP snapshot, not bundled fixtures', () => {
  for (const file of [
    'frontend/src/routes/(apps)/admin/projects/index.tsx',
    'frontend/src/routes/(apps)/admin/projects/$projectId.tsx',
  ]) assert.match(source(file), /LocalStudioWorkPage/);
  assert.match(source('frontend/src/components/work/LocalStudioWorkPage.tsx'), /createHttpWorkHost/);
  assert.match(source('backend/worker/work-service.js'), /listProjects\(env\.DB, accountId, tickets\)/);
  assert.match(source('backend/worker/work-data.js'), /WHERE owner_user_id = \?/);
  const worker = source('backend/worker/index.js');
  assert.ok(worker.indexOf('canonicalStudioPath(url.pathname)') < worker.indexOf('servePackagedConsole(request, env.ASSETS)'));
  assert.match(worker, /status: 301/);
});
