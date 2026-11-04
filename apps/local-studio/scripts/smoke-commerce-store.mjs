/** Isolated visual/interaction contract for the *actual packaged* merchant Store. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, '../ecommerce-cms-agentsam/frontend/store/mount.mjs');
const editorStatic = resolve(root, '../ecommerce-cms-agentsam/frontend/static');
const websiteThemesSource = resolve(editorStatic, 'js/website-theme-browser.js');
const liveRuntimeSource = resolve(editorStatic,'js/store.js');
// Accept the just-built native desktop payload, rather than a stale web build.
const nativeAssets = resolve(root, 'desktop-dist/commerce-store');
const assets = existsSync(resolve(nativeAssets, 'runtime.js'))
  ? nativeAssets : resolve(root, '.output/public/commerce-store');
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
let receivedInstall = null;
const emptySiteScenario = process.env.SMOKE_EMPTY_SITE === '1';
let createdSite = null;
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>Commerce Store Smoke</title><body style="margin:0"></body>');
  if (pathname === '/apps/ecommerce-cms-agentsam') return res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>Private Theme Library</title><h1>Private theme library</h1>');
  if (pathname === '/api/admin/cms/sites' && req.method==='POST') {
    let body='';
    req.on('data',chunk=>body+=chunk);
    req.on('end',()=>{
      const site=JSON.parse(body);
      createdSite={id:'site-created',name:site.name,slug:site.slug,status:site.status};
      res.writeHead(201,{'content-type':'application/json'}).end(JSON.stringify({ok:true,site:createdSite}));
    });
    return;
  }
  if (pathname === '/api/admin/cms/sites' && req.method==='GET') return res.writeHead(200, {
    'content-type': 'application/json',
  }).end(JSON.stringify({
    ok:true,
    sites:emptySiteScenario?[]:[
      {id:'site-store',name:'Store',slug:'store',page_count:4},
      {id:'site-blog',name:'Personal Blog',slug:'blog',page_count:0},
    ],default_site_id:emptySiteScenario?null:'site-store',
  }));
  if (pathname === '/api/admin/website-themes/plain-jane/install' && req.method==='POST') {
    let body='';
    req.on('data',chunk=>body+=chunk);
    req.on('end',()=>{
      receivedInstall=JSON.parse(body);
      res.writeHead(201,{'content-type':'application/json'}).end(JSON.stringify({
        ok:true, installed:true,
        site_id:'site-private-draft',
        site_status:'draft',
        editor_url:'/admin/theme-project-editor?project=theme_plain-jane&site_id=site-private-draft',
      }));
    });
    return;
  }
  if (pathname === '/admin/theme-project-editor') return res.writeHead(200,{
    'content-type':'text/html',
  }).end('<!doctype html><title>Installed CMS Theme Editor</title><h1>Editable theme project</h1>');
  if (pathname === '/api/admin/website-themes') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
    ok: true, source: 'themes.inneranimalmedia.com', products: [{
      slug: 'plain-jane', sku: 'iam.theme.plain-jane', version: '0.1.0',
      name: 'Plain Jane Journal', description: 'Real editorial website package',
      category: 'Editorial', pages: ['Journal', 'Article', 'About'],
      release_status: 'published', can_install:true, editable_page_count:5, manifest_page_count:9,
      preview_url: 'https://themes.inneranimalmedia.com/theme-packages/plain-jane/0.1.0/preview/',
      detail_url: 'https://themes.inneranimalmedia.com/themes/plain-jane/',
      download_url: 'https://themes.inneranimalmedia.com/api/themes/plain-jane/0.1.0/download',
      thumbnail_url: null,
    }]
  }));
  const file = pathname === '/mount.mjs' ? source :
    pathname === '/commerce-store/website-themes.js' ? websiteThemesSource :
    pathname === '/commerce-store/runtime.js' ? liveRuntimeSource :
    pathname.startsWith('/commerce-store/') ? resolve(assets, pathname.slice('/commerce-store/'.length)) : null;
  const allowed = pathname === '/mount.mjs' ? source :
    pathname === '/commerce-store/website-themes.js' ? websiteThemesSource :
    pathname === '/commerce-store/runtime.js' ? liveRuntimeSource : assets + '/';
  if (!file || (file !== allowed && !file.startsWith(allowed)) || !existsSync(file) || !statSync(file).isFile()) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const baseUrl = 'http://127.0.0.1:' + server.address().port;
const executablePath = process.env.CHROME_BIN || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (cause) => errors.push(String(cause)));
try {
  await page.goto(baseUrl+'/?theme_sku=iam.theme.plain-jane&theme_version=0.1.0');
  await page.evaluate(async () => {
    const { mountOnlineStore } = await import('/mount.mjs');
    const frame = document.createElement('iframe');
    frame.id = 'merchant-frame';
    frame.style.cssText = 'display:block;border:0;width:100vw;height:100vh';
    document.body.append(frame);
    frame.addEventListener('load', () => {
      window.__mounted = mountOnlineStore(frame, {
        baseUrl: location.origin,
        storefrontUrl: null,
        async loadStore() {
          return { store: { visibility: 'unknown' }, performance: {},
            active_theme: { name: 'Theme details unavailable', verified: false,
              preview_href: null, edit_href: '/admin/theme-editor?slug=home' },
            draft_themes: [] };
        },
        onEdit(slug) { window.__edited = slug; },
        onBrowseThemes() { window.__browseThemes = (window.__browseThemes || 0) + 1; },
      });
    }, { once: true });
    frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>';
    await new Promise((done, reject) => {
      const check = () => {
        if (window.__mounted) return Promise.resolve(window.__mounted).then(done, reject);
        setTimeout(check, 25);
      };
      check();
    });
  });
  const merchant = page.frameLocator('#merchant-frame');
  await merchant.locator('.online-store').waitFor();
  assert.equal(await merchant.locator('.online-store-title h1').innerText(), 'Online Store');
  assert.match(await merchant.locator('#store-visibility-label').innerText(), /(?:Not published|Theme not published)/);
  assert.equal(await merchant.locator('.online-store-badge--pending').innerText(), 'Unpublished');
  assert.equal(await merchant.locator('.online-store-starter').count(), 0, 'No fake storefront is presented as installed');
  assert.equal(await merchant.locator('.online-store-preview-message--empty').count(), 2, 'Uninstalled storefront state is explicit');
  assert.equal(await merchant.locator('#import-theme-btn').isDisabled(), true, 'Unimplemented import cannot be clicked');
  const addTheme = merchant.locator('#edit-theme-btn');
  assert.equal(await addTheme.innerText(), 'Browse website themes');
  assert.equal(await addTheme.getAttribute('href'), '#theme-product-marketplace');
  await merchant.locator('#theme-marketplace-grid .theme-marketplace-item').first().waitFor();
  assert.equal(await merchant.locator('#theme-marketplace-grid .theme-marketplace-item').count(), 1);
  assert.equal(await merchant.locator('.theme-marketplace-item h3').first().innerText(), 'Plain Jane Journal');
  assert.match(await merchant.locator('.theme-marketplace-selection').innerText(), /ready as a private editable draft/);
  assert.equal(await merchant.locator('[data-theme-store-selection]').count(),1,'Theme Store deep link selects the actual released theme');
  await addTheme.click();
  await merchant.locator('#browse-themes-shortcut').click();
  assert.equal(await page.evaluate(() => window.__browseThemes), undefined, 'Website browsing never opens the appearance-theme route');
  assert.equal(await page.evaluate(() => window.__edited), undefined, 'Unpublished starter does not request an empty theme editor');
  await page.setViewportSize({ width: 390, height: 844 });
  const dimensions = await merchant.locator('.online-store').evaluate((node) => ({
    width: node.getBoundingClientRect().width,
    viewport: node.ownerDocument.defaultView.innerWidth,
  }));
  assert.ok(dimensions.width <= dimensions.viewport + 1, 'Online Store layout fits mobile viewport');
  await page.setViewportSize({width:1440,height:900});
  assert.equal(await merchant.locator('dialog.website-theme-install-dialog').count(),0,
    'The nested modal must never be used to pick an arbitrary production site');
  await Promise.all([
    page.waitForURL(/\/apps\/ecommerce-cms-agentsam\?page=%2Fadmin%2Fstore&site_id=site-private-draft/),
    merchant.locator('[data-install-theme="plain-jane"]').click(),
  ]);
  assert.deepEqual(receivedInstall,{version:'0.1.0'},
    'Try creates its own private draft; it does not send a production site ID');
  assert.equal(createdSite,null,'Try does not create a generic default website starter');
  assert.equal(await page.title(),'Private Theme Library');
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log('Packaged Store smoke PASS: original theme, no modal, site-free Try, private draft return and mobile width');
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
