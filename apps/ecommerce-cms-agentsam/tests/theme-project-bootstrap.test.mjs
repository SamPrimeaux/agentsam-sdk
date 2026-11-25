import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { parseThemeEditorLocation, themeProjectEditorPath, cmsPageEditorPath } from '../frontend/theme-editor/routes.mjs';
import { adminRouteForPath } from '../backend/lib/route-manifest.js';
import { createCmsPageThemeEditorAdapter } from '../frontend/theme-editor/cms-page-adapter.mjs';
import { blankThemeProject, materializeStarterProject, inheritDefaultTemplates } from '../frontend/theme-editor/starter-project.mjs';
import { fillMissingThemeChrome } from '../frontend/theme-editor/starter-chrome.mjs';
import { validateThemeProjectPayload } from '../backend/cms/theme-project-store.mjs';
import { withThemeSharedChrome } from '../packages/theme-contract/editor/project.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('theme page composition projects one saved header/footer into the page without mutating the project', () => {
  const header={key:'header-main',globalKey:'site_header',zone:'HEADER',html:'<header>Site header</header>',content:{},schema:{fields:[]}};
  const footer={key:'footer-main',globalKey:'site_footer',zone:'FOOTER',html:'<footer>Site footer</footer>',content:{},schema:{fields:[]}};
  const body={key:'blog-body',zone:'BODY',html:'<main>Blog content</main>',content:{},schema:{fields:[]}};
  const project={pages:[
    {slug:'home',template:'<html><body></body></html>',sections:[header,footer]},
    {slug:'blog',template:'<html><body><!--theme-section:blog-body--></body></html>',sections:[body]},
  ]};
  const before=structuredClone(project);
  const composed=withThemeSharedChrome(project,project.pages[1]);
  assert.match(composed.template,/<!--theme-section:global_site_header-->/);
  assert.match(composed.template,/<!--theme-section:global_site_footer-->/);
  assert.deepEqual(composed.sections.map(section=>section.key),['global_site_header','blog-body','global_site_footer']);
  assert.deepEqual(project,before);
});

test('both CMS pages and installed themes resolve to the same Theme Studio HTML route', () => {
  for (const path of [
    '/admin/sites/site_a/pages/page_home/editor',
    '/admin/sites/site_a/themes/theme_plain_jane/editor/home',
    '/admin/sites/site_a/themes/theme_plain_jane/editor/product',
    '/admin/sites/site_a/settings/editor',
  ]) assert.equal(adminRouteForPath(path)?.page, 'theme-editor', path);
});

test('shared route parser preserves the correct target identity and view state', () => {
  assert.deepEqual(parseThemeEditorLocation(new URL('https://studio.test/admin/sites/site_a/themes/theme_plain_jane/editor/home?previewMode=tablet')), {
    mode: 'project', siteId: 'site_a', projectId: 'theme_plain_jane', pageSlug: 'home', legacy: false,
  });
  assert.deepEqual(parseThemeEditorLocation(new URL('https://studio.test/admin/sites/site_a/pages/page_home/editor')), {
    mode: 'page', siteId: 'site_a', pageId: 'page_home', pageSlug: null, legacy: false,
  });
  assert.deepEqual(parseThemeEditorLocation(new URL('https://studio.test/admin/sites/site_a/settings/editor')), {
    mode: 'page', siteId: 'site_a', pageId: null, pageSlug: 'site', legacy: false,
  });
  assert.equal(themeProjectEditorPath('site_a', 'theme_plain_jane', 'home'), '/admin/sites/site_a/themes/theme_plain_jane/editor/home');
  assert.deepEqual(parseThemeEditorLocation(themeProjectEditorPath(null,'theme_authored','home')),{mode:'project',siteId:null,projectId:'theme_authored',pageSlug:'home',legacy:true});
  assert.equal(cmsPageEditorPath('site_a', 'page_home'), '/admin/sites/site_a/pages/page_home/editor');
  assert.equal(cmsPageEditorPath('site_a', null, 'site'), '/admin/sites/site_a/settings/editor');
});

