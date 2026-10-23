import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const cmsFrame = read('frontend/src/components/sites/CmsOnlineStoreFrame.tsx');
const sitesPage = read('frontend/src/components/sites/SitesStudioPage.tsx');
const cmsRoute = read('frontend/src/routes/(apps)/cms.tsx');
const globalShell = read('frontend/agentsam/AgentSamShell.tsx');
const docsHome = read('frontend/src/routes/(apps)/docs.tsx');
const cmsGuide = read('frontend/src/routes/(apps)/help/cms.tsx');
const routeTree = read('frontend/src/routeTree.gen.ts');

test('content-only CMS shows setup actions without impersonating a live storefront', () => {
  assert.match(cmsFrame, /Your store is taking shape\./);
  assert.match(cmsFrame, /Storefront not configured/);
  assert.match(cmsFrame, /Waiting for connection/);
  assert.match(cmsFrame, /onOpenThemes/);
  assert.match(cmsFrame, /onOpenHelp/);
  assert.doesNotMatch(cmsFrame, /Content project · Theme not installed/);
});

test('Sites distinguishes content-only records from connected storefronts and local drafts', () => {
  assert.match(sitesPage, /Connected sites and content projects/);
  assert.match(sitesPage, /Content-only project/);
  assert.match(sitesPage, /No local theme drafts yet/);
  assert.doesNotMatch(sitesPage, /No saved sites on this installation yet/);
});

test('global and contextual help icons lead to real documentation routes', () => {
  assert.match(globalShell, /Help & documentation/);
  assert.match(globalShell, /go\('\/docs'\)/);
  assert.match(cmsRoute, /<Navigate[\s\S]*to="\/apps\/ecommerce-cms-agentsam"[\s\S]*search=\{\{ page: '\/admin\/store' \}\}/);
  assert.match(docsHome, /createFileRoute\('\/\(apps\)\/docs'\)/);
  assert.match(sitesPage, /go\('\/help\/cms'\)/);
  assert.match(cmsGuide, /createFileRoute\('\/\(apps\)\/help\/cms'\)/);
  assert.match(cmsGuide, /From theme to a verified storefront/);
  assert.match(routeTree, /path: '\/docs'/);
  assert.match(routeTree, /path: '\/help\/cms'/);
});
