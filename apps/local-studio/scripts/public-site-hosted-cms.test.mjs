import test from 'node:test';
import assert from 'node:assert/strict';
import { servePublicSitePage } from '../backend/worker/public-site.js';

const site={id:'site_one',account_id:'account_one',slug:'custom-shop',name:'Custom Shop',status:'active'};
const source='sites/custom-shop/public/_cms-publications/cmsp_one/v1-abc.html';
const html='<!doctype html><html><head><base href="/"></head><body><a href="pages/about">About</a><h1>Hello</h1></body></html>';
function envFor(route,alias=false) {
 const visited=[];
 const db={prepare(sql){return {bind(...args){visited.push({sql,args});return {
  async first(){if(sql.includes('FROM cms_sites WHERE id'))return args[0]==='site_one'?site:null;return null},
  async all(){if(sql.includes('SELECT id, site_id, slug, route_path'))return {results:alias?[]:[{id:'cmsp_one',site_id:site.id,slug:'starter',route_path:route,status:'published',content_object_key:source,published_manifest_object_key:null}]};
    if(sql.includes('route_redirects'))return {results:alias?[{route_path:'/pages/starter'}]:[]};
    return {results:[]};}
 };}}}};
 return {DB:db,WEBSITE_ASSETS:{async get(key){return key===source?{async text(){return html}}:null},async put(){}},visited};
}

test('authenticated admin origin serves a published page at the site-owned public path',async()=>{
 const env=envFor('/pages/starter');
 const request=new Request('https://agentsam.inneranimalmedia.com/public-sites/site_one/pages/starter',{headers:{Accept:'text/html'}});
 const response=await servePublicSitePage(request,env);
 assert.equal(response.status,200);
 assert.match(await response.text(),/<base href="\/public-sites\/site_one\/">/);
 assert.equal(response.headers.get('x-public-site-key'),source);
 assert.equal(env.visited[0].args[0],'site_one');
});

test('old published hosted URL redirects within the same hosted site namespace',async()=>{
 const env=envFor('/pages/starter',true);
 const request=new Request('https://agentsam.inneranimalmedia.com/public-sites/site_one/pages/old-name?ref=old',{headers:{Accept:'text/html'}});
 const response=await servePublicSitePage(request,env);
 assert.equal(response.status,301);
 assert.equal(response.headers.get('location'),'https://agentsam.inneranimalmedia.com/public-sites/site_one/pages/starter?ref=old');
});

test('unknown published site identifier does not fall back to another tenant',async()=>{
 const env=envFor('/pages/starter');
 const request=new Request('https://agentsam.inneranimalmedia.com/public-sites/another_account/pages/starter');
 assert.equal(await servePublicSitePage(request,env),null);
});
