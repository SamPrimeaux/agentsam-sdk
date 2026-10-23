import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const cadRoute = read('frontend/src/routes/(apps)/cad.tsx');
const samSketchRoute = read('frontend/src/routes/(apps)/samsketch.tsx');
const navRail = read('frontend/src/components/shell/nav-rail.tsx');
const routeTree = read('frontend/src/routeTree.gen.ts');
const cadManifest = JSON.parse(readFileSync(resolve(root, '../../apps/cad-creator/agentsam.app.json'), 'utf8'));
const samSketchManifest = JSON.parse(readFileSync(resolve(root, '../../apps/samsketch/agentsam.app.json'), 'utf8'));
const desktopManifest = JSON.parse(readFileSync(resolve(root, '../../packages/agentsam-desktop-shell/manifests/local-studio.json'), 'utf8'));
const desktopSchema = readFileSync(resolve(root, '../../packages/agentsam-desktop-shell/manifests/schema.json'), 'utf8');
const ownerProjectSource = readFileSync(resolve(root, '../../apps/cad-creator/frontend/src/lib/owner-project-source.ts'), 'utf8');

test('CAD Creator and SamSketch remain distinct products with distinct canonical identities', () => {
  assert.equal(cadManifest.id, 'cad-creator');
  assert.equal(samSketchManifest.id, 'samsketch');
  assert.notEqual(cadManifest.id, samSketchManifest.id);
  assert.match(navRail, /href="\/samsketch"[\s\S]*SamSketch/);
  assert.match(navRail, /href="\/cad"[\s\S]*CAD Creator/);
});

test('SamSketch owns its route and mounts its own scene-authoring bundle', () => {
  assert.match(samSketchRoute, /createFileRoute\("\/\(apps\)\/samsketch"\)/);
  assert.match(samSketchRoute, /src="\/samsketch\/index\.html\?presentation=embedded"/);
  assert.match(samSketchRoute, /app: "SamSketch"/);
  assert.doesNotMatch(samSketchRoute, /Navigate to="\/cad"/);
});

test('CAD Creator owns its CAD route and never embeds SamSketch as a substitute workspace', () => {
  assert.match(cadRoute, /createFileRoute\("\/\(apps\)\/cad"\)/);
  assert.match(cadRoute, /src="\/cad-creator\/index\.html\?presentation=embedded&access=owner"/);
  assert.doesNotMatch(cadRoute, /SamSketch|samsketch|DreamHouse BIM|CAD_WORKSPACES/);
});

test('DreamHouse remains a project loaded through local project authority, not a product route', () => {
  assert.match(ownerProjectSource, /OWNER_DREAMHOUSE_PROJECT_ID/);
  assert.match(ownerProjectSource, /design_project_get/);
  assert.doesNotMatch(routeTree, /path: ['"]\/dreamhouse['"]/);
  assert.doesNotMatch(navRail, /href="\/dreamhouse"/);
});

test('desktop included apps are an explicit build-time option, not runtime installation proof', () => {
  assert.ok(Array.isArray(desktopManifest.included_apps));
  assert.match(desktopSchema, /included_apps/);
  assert.match(desktopSchema, /Optional sibling APP ids/);
  assert.match(desktopSchema, /Empty\/omitted = host-only/);
});
