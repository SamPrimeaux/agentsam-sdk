import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
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
  assert.equal(p.to,'/admin/sites/site_a/pages/cmsp_home_a/editor');
  const other=planThemeEditorEntry({site:siteA,location:'/admin/theme-editor?slug=about&site_id=site_a',pages:[about,home]});
  assert.equal(other.to,'/admin/sites/site_a/pages/cmsp_about_a/editor');
});

test('installed private theme goes to its own site-scoped project editor, not an unrelated demo',()=>{
  const destination=planThemeEditorEntry({site:siteB,location:'/admin/theme-editor',
    pages:[{id:'cmsp_starter',site_id:'site_b',slug:'site',is_homepage:false}],projects:[project]});
  assert.equal(destination.kind,'redirect');
  assert.equal(destination.resource,'theme-project');
  assert.equal(destination.to,
    '/admin/sites/site_b/themes/theme_revise/editor/home');
  const journal=planThemeEditorEntry({site:siteB,
    location:'/admin/theme-editor?slug=journal&site_id=site_b',projects:[project]});
  assert.equal(journal.to,
    '/admin/sites/site_b/themes/theme_revise/editor/journal');
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
    '/admin/sites/site_a/pages/cmsp_about_a/editor');
});

test('empty sites go to Pages for the selected owner; no mocked homepage is manufactured',()=>{
  const result=planThemeEditorEntry({site:siteA,location:'/admin/theme-editor',pages:[],projects:[]});
  assert.equal(result.to,'/admin/pages?site_id=site_a');
  assert.equal(planThemeEditorEntry({site:siteA,location:'/admin/theme-editor?slug=%2Fwrong',pages:[home]}).kind,'unavailable');
});

test('one Theme Studio shell verifies site ownership and mounts either target through one runtime',()=>{
  const html=readFileSync(new URL('../frontend/static/theme-editor.html',import.meta.url),'utf8');
  const bootstrap=readFileSync(new URL('../frontend/static/js/theme-studio-bootstrap.mjs',import.meta.url),'utf8');
  const pageAdapter=readFileSync(new URL('../frontend/theme-editor/cms-page-adapter.mjs',import.meta.url),'utf8');
  const projectAdapter=readFileSync(new URL('../packages/theme-contract/editor/project.mjs',import.meta.url),'utf8');
  assert.match(html,/theme-studio-bootstrap\.mjs/);
  assert.doesNotMatch(html,/theme-editor-entry\.js|theme-project-editor-bootstrap/);
  assert.match(bootstrap,/chooseThemeEditorSite/);
  assert.match(bootstrap,/planThemeEditorEntry/);
  assert.match(bootstrap,/createCmsPageThemeEditorAdapter/);
  assert.match(bootstrap,/createThemeProjectAdapter/);
  assert.match(bootstrap,/mountThemeEditor\(frame, host/);
  assert.match(bootstrap,/async onDuplicate\(\)/);
  assert.match(bootstrap,/async onDelete\(\)/);
  assert.match(pageAdapter,/site_id/);
  assert.match(projectAdapter,/createThemeProjectAdapter/);
});


test('Theme Studio uses the site-scoped editor and no longer ships the legacy customer workspace',()=>{
  const routes=readFileSync(new URL('../backend/lib/route-manifest.js',import.meta.url),'utf8');
  const store=readFileSync(new URL('../frontend/static/js/store.js',import.meta.url),'utf8');
  const editor=readFileSync(new URL('../frontend/static/js/theme-studio-bootstrap.mjs',import.meta.url),'utf8');
  const projectEditor=readFileSync(new URL('../frontend/static/theme-project-editor.html',import.meta.url),'utf8');
  assert.match(routes,/admin\.theme-editor\.theme/);
  assert.match(routes,/admin\.theme-editor\.theme-page/);
  assert.doesNotMatch(routes,/admin\.theme-workspace|theme-workspace\.html/);
  assert.doesNotMatch(store,/theme-workspace|my-theme-studio-btn/);
  assert.match(editor,/themeProjectEditorPath\(siteId, result\.project\.id, 'home'\)/);
  assert.match(editor,/result\.archived !== true/);
  assert.match(editor,/location\.assign\('\/admin\/store'\)/);
  assert.match(projectEditor,/location\.replace\('\/admin\/store'\)/);
});

test('marketplace intent reaches the authorized page editor with catalog installation support',()=>{
  const destination=planThemeEditorEntry({site:siteA,
    location:'/admin/theme-editor?marketplace_kind=cms_embed&marketplace_key=announcement_bar',
    pages:[home],projects:[project]});
  assert.equal(destination.resource,'cms-page');
  assert.equal(destination.to,
    '/admin/sites/site_a/pages/cmsp_home_a/editor?marketplace_kind=cms_embed&marketplace_key=announcement_bar');
});


test('site-owned Theme Editor previews resolve canonical route_path on the selected public domain', () => {
  const editor = readFileSync(new URL('../frontend/static/js/theme-editor.js', import.meta.url), 'utf8');
  const start = editor.indexOf('function pageRoute(pageSlug)');
  const end = editor.indexOf('function ownerSections(ownerSlug)', start);
  assert.ok(start >= 0 && end > start, 'pageRoute helper is present');
  const route = editor.slice(start, end);
  assert.match(route, /owned\.route_path \|\| owned\.route \|\| owned\.live_route/);
  assert.match(route, /cmsEditorStorefrontUrl/);
  assert.doesNotMatch(route, /activeCmsSite\?\.id !== ["']app-store["']/,
    'ordinary sites must not fall back to an admin-origin relative live_route');
});


test('marketplace handoff asks for explicit site even when a prior selection exists',()=>{
  const archived={id:'old',status:'archived'};
  assert.equal(chooseThemeEditorSite({sites:[siteA,siteB,archived],rememberedSiteId:'site_b',requireSelection:true}).reason,'site_selection_required');
  assert.equal(chooseThemeEditorSite({sites:[siteA],requireSelection:true}).reason,'site_selection_required');
  assert.equal(chooseThemeEditorSite({sites:[siteA,siteB],requestedSiteId:'site_b',requireSelection:true}).site.id,'site_b');
  assert.equal(chooseThemeEditorSite({sites:[archived],requireSelection:true}).reason,'no_sites');
  assert.equal(chooseThemeEditorSite({sites:[siteA,archived],requestedSiteId:'old'}).reason,'site_not_owned');
  const next=planThemeEditorEntry({site:siteA,location:'/admin/theme-editor?marketplace_kind=cms_embed&marketplace_key=store_chat',projects:[project],pages:[home,about]});
  assert.equal(next.to,'/admin/sites/site_a/pages/cmsp_home_a/editor?marketplace_kind=cms_embed&marketplace_key=store_chat');
  const shell=readFileSync(new URL('../frontend/static/theme-editor.html',import.meta.url),'utf8');
  assert.match(shell,/#theme-project-loading\[hidden\]/);
  assert.doesNotMatch(shell,/id="theme-project-site-picker"/,"editor must not own a website picker");
});
