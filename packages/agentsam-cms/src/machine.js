/**
 * Full portable SAM CMS machine. Host provides repository, definitions and IAM
 * authorization. No ecommerce UI, global seed or D1 binding dependency.
 */
import { CMS_OPERATION_CONTRACTS } from './contracts.js';
import { createCmsCompatibilityOperations } from './aliases.js';

const fail = (code,details={}) => {throw Object.assign(new Error(code),{code,...details});};
const clone = value => structuredClone(value);
const sha = async value => {
  const data = new TextEncoder().encode(JSON.stringify(value));
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',data));
  return Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
};
const identityValid = value => value && typeof value.accountId==='string' && value.accountId
  && typeof value.installationId==='string' && value.installationId
  && typeof value.actorId==='string' && value.actorId;
const isObject = value => value!==null && typeof value==='object' && !Array.isArray(value);

function assertSchema(value, schema, at='input') {
  if (!schema) return;
  const type=schema.type;
  const ok=type==='object' ? isObject(value)
    :type==='array' ? Array.isArray(value)
    :type==='integer' ? Number.isInteger(value)
    :type==='number' ? typeof value==='number' && Number.isFinite(value)
    :type ? typeof value===type : true;
  if(!ok) fail('cms_schema_invalid_type',{field:at});
  if(schema.const!==undefined && value!==schema.const) fail('cms_schema_invalid_const',{field:at});
  if(schema.enum && !schema.enum.includes(value)) fail('cms_schema_invalid_choice',{field:at});
  if(typeof value==='string') {
    if(schema.minLength!==undefined && value.length<schema.minLength) fail('cms_schema_string_short',{field:at});
    if(schema.maxLength!==undefined && value.length>schema.maxLength) fail('cms_schema_string_long',{field:at});
    if(schema.pattern && !(new RegExp(schema.pattern).test(value))) fail('cms_schema_string_pattern',{field:at});
  }
  if(typeof value==='number') {
    if(schema.minimum!==undefined && value<schema.minimum) fail('cms_schema_number_low',{field:at});
    if(schema.maximum!==undefined && value>schema.maximum) fail('cms_schema_number_high',{field:at});
  }
  if(isObject(value)) {
    if(schema.minProperties!==undefined && Object.keys(value).length<schema.minProperties) fail('cms_schema_empty_patch',{field:at});
    for(const required of schema.required||[]) if(!Object.hasOwn(value,required)) fail('cms_schema_required',{field:at+'.'+required});
    for(const [k,v] of Object.entries(value)) {
      if(['__proto__','constructor','prototype'].includes(k)) fail('cms_unsafe_setting_key',{field:at+'.'+k});
      const property = schema.properties?.[k];
      if(property) assertSchema(v,property,at+'.'+k);
      else if(schema.additionalProperties===false) fail('cms_schema_unknown_field',{field:at+'.'+k});
      else if(isObject(schema.additionalProperties)) assertSchema(v,schema.additionalProperties,at+'.'+k);
    }
  }
  if(Array.isArray(value)) {
    if(schema.minItems!==undefined && value.length<schema.minItems) fail('cms_schema_array_short',{field:at});
    if(schema.maxItems!==undefined && value.length>schema.maxItems) fail('cms_schema_array_long',{field:at});
    if(schema.items) value.forEach((item,index)=>assertSchema(item,schema.items,at+'['+index+']'));
  }
}
export {assertSchema as validateCmsSchema};
function findComponent(page,id) {
  for(const [index,section] of page.sections.entries()) {
    if(section.id===id) return {parent:page,items:page.sections,index,node:section,kind:'section'};
    for(const [blockIndex,block] of section.blocks.entries()) {
      if(block.id===id) return {parent:section,items:section.blocks,index:blockIndex,node:block,kind:'block'};
    }
  }
  fail('cms_component_not_found',{componentId:id});
}
function defFor(definitions,kind,key) {
  const def=definitions.find(d=>d.key===key&&d.kind===kind&&d.status!=='disabled');
  if(!def) fail('cms_definition_not_installed',{definitionKey:key,kind});
  return def;
}
function validateSettings(def,settings) {
  assertSchema(settings,def.settings_schema||{type:'object',additionalProperties:false},'settings');
  return clone(settings);
}
function visibleDocument(page) {
  const {dedupe,createKey,...publicPage}=page;
  return clone(publicPage);
}
function snapshotResource(page,id) {
  return id?findComponent(page,id).node:page;
}
const updated = async (page,extra={})=>({ok:true,pageId:page.id,version:page.version,digest:await sha({...page,dedupe:{}}),...extra});

