import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { themeStoreTrySelection } from '../frontend/src/lib/apps/theme-store-selection.ts';
const root = resolve(import.meta.dirname,'..');
const read = path => readFileSync(resolve(root,path),'utf8');

test('selection survives /sites and the authenticated CMS iframe',()=>{
  const sites=read('frontend/src/routes/(apps)/sites.tsx');
  const host=read('frontend/src/routes/(apps)/apps/ecommerce-cms-agentsam.tsx');
  for(const name of ['theme_sku','theme_version','action','site_id'])
    assert.ok(sites.includes(name),'/sites dropped '+name);
  for(const name of ['theme_sku','theme_version','action'])
    assert.match(host,new RegExp("resolved\\.searchParams\\.set\\('"+name+"'"),'iframe dropped '+name);
});
test('Try theme uses a focused installer and returns to Online Store, not another catalog',()=>{
  const browser=read('../ecommerce-cms-agentsam/frontend/static/js/website-theme-browser.js');
  const store=read('../ecommerce-cms-agentsam/frontend/static/js/store.js');
  assert.match(browser,/if \(installIntent && selectedSlug\)/);
  assert.match(browser,/showInstallStage\(\)/);
  assert.match(browser,/trustedHandoff/);
  assert.match(browser,/async function createPrivateDraft\(theme,button,container\)/);
  assert.match(browser,/api\/admin\/website-themes\/.*\/install/);
  assert.match(browser,/version:theme\.version/);
  assert.doesNotMatch(browser,/preferredSiteId\(\)/);
  assert.match(browser,/Your existing sites have not been changed/);
  assert.match(browser,/\/admin\/store\?site_id=/);
  assert.match(browser,/target\.location\.assign\(route\)/);
  assert.match(store,/id="browse-themes-shortcut">Visit Theme Store/);
  assert.match(store,/destination\.searchParams\.set\('site_id'/);
});
test('installing is not a publish or active theme replacement',()=>{
  const install=read('backend/worker/studio-website-theme-install.js');
  assert.match(install,/installThemeDraft/);
  assert.match(install,/resolveCmsSite/);
  assert.doesNotMatch(install,/publishTheme|activateTheme/);
});


test('real Theme Store selection is accepted, malformed or forged handoffs are ignored',()=>{
  assert.deepEqual(themeStoreTrySelection({
    action:'try',theme_sku:'iam.theme.plain-jane',theme_version:'0.1.0',
  }),{theme_sku:'iam.theme.plain-jane',theme_version:'0.1.0',action:'try'});
  assert.deepEqual(themeStoreTrySelection({
    action:'try',theme_sku:'iam.theme.revise',theme_version:'2.6.13',
  }),{theme_sku:'iam.theme.revise',theme_version:'2.6.13',action:'try'});
  for(const value of [
    {action:'try',theme_sku:'iam.theme..',theme_version:'2.6.13'},
    {action:'try',theme_sku:'iamXtheme.revise',theme_version:'2.6.13'},
    {action:'try',theme_sku:'iam.theme.revise',theme_version:'2.6.13malicious'},
    {action:'try',theme_sku:'iam.theme.revise',theme_version:'../2'},
    {action:'publish',theme_sku:'iam.theme.revise',theme_version:'2.6.13'},
    {action:'try',theme_sku:'iam.theme.revise',theme_version:''},
  ])assert.equal(themeStoreTrySelection(value),null);
});

test('Try Theme always posts a site-free install body even after browsing a production site',()=>{
  const browser=read('../ecommerce-cms-agentsam/frontend/static/js/website-theme-browser.js');
  assert.ok(browser.includes('body:JSON.stringify({version:theme.version})'));
  assert.ok(!browser.includes('preferredSiteId()'));
});
