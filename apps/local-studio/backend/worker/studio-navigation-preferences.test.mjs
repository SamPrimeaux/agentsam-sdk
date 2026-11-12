import test from 'node:test';
import assert from 'node:assert/strict';
import { applyNavigationOverrides, listNavigationEntries, normalizeNavigationOverrides, handleStudioNavigation, withInstalledApps } from './studio-navigation-preferences.js';

const defaults = {
  schema: 'agentsam.host-navigation.v1', source:'included_apps', hostAppId:'local-studio',
  primary:[{id:'home',label:'Home',href:'/admin/home',icon:'home'},
    {id:'media',label:'Media',href:'/media',icon:'content',children:[
      {id:'images',label:'Images',href:'/media/images',icon:'content'}]}],
  channels:[], apps:[{id:'cad-creator',name:'CAD Creator',label:'CAD Creator',href:'/admin/cad',icon:'box'}], utilities:[],
};
function fakeEnv(catalogRows = []) {
  let stored = null;
  return {
    ASSETS:{fetch:async()=>Response.json(defaults)},
    DB:{prepare(sql) {
      return {
        bind(...values) { this.values=values;return this; },
        async first() {return stored;},
        async all() {return {results: catalogRows};},
        async run() {
          const [accountId, overrides_json, updated_at_ms, expected]=this.values;
          if (stored && stored.updated_at_ms!==expected) return {meta:{changes:0}};
          stored={overrides_json,updated_at_ms}; return {meta:{changes:1}};
        },
      };
    }},
  };
}
const request=(method='GET',body)=>new Request('https://agentsam.inneranimalmedia.com/api/studio/navigation',{
  method,headers:method==='PATCH'?{'content-type':'application/json','origin':'https://agentsam.inneranimalmedia.com'}:undefined,
  body:body?JSON.stringify(body):undefined,
});
test('navigation overrides retain the installed manifest as the authoritative catalog',()=>{
  const entries=listNavigationEntries(defaults);
  assert.deepEqual(entries.map(item=>item.key),['primary/home','primary/media','primary/media/images','apps/cad-creator']);
  const overrides=normalizeNavigationOverrides({
    'primary/home':{label:'Dashboard',icon:'projects',href:'/admin/cad',order:2},
    'primary/media':{hidden:true},
    'apps/cad-creator':{order:0},
  },defaults);
  const edited=applyNavigationOverrides(defaults,overrides);
  assert.equal(edited.primary[0].label,'Dashboard');
  assert.equal(edited.primary[0].icon,'projects');
  assert.equal(edited.primary.length,1);
  assert.equal(edited.apps[0].package,undefined);
  assert.equal(defaults.primary[0].label,'Home','the installed base is not modified');
  assert.throws(()=>normalizeNavigationOverrides({'primary/random':{label:'Wrong'}},defaults),/navigation_destination_not_installed/);
  assert.throws(()=>normalizeNavigationOverrides({'primary/home':{href:'https://example.com'}},defaults),/navigation_href_invalid/);
  assert.throws(()=>normalizeNavigationOverrides({'primary/home':{icon:'<svg>'}},defaults),/navigation_icon_invalid/);
});
test('authenticated navigation settings save, read and reject stale writes',async()=>{
  const env=fakeEnv();
  assert.equal((await handleStudioNavigation(request(),env,null)).status,401);
  let response=await handleStudioNavigation(request(),env,'account-1');
  assert.equal(response.status,200);
  let data=await response.json();
  assert.equal(data.revision,0);
  assert.equal(data.primary[0].label,'Home');
  response=await handleStudioNavigation(request('PATCH',{expectedRevision:0,overrides:{'primary/home':{label:'Home dashboard'}}}),env,'account-1');
  assert.equal(response.status,200);
  data=await response.json();
  assert.equal(data.primary[0].label,'Home dashboard');
  assert.ok(data.revision>0);
  response=await handleStudioNavigation(request('PATCH',{expectedRevision:0,overrides:{}}),env,'account-1');
  assert.equal(response.status,409);
  response=await handleStudioNavigation(request(),env,'account-1');
  assert.equal((await response.json()).primary[0].label,'Home dashboard');
});
test('navigation settings enforce safe same-origin paths, field limits and CSRF',async()=>{
  const env=fakeEnv();
  let response=await handleStudioNavigation(request('PATCH',{expectedRevision:0,overrides:{'primary/home':{href:'//evil.example'}}}),env,'account-1');
  assert.equal(response.status,400);
  response=await handleStudioNavigation(new Request('https://agentsam.inneranimalmedia.com/api/studio/navigation',{
    method:'PATCH',headers:{origin:'https://other.example'},body:JSON.stringify({expectedRevision:0,overrides:{}}),
  }),env,'account-1');
  assert.equal(response.status,403);
  response=await handleStudioNavigation(request('POST'),env,'account-1');
  assert.equal(response.status,405);
});


