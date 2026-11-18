import test from 'node:test';
import assert from 'node:assert/strict';
import { createMerchantCms, CMS_PAGE_KINDS } from '../src/index.js';

function fixture() {
  const calls=[];
  const page=new Map();
  const repository={
    async getSite(scope){return {id:scope.siteId,account_id:scope.accountId};},
    async listPages(scope,options){calls.push(['listPages',scope,options]);return [...page.values()];},
    async readPage(scope,id){return page.get(id)||null;},
    async createPageDraft(scope,input){
      if(page.has(input.pageId))throw Error('already_exists');
      const draft={id:input.pageId,siteId:scope.siteId,accountId:scope.accountId,
        version:1,status:'draft',...input};
      page.set(input.pageId,draft);
      return {ok:true,accountId:scope.accountId,siteId:scope.siteId,pageId:input.pageId,version:1};
    },
    async updatePageDraft(scope,input){
      const current=page.get(input.pageId);
      if(current.version!==input.expectedVersion)throw Error('version_conflict');
      page.set(input.pageId,{...current,...input.changes,version:current.version+1});
      return {ok:true,pageId:input.pageId,version:current.version+1};
    },
    async duplicatePageDraft(scope,input){return {ok:true,pageId:input.newPageId};},
    async archivePage(scope,input){return {ok:true,pageId:input.pageId};},
    async history(){return [{revision:1}];},
    async restoreRevision(scope,input){return {ok:true,pageId:input.pageId};},
    async previewPage(scope,input){return {published:false,document:page.get(input.pageId)};},
    async publishPage(scope,input){
      return {ok:true,siteId:scope.siteId,pageId:input.pageId,
        manifestObjectKey:'cms/releases/1.json',
        manifestHash:'a'.repeat(64),releaseNumber:1};
    },
    async rollbackPage(scope,input){
      return {ok:true,pageId:input.pageId,manifestObjectKey:'cms/releases/2.json',
        manifestHash:'b'.repeat(64),releaseNumber:2};
    },
    async getPublication(){return {status:'published',manifestObjectKey:'cms/releases/1.json'};},
    async listThemes(){return [];},
    async installTheme(scope,input){return {ok:true,themeId:input.themeId};},
    async publishTheme(scope,input){return {ok:true,themeId:input.themeId,
      manifestObjectKey:'cms/themes/1.json',manifestHash:'b'.repeat(64),releaseNumber:1};},
    async listNavigation(){return [];},
    async saveNavigation(){return {ok:true};},
    async listAssets(){return [];}
  };
  const actor={accountId:'merchant',siteId:'site1',actorId:'editor'};
  const allowed=({effect})=>effect==='publish'
    ? {allow:true,publicationApproved:true}:{allow:true};
  const options={
    repository,
    resolveTrustedContext:()=>actor,
    authorize:allowed
  };
  return {repository,actor,options,calls,page};
}
test('merchant CMS uses only host methods and site-scoped account identity',async()=>{
  const f=fixture(),app=createMerchantCms(f.options);
  assert.ok(CMS_PAGE_KINDS.includes('checkout'));
  assert.equal((await app.sites.current()).id,'site1');
  assert.deepEqual(await app.pages.list(),[]);
  const created=await app.pages.create({
    pageId:'home',title:'Home',slug:'home',routePath:'/',pageType:'home',
    idempotencyKey:'create-home-1'
  });
  assert.equal(created.pageId,'home');
  const updated=await app.pages.update({
    pageId:'home',expectedVersion:1,
    changes:{seo:{title:'Store Home',description:'Hello'},navVisible:true},
    idempotencyKey:'update-home-1'
  });
  assert.equal(updated.version,2);
  assert.equal((await app.pages.read({pageId:'home'})).seo.title,'Store Home');
  assert.equal((await app.pages.preview({pageId:'home'})).published,false);
  assert.equal((await app.pages.revisions({pageId:'home'}))[0].revision,1);
  assert.equal((await app.pages.publish({
    pageId:'home',expectedVersion:2,confirmation:true,idempotencyKey:'publish-home-1'
  })).releaseNumber,1);
  assert.equal((await app.pages.published({pageId:'home'})).status,'published');
  assert.equal((await app.pages.rollback({
    pageId:'home',releaseNumber:1,confirmation:true,idempotencyKey:'rollback-home-1'
  })).releaseNumber,2);
  assert.equal((await app.themes.install({
    themeId:'harbor',sourceRef:'release:harbor',sourceVersion:'1.0.0',
    idempotencyKey:'install-theme-1'
  })).themeId,'harbor');
  assert.equal((await app.themes.publish({
    themeId:'harbor',expectedVersion:1,confirmation:true,idempotencyKey:'publish-theme-1'
  })).releaseNumber,1);
  assert.equal((await app.navigation.save({
    menuId:'main',expectedVersion:1,items:[{label:'Shop',path:'/shop'}]
  })).ok,true);
});
test('CMS fails closed on client scope, malformed paths and publish without trusted approval',async()=>{
  const f=fixture();
  const app=createMerchantCms(f.options);
  await assert.rejects(app.pages.create({
    pageId:'home',title:'Home',slug:'home',routePath:'//untrusted',
    idempotencyKey:'create-home-1'
  }),/cms_page_route_invalid/);
  await assert.rejects(app.pages.create({
    pageId:'home',title:'Home',slug:'home',routePath:'/',
    idempotencyKey:'x'
  }),/cms_idempotency_key_required/);
  await assert.rejects(app.pages.update({
    pageId:'home',expectedVersion:1,changes:{accountId:'another'},
    idempotencyKey:'update-home-1'
  }),/cms_page_field_not_editable/);
  await assert.rejects(app.pages.publish({
    pageId:'home',expectedVersion:1,idempotencyKey:'publish-home-1',confirmation:false
  }),/cms_publish_confirmation_required/);
  const unapproved=createMerchantCms({...f.options,authorize:()=>true});
  await assert.rejects(unapproved.pages.publish({
    pageId:'home',expectedVersion:1,idempotencyKey:'publish-home-1',confirmation:true
  }),/cms_publication_approval_required/);
  const wrongSite=createMerchantCms({...f.options,
    repository:{...f.repository,getSite:()=>({id:'different',account_id:'merchant'})}
  });
  await assert.rejects(wrongSite.pages.list(),/cms_site_not_owned/);
  const forgedScope=createMerchantCms({...f.options,resolveTrustedContext:()=>({
    accountId:'merchant',actorId:'editor'
  })});
  await assert.rejects(forgedScope.pages.list(),/cms_trusted_scope_required/);
});
test('CMS will not announce publication without durable host manifest proof',async()=>{
  const f=fixture();
  const app=createMerchantCms({...f.options,repository:{
    ...f.repository,publishPage:async()=>({ok:true,pageId:'home',status:'published'})
  }});
  await assert.rejects(app.pages.publish({
    pageId:'home',expectedVersion:1,idempotencyKey:'publish-home-1',confirmation:true
  }),/cms_publication_proof_required/);
});