test('the shared shell mounts one editor runtime with target-specific adapters', () => {
  const shell = read('../frontend/static/theme-editor.html');
  const alias = read('../frontend/static/theme-project-editor.html');
  const bootstrap = read('../frontend/static/js/theme-studio-bootstrap.mjs');
  assert.match(shell, /theme-studio-bootstrap\.mjs/);
  assert.doesNotMatch(shell, /theme-project-editor-bootstrap|theme-editor-entry\.js/);
  assert.match(bootstrap, /createThemeProjectAdapter/);
  assert.match(bootstrap, /createCmsPageThemeEditorAdapter/);
  assert.match(bootstrap, /\/ecommerce-cms-agentsam\/theme-editor\/routes\.mjs/);
  assert.match(bootstrap, /\/ecommerce-cms-agentsam\/theme-editor\/cms-page-adapter\.mjs/);
  assert.equal((bootstrap.match(/mountThemeEditor\(frame, host/g) || []).length, 1);
  assert.match(bootstrap, /async onDuplicate\(\)/);
  assert.match(bootstrap, /async onDelete\(\)/);
  assert.match(alias, /location\.replace/);
  assert.doesNotMatch(alias, /<iframe|theme-project-editor-bootstrap|theme-studio-bootstrap/);
});

test('project and page saves remain scoped to the same site identity', () => {
  const bootstrap = read('../frontend/static/js/theme-studio-bootstrap.mjs');
  const pageAdapter = read('../frontend/theme-editor/cms-page-adapter.mjs');
  assert.match(bootstrap, /site_id: siteId/);
  assert.match(bootstrap, /scopedProjectPath\(projectId, siteId/);
  assert.match(pageAdapter, /url\.searchParams\.set\('site_id', siteId\)/);
});

test('CMS page adapter persists theme settings to the selected project and previews through the canonical renderer', async (t) => {
  const dom = new JSDOM('<!doctype html>');
  const originalParser = globalThis.DOMParser;
  globalThis.DOMParser = dom.window.DOMParser;
  t.after(() => { if (originalParser) globalThis.DOMParser = originalParser; else delete globalThis.DOMParser; dom.window.close(); });
  const calls = [];
  const pagesPayload = {
    site: { id:'site_a', name:'Agency site', primary_domain:'example.com' },
    pages: [
      { id:'page_home_a', site_id:'site_a', slug:'home', route_path:'/', title:'Home', status:'published' },
      { id:'page_about_a', site_id:'site_a', slug:'about', route_path:'/about', title:'About', status:'draft', sections:[] },
      { id:'page_services_a', site_id:'site_a', slug:'services', route_path:'/services', title:'Services', status:'draft', sections:[{id:'cms-section'}] },
    ],
  };
  const project = {
    id:'theme_heuristic', sourceThemeId:'heuristic', revision:4,
    themeSettings:{colors:{accent:'#123456'},typography:{body:'Inter'}},
    tokens:{'--theme-color-primary':'#123456'},
    pages:[{slug:'about',title:'About template',template:'<html><body><!--theme-section:about_intro--></body></html>',sections:[{key:'about_intro',html:'<section>Inherited theme template</section>',content:{},schema:{fields:[]}}]}],
  };
  const adapter = createCmsPageThemeEditorAdapter({
    siteId:'site_a',
    pagesPayload,
    publicUrlResolver:(site, route) => 'https://' + site.primary_domain + route,
    fetchImpl:async (path, init={}) => {
      calls.push({path,init});
      const url = new URL(path,'https://agentsam.example');
      let data;
      if (url.pathname === '/api/admin/cms/registry') data={ok:true,registry:{pages:[]}};
      else if (url.pathname === '/api/admin/cms/themes') data={ok:true,
        active_theme:{name:'Live theme',slug:'live-theme',state:'published'},
        preview_theme:{name:'Heuristic',slug:'heuristic',project_id:'theme_heuristic',state:'draft'}};
      else if (url.pathname === '/api/admin/cms/theme-projects') data={ok:true,
        projects:[{id:'theme_heuristic',sourceThemeId:'heuristic'}]};
      else if (url.pathname === '/api/admin/cms/theme-projects/theme_heuristic' && init.method==='PUT') {
        const body=JSON.parse(init.body);
        data={ok:true,project:body.project};
      }
      else if (url.pathname === '/api/admin/cms/theme-projects/theme_heuristic') data={ok:true,project};
      else if (url.pathname === '/api/admin/cms/pages/services/preview') data={ok:true,html:'<!doctype html><main><h1>Server-rendered page draft</h1></main>'};
      else data={ok:true,page:pagesPayload.pages[0]};
      return {ok:true,status:200,json:async()=>data};
    },
  });

  await adapter.request('/api/admin/cms/pages/home?site_id=wrong');
  const pageUrl = new URL(calls[0].path, 'https://agentsam.example');
  assert.equal(pageUrl.searchParams.get('site_id'), 'site_a');
  assert.equal(pageUrl.searchParams.get('page_id'), 'page_home_a');
  assert.equal(calls[0].init.credentials, 'include');

  await adapter.request('/api/admin/cms/pages/site?site_id=wrong');
  const siteUrl = new URL(calls[1].path, 'https://agentsam.example');
  assert.equal(siteUrl.searchParams.get('site_id'), 'site_a');
  assert.equal(siteUrl.searchParams.has('page_id'), false);

  assert.deepEqual(await adapter.getRegistry(), {pages:[]});
  assert.deepEqual(await adapter.getThemeIdentity(), {name:'Heuristic', status:'draft'});
  assert.deepEqual(await adapter.getThemeSettings(), project.themeSettings);
  const nextSettings={colors:{accent:'#abcdef'}};
  assert.deepEqual(await adapter.updateThemeSettings(nextSettings),nextSettings);
  const updateCall=calls.find(call=>call.init.method==='PUT'&&call.path.includes('/theme-projects/'));
  assert.ok(updateCall);
  const updateBody=JSON.parse(updateCall.init.body);
  assert.equal(updateBody.site_id,'site_a');
  assert.equal(updateBody.expected_version,4);
  assert.deepEqual(updateBody.project.themeSettings,nextSettings);

  const inheritedPreview = await adapter.resolvePreview('about', pagesPayload.pages[1]);
  assert.match(inheritedPreview.html,/Inherited theme template/);
  assert.equal(inheritedPreview.inheritedThemeTemplate,true);
  assert.equal(inheritedPreview.templateSlug,'about');
  assert.equal(inheritedPreview.openUrl,'https://example.com/about');
  assert.equal(calls.some(call=>call.path.startsWith('/api/admin/cms/pages/about/preview')),false);

  const preview = await adapter.resolvePreview('services', pagesPayload.pages[2]);
  assert.match(preview.html,/Server-rendered page draft/);
  assert.equal(preview.openUrl,'https://example.com/services');
  const previewCall=calls.find(call=>call.path.startsWith('/api/admin/cms/pages/services/preview'));
  assert.ok(previewCall);
  const previewUrl=new URL(previewCall.path,'https://agentsam.example');
  assert.equal(previewUrl.searchParams.get('site_id'),'site_a');
  assert.equal(previewUrl.searchParams.get('page_id'),'page_services_a');
  assert.equal(previewCall.init.method,'POST');
  assert.equal(JSON.parse(previewCall.init.body).url_handle,'services');
  assert.equal(calls.some(call=>call.path.startsWith('https://example.com/about?preview=1')),false);
  assert.ok(calls.every(call=>new URL(call.path,'https://agentsam.example').searchParams.get('site_id')==='site_a'));
});

test('site-scoped new-theme editor creates a draft without the retired entry route', () => {
  assert.deepEqual(parseThemeEditorLocation(new URL('https://studio.test/admin/sites/site_a/themes/new/editor')), {
    mode:'new', siteId:'site_a', legacy:false,
  });
});

test('new theme creation produces a non-empty Shopify-style scaffold in the same project contract', () => {
  const preset = {
    schema:'agentsam.website-starter-preset.v1',
    theme:{slug:'new-theme-test',name:'New theme',packageVersion:'1.0.0'},
    sampleProducts:false,
    tokens:{},
    pages:[
      {slug:'home',title:'Home',sections:[
        {type:'hero',eyebrow:'Test site',heading:'A clear place to begin',body:'Build a memorable experience.',ctaLabel:'Discover our story',ctaHref:'/about'},
        {type:'features',eyebrow:'What makes you different',heading:'Your story, made clear',body:'Introduce your work.',ctaLabel:'Learn more',ctaHref:'/about'},
      ]},
      {slug:'about',title:'About',sections:[
        {type:'hero',eyebrow:'About us',heading:'The people behind the work',body:'Share your story.',ctaLabel:'Back home',ctaHref:'/'},
      ]},
    ],
  };
  const starter = materializeStarterProject(preset,{name:'Test site'});
  const {project,changed} = inheritDefaultTemplates(starter);
  assert.equal(changed,true);
  assert.equal(project.id,'theme_new-theme-test');
  assert.ok(project.pages.find(page=>page.slug==='home').sections.length >= 6);
  for (const slug of ['about','product','collection','checkout','404']) {
    assert.ok(project.pages.some(page=>page.slug===slug), 'missing scaffold page: '+slug);
  }
  assert.equal(project.media.length,0);
  assert.equal(validateThemeProjectPayload(project).id,project.id);
});

test('legacy new-theme alias redirects to the shared Theme Studio, never Design Canvas', () => {
  const alias = read('../frontend/static/theme-project-editor.html');
  const bootstrap = read('../frontend/static/js/theme-studio-bootstrap.mjs');
  assert.match(alias,/new/);
  assert.match(alias,/\/admin\/sites\//);
  assert.doesNotMatch(alias,/\/canvas/);
  assert.match(bootstrap,/async function bootNewTheme/);
  assert.match(bootstrap,/blankThemeProject/);
  assert.match(bootstrap,/fillMissingThemeChrome/);
  assert.doesNotMatch(bootstrap,/A clear place to begin|Discover our story|Your story, made clear|sampleProducts/);
  assert.match(bootstrap,/inheritDefaultTemplates/);
  assert.match(bootstrap,/themeProjectEditorPath\(null,created\.project\.id,'home'\)/);
});

test('new theme creation starts from real, editable shared chrome without branded or fake hero content', () => {
  const draft = blankThemeProject({ name:'New theme', purpose:'', audience:'', siteName:'Example site' });
  const withChrome = fillMissingThemeChrome(draft, 'Example site');
  const {project} = inheritDefaultTemplates(withChrome);
  assert.equal(validateThemeProjectPayload(project).id, project.id);
  const home = project.pages.find(page => page.slug === 'home');
  assert.ok(home);
  assert.ok(home.sections.some(s => s.globalKey === 'site-header'));
  assert.ok(home.sections.some(s => s.globalKey === 'site-footer'));
  assert.ok(project.pages.some(page => page.slug === 'product'));
  assert.ok(project.pages.some(page => page.slug === 'checkout'));
  assert.doesNotMatch(JSON.stringify(home),/A clear place to begin|Your story, made clear|fuelnfreetime/i);
  assert.deepEqual(home.sections.filter(s => s.zone === 'BODY'),[],
    'Generated body sections must not be fabricated by the new theme bootstrap');
});
