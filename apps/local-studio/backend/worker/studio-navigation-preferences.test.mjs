import test from 'node:test';
import assert from 'node:assert/strict';
import { applyNavigationOverrides, listNavigationEntries, normalizeNavigationOverrides, handleStudioNavigation } from './studio-navigation-preferences.js';

const defaults = {
  schema: 'agentsam.host-navigation.v1', source:'included_apps', hostAppId:'local-studio',
  primary:[{id:'home',label:'Home',href:'/admin/home',icon:'home'},
    {id:'media',label:'Media',href:'/media',icon:'content',children:[
      {id:'images',label:'Images',href:'/media/images',icon:'content'}]}],
  channels:[], apps:[{id:'cad-creator',name:'CAD Creator',label:'CAD Creator',href:'/admin/cad',icon:'box'}], utilities:[],
};
function fakeEnv() {
  let stored = null;
  return {
    ASSETS:{fetch:async()=>Response.json(defaults)},
    DB:{prepare(sql) {
      return {
        bind(...values) { this.values=values;return this; },
        async first() {return stored;},
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
