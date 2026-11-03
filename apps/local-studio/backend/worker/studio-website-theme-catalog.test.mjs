import assert from 'node:assert/strict';
import test from 'node:test';
import { handleStudioWebsiteThemeCatalog } from './studio-website-theme-catalog.js';

const origin = 'https://themes.inneranimalmedia.com';
const sha = 'a'.repeat(64);
const product = {
  slug: 'plain-jane', version: '0.1.0', name: 'Plain Jane Journal',
  summary: 'Source-driven journal with real pages.', category: 'Editorial',
  pages: ['Journal','Article','About'], cardImage: '/previews/plain-jane.svg',
  previewUrl: origin + '/theme-packages/plain-jane/0.1.0/preview/',
  release: {
    status: 'published', sha256: sha,
    storageKey: 'releases/plain-jane/0.1.0/' + sha + '.zip'
  }
};
test('website product adapter does not read cms_themes and preserves verified releases', async () => {
  const previous = globalThis.fetch;
  let requested = null;
  globalThis.fetch = async url => {
    requested = url;
    return Response.json({ ok: true, products: [product, { ...product, slug: '__unsafe' }] });
  };
  try {
    const response = await handleStudioWebsiteThemeCatalog(new Request('https://agentsam.test/api/admin/website-themes'), 'account-one');
    assert.equal(response.status, 200);
    assert.equal(requested, origin + '/api/catalog');
    const result = await response.json();
    assert.equal(result.source, 'themes.inneranimalmedia.com');
    assert.equal(result.products.length, 1);
    assert.equal(result.products[0].release_status, 'published');
    assert.equal(result.products[0].cms_installed, false);
    assert.equal(result.products[0].detail_url, origin + '/themes/plain-jane/');
    assert.match(result.products[0].download_url, /plain-jane\/0\.1\.0\/download/);
    assert.equal(result.products[0].preview_url, product.previewUrl);
    assert.equal(result.products[0].thumbnail_url, origin + '/previews/plain-jane.svg');
  } finally { globalThis.fetch = previous; }
});
test('invalid release or cross-domain preview never becomes an installable product', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ ok: true, products: [{
    ...product, previewUrl: 'https://untrusted.example/x',
    cardImage: '//untrusted.example/image.svg',
    release: { status: 'published', sha256: sha, storageKey: 'elsewhere.zip' }
  }] });
  try {
    const result = await (await handleStudioWebsiteThemeCatalog(new Request('https://agentsam.test/api/admin/website-themes'), 'account-one')).json();
    assert.equal(result.products[0].release_status, 'preview');
    assert.equal(result.products[0].download_url, null);
    assert.equal(result.products[0].preview_url, null);
    assert.equal(result.products[0].thumbnail_url, null);
  } finally { globalThis.fetch = previous; }
});
test('catalog endpoint requires an authenticated account and is read-only', async () => {
  const request = new Request('https://agentsam.test/api/admin/website-themes');
  assert.equal((await handleStudioWebsiteThemeCatalog(request, null)).status, 401);
  assert.equal((await handleStudioWebsiteThemeCatalog(new Request(request.url, { method: 'POST' }), 'account-one')).status, 405);
});

test('catalog marks a release install-ready only when its packaged editable project and release checksum match', async () => {
  const previous=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({ok:true,products:[product]});
  const env={ASSETS:{async fetch(request){
    assert.equal(new URL(request.url).pathname,
      '/ecommerce-cms-agentsam/admin/data/site-theme-projects/index.json');
    return Response.json({
      schema:'agentsam.website-theme-install-index.v1',
      packages:[{
        slug:'plain-jane',version:'0.1.0',sha256:sha,
        project_asset:'/ecommerce-cms-agentsam/admin/data/site-theme-projects/plain-jane-0.1.0.json',
        page_count:5,manifest_page_count:9,
      }],
    });
  }}};
  try {
    const response=await handleStudioWebsiteThemeCatalog(
      new Request('https://agentsam.test/api/admin/website-themes'),'account-one',env);
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.products[0].can_install,true);
    assert.equal(result.products[0].editable_page_count,5);
    assert.equal(result.products[0].manifest_page_count,9);
  }finally{globalThis.fetch=previous;}
});
