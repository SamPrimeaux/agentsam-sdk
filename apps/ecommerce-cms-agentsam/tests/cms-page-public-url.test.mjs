import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const scope={};
runInNewContext(readFileSync(new URL('../frontend/static/js/cms-site-public-url.js',import.meta.url),'utf8'),
 {window:scope,URL});
const {cmsPublicSiteOrigin,cmsPublicPageUrl}=scope;
test('site-owned published URLs use the CMS primary_domain instead of the AgentSam host',()=>{
  const site={id:'theme-store',status:'active',primary_domain:'themes.inneranimalmedia.com'};
  assert.equal(cmsPublicSiteOrigin(site),'https://themes.inneranimalmedia.com');
  assert.equal(cmsPublicPageUrl(site,'/app-embeds/'),'https://themes.inneranimalmedia.com/app-embeds/');
  assert.equal(cmsPublicPageUrl(site,'/'),'https://themes.inneranimalmedia.com/');
});
test('site URL resolution fails closed for absent, unsafe or mismatched public domains',()=>{
  for(const domain of [null,'','http://example.com','https://example.com:8080','localhost','user@example.com','https://example.com/path','javascript:alert(1)']){
    assert.equal(cmsPublicSiteOrigin({primary_domain:domain}),null);
  }
  const site={primary_domain:'themes.inneranimalmedia.com'};
  for(const route of ['//other-domain/','/../bad','javascript:','/foo?draft=1','/foo#frag']){
    assert.equal(cmsPublicPageUrl(site,route),null);
  }
});
test('page edit does not interpret the AgentSam admin origin as the public domain',()=>{
  const html=readFileSync(new URL('../frontend/static/page-edit.html',import.meta.url),'utf8');
  assert.match(html,/cms-site-public-url\.js/);
  assert.match(html,/window\.cmsPublicPageUrl\(pageData\?\.site, pageData\?\.route_path\)/);
  assert.doesNotMatch(html,/viewButton\.href = publishedRoute/);
  assert.doesNotMatch(html,/previewLink\.href = publishedRoute/);
});