const catalogRecord = (key, {enabled = 1, installed = 1, href = '/admin/apps/' + key, surfaces = ['admin-nav'], label = key} = {}) => ({
  plugin_key: key, display_name: label,
  metadata_json: JSON.stringify({app:{surfaces,nav:{href,label}}}),
  installed, enabled, setup_status: enabled ? 'connected' : 'unconfigured',
});

test('installed account plugins flow into the canonical shared navigation, not a second shell', async () => {
  const env = fakeEnv([
    catalogRecord('campaign', {label:'AgentSam Campaign'}),
    catalogRecord('disabled', {enabled:0}),
    catalogRecord('not-installed', {installed:0,enabled:0}),
    catalogRecord('widget', {surfaces:['add-apps']}),
    catalogRecord('duplicate', {href:'/admin/cad'}),
    catalogRecord('malicious', {href:'//evil.example'}),
  ]);
  const response = await handleStudioNavigation(request(), env, 'account-1');
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.schema, 'agentsam.host-navigation.v1');
  assert.deepEqual(payload.apps.map(app=>app.id), ['cad-creator', 'plugin-campaign']);
  assert.equal(payload.apps[1].source, 'account-plugin');
  assert.equal(payload.apps[1].href, '/admin/apps/campaign');
  assert.equal(payload.entries.some(row=>row.key==='apps/plugin-campaign'), true);
  assert.equal(payload.defaults.apps.length, 2);
});

test('removed app overrides are filtered at read time and do not re-create an uninstalled link', async () => {
  const env = fakeEnv([catalogRecord('campaign')]);
  let response = await handleStudioNavigation(request('PATCH', {
    expectedRevision:0,overrides:{'apps/plugin-campaign':{label:'Campaign Custom'}}
  }),env,'account-1');
  assert.equal(response.status,200);
  const before = await response.json();
  assert.equal(before.apps[1].label,'Campaign Custom');
  // Simulate account uninstall without changing the saved presentation record.
  const original = env.DB.prepare;
  env.DB.prepare = sql => {
    const statement = original(sql);
    if (sql.includes('FROM agentsam_plugins')) {
      statement.bind = () => ({all:async()=>({results:[]})});
    }
    return statement;
  };
  response = await handleStudioNavigation(request(),env,'account-1');
  assert.equal(response.status,200);
  const after = await response.json();
  assert.deepEqual(after.apps.map(item=>item.id),['cad-creator']);
  assert.deepEqual(after.overrides,{});
});

test('installed-app reconciliation rejects unsafe metadata without creating navigation authority', () => {
  const payload = withInstalledApps(defaults, [
    {key:'a',label:'Good App',href:'/admin/apps/a',installed:true,enabled:true,surfaces:['admin-nav']},
    {key:'b',label:'Bad',href:'javascript:alert(1)',installed:true,enabled:true,surfaces:['admin-nav']},
    {key:'c',label:'Bad',href:'/admin/x" onload="evil',installed:true,enabled:true,surfaces:['admin-nav']},
    {key:'d',label:'Disabled',href:'/admin/d',installed:true,enabled:false,surfaces:['admin-nav']},
  ]);
  assert.deepEqual(payload.apps.map(app=>app.id),['cad-creator','plugin-a']);
  assert.equal(defaults.apps.length,1);
});

test('account app removal hides optional static host nav without affecting core apps',()=>{
  const base={...defaults,apps:[
    {id:'local-studio',label:'AgentSam',href:'/admin/agentsam'},
    {id:'cad-creator',label:'CAD Creator',href:'/admin/cad',aliases:['/cad']},
  ]};
  const catalog=[{key:'agentsam-stage-cad',label:'CAD Creator',href:'/cad',kind:'app',installable:true,
    installed:false,enabled:false,surfaces:['admin-nav']}];
  assert.deepEqual(withInstalledApps(base,catalog).apps.map(app=>app.id),['local-studio']);
  const restored=withInstalledApps(base,[{...catalog[0],installed:true,enabled:true}]);
  assert.deepEqual(restored.apps.map(app=>app.id),['local-studio','cad-creator']);
  assert.equal(base.apps.length,2);
});

test('unregistered ecommerce tools never masquerade as installed admin Apps',()=>{
  const base={...defaults,apps:[
    {id:'local-studio',label:'AgentSam',href:'/admin/agentsam'},
    {id:'completeful',label:'Completeful',href:'/admin/products/create?app=completeful',provenance:'ecommerce-bundled-manifest'},
    {id:'resend',label:'Email',href:'/admin/email',provenance:'ecommerce-bundled-manifest'},
    {id:'growth',label:'Growth',href:'/admin/growth',provenance:'ecommerce-bundled-manifest'},
  ]};
  const installed=[{key:'agentsam-app-growth',label:'Growth',href:'/admin/growth',kind:'app',installable:true,
    installed:true,enabled:true,surfaces:['admin-nav']}];
  assert.deepEqual(withInstalledApps(base,installed).apps.map(row=>row.id),['local-studio','growth']);
  assert.deepEqual(withInstalledApps(base,[{...installed[0],installed:false}]).apps.map(row=>row.id),['local-studio']);
});
