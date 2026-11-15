import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chooseThemeEditorSite,planThemeEditorEntry} from '../frontend/static/js/theme-editor-entry-resolution.mjs';

const siteA={id:'site_a',name:'Agency site',status:'active',is_default:1};
const siteB={id:'site_b',name:'Client site',status:'draft',is_default:0};
const home={id:'cmsp_home_a',site_id:'site_a',slug:'home',route_path:'/',is_homepage:true};
const about={id:'cmsp_about_a',site_id:'site_a',slug:'about',route_path:'/about'};
const project={id:'theme_revise',pages:[{slug:'home',title:'Home'},{slug:'journal',title:'Journal'}]};

test('site selection requires ownership and never silently falls back across two websites',()=>{
  assert.deepEqual(chooseThemeEditorSite({sites:[siteA,siteB]}),
    {kind:'unavailable',reason:'site_selection_required'});
  assert.equal(chooseThemeEditorSite({sites:[siteA,siteB],rememberedSiteId:'site_b'}).site.id,'site_b');
  assert.equal(chooseThemeEditorSite({sites:[siteA,siteB],requestedSiteId:'site_a',rememberedSiteId:'site_b'}).site.id,'site_a');
  assert.equal(chooseThemeEditorSite({sites:[siteA,siteB],requestedSiteId:'site_other'}).reason,'site_not_owned');
  assert.equal(chooseThemeEditorSite({sites:[siteA],rememberedSiteId:'site_other'}).site.id,'site_a');
  assert.equal(chooseThemeEditorSite({sites:[]}).reason,'no_sites');
});

test('bare editor chooses verified CMS homepage and preserves site and stable page IDs',()=>{
  const p=planThemeEditorEntry({site:siteA,location:'/admin/theme-editor',pages:[about,home]});
  assert.equal(p.kind,'redirect');
  assert.equal(p.to,'/admin/theme-editor?slug=home&site_id=site_a&page_id=cmsp_home_a');
  const other=planThemeEditorEntry({site:siteA,location:'/admin/theme-editor?slug=about&site_id=site_a',pages:[about,home]});
  assert.equal(other.to,'/admin/theme-editor?slug=about&site_id=site_a&page_id=cmsp_about_a');
});

test('installed private theme goes to its own site-scoped project editor, not an unrelated demo',()=>{
  const destination=planThemeEditorEntry({site:siteB,location:'/admin/theme-editor',
    pages:[{id:'cmsp_starter',site_id:'site_b',slug:'site',is_homepage:false}],projects:[project]});
  assert.equal(destination.kind,'redirect');
  assert.equal(destination.resource,'theme-project');
  assert.equal(destination.to,
    '/admin/theme-project-editor?project=theme_revise&site_id=site_b&page=home');
  const journal=planThemeEditorEntry({site:siteB,
    location:'/admin/theme-editor?slug=journal&site_id=site_b',projects:[project]});
  assert.equal(journal.to,
    '/admin/theme-project-editor?project=theme_revise&site_id=site_b&page=journal');
});

test('canonical deep-link page_id takes precedence and cannot resolve across sites',()=>{
  const wrong=planThemeEditorEntry({site:siteB,
    location:'/admin/theme-editor?slug=home&site_id=site_b&page_id=cmsp_home_a',
    pages:[home],projects:[project]});
  assert.equal(wrong.kind,'unavailable');
  assert.equal(wrong.reason,'page_not_in_site');
  const exact=planThemeEditorEntry({site:siteA,
    location:'/admin/theme-editor?slug=stale&site_id=site_a&page_id=cmsp_about_a',
    pages:[home,about],projects:[project]});
  assert.equal(exact.to,
    '/admin/theme-editor?slug=about&site_id=site_a&page_id=cmsp_about_a');
});

test('empty sites go to Pages for the selected owner; no mocked homepage is manufactured',()=>{
  const result=planThemeEditorEntry({site:siteA,location:'/admin/theme-editor',pages:[],projects:[]});
  assert.equal(result.to,'/admin/pages?site_id=site_a');
  assert.equal(planThemeEditorEntry({site:siteA,location:'/admin/theme-editor?slug=%2Fwrong',pages:[home]}).kind,'unavailable');
});

test('the live editor waits for account-owned route verification before CMS/preview initialization',()=>{
  const source=readFileSync(new URL('../frontend/static/js/theme-editor.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../frontend/static/theme-editor.html',import.meta.url),'utf8');
  const entry=readFileSync(new URL('../frontend/static/js/theme-editor-entry.js',import.meta.url),'utf8');
  assert.ok(source.includes('await window.__agentsamThemeEditorEntryReady'));
  assert.ok(source.indexOf('await window.__agentsamThemeEditorEntryReady') <
    source.indexOf("const params = new URLSearchParams(location.search)"));
  assert.ok(html.indexOf('theme-editor-entry.js') < html.indexOf('/admin/js/theme-editor.js'));
  assert.match(entry,/\/api\/admin\/cms\/sites/);
  assert.match(entry,/\/api\/admin\/cms\/pages\?site_id=/);
  assert.match(entry,/\/api\/admin\/cms\/theme-projects\?site_id=/);
});


test('Theme Studio editor bootstraps an account scope without requiring or inventing a site',()=>{
  const bootstrap=readFileSync(new URL('../frontend/static/js/theme-project-editor-bootstrap.mjs',import.meta.url),'utf8');
  const editor=readFileSync(new URL('../frontend/static/theme-project-editor.html',import.meta.url),'utf8');
  const workspace=readFileSync(new URL('../frontend/static/js/theme-workspace-loader.js',import.meta.url),'utf8');
  const store=readFileSync(new URL('../frontend/static/js/store.js',import.meta.url),'utf8');
  assert.match(bootstrap,/const studioMode = parameters\.get\('scope'\) === 'studio'/);
  assert.match(bootstrap,/scope=studio/);
  assert.match(bootstrap,/if \(!studioMode &&/);
  assert.match(bootstrap,/studioMode \? 'scope=studio'/);
  assert.match(editor,/<title>Theme Studio — AgentSam CMS<\/title>/);
  assert.match(workspace,/api\/admin\/cms\/theme-projects\?scope=studio/);
  assert.match(workspace,/Continue editing/);
  assert.doesNotMatch(workspace,/site_id/);
  assert.match(store,/id="my-theme-studio-btn" href="\/admin\/theme-workspace"/);
});

test('marketplace intent reaches the authorized page editor with catalog installation support',()=>{
  const destination=planThemeEditorEntry({site:siteA,
    location:'/admin/theme-editor?marketplace_kind=cms_embed&marketplace_key=announcement_bar',
    pages:[home],projects:[project]});
  assert.equal(destination.resource,'cms-page');
  assert.equal(destination.to,
    '/admin/theme-editor?slug=home&site_id=site_a&page_id=cmsp_home_a&marketplace_kind=cms_embed&marketplace_key=announcement_bar');
});