export function createCmsOperations({defineSamOperation,repository,definitions=[],resolveTrustedContext,authorize,createId=()=>crypto.randomUUID(),includeCompatibilityAliases=true}={}) {
  if(typeof defineSamOperation!=='function') throw new TypeError('cms_defineSamOperation_required');
  for(const key of ['createPage','readPage','mutate','history','getRevision','getPublication']) {
    if(typeof repository?.[key]!=='function') throw new TypeError('cms_repository_missing_'+key);
  }
  if(typeof resolveTrustedContext!=='function'||typeof authorize!=='function') throw new TypeError('cms_trusted_host_required');
  if(!Array.isArray(definitions)) throw new TypeError('cms_definitions_array_required');
  const seen=new Set();
  for(const def of definitions) {
    if(!['section','block'].includes(def.kind)||!def.key||!def.settings_schema) fail('cms_definition_invalid');
    if(seen.has(def.kind+':'+def.key)) fail('cms_definition_duplicate');
    seen.add(def.kind+':'+def.key);
  }
  const schemaFor = name => CMS_OPERATION_CONTRACTS.find(c=>c.name===name);
  const operations = CMS_OPERATION_CONTRACTS.map(contract => defineSamOperation({
    id:contract.name,version:1,module:'cms',action:contract.name.slice(4),
    summary:contract.description,description:contract.description,
    capabilities:[contract.capability],input_schema:contract.input_schema,
    output_schema:contract.output_schema,
    risk:contract.effect==='read'?'read_only':contract.effect==='live_publish'?'privileged':'write',
    execution:{lanes:['platform','local'],model:'never',network:'optional',
      sideEffects:contract.effect==='read'?'none':'remote_write'},
    async handler(input={},sdkContext={}) {
      assertSchema(input,contract.input_schema);
      const actor=await resolveTrustedContext(sdkContext);
      if(!identityValid(actor)) fail('cms_trusted_identity_required');
      const decision=await authorize({operation:contract.name,requestedAlias:sdkContext.requestedAlias||null,capability:contract.capability,effect:contract.effect,identity:actor,
        resource:{pageId:input.pageId||null,componentId:input.componentId||null},input});
      if(decision!==true && decision?.allow!==true) fail('cms_operation_not_authorized');
      // A model-provided confirmation boolean is not permission to publish.
      // Hosts must record explicit approval through their trusted policy layer.
      if(contract.effect==='live_publish' && decision?.publicationApproved!==true)
        fail('cms_publish_approval_required');
      if(contract.name==='cms.definition.list') {
        return {ok:true,definitions:definitions.filter(d=>(!input.kind||d.kind===input.kind)&&(!input.key||d.key===input.key)&&(!input.status||d.status===input.status)).map(clone)};
      }
      if(contract.name==='cms.page.createDraft') {
        const saved=await repository.createPage(actor,input);
        return {ok:true,pageId:saved.document.id,version:saved.document.version,published:false,idempotent:saved.duplicate};
      }
      const page=await repository.readPage(actor,input.pageId);
      if(!page) fail('cms_page_not_found');
      if(contract.name==='cms.resource.inspect') {
        return {ok:true,page:visibleDocument(page),resource:input.componentId?clone(snapshotResource(page,input.componentId)):visibleDocument(page)};
      }
      if(contract.name==='cms.revision.history') return {ok:true,pageId:page.id,revisions:await repository.history(actor,page.id,input.limit||30)};
      if(contract.name==='cms.page.preview') {
        return {ok:true,pageId:page.id,version:page.version,document:visibleDocument(page),digest:await sha({...page,dedupe:{}}),published:false};
      }
      if(contract.name==='cms.component.update' && !Object.keys(input.patch).length) fail('cms_empty_settings_patch');
      const operation=contract.name;
      // Resolve the authorized historical version outside the synchronous CAS.
      // The transaction still verifies the current draft version atomically.
      const restoreSnapshot=operation==='cms.revision.restore'
        ? await repository.getRevision(actor,input.pageId,input.revision) : null;
      if(operation==='cms.revision.restore' && !restoreSnapshot) fail('cms_revision_not_found');
      const fingerprint=await sha({name:operation,input});
      const publishDigest=operation==='cms.page.publish'?await sha({...page,dedupe:{}}):null;
      const mutation = await repository.mutate(actor,{
        pageId:input.pageId,expectedVersion:input.expectedVersion,effect:contract.effect,
        idempotencyKey:input.idempotencyKey||null,fingerprint,
        apply(draft) {
          if(operation==='cms.component.create') {
            const definition=defFor(definitions,input.kind,input.definitionKey);
            let items=draft.sections;
            if(input.kind==='block'){
              if(!input.parentId) fail('cms_block_parent_required');
              const parent=findComponent(draft,input.parentId);
              if(parent.kind!=='section') fail('cms_block_parent_must_be_section');
              const parentDef=defFor(definitions,'section',parent.node.definitionKey);
              if(parentDef.allowedBlocks && !parentDef.allowedBlocks.includes(input.definitionKey)) fail('cms_block_not_allowed_by_parent');
              items=parent.node.blocks;
            } else if(input.parentId) fail('cms_section_cannot_have_parent');
            const node={id:'cmp_'+createId().replaceAll('-',''),kind:input.kind,definitionKey:definition.key,
              settings:validateSettings(definition,input.settings||{}),visible:true,
              ...(input.kind==='section'?{blocks:[]}:{})};
            const pos=input.position??items.length;
            if(pos>items.length) fail('cms_index_out_of_bounds');
            items.splice(pos,0,node);
            return {componentId:node.id};
          }
          if(operation==='cms.revision.restore'){
            // Resolved before entering synchronous transaction by helper below.
            if(!restoreSnapshot) fail('cms_revision_not_found');
            draft.sections=clone(restoreSnapshot.sections);
            draft.title=restoreSnapshot.title;draft.slug=restoreSnapshot.slug;
            return {restoredFrom:input.revision,published:false};
          }
          if(operation==='cms.page.publish'){
            if(input.confirmation!==true) fail('cms_publish_requires_confirmation');
            draft.publishedVersion=input.expectedVersion;
            return {publishedVersion:input.expectedVersion,digest:publishDigest};
          }
          const found=findComponent(draft,input.componentId);
          const node=found.node;
          if(operation==='cms.component.update'){
            const definition=defFor(definitions,found.kind,node.definitionKey);
            // A settings patch cannot modify code, renderer or definition provenance.
            node.settings=validateSettings(definition,{...node.settings,...input.patch});
          } else if(operation==='cms.component.duplicate'){
            const duplicate=clone(node);
            const rekey=part=>{
              part.id='cmp_'+createId().replaceAll('-','');
              for(const child of part.blocks||[]) rekey(child);
            };
            rekey(duplicate);
            found.items.splice(found.index+1,0,duplicate);
            return {componentId:duplicate.id};
          } else if(operation==='cms.component.remove'){
            found.items.splice(found.index,1);
            return {componentId:input.componentId,removed:true};
          } else if(operation==='cms.component.visibility'){
            node.visible=input.visible;
            return {componentId:input.componentId,visible:input.visible};
          } else if(operation==='cms.component.reorder'){
            if(input.targetIndex>=found.items.length) fail('cms_index_out_of_bounds');
            found.items.splice(found.index,1);
            found.items.splice(input.targetIndex,0,node);
          } else fail('cms_operation_not_implemented');
          return {componentId:input.componentId};
        },
      });
      const doc=mutation.document;
      return await updated(doc,{...mutation.result,idempotent:mutation.duplicate});
    },
  }));
  for (const [index, op] of operations.entries()) {
    const original=op.handler;
    const schema=CMS_OPERATION_CONTRACTS[index].output_schema;
    operations[index]=defineSamOperation({...op,async handler(input,context) {
      const output=await original(input,context);
      assertSchema(output,schema,'output');
      return output;
    }});
  }
  return Object.freeze(includeCompatibilityAliases? [...operations,...createCmsCompatibilityOperations(operations,defineSamOperation)] : operations);
}
