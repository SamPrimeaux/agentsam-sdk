/**
 * Compatibility names for SDK users who already adopted the original
 * v1.1 section/block operation vocabulary.
 * They route to fully typed canonical machinery, not FuelNFreetime endpoints.
 * They are intentionally hidden from the default model tool surface.
 */
import { CMS_CONTRACTS_BY_NAME } from './contracts.js';
const s={type:'string',minLength:1};
const v={type:'integer',minimum:1};
const settings={type:'object',additionalProperties:true};
const schema=(props,required)=>({type:'object',properties:props,required,additionalProperties:false});
const page={pageId:s};
const section={...page,sectionId:s};
const block={...page,blockId:s};
const expected={expectedVersion:v};
const entries=[
  ['cms.page.inspect','cms.resource.inspect',schema(page,['pageId']),i=>({pageId:i.pageId})],
  ['cms.section.inspect','cms.resource.inspect',schema(section,['pageId','sectionId']),i=>({pageId:i.pageId,componentId:i.sectionId})],
  ['cms.section.create','cms.component.create',schema({...page,...expected,definitionKey:s,settings},['pageId','expectedVersion','definitionKey']),
    i=>({...i,kind:'section'})],
  ['cms.section.updateDraft','cms.component.update',schema({...section,...expected,settings},['pageId','sectionId','expectedVersion','settings']),
    i=>({pageId:i.pageId,componentId:i.sectionId,expectedVersion:i.expectedVersion,patch:i.settings})],
  ['cms.section.duplicate','cms.component.duplicate',schema({...section,...expected},['pageId','sectionId','expectedVersion']),
    i=>({pageId:i.pageId,componentId:i.sectionId,expectedVersion:i.expectedVersion})],
  ['cms.section.move','cms.component.reorder',schema({...section,...expected,targetIndex:{type:'integer',minimum:0}},['pageId','sectionId','expectedVersion','targetIndex']),
    i=>({pageId:i.pageId,componentId:i.sectionId,expectedVersion:i.expectedVersion,targetIndex:i.targetIndex})],
  ['cms.section.visibility','cms.component.visibility',schema({...section,...expected,visible:{type:'boolean'}},['pageId','sectionId','expectedVersion','visible']),
    i=>({pageId:i.pageId,componentId:i.sectionId,expectedVersion:i.expectedVersion,visible:i.visible})],
  ['cms.section.remove','cms.component.remove',schema({...section,...expected},['pageId','sectionId','expectedVersion']),
    i=>({pageId:i.pageId,componentId:i.sectionId,expectedVersion:i.expectedVersion})],
  ['cms.block.add','cms.component.create',schema({...page,...expected,sectionId:s,definitionKey:s,settings},['pageId','sectionId','expectedVersion','definitionKey']),
    i=>({pageId:i.pageId,expectedVersion:i.expectedVersion,kind:'block',definitionKey:i.definitionKey,
      parentId:i.sectionId,settings:i.settings})],
  ['cms.block.update','cms.component.update',schema({...block,...expected,settings},['pageId','blockId','expectedVersion','settings']),
    i=>({pageId:i.pageId,componentId:i.blockId,expectedVersion:i.expectedVersion,patch:i.settings})],
  ['cms.block.move','cms.component.reorder',schema({...block,...expected,targetIndex:{type:'integer',minimum:0}},['pageId','blockId','expectedVersion','targetIndex']),
    i=>({pageId:i.pageId,componentId:i.blockId,expectedVersion:i.expectedVersion,targetIndex:i.targetIndex})],
  ['cms.block.remove','cms.component.remove',schema({...block,...expected},['pageId','blockId','expectedVersion']),
    i=>({pageId:i.pageId,componentId:i.blockId,expectedVersion:i.expectedVersion})],
];
export const CMS_COMPATIBILITY_ALIASES = Object.freeze(entries.map(([name,canonical,input_schema])=>({name,canonical,input_schema})));
function assertAliasInput(input,schema) {
  if(!input || typeof input!=='object' || Array.isArray(input)) throw new Error('cms_alias_input_object_required');
  for(const required of schema.required) if(!Object.hasOwn(input,required)) throw new Error('cms_alias_input_required:'+required);
  for(const [key,value] of Object.entries(input)) {
    const spec=schema.properties[key];
    if(!spec) throw new Error('cms_alias_unknown_field:'+key);
    if(spec.type==='string' && (typeof value!=='string'||(spec.minLength&&value.length<spec.minLength))) throw new Error('cms_alias_invalid_string:'+key);
    if(spec.type==='integer' && (!Number.isInteger(value)||(spec.minimum!==undefined&&value<spec.minimum))) throw new Error('cms_alias_invalid_integer:'+key);
    if(spec.type==='boolean' && typeof value!=='boolean') throw new Error('cms_alias_invalid_boolean:'+key);
    if(spec.type==='object' && (!value||typeof value!=='object'||Array.isArray(value))) throw new Error('cms_alias_invalid_object:'+key);
  }
}
export function createCmsCompatibilityOperations(canonical,defineSamOperation) {
  const byName=new Map(canonical.map(op=>[op.id,op]));
  return entries.map(([name,target,input_schema,translate])=>{
    const source=byName.get(target);
    const sourceContract=CMS_CONTRACTS_BY_NAME.get(target);
    if(!source||!sourceContract) throw new Error('cms_compat_target_missing:'+target);
    return defineSamOperation({
      id:name,version:1,module:'cms',action:name.slice(4),
      summary:'Compatibility alias of '+target+'. Use '+target+' for new clients.',
      description:'Compatibility alias of '+target+'. Use canonical CMS operations for new models.',
      capabilities:[sourceContract.capability],
      execution:source.execution,risk:source.risk,
      input_schema,output_schema:source.output_schema,
      status:'compatibility',model_visible:false,aliasFor:target,
      handler:(input,context)=>{
        assertAliasInput(input,input_schema);
        return source.handler(translate(input),{...context,requestedAlias:name});
      },
    });
  });
}
