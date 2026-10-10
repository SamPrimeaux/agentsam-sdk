import test from 'node:test';
import assert from 'node:assert/strict';
import {createSamOS} from '../src/sam/os.js';
import {AgentSamClient} from '../src/sam/client.js';

function fixture() {
  const calls=[];
  const source='<section data-cms-section="hero"><h1 data-cms="headline">Original</h1></section>';
  const compiler={
    compileHtmlAuthoring:({html,scope})=>{
      assert.equal(html,source);
      return {schema:'agentsam.authoring-bindings.v1',scope,annotatedHtml:source,
        bindings:[{id:'heading',controls:[{key:'fontSize',css:'font-size'}]}],diagnostics:[]};
    },
    compileScopedStyles:({edits})=>({css:edits.map(e=>'font-size:'+e.value+'px').join(';')}),
    compileSourcePatch:({source:input,patches})=>({source:input.replace(patches[0].before,patches[0].after),patches})
  };
  const repo={
    async getSource({principal,artifactId}) {calls.push(['read',principal.accountId,artifactId]); return {source,revision:3,contentHash:'hash3',fragment:true};},
    async saveDraftStyles(args) {calls.push(['style',args]);return {ok:true,revisionId:'cms-rev-4'};},
    async saveSourceDraft(args) {calls.push(['source',args]);return {ok:true,revisionId:'cms-rev-5',artifactId:'art-v2'};}
  };
  const allowed={value:true};
  const opts={compiler,repository:repo,resolveTrustedContext:async()=>({accountId:'merchant-a',actorId:'owner'}),
    authorize:async()=>allowed.value};
  return {calls,allowed,opts};
}

test('SAM OS binds five actual authoring operations, never descriptors', async()=>{
  const f=fixture();
  const os=createSamOS({core:false,authoring:f.opts});
  const names=os.list().map(o=>o.id);
  assert.deepEqual(names,[
    'sam.authoring.inspect','sam.authoring.previewStyles','sam.authoring.proposeSourcePatch',
    'sam.authoring.saveDraftStyles','sam.authoring.saveSourceDraft'
  ]);
  const client=new AgentSamClient({os});
  const inspect=await client.invoke('sam.authoring.inspect',{artifactId:'art',scope:'hero'});
  assert.equal(inspect.ok,true);
  assert.equal(inspect.data.bindings[0].id,'heading');
  f.allowed.value=false;
  const denied=await client.invoke('sam.authoring.inspect',{artifactId:'art',scope:'hero'});
  assert.equal(denied.ok,false);
  assert.match(denied.error.message,/access_denied/);
  f.allowed.value=true;
  const stale=await client.invoke('sam.authoring.saveDraftStyles',{artifactId:'art',scope:'hero',expectedRevision:2,expectedHash:'hash3'});
  assert.equal(stale.ok,false);
  assert.match(stale.error.message,/stale_revision/);
  const draft=await client.invoke('sam.authoring.saveDraftStyles',{artifactId:'art',pageId:'shop',sectionId:'hero',
    scope:'hero',expectedRevision:3,expectedHash:'hash3',expectedCmsRevision:4,edits:[{nodeId:'heading',property:'fontSize',value:60}]});
  assert.equal(draft.ok,true);
  assert.equal(draft.data.revisionId,'cms-rev-4');
  assert.equal(draft.data.published,false);
  assert.equal(f.calls.find(x=>x[0]==='style')[1].principal.accountId,'merchant-a');
  const missingReview=await client.invoke('sam.authoring.saveSourceDraft',{artifactId:'art',scope:'hero',expectedRevision:3,
    expectedHash:'hash3',patches:[{before:'Original',after:'Improved'}]});
  assert.equal(missingReview.ok,false);
  assert.match(missingReview.error.message,/review_required/);
  const sourceDraft=await client.invoke('sam.authoring.saveSourceDraft',{artifactId:'art',scope:'hero',
    expectedRevision:3,expectedHash:'hash3',approved:true,patches:[{before:'Original',after:'Improved'}]});
  assert.equal(sourceDraft.ok,true);
  assert.equal(sourceDraft.data.artifactId,'art-v2');
  assert.equal(sourceDraft.data.published,false);
});

test('missing adapters fail fast; no pretend operation registration',()=>{
  assert.throws(()=>createSamOS({core:false,authoring:{}}),/compiler_missing/);
});
