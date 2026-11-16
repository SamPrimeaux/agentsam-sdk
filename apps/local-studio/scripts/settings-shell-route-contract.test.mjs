import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import { STUDIO_ADMIN_PRERENDERED_ROUTES } from '../shared/studio-admin-routes.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const units=['general','agents','customize','design','git-prs','codebase',
  'network','runtime','themes','storage','keys','usage','notifications','docs','integrations'];
test('all hosted Settings routes are pre-rendered by canonical Nitro SSR at build-time',()=>{
 for(const unit of units){
  const source=path.join(root,'.output/public/studio-settings-shell',unit,'index.html');
  assert.ok(existsSync(source),'missing SSR shell: '+unit);
  const html=readFileSync(source,'utf8');
  assert.match(html,/^<!DOCTYPE html>/i);
  assert.match(html,/<script/);
  assert.ok(html.includes('/assets/'));
  assert.doesNotMatch(html,/password_hash|api_token|client_secret/i);
 }
});
test('Settings shell host is session-gated, read-only and stays on the current app origin',()=>{
 const worker=readFileSync(path.join(root,'backend/worker/index.js'),'utf8');
 const start=worker.indexOf('    // Settings are served as build-generated');
 const end=worker.indexOf('    // Gate authenticated Studio app routes',start);
 assert.ok(start>0 && end>start);
 const section=worker.slice(start,end);
 assert.match(section,/await guardStudioDocument\(request, env\)/);
 assert.match(section,/if \(denied\) return denied/);
 assert.match(section,/studio-settings-shell/);
 assert.match(section,/cache-control","private, no-store"/);
 assert.doesNotMatch(section,/env\.DB\.prepare/);
 assert.doesNotMatch(section,/run\(|INSERT INTO|UPDATE |DELETE FROM/);
 const stage=readFileSync(path.join(root,'scripts/stage-settings-shell.mjs'),'utf8');
 assert.match(stage,/nitro.fetch/);
 assert.match(stage,/No account data/);
});

test('AgentSam Work, CAD and MovieMode use authenticated canonical React shells',()=>{
 const routes=[...STUDIO_ADMIN_PRERENDERED_ROUTES, '/mail','/artifacts','/artifacts/tickets','/tickets','/themes'];
 for(const pathname of routes){
  const route = pathname.replace(/^\/(?:admin\/)?/, '');
  const source=path.join(root,'.output/public/studio-app-shell',route,'index.html');
  assert.ok(existsSync(source),'missing Studio mount: '+route);
  const html=readFileSync(source,'utf8');
  assert.match(html,/^<!DOCTYPE html>/i);
  assert.ok(html.includes('/assets/'));
  assert.doesNotMatch(html,/password_hash|client_secret/i);
  if (pathname === '/admin/store' || pathname.startsWith('/admin/media')) {
    assert.ok(html.includes('/(apps)' + pathname), 'wrong router match for ' + pathname);
  }
 }
 const worker=readFileSync(path.join(root,'backend/worker/index.js'),'utf8');
 const begin=worker.indexOf('    // Canonical React app mounts are served');
 const end=worker.indexOf('    // Settings are served as build-generated',begin);
 assert.ok(begin>0 && end>begin);
 const section=worker.slice(begin,end);
 assert.match(section,/STUDIO_ADMIN_PRERENDERED_ROUTES.includes/);
 assert.match(section,/guardStudioDocument\(request, env\)/);
 assert.match(section,/studio-app-shell/);
 assert.match(section,/cache-control","private, no-store"/);
 assert.doesNotMatch(section,/env\.DB\.prepare|INSERT INTO|UPDATE |DELETE FROM/);
});


test('Settings subpages stay in one canonical shell and use router navigation',()=>{
 const layout=readFileSync(path.join(root,'frontend/src/components/settings/SettingsLayout.tsx'),'utf8');
 assert.ok(layout.includes('segments[0] === "admin"'));
 assert.ok(layout.includes('/admin/settings/'));
 const page=readFileSync(path.join(root,'frontend/src/components/settings/LocalStudioSettingsPage.tsx'),'utf8');
 assert.ok(page.includes('SettingsProductPage'));
 assert.ok(page.includes('unit === "keys"'));
 assert.ok(page.includes('unit === "runtime"'));
 assert.ok(!page.includes('window.history.replaceState'));
 const runtime=readFileSync(path.join(root,'frontend/src/routes/(apps)/admin/settings/runtime.tsx'),'utf8');
 assert.ok(runtime.includes('LocalStudioSettingsPage'));
 const integrations=readFileSync(path.join(root,'frontend/src/routes/(apps)/admin/settings/integrations.tsx'),'utf8');
 assert.ok(integrations.includes('Navigate to="/admin/settings/customize"'));
 const host=readFileSync(path.join(root,'frontend/src/components/settings/localStudioSettingsHost.ts'),'utf8');
 assert.ok(host.includes('return_to=%2Fadmin%2Fsettings%2Fstorage'));
 assert.ok(host.includes('startsWith("/admin/settings/storage")'));
 const apps=readFileSync(path.join(root,'frontend/src/components/settings/AppsManagementPage.tsx'),'utf8');
 assert.ok(apps.includes('openAccountApp(href)'));
 assert.ok(!apps.includes('window.location.assign'));
 const identity=readFileSync(path.join(root,'frontend/src/lib/desktop/tauri.ts'),'utf8');
 assert.ok(identity.includes('getDesktopIdentityStatus'));
 assert.ok(!identity.includes('identity_session_exists'));
 const nativeAuth=readFileSync(path.join(root,'frontend/src/lib/desktop/native-auth.ts'),'utf8');
 assert.ok(nativeAuth.includes('invalidateDesktopIdentityStatus'));
 const keys=readFileSync(path.join(root,'frontend/src/components/settings/LiveKeysSettingsPage.tsx'),'utf8');
 assert.ok(keys.includes('agentsam:identity-open'));
});
