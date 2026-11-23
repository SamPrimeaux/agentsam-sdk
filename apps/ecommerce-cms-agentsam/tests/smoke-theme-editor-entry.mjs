#!/usr/bin/env node
/** Contract smoke for the single site-scoped Theme Studio entry/runtime. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chooseThemeEditorSite, planThemeEditorEntry } from '../frontend/static/js/theme-editor-entry-resolution.mjs';
import { parseThemeEditorLocation } from '../frontend/theme-editor/routes.mjs';
import { adminRouteForPath } from '../backend/lib/route-manifest.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const siteA = { id:'site_a', name:'Agency site', status:'active', is_default:1 };
const siteB = { id:'site_b', name:'Private draft', status:'draft', is_default:0 };
const home = { id:'page_home_a', site_id:'site_a', slug:'home', route_path:'/', is_homepage:true };
const project = { id:'theme_revise', pages:[{slug:'home'},{slug:'journal'}] };

assert.equal(chooseThemeEditorSite({sites:[siteA,siteB]}).reason, 'site_selection_required');
assert.equal(chooseThemeEditorSite({sites:[siteA,siteB],requestedSiteId:'site_b'}).site.id, 'site_b');

const pageEntry = planThemeEditorEntry({site:siteA,location:'/admin/theme-editor',pages:[home]});
assert.equal(pageEntry.to, '/admin/sites/site_a/pages/page_home_a/editor');

const projectEntry = planThemeEditorEntry({
  site:siteB,
  location:'/admin/theme-editor?slug=journal',
  pages:[],
  projects:[project],
});
assert.equal(projectEntry.to, '/admin/sites/site_b/themes/theme_revise/editor/journal');

for (const path of [
  '/admin/sites/site_a/pages/page_home_a/editor',
  '/admin/sites/site_b/themes/theme_revise/editor/home',
  '/admin/sites/site_b/themes/theme_revise/editor/journal',
  '/admin/sites/site_a/settings/editor',
]) {
  assert.equal(adminRouteForPath(path)?.page, 'theme-editor', path);
}

assert.deepEqual(
  parseThemeEditorLocation(new URL('https://studio.test/admin/sites/site_b/themes/theme_revise/editor/journal?previewMode=tablet')),
  {mode:'project',siteId:'site_b',projectId:'theme_revise',pageSlug:'journal',legacy:false},
);
assert.deepEqual(
  parseThemeEditorLocation(new URL('https://studio.test/admin/sites/site_a/pages/page_home_a/editor')),
  {mode:'page',siteId:'site_a',pageId:'page_home_a',pageSlug:null,legacy:false},
);
assert.deepEqual(
  parseThemeEditorLocation(new URL('https://studio.test/admin/sites/site_a/themes/new/editor')),
  {mode:'new',siteId:'site_a',legacy:false},
);

const shell = read('../frontend/static/theme-editor.html');
const alias = read('../frontend/static/theme-project-editor.html');
const bootstrap = read('../frontend/static/js/theme-studio-bootstrap.mjs');
assert.match(shell,/theme-studio-bootstrap\.mjs/);
assert.doesNotMatch(shell,/theme-project-editor-bootstrap|theme-editor-entry\.js/);
assert.match(alias,/location\.replace/);
assert.doesNotMatch(alias,/<iframe|theme-studio-bootstrap|theme-project-editor-bootstrap/);
assert.match(bootstrap,/createThemeProjectAdapter/);
assert.match(bootstrap,/createCmsPageThemeEditorAdapter/);
assert.match(bootstrap,/bootNewTheme/);
assert.match(bootstrap,/blankThemeProject/);
assert.match(bootstrap,/inheritDefaultTemplates/);
assert.match(bootstrap,/fillMissingThemeChrome/);
assert.equal((bootstrap.match(/mountThemeEditor\(frame, host/g)||[]).length,1);

console.log('PASS single Theme Studio route, ownership, page/theme adapters, and legacy redirect');
