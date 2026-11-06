import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { heuristicStarterPreset } from '../../../packages/heuristic-theme/src/starter.js';
import { materializeStarterProject, inheritDefaultTemplates } from '../frontend/theme-editor/starter-project.mjs';
import { STOCK_ADAPTERS, STOCK_TEMPLATES, STOCK_TEMPLATE_STYLES } from '../frontend/theme-editor/stock-templates.mjs';

const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');
const kinds = Object.keys(STOCK_TEMPLATES);
const slugs = ['checkout', 'sign-in', 'sign-up', 'account', 'orders', 'gift-card', 'password'];
const base = () => materializeStarterProject(heuristicStarterPreset, { name: 'Test Store' });
const inherited = () => inheritDefaultTemplates(base()).project;
const stockPages = project => project.pages.filter(page => kinds.includes(page.page_type));
const bodyOf = page => page.sections.find(section => section.key === 'default_' + page.page_type);
const pageBySlug = slug => inherited().pages.find(page => page.slug === slug);
const assemble = page => page.template.replace(/<!--theme-section:([a-z0-9_]+)-->/g, (_, key) => page.sections.find(section => section.key === key)?.html || '');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function open(page, { cart, fetchImpl } = {}) {
  const errors = [], calls = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(assemble(page), {
    url: 'https://store.test/' + page.slug, runScripts: 'dangerously', virtualConsole,
    beforeParse(window) {
      if (cart) window.localStorage.setItem('agentsam.cart.v1', JSON.stringify(cart));
      window.fetch = async (url, init) => {
        calls.push({ url, init });
        return fetchImpl ? fetchImpl(url, init) : { ok: true, status: 200, json: async () => ({}) };
      };
    },
  });
  return { dom, document: dom.window.document, calls, errors };
}
const submit = (dom, form) => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

test('every missing stock page type is filled, and only once', () => {
  const first = inheritDefaultTemplates(base());
  assert.equal(first.changed, true);
  for (const slug of slugs) assert.ok(first.project.pages.some(page => page.slug === slug), slug);
  assert.deepEqual(stockPages(first.project).map(page => page.page_type).sort(), [...kinds].sort());
  assert.equal(inheritDefaultTemplates(first.project).changed, false, 'second pass is a no-op');
});

test('an authored page always wins over the stock one', () => {
  const project = base(), authored = structuredClone(project.pages[0]);
  authored.slug = 'password'; authored.title = 'Authored gate'; project.pages.push(authored);
  const pages = inheritDefaultTemplates(project).project.pages.filter(page => page.slug === 'password');
  assert.equal(pages.length, 1);
  assert.equal(pages[0].title, 'Authored gate');
});

test('every string on every stock page is an editable field, and every field renders', () => {
  for (const page of stockPages(inherited())) {
    const section = bodyOf(page), doc = new JSDOM(section.html).window.document;
    const keys = new Set(section.schema.fields.map(field => field.key));
    for (const node of doc.querySelectorAll('[data-theme-project-field]'))
      assert.ok(keys.has(node.dataset.themeProjectField), `${page.slug}: ${node.dataset.themeProjectField} has no field`);
    for (const field of section.schema.fields) {
      assert.ok(field.key in section.content, `${page.slug}: ${field.key} has no default`);
      if (field.type === 'link') assert.ok(keys.has(field.binding.field), `${page.slug}: ${field.key} binds to a missing field`);
      else assert.ok(doc.querySelector(`[data-theme-project-field="${field.key}"]`), `${page.slug}: ${field.key} is not rendered`);
    }
  }
});

test('forms and views only name declared adapters, and backend:true adapters exist in the store API', () => {
  for (const page of stockPages(inherited())) {
    const doc = new JSDOM(bodyOf(page).html).window.document;
    for (const node of doc.querySelectorAll('[data-adapter],[data-adapter-view]'))
      assert.ok(STOCK_ADAPTERS[node.dataset.adapter || node.dataset.adapterView], `${page.slug}: undeclared adapter`);
  }
  const api = readFileSync(new URL('../backend/store/api.js', import.meta.url), 'utf8');
  for (const [key, adapter] of Object.entries(STOCK_ADAPTERS))
    if (adapter.backend) assert.ok(api.includes(`path === "${adapter.path}"`), `${key} is marked backend:true but ${adapter.path} is not routed`);
});

test('look is tokens only and copy is neutral', () => {
  const css = STOCK_TEMPLATE_STYLES.replace(/var\([^)]*\)/g, '');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, 'no hex colors outside a var() fallback');
  assert.doesNotMatch(css, /\b(rgb|hsl)a?\(/i);
  for (const page of stockPages(inherited())) {
    const section = bodyOf(page);
    assert.doesNotMatch(section.html, /\sstyle=/, `${page.slug}: no inline styles`);
    assert.doesNotMatch(JSON.stringify([section.html, section.content]), /fuel|resolve|inner animal|agentsam|fnf/i, `${page.slug}: brand or fixture text`);
  }
});

test('checkout with no cart shows the empty state and sends nothing', async () => {
  const { document, calls } = open(pageBySlug('checkout'));
  await tick();
  assert.equal(document.querySelector('[data-cart-empty]').hidden, false);
  assert.equal(document.querySelector('form[data-adapter="checkout.session"] [type="submit"]').disabled, true);
  assert.equal(document.querySelector('[data-cart-subtotal]').textContent, '—');
  assert.equal(document.querySelector('[data-cart-totals]').hidden, true, 'no totals for an empty cart');
  assert.equal(calls.length, 0);
});

test('checkout renders the cart and posts the real session payload', async () => {
  const cart = [{ variant_id: 'v1', qty: 2, title: 'Mug', price_cents: 1500 }];
  const { dom, document, calls } = open(pageBySlug('checkout'), { cart, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ url: 'https://pay.test/s/1' }) }) });
  assert.equal(document.querySelectorAll('[data-cart-lines] li').length, 1);
  assert.match(document.querySelector('[data-cart-subtotal]').textContent, /30/);
  assert.equal(document.querySelector('[data-cart-totals]').hidden, false);
  document.querySelector('input[name="email"]').value = 'buyer@test.dev';
  submit(dom, document.querySelector('form[data-adapter="checkout.session"]'));
  await tick(); await tick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/store/checkout/session');
  assert.deepEqual(JSON.parse(calls[0].init.body), { email: 'buyer@test.dev', items: [{ variant_id: 'v1', qty: 2 }], discount_code: '' });
});

test('a failed call shows the editable error copy, never server text', async () => {
  const page = pageBySlug('sign-in');
  const { dom, document, calls } = open(page, { fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({ error: 'SQLITE_CONSTRAINT' }) }) });
  document.querySelector('input[name="email"]').value = 'a@test.dev';
  document.querySelector('input[name="password"]').value = 'secret';
  submit(dom, document.querySelector('form[data-adapter="customer.sign-in"]'));
  await tick(); await tick();
  const out = document.querySelector('[data-adapter-status]');
  assert.equal(calls[0].url, '/api/store/customer/sign-in');
  assert.equal(out.textContent, bodyOf(page).content.error);
  assert.equal(out.dataset.state, 'error');
});

test('account sends signed-out visitors to sign in', async () => {
  const { calls, errors } = open(pageBySlug('account'), { fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }) });
  await tick(); await tick();
  assert.equal(calls[0].url, '/api/store/customer/session');
  assert.ok(errors.some(message => /navigation/i.test(message)), 'tried to navigate to /sign-in');
});
