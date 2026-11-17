import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseThemeEditorLocation, themeProjectEditorPath, cmsPageEditorPath } from '../frontend/theme-editor/routes.mjs';
import { adminRouteForPath } from '../backend/lib/route-manifest.js';
import { createCmsPageThemeEditorAdapter } from '../frontend/theme-editor/cms-page-adapter.mjs';
import { materializeStarterProject, inheritDefaultTemplates } from '../frontend/theme-editor/starter-project.mjs';
import { validateThemeProjectPayload } from '../backend/cms/theme-project-store.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

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

test('CMS page adapter pins every read and write to the selected site and resolves the real public preview URL', async () => {
  const calls = [];
  const pagesPayload = {
    site: { id:'site_a', name:'Agency site', primary_domain:'example.com' },
    pages: [
      { id:'page_home_a', site_id:'site_a', slug:'home', route_path:'/' },
      { id:'page_about_a', site_id:'site_a', slug:'about', route_path:'/about' },
    ],
  };
  const adapter = createCmsPageThemeEditorAdapter({
    siteId:'site_a',
    pagesPayload,
    publicUrlResolver:(site, route) => 'https://' + site.primary_domain + route,
    fetchImpl:async (path, init) => {
      calls.push({path, init});
      const data = path.startsWith('/api/admin/cms/registry')
        ? {ok:true, registry:{pages:[]}}
        : path.startsWith('/api/admin/cms/themes')
          ? {ok:true, active_theme:{name:'Plain Jane', state:'draft'}}
          : {ok:true, page:pagesPayload.pages[0]};
      return {ok:true, status:200, json:async()=>data};
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
  assert.deepEqual(await adapter.getThemeIdentity(), {name:'Plain Jane', status:'draft'});
  const preview = await adapter.resolvePreview('about', pagesPayload.pages[1]);
  const previewUrl = new URL(preview.url);
  assert.equal(previewUrl.origin + previewUrl.pathname, 'https://example.com/about');
  assert.equal(previewUrl.searchParams.get('preview'), '1');
  assert.ok(previewUrl.searchParams.get('_'));
  assert.equal(preview.openUrl, 'https://example.com/about');
});

test('new=1 parses as a Theme Studio creation intent on the shared editor route', () => {
  assert.deepEqual(parseThemeEditorLocation(new URL('https://studio.test/admin/theme-editor?new=1&site_id=site_a')), {
    mode:'new', siteId:'site_a', legacy:true,
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
  assert.match(alias,/\/admin\/theme-editor/);
  assert.doesNotMatch(alias,/\/canvas/);
  assert.match(bootstrap,/async function bootNewTheme/);
  assert.match(bootstrap,/materializeStarterProject/);
  assert.match(bootstrap,/inheritDefaultTemplates/);
  assert.match(bootstrap,/themeProjectEditorPath\(siteId, created\.project\.id, 'home'\)/);
});
