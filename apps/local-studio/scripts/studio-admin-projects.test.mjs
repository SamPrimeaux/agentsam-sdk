import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalStudioPath, isStudioAdminPath, STUDIO_ADMIN_MOUNTS } from '../shared/studio-admin-routes.mjs';
import { resolveConsoleFile } from '../backend/worker/packaged-console.js';
import { mountRequiresAuth } from '../../../packages/identity/src/server/mount-policy.js';

const source = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('canonical Projects owns one host-neutral Work UI; old flat paths redirect without leaks', () => {
  assert.deepEqual(STUDIO_ADMIN_MOUNTS.map((mount) => mount.canonical), [
    '/admin/projects', '/admin/home', '/admin/store', '/admin/onboarding-preview', '/admin/agentsam', '/admin/cad', '/admin/moviemode',
  ]);
  assert.equal(canonicalStudioPath('/samsketch'), null, 'SamSketch owns /samsketch; never redirect into CAD');
  assert.equal(canonicalStudioPath('/media'), null, 'Media Library owns /media; MovieMode is Apps-only');
  assert.equal(canonicalStudioPath('/projects'), '/admin/projects');
  assert.equal(canonicalStudioPath('/projects/proj_123'), '/admin/projects/proj_123');
  assert.equal(canonicalStudioPath('/admin/home'), null, 'canonical commerce home must not redirect to itself');
  assert.equal(canonicalStudioPath('/admin/moviemode/edit'), null, 'canonical MovieMode editor deep link must never self-redirect');
  assert.equal(canonicalStudioPath('/admin/moviemode/edit/'), '/admin/moviemode/edit', 'editor deep-link slash normalized once');
  assert.equal(canonicalStudioPath('/admin/moviemode/'), '/admin/moviemode', 'canonical app slash normalized once');
  assert.equal(canonicalStudioPath('/admin/cad/edit'), null, 'canonical CAD child must never self-redirect');
  assert.equal(canonicalStudioPath('/admin/home/'), '/admin/home', 'canonical commerce home tolerates a trailing slash');
  assert.equal(canonicalStudioPath('/projects-other'), null);
  assert.equal(canonicalStudioPath('/public/projects'), null);
  assert.equal(canonicalStudioPath('/api/projects'), null);
  assert.ok(isStudioAdminPath('/admin/projects'));
  assert.ok(isStudioAdminPath('/admin/home'));
  assert.ok(isStudioAdminPath('/admin/projects/proj_123'));
  assert.equal(isStudioAdminPath('/admin/projects-other'), false);
  assert.equal(isStudioAdminPath('/admin/store'), true);
  assert.equal(isStudioAdminPath('/admin/onboarding-preview'), true);
  assert.equal(isStudioAdminPath('/admin/agentsam'), true);
  assert.equal(isStudioAdminPath('/admin/cad'), true);
  assert.equal(isStudioAdminPath('/admin/moviemode'), true);
  assert.equal(isStudioAdminPath('/admin/products'), false);
});
test('AgentSam canonical route requires authentication and preserves legacy child routes', () => {
  const manifest = JSON.parse(source('agentsam.app.json'));
  assert.equal(manifest.routes.entry, '/admin/agentsam');
  assert.equal(mountRequiresAuth('/admin/agentsam', manifest), true);
  assert.equal(mountRequiresAuth('/admin/agentsam/new', manifest), true);
  assert.equal(canonicalStudioPath('/agentsam'), '/admin/agentsam');
  assert.equal(canonicalStudioPath('/agentsam/apps/cad'), null);
  assert.equal(resolveConsoleFile('/admin/agentsam'), null);
  assert.match(source('frontend/src/routes/(apps)/admin/agentsam.tsx'), /component: AgentSamPage/);
});
test('Studio owns the authenticated home entry while installed Ecommerce pages keep their product owner', () => {
  assert.equal(resolveConsoleFile('/admin/projects'), null);
  assert.equal(resolveConsoleFile('/admin/agentsam'), null);
  assert.equal(resolveConsoleFile('/admin/projects/proj_123'), null);
  assert.equal(resolveConsoleFile('/admin/home'), null);
  assert.equal(resolveConsoleFile('/admin/home', { allowEmbeddedHome: true }), 'home.html');
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
  const canonicalRedirect = worker.indexOf('canonicalStudioPath(url.pathname)');
  const packagedConsoleRoute = worker.indexOf('servePackagedConsole(');
  assert.ok(canonicalRedirect >= 0 && packagedConsoleRoute > canonicalRedirect,
    'legacy route redirects must run before any packaged console response');
  assert.match(worker, /status: 301/);
});
