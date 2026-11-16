undefined

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
});
