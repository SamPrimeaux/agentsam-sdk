import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { heuristicStarterPreset } from '../../../packages/heuristic-theme/src/starter.js';
import { materializeStarterProject, inheritDefaultTemplates } from '../frontend/theme-editor/starter-project.mjs';
import { fillMissingThemeChrome } from '../frontend/theme-editor/starter-chrome.mjs';
import { createThemeProjectAdapter, renderThemePage, sourceSectionTemplateKey } from '../packages/theme-contract/editor/project.mjs';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const projectFor = name => materializeStarterProject(heuristicStarterPreset, { name });
const withDomParser = async run => {
  const win = new JSDOM('').window, previous = globalThis.DOMParser;
  globalThis.DOMParser = win.DOMParser;
  try { return await run(win); } finally { globalThis.DOMParser = previous; win.close(); }
};

test('neutral chrome renders and responds on each starter page', async () => withDomParser(async win => {
  const project = projectFor('Customer Store');
  assert.deepEqual(project.pages.map(page => page.sections.filter(section => section.globalKey).map(section => section.key)),
    project.pages.map(() => ['announcement_bar', 'site_header', 'site_footer', 'promotion_popup']));
  for (const page of project.pages) {
    const doc = new win.DOMParser().parseFromString(renderThemePage(page), 'text/html');
    assert.equal(doc.querySelector('.iam-starter-announcement-link').textContent, 'Welcome to our store');
    assert.equal(doc.querySelector('.iam-starter-brand').textContent, 'Customer Store');
    assert.equal(doc.querySelectorAll('.iam-starter-nav-item').length, 3);
    assert.equal(doc.querySelector('footer strong').textContent, 'Customer Store');
    assert.equal(doc.querySelector('.iam-starter-promo'), null, 'optional promotion starts disabled');
  }
  const preview = new JSDOM(renderThemePage(project.pages[0]), { runScripts: 'dangerously', url: 'https://store.test/' });
  try {
    const toggle = preview.window.document.querySelector('.iam-starter-menu-toggle');
    toggle.click();
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(preview.window.document.querySelector('.iam-starter-nav').classList.contains('is-open'), true);
  } finally { preview.window.close(); }
}));

test('package chrome remains its own source when already present', () => {
  const project = projectFor('Store');
  const page = project.pages[0];
  const originalHeader = page.sections.find(s => s.key === 'site_header');
  originalHeader.html = '<header data-theme-section="site_header">Package header</header>';
  page.sections = page.sections.filter(s => s.key !== 'announcement_bar' && s.key !== 'promotion_popup');
  page.template = page.template.replace(/<!--theme-section:(announcement_bar|promotion_popup)-->/g, '');
  const installed = fillMissingThemeChrome(project, 'Store');
  const sections = installed.pages[0].sections;
  assert.equal(sections.filter(s => s.globalKey === 'site-header').length, 1);
  assert.equal(sections.find(s => s.key === 'site_header').html, originalHeader.html);
  assert.equal(sections.find(s => s.key === 'announcement_bar').content.announcement_1.text, 'Welcome to our store');
  assert.equal(sections.find(s => s.key === 'promotion_popup').content.__editor.visibility.enabled, false);
  assert.equal(fillMissingThemeChrome(installed, 'Store').pages[0].sections.length, sections.length);
});

test('packaged markup with a static shell is not doubled by neutral fallbacks', () => {
  const packaged = require('../frontend/static/data/site-theme-projects/plain-jane-0.1.0.json');
  const filled = fillMissingThemeChrome(packaged, 'Merchant Store');
  for (const page of filled.pages) {
    assert.equal(page.sections.some(s => s.key === 'site_header'), false);
    assert.equal(page.sections.some(s => s.key === 'site_footer'), false);
    assert.equal((page.template.match(/<header\b/gi) || []).length, 1);
    assert.equal((page.template.match(/<footer\b/gi) || []).length, 1);
  }
});

