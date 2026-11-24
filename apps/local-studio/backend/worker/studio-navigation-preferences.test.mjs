import test from 'node:test';
import assert from 'node:assert/strict';
import { applyNavigationOverrides, listNavigationEntries, normalizeNavigationOverrides, handleStudioNavigation, withInstalledApps } from './studio-navigation-preferences.js';

const defaults = {
  schema: 'agentsam.host-navigation.v1', source:'included_apps', hostAppId:'local-studio',
  primary:[{id:'home',label:'Home',href:'/admin/home',icon:'home'},
    {id:'media',label:'Media',href:'/media',icon:'content',children:[
      {id:'images',label:'Images',href:'/media/images',icon:'content'}]}],
  work:[], channels:[],
  apps:[{id:'cad-creator',app_id:'cad-creator',screen_id:'cad-creator.workspace',name:'CAD Creator',label:'CAD Creator',href:'/admin/cad',icon:'box'}],
  utilities:[],
  appManifests:[
    {id:'cad-creator',version:'1.0.0',screens:[{id:'cad-creator.workspace',app_id:'cad-creator',route:'/admin/cad'}]},
  ],
};

function fakeEnv(catalogRows = [], navigation = defaults, pluginRows = []) {
  let stored = null;
  return {
    ASSETS:{fetch:async()=>Response.json(navigation)},
    DB:{prepare(sql) {
      return {
        bind(...values) { this.values=values;return this; },
        async first() {return stored;},
        async all() {return {results: sql.includes('agentsam_plugin_installations') ? pluginRows : catalogRows};},
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
test('navigation API canonicalizes legacy dashboard destinations before exposing them', async () => {
  const env = fakeEnv();
  const response = await handleStudioNavigation(request(), env, 'account-1');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.primary.find(item => item.id === 'media').href, '/admin/media');
  assert.equal(data.primary.find(item => item.id === 'media').children[0].href, '/admin/media/images');
  const overrides = normalizeNavigationOverrides({
    'primary/media': { href: '/media/images?sort=recent#grid' },
  }, defaults);
  assert.equal(overrides['primary/media'].href, '/admin/media/images?sort=recent#grid');
});


test('navigation API resolves installed plugin screens into their manifest-owned channel group', async () => {
  const growthNavigation = {
    ...defaults,
    channels: [{
      id:'audience',label:'Audience',href:'/admin/audience',icon:'users',children:[
        {id:'growth',app_id:'agentsam-app-growth',screen_id:'growth.workspace',label:'Growth',href:'/admin/growth',icon:'chart-no-axes-combined'},
      ],
    }],
    appManifests:[...defaults.appManifests,{
      id:'ecommerce-cms-agentsam',version:'2.6.18',screens:[{
        id:'growth.workspace',app_id:'agentsam-app-growth',route:'/admin/growth',
        navigation:{surface:'channels',parent:'audience',key:'growth',label:'Growth',icon:'chart-no-axes-combined'},
        mount:{type:'document',path:'/admin/growth'},
      }],
    }],
  };
  const pluginRows=[{
    plugin_key:'agentsam-app-growth',display_name:'Growth',description:'Audience growth tools',icon_url:null,
    metadata_json:JSON.stringify({app:{nav:{label:'Growth',href:'/admin/growth',icon:'chart'},surfaces:['admin-nav']}}),
    enabled:1,setup_status:'configured',
    config_json:JSON.stringify({runtime:{manifest_id:'ecommerce-cms-agentsam',screen_ids:['growth.workspace']}}),
    instance_key:'default',updated_at:100,
  }];
  const response=await handleStudioNavigation(request(),fakeEnv([],growthNavigation,pluginRows),'account-1');
  assert.equal(response.status,200);
  const data=await response.json();
  assert.deepEqual(data.channels[0].children.map(item=>item.id),['growth']);
  assert.equal(data.apps.some(item=>item.id==='plugin-agentsam-app-growth'),false);
  assert.equal(data.channels[0].children[0].href,'/admin/growth');
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


// Rows as the `apps` + `agentsam_app_installations` join returns them.
const catalogRecord = (key, {enabled = 1, installed = 1, href = '/admin/apps/' + key, label = key} = {}) => ({
  id: key, name: label, description: '', icon_url: null, app_icon: null, launch_url: href,
  config_json: JSON.stringify({ runtime: { manifest_id: 'local-studio', screen_ids: [key + '.page'] } }),
  install_id: installed ? 'inst_' + key : null, enabled,
});

test('installed account plugins flow into the canonical shared navigation, not a second shell', () => {
  const result = withInstalledApps(defaults, [
    {key:'campaign',label:'AgentSam Campaign',href:'/admin/apps/campaign',kind:'plugin',installed:true,enabled:true,surfaces:['admin-nav']},
    {key:'plugin-disabled',label:'Disabled',href:'/admin/apps/disabled',kind:'plugin',installed:true,enabled:false,surfaces:['admin-nav']},
  ]);
  assert.deepEqual(result.apps.map(app => app.id), ['plugin-campaign']);
  assert.equal(result.apps[0].source, 'account-plugin');
  assert.equal(result.apps[0].href, '/admin/apps/campaign');
  assert.equal(listNavigationEntries(result).some(row => row.key === 'apps/plugin-campaign'), true);
});

test('removed app screen overrides are filtered at read time and do not re-create an uninstalled link', async () => {
  const campaignNavigation = {
    ...defaults,
    apps:[...defaults.apps,{id:'campaign',app_id:'campaign',screen_id:'campaign.page',label:'Campaign',href:'/admin/apps/campaign',icon:'apps'}],
    appManifests:[...defaults.appManifests,{id:'local-studio',version:'1.0.0',screens:[{id:'campaign.page',app_id:'campaign',route:'/admin/apps/campaign'}]}],
  };
  const env = fakeEnv([catalogRecord('campaign')], campaignNavigation);
  let response = await handleStudioNavigation(request('PATCH', {
    expectedRevision:0,overrides:{'apps/campaign':{label:'Campaign Custom'}}
  }),env,'account-1');
  assert.equal(response.status,200);
  const before = await response.json();
  assert.equal(before.apps.some(item=>item.id==='campaign' && item.label==='Campaign Custom'),true);
  // Simulate account uninstall without changing the saved presentation record.
  const original = env.DB.prepare;
  env.DB.prepare = sql => {
    const statement = original(sql);
    if (sql.includes('FROM apps a')) statement.bind = () => ({all:async()=>({results:[]})});
    return statement;
  };
  response = await handleStudioNavigation(request(),env,'account-1');
  assert.equal(response.status,200);
  const after = await response.json();
  assert.equal(after.apps.some(item=>item.id==='campaign'),false);
  assert.deepEqual(after.overrides,{});
});

test('installed-app reconciliation rejects unsafe metadata without creating navigation authority', () => {
  const payload = withInstalledApps(defaults, [
    {key:'cad-creator',kind:'app',installed:true,enabled:true,screens:[{id:'cad-creator.workspace'}]},
    {key:'a',label:'Good App',href:'/admin/apps/a',kind:'plugin',installed:true,enabled:true,surfaces:['admin-nav']},
    {key:'b',label:'Bad',href:'javascript:alert(1)',kind:'plugin',installed:true,enabled:true,surfaces:['admin-nav']},
    {key:'c',label:'Bad',href:'/admin/x" onload="evil',kind:'plugin',installed:true,enabled:true,surfaces:['admin-nav']},
    {key:'d',label:'Disabled',href:'/admin/d',kind:'plugin',installed:true,enabled:false,surfaces:['admin-nav']},
  ]);
  assert.deepEqual(payload.apps.map(app=>app.id),['cad-creator','plugin-a']);
  assert.equal(defaults.apps.length,1);
});

test('account app removal hides optional static host nav without affecting core apps',()=>{
  const base={...defaults,apps:[
    {id:'local-studio',label:'AgentSam',href:'/admin/agentsam',app_id:'local-studio',screen_id:'local-studio.chat',host_core:true},
    {id:'cad-creator',label:'CAD Creator',href:'/admin/cad',app_id:'agentsam-stage-cad',screen_id:'cad-creator.workspace',aliases:['/cad']},
  ]};
  const catalog=[{key:'agentsam-stage-cad',label:'CAD Creator',href:'/cad',kind:'app',installable:true,
    installed:false,enabled:false,surfaces:['admin-nav'],screens:[{id:'cad-creator.workspace'}]}];
  assert.deepEqual(withInstalledApps(base,catalog).apps.map(app=>app.id),['local-studio']);
  const restored=withInstalledApps(base,[{...catalog[0],installed:true,enabled:true}]);
  assert.deepEqual(restored.apps.map(app=>app.id),['local-studio','cad-creator']);
  assert.equal(base.apps.length,2);
});

test('unregistered ecommerce tools never masquerade as installed admin Apps',()=>{
  const base={...defaults,apps:[
    {id:'local-studio',label:'AgentSam',href:'/admin/agentsam',host_core:true},
    {id:'completeful',label:'Completeful',href:'/admin/products/create?app=completeful',app_id:'completeful',screen_id:'completeful.app',provenance:'ecommerce-bundled-manifest'},
    {id:'resend',label:'Email',href:'/admin/email',app_id:'resend',screen_id:'resend.app',provenance:'ecommerce-bundled-manifest'},
    {id:'growth',label:'Growth',href:'/admin/growth',app_id:'agentsam-app-growth',screen_id:'growth.workspace',provenance:'ecommerce-bundled-manifest'},
  ]};
  const installed=[{key:'agentsam-app-growth',label:'Growth',href:'/admin/growth',kind:'app',installable:true,
    installed:true,enabled:true,surfaces:['admin-nav'],screens:[{id:'growth.workspace'}]}];
  assert.deepEqual(withInstalledApps(base,installed).apps.map(row=>row.id),['local-studio','growth']);
  assert.deepEqual(withInstalledApps(base,[{...installed[0],installed:false}]).apps.map(row=>row.id),['local-studio']);
});


test('installed Commerce CMS does not duplicate canonical Online Store navigation',()=>{
  const base={...defaults,channels:[{id:'online-store',label:'Online Store',href:'/admin/store'}]};
  const installed=[
    {key:'ecommerce-cms-agentsam',label:'Ecommerce + CMS',href:'/apps/ecommerce-cms-agentsam',kind:'app',installable:true,installed:true,enabled:true,surfaces:['admin-nav']},
    {key:'cad-creator',label:'CAD Creator',href:'/admin/cad',kind:'app',installable:true,installed:true,enabled:true,surfaces:['admin-nav'],screens:[{id:'cad-creator.workspace'}]},
  ];
  const result=withInstalledApps(base,installed);
  assert.equal(result.apps.some(app=>app.pluginKey==='ecommerce-cms-agentsam'),false);
  assert.equal(result.apps.some(app=>app.id==='cad-creator'),true);
  assert.equal(installed[0].installed,true);
});

test('legacy plugin navigation is folded into the installed packaged screen instead of duplicating it', () => {
  const result = withInstalledApps(defaults, [
    {key:'cad-creator',kind:'app',installed:true,enabled:true,href:'/admin/cad',legacy_href:'/cad',screens:[{id:'cad-creator.workspace'}]},
    {key:'agentsam-stage-cad',kind:'plugin',installed:true,enabled:true,href:'/cad',label:'CAD Creator',surfaces:['admin-nav']},
  ]);
  assert.deepEqual(result.apps.map(item=>item.id), ['cad-creator']);
});
