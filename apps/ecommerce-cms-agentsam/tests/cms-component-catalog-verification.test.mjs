import test from 'node:test';
import assert from 'node:assert/strict';
import '../packages/theme-contract/runtime/portable-sections.js';
import { normalizeCmsCatalogTemplate, listCmsComponentCatalog } from '../backend/cms/definition-registry.mjs';

const base = {
  id:'t1',sku:'SKU-PORTABLE-HERO',template_name:'Sticky curtain',template_type:'section',
  status:'active',item_type:'section',tags:'[]',template_data:'{"renderer_key":"fake:key","implementation_status":"implemented"}',
  editor_schema_json:'{}',compatibility_json:'{}',responsive_schema_json:'{}',data_bindings_json:'{}',
  preview_json:'{}',definition_key:'revise/sticky-curtain',definition_version:'1',
  resolved_definition_id:'d1',resolved_definition_kind:'section',
  resolved_definition_version:'1',definition_status:'active',
  definition_origin:'built_in',definition_metadata_json:'{"rendererKey":"fake:key","implementationStatus":"implemented","implementationClass":"native"}',
  resolved_component_id:'c1',resolved_renderer_key:'revise/sticky-curtain',
  resolved_implementation_status:'verified',resolved_delivery_mode:'bundled',
};
test('metadata cannot impersonate a verified cms_components renderer',()=>{
  const row=normalizeCmsCatalogTemplate(base);
  assert.equal(row.rendererKey,'revise/sticky-curtain');
  assert.equal(row.implementationStatus,'verified');
  assert.equal(row.rendererVerified,true);
  assert.equal(row.runtimeReady,true);
  assert.equal(row.installable,true);
  for(const change of [
    {resolved_component_id:null},
    {resolved_implementation_status:'unverified'},
    {resolved_renderer_key:'fake:key'},
    {resolved_definition_version:'99'},
    {definition_status:'draft'},
    {status:'draft'}
  ]) assert.equal(normalizeCmsCatalogTemplate({...base,...change}).installable,false,
    JSON.stringify(change));
});
test('an unrecognized bundled implementation cannot become installable by metadata',()=>{
  const row=normalizeCmsCatalogTemplate({...base,resolved_renderer_key:'fake:key'});
  assert.equal(row.rendererVerified,true);
  assert.equal(row.runtimeReady,false);
  assert.equal(row.installable,false);
});
test('the account-scoped catalog SQL reads actual component status, key and delivery',async()=>{
  let sql='',binds=[];
  const env={DB:{prepare(query){sql=query;return {
    bind(...args){binds=args;return this;},
    async all(){return {results:[base]};},
  };}}};
  const rows=await listCmsComponentCatalog(env,'merchant-a');
  assert.equal(binds[0],'merchant-a');
  assert.match(sql,/c\.renderer_key AS resolved_renderer_key/);
  assert.match(sql,/c\.implementation_status AS resolved_implementation_status/);
  assert.match(sql,/c\.delivery_mode AS resolved_delivery_mode/);
  assert.equal(rows.length,1);
  assert.equal(rows[0].installable,true);
});
