import test from 'node:test';
import assert from 'node:assert/strict';
import {createCmsTestDb} from './cms-test-db.mjs';
import {
  createStudioThemeProject, getStudioThemeProject, listStudioThemeProjects,
  saveStudioThemeProject, deleteStudioThemeProject, duplicateStudioThemeProject,
} from '../backend/cms/theme-studio-store.mjs';

const project=()=>({
  schema:'agentsam.theme-project.v1', id:'theme_plain-jane',
  name:'My fully editable stock theme',version:'0.1.0',revision:0,
  sourceThemeId:'plain-jane', sourcePackage:'@inneranimalmedia/theme-plain-jane',
  sourcePackageVersion:'0.3.0',
  sourcePreviewUrl:'https://themes.inneranimalmedia.com/iapj/',
  pages:[{slug:'home',title:'Home',status:'draft',
    template:'<!DOCTYPE html><html><body><!--theme-section:hero--></body></html>',
    sections:[{key:'hero',name:'Hero',html:'<section><h1 data-theme-project-field="title">Welcome</h1></section>',
      content:{title:'Welcome',__editor:{templateKey:'hero',visibility:{enabled:true},blocks:[]}},
      schema:{key:'hero',label:'Hero',fields:[{key:'title',type:'text',binding:{field:'title'}}],blocks:[]},
      zone:'BODY',status:'draft'}]}],tokens:{'--iam-accent':'#008b65'},
});
function dbAdapter(sqlite) {
  return {prepare(sql) {
    let params=[];
    const stmt={
      bind(...args){params=args;return stmt;},
      async first(){return sqlite.prepare(sql).get(...params)||null;},
      async all(){return {results:sqlite.prepare(sql).all(...params)};},
      async run(){const result=sqlite.prepare(sql).run(...params);return {meta:{changes:result.changes}};},
    };return stmt;
  }};
}
function fixture() {
  const sqlite=createCmsTestDb();
  sqlite.exec("PRAGMA foreign_keys=ON; INSERT INTO accounts(id) VALUES ('account_a'),('account_b');");
  const storage=new Map();
  const env={DB:dbAdapter(sqlite),WEBSITE_ASSETS:{
    async put(key,content){storage.set(key,String(content));},
    async get(key){return storage.has(key)?{text:async()=>storage.get(key)}:null;},
    async delete(key){storage.delete(key);},
  }};
  return {sqlite,storage,env};
}
test('every signed-in account can independently create, read, update and delete a site-free theme',async()=>{
  const {sqlite,storage,env}=fixture();
  try{
    assert.equal((await createStudioThemeProject(env,null,project())).status,403);
    const created=await createStudioThemeProject(env,'account_a',project());
    assert.equal(created.ok,true,JSON.stringify(created));
    assert.equal(created.project.revision,1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM cms_sites').get().n,0);
    assert.equal((await getStudioThemeProject(env,'account_b',project().id)).status,404);
    const read=await getStudioThemeProject(env,'account_a',project().id);
    assert.equal(read.project.pages[0].sections[0].content.title,'Welcome');
    const changed=structuredClone(read.project);
    changed.pages[0].sections[0].content.title='My actual custom copy';
    changed.tokens['--iam-accent']='#00ff88';
    const saved=await saveStudioThemeProject(env,'account_a',changed.id,changed,1);
    assert.equal(saved.ok,true);
    assert.equal((await getStudioThemeProject(env,'account_a',changed.id)).project.revision,2);
    assert.equal((await deleteStudioThemeProject(env,'account_a',changed.id,1)).status,409);
    assert.equal((await deleteStudioThemeProject(env,'account_b',changed.id,2)).status,404);
    const removed=await deleteStudioThemeProject(env,'account_a',changed.id,2);
    assert.equal(removed.ok,true,JSON.stringify(removed));
    assert.equal(removed.deleted,true);
    assert.equal(removed.cleanup_pending,false);
    assert.equal((await getStudioThemeProject(env,'account_a',changed.id)).status,404);
    assert.equal((await listStudioThemeProjects(env,'account_a')).projects.length,0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM cms_theme_studio_revisions').get().n,0);
    assert.equal(storage.size,0,'deleted drafts must not leave private snapshot objects behind');
    assert.equal((await createStudioThemeProject(env,'account_a',project())).ok,true,
      'reinstall after deletion must not be locked by a stale unique row');
  }finally{sqlite.close();}
});
test('multiple canvas copies keep separate ownership, content and revision histories',async()=>{
  const {sqlite,env}=fixture();
  try{
    assert.equal((await createStudioThemeProject(env,'account_a',project())).ok,true);
    const duplicate=await duplicateStudioThemeProject(env,'account_a',project().id,'My alternate canvas');
    assert.equal(duplicate.ok,true,JSON.stringify(duplicate));
    assert.match(duplicate.project.id,/^copy_[a-f0-9]{12}$/);
    assert.equal(duplicate.project.name,'My alternate canvas');
    assert.equal(duplicate.project.clonedFromThemeProject,project().id);
    assert.equal(duplicate.project.revision,1);
    assert.equal((await duplicateStudioThemeProject(env,'account_b',project().id)).status,404);
    const original=(await getStudioThemeProject(env,'account_a',project().id)).project;
    original.pages[0].sections[0].content.title='Changed master';
    assert.equal((await saveStudioThemeProject(env,'account_a',original.id,original,1)).ok,true);
    const clone=(await getStudioThemeProject(env,'account_a',duplicate.project.id)).project;
    assert.equal(clone.pages[0].sections[0].content.title,'Welcome');
    assert.equal((await listStudioThemeProjects(env,'account_a')).projects.length,2);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM cms_sites').get().n,0);
  }finally{sqlite.close();}
});
