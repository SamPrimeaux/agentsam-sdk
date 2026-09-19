import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertProjectSlug, createCmsDbClient } from '../../apps/local-studio/backend/worker/cms-db.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const at = (...parts) => path.join(root, ...parts);
const read = (...parts) => fs.readFileSync(at(...parts), 'utf8');

test('CMS D1 query helper strictly enforces projectSlug tenancy invariant', () => {
  // Empty or invalid projectSlug must throw immediately
  assert.throws(() => assertProjectSlug(''), /CMS Tenancy Invariant Violation/);
  assert.throws(() => assertProjectSlug('   '), /CMS Tenancy Invariant Violation/);
  assert.throws(() => assertProjectSlug(null), /CMS Tenancy Invariant Violation/);
  assert.throws(() => assertProjectSlug(undefined), /CMS Tenancy Invariant Violation/);
  assert.throws(() => createCmsDbClient({}, ''), /CMS Tenancy Invariant Violation/);

  assert.equal(assertProjectSlug('agentsam-sdk'), 'agentsam-sdk');
});

test('Local Studio mounts CMS route with default site agentsam-sdk', () => {
  assert.ok(fs.existsSync(at('apps', 'local-studio', 'frontend', 'src', 'routes', '_app', 'cms.tsx')));
  const routeContent = read('apps', 'local-studio', 'frontend', 'src', 'routes', '_app', 'cms.tsx');

  // Must default to agentsam-sdk
  assert.match(routeContent, /"agentsam-sdk"/);
  assert.doesNotMatch(routeContent, /default\s*:\s*["']inneranimalmedia["']/);

  // Must use same-origin relative basePath
  assert.match(routeContent, /basePath="\/cms"/);

  // NavRail must include CMS entry
  const navRail = read('apps', 'local-studio', 'frontend', 'src', 'components', 'shell', 'nav-rail.tsx');
  assert.match(navRail, /to:\s*"\/cms"/);
  assert.match(navRail, /label:\s*"CMS"/);
});

test('Local Studio Worker dispatches /api/cms/* with strict tenant isolation', () => {
  const workerContent = read('apps', 'local-studio', 'backend', 'worker', 'index.js');
  assert.match(workerContent, /url\.pathname\.startsWith\("\/api\/cms\/"\)/);
  assert.match(workerContent, /handleCmsWorkerRequest/);

  const cmsService = read('apps', 'local-studio', 'backend', 'worker', 'cms-service.js');
  // Default fallback must be agentsam-sdk, never inneranimalmedia
  assert.match(cmsService, /'agentsam-sdk'/);
  assert.match(cmsService, /createCmsDbClient\(env\.DB,\s*siteSlug\)/);
});

test('homepage.html is decomposed into reusable site partials with relative links', () => {
  assert.ok(fs.existsSync(at('sites', 'agentsam-sdk', 'partials', 'header.html')));
  assert.ok(fs.existsSync(at('sites', 'agentsam-sdk', 'partials', 'footer.html')));

  const header = read('sites', 'agentsam-sdk', 'partials', 'header.html');
  const footer = read('sites', 'agentsam-sdk', 'partials', 'footer.html');
  const homepage = read('apps', 'frontend', 'public', 'site', 'homepage.html');

  // Relative navigation links
  assert.match(header, /href="\/work"/);
  assert.match(header, /href="\/about"/);
  assert.match(header, /href="\/services"/);
  assert.match(header, /href="\/contact"/);
  assert.match(header, /href="\/auth\/login\?next=\/agentsam"/);
  assert.doesNotMatch(header, /href="https:\/\/inneranimalmedia\.com\/(work|about|services|contact)"/);

  assert.match(footer, /href="\/work"/);
  assert.match(footer, /href="\/about"/);
  assert.match(footer, /href="\/services"/);
  assert.match(footer, /href="\/contact"/);
  assert.match(footer, /href="\/privacy"/);
  assert.match(footer, /href="\/terms"/);
  assert.match(footer, /href="\/sitemap"/);
  assert.doesNotMatch(footer, /href="https:\/\/inneranimalmedia\.com\/(work|about|services|contact|privacy|terms|sitemap)"/);

  // In homepage.html itself, workbench CTA points to /agentsam, not /dashboard/home
  assert.match(homepage, /href="\/auth\/login\?next=\/agentsam"/);
  assert.doesNotMatch(homepage, /href="\/auth\/login\?next=\/dashboard\/home"/);
});
