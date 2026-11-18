import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('Theme Store Add uses a native authenticated install route, not the embedded Online Store',()=>{
  const sites=source('../../frontend/src/routes/(apps)/admin/sites.tsx');
  const store=source('../../frontend/src/routes/(apps)/admin/store.tsx');
  assert.match(sites,/themeStoreTrySelection/);
  assert.match(sites,/useCurrentUserState/);
  assert.match(sites,/RedirectToSignIn/);
  assert.match(sites,/startedAttempt\.current === attempt/);
  assert.match(sites,/fetch\('\/api\/admin\/website-themes\//);
  assert.match(sites,/result\.scope !== 'site'/);
  assert.match(sites,/window\.location\.replace\(destination\.href\)/);
  assert.doesNotMatch(sites,/<iframe|EcommerceAppView|indexedDB|localStorage/);
  assert.match(store,/<Navigate to="\/admin\/sites" search=\{selected\} replace \/>/);
  assert.doesNotMatch(store,/if \(search\.theme_sku \|\| search\.action/);
});

test('Server validates checksum-addressed release and owns installation without a browser preview',()=>{
  const installer=source('./studio-website-theme-install.js');
  assert.match(installer,/getWebsiteThemeInstallIndex/);
  assert.match(installer,/getVerifiedInstallProject/);
  assert.match(installer,/crypto\.subtle\.digest\('SHA-256'/);
  assert.match(installer,/createAuthorizedCmsSite/);
  assert.match(installer,/installThemeDraftSite/);
  assert.match(installer,/\/admin\/sites\//);
});
