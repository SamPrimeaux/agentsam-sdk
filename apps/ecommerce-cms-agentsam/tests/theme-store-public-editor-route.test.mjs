import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../frontend/static/js/theme-editor.js',import.meta.url),'utf8');
const start=source.indexOf('  function pageRoute(pageSlug) {');
const end=source.indexOf('\n\n  function ownerSections(',start);
assert.ok(start>=0&&end>start);
const selected=source.slice(start,end);

function resolve({siteId='theme-store',page={slug:'home',status:'published',route_path:'/'},routeSite=siteId}={}) {
  const ctx={
    host:null,slug:page.slug,pageData:page,pages:[page],activeCmsSite:{id:siteId,primary_domain:'themes.inneranimalmedia.com'},
    fallbackPages:[],window:{
      cmsActiveSiteId:routeSite,
      cmsEditorStorefrontUrl:(site,route)=> 'https://'+site.primary_domain+route
    }
  };
  return vm.runInNewContext(
    selected+'\npageRoute(slug)', ctx,
    {timeout:1000});
}

test('Theme Store published homepage resolves its actual storefront, not a generic SDK demo',()=>{
  assert.equal(resolve(), 'https://themes.inneranimalmedia.com/');
  assert.equal(resolve({page:{slug:'themes',status:'published',route_path:'/themes/'}}), 'https://themes.inneranimalmedia.com/themes/');
});
test('private drafts, internal site globals and foreign site context never become public previews',()=>{
  assert.equal(resolve({page:{slug:'idktest',status:'draft',route_path:'/idktest'}}),null);
  assert.equal(resolve({page:{slug:'site-shell',status:'published',route_path:'/_site-shell'}}),null);
  assert.equal(resolve({routeSite:'foreign-site'}),null);
});