test('announcement, navigation and footer edits persist once for the installed site', async () => withDomParser(async win => {
  let saved = projectFor('My Store');
  const store = { async get() { return structuredClone(saved); }, async save(value) { saved = structuredClone(value); return saved; } };
  const adapter = createThemeProjectAdapter(saved, store);
  const home = await adapter.getPage('home');
  const announcement = home.sections.find(s => s.key === 'announcement_bar');
  const content = structuredClone(announcement.content);
  content.announcement_1.text = 'Free shipping today';
  await adapter.saveDraft('home', announcement.key, content, announcement.version);
  const inserted = await adapter.addBlock('home', 'site_header', 'nav_item', 1);
  const header = await adapter.getPage('home');
  const headerSection = header.sections.find(s => s.key === 'site_header');
  const headerContent = structuredClone(headerSection.content);
  headerContent[inserted.block_id] = { label: 'New arrivals', href: '/new', submenu_label: 'All', submenu_href: '/new/all' };
  await adapter.saveDraft('home', 'site_header', headerContent, headerSection.version);
  const footer = home.sections.find(s => s.key === 'site_footer');
  const footerContent = structuredClone(footer.content);
  footerContent.tagline = 'Made for you';
  await adapter.saveDraft('home', footer.key, footerContent, footer.version);
  const shop = await adapter.getPage('shop');
  assert.equal(shop.sections.find(s => s.key === 'announcement_bar').content.announcement_1.text, 'Free shipping today');
  assert.equal(shop.sections.find(s => s.key === 'site_header').content[inserted.block_id].label, 'New arrivals');
  assert.equal(shop.sections.find(s => s.key === 'site_footer').content.tagline, 'Made for you');
  const rendered = new win.DOMParser().parseFromString(renderThemePage(shop), 'text/html');
  assert.match(rendered.querySelector('header').textContent, /New arrivals/);
  assert.match(rendered.querySelector('footer').textContent, /Made for you/);
  assert.equal(rendered.querySelector('.iam-starter-submenu a').textContent, 'All');
  await adapter.addSection('home', sourceSectionTemplateKey('home', 'section_1'), 3);
  const withExtra = new win.DOMParser().parseFromString(renderThemePage(await adapter.getPage('home')), 'text/html');
  assert.equal(withExtra.querySelectorAll('main > .iam-starter-section').length,
    home.sections.filter(s=>s.zone==='BODY').length+1, 'new content stays inside the template');
  await adapter.setSectionVisibility('home', 'promotion_popup', true);
  assert.ok(new win.DOMParser().parseFromString(renderThemePage(await adapter.getPage('about')), 'text/html').querySelector('.iam-starter-promo'));
}));

test('required page inheritance preserves authored pages and saves through the same project adapter',async()=>withDomParser(async win=>{
  const original=projectFor('Customer Store');
  original.pages=original.pages.filter(page=>page.slug==='home');
  const home=structuredClone(original.pages[0]);
  const inherited=inheritDefaultTemplates(original);
  assert.deepEqual(inherited.project.pages[0],home);
  assert.deepEqual(original.pages,[home]);
  assert.equal(inherited.project.pages.length,11);
  assert.equal(inheritDefaultTemplates(inherited.project).changed,false);
  const product=inherited.project.pages.find(page=>page.slug==='product');
  const doc=new win.DOMParser().parseFromString(renderThemePage(product),'text/html');
  assert.equal(doc.querySelector('h1').textContent,'Product title');
  assert.equal(doc.querySelector('input[type=number]').value,'1');
  assert.equal(doc.querySelector('[data-theme-project-field=button]').textContent,'Add to cart');
  let saved=structuredClone(inherited.project);
  const adapter=createThemeProjectAdapter(saved,{get:async()=>saved,save:async next=>(saved=structuredClone(next))});
  const page=await adapter.getPage('product');
  const section=page.sections.find(item=>item.key==='default_product');
  await adapter.saveDraft('product',section.key,{...section.content,title:'Edited product'},0);
  assert.equal(saved.pages.find(item=>item.slug==='product').sections.find(item=>item.key==='default_product').content.title,'Edited product');
  assert.deepEqual(saved.pages[0],home);
}));
