/**
 * SAM portable CMS contracts v1.
 *
 * A CMS host implements persistence and rendering, not the operation semantics.
 * Inputs never carry account, actor, role, provider secrets or workspace roots.
 */
const string = { type:'string', minLength:1 };
const integer = { type:'integer', minimum:0 };
const positive = { type:'integer', minimum:1 };
const object = { type:'object' };
const settings = { type:'object', additionalProperties:true };
const base = (properties, required = []) => ({
  type:'object', properties, required, additionalProperties:false,
});
const page = { pageId:string };
const versioned = { ...page, expectedVersion:positive };
const resource = { ...page, componentId:string };
const component = { ...resource, expectedVersion:positive };
const patch = { type:'object', minProperties:1, additionalProperties:true };
const idempotency = { idempotencyKey: { type:'string', minLength:8, maxLength:128 } };
const result = properties => ({
  ...base({ ok:{type:'boolean'}, ...properties }, ['ok',...Object.keys(properties)]),
  additionalProperties:true, // canonical result extensions include digest, receipt metadata, idempotency
});
export const CMS_OPERATION_CONTRACTS = Object.freeze([
  {
    name:'cms.definition.list', capability:'cms.definition.read', effect:'read',
    description:'List installed CMS section and block definitions, versioned settings schemas and allowed composition rules.',
    input_schema:base({ kind:{type:'string',enum:['section','block']}, key:string, status:{type:'string'} }),
    output_schema:result({definitions:{type:'array',items:object}}),
  },
  {
    name:'cms.resource.inspect', capability:'cms.resource.read', effect:'read',
    description:'Read an authorized page, section or block, its versioned draft structure and definition references.',
    input_schema:base({...page, componentId:string}),
    output_schema:result({page:object,resource:object}),
  },
  {
    name:'cms.page.createDraft', capability:'cms.page.write', effect:'draft_create',
    description:'Create a new private page draft with an independent draft revision; never publish it.',
    input_schema:base({...page,title:string,slug:string,...idempotency},['pageId','title','slug']),
    output_schema:result({pageId:string,version:positive,published:{type:'boolean'}}),
  },
  {
    name:'cms.component.create', capability:'cms.component.write', effect:'draft_create',
    description:'Install a section or nested block from an available typed definition into a page draft.',
    input_schema:base({...versioned,kind:{type:'string',enum:['section','block']},definitionKey:string,parentId:string,settings,position:integer,...idempotency},['pageId','expectedVersion','kind','definitionKey']),
    output_schema:result({pageId:string,componentId:string,version:positive}),
  },
  {
    name:'cms.component.update', capability:'cms.component.write', effect:'draft_update',
    description:'Apply a settings patch to an existing draft component with optimistic concurrency and definition-schema validation.',
    input_schema:base({...component,patch},['pageId','componentId','expectedVersion','patch']),
    output_schema:result({pageId:string,componentId:string,version:positive}),
  },
  {
    name:'cms.component.duplicate', capability:'cms.component.write', effect:'draft_create',
    description:'Clone a placed section or block as an independent draft instance with a new component ID.',
    input_schema:base({...component,...idempotency},['pageId','componentId','expectedVersion']),
    output_schema:result({pageId:string,componentId:string,version:positive}),
  },
  {
    name:'cms.component.remove', capability:'cms.component.write', effect:'draft_soft_remove',
    description:'Remove a section or block from a private draft, recording a recoverable revision and preserving published content.',
    input_schema:base({...component},['pageId','componentId','expectedVersion']),
    output_schema:result({pageId:string,componentId:string,version:positive,removed:{type:'boolean'}}),
  },
  {
    name:'cms.component.reorder', capability:'cms.component.write', effect:'draft_reorder',
    description:'Move a component within its composition parent using a concurrency-checked draft revision.',
    input_schema:base({...component,targetIndex:integer},['pageId','componentId','expectedVersion','targetIndex']),
    output_schema:result({pageId:string,componentId:string,version:positive}),
  },
  {
    name:'cms.component.visibility', capability:'cms.component.write', effect:'draft_visibility',
    description:'Change only draft component visibility; live publication stays unchanged.',
    input_schema:base({...component,visible:{type:'boolean'}},['pageId','componentId','expectedVersion','visible']),
    output_schema:result({pageId:string,componentId:string,version:positive,visible:{type:'boolean'}}),
  },
  {
    name:'cms.revision.history', capability:'cms.revision.read', effect:'read',
    description:'Retrieve an authorized page draft revision history, authorship, content digests and publication pointers.',
    input_schema:base({...page,limit:{type:'integer',minimum:1,maximum:100}},['pageId']),
    output_schema:result({pageId:string,revisions:{type:'array',items:object}}),
  },
  {
    name:'cms.revision.restore', capability:'cms.revision.write', effect:'draft_restore',
    description:'Restore a historical snapshot into a NEW private draft revision, without changing the live publication.',
    input_schema:base({...versioned,revision:positive},['pageId','expectedVersion','revision']),
    output_schema:result({pageId:string,version:positive,restoredFrom:positive,published:{type:'boolean'}}),
  },
  {
    name:'cms.page.preview', capability:'cms.page.read', effect:'read',
    description:'Resolve a private draft preview document and hash. Never treat preview as publication or issue public access.',
    input_schema:base({...page},['pageId']),
    output_schema:result({pageId:string,version:positive,document:object,digest:string,published:{type:'boolean'}}),
  },
  {
    name:'cms.page.publish', capability:'cms.page.publish', effect:'live_publish',
    description:'Explicitly publish exactly the authorized draft revision as a separate immutable live snapshot.',
    input_schema:base({...versioned,confirmation:{type:'boolean',const:true},...idempotency},['pageId','expectedVersion','confirmation']),
    output_schema:result({pageId:string,version:positive,publishedVersion:positive,digest:string}),
  },
]);
export const CMS_CONTRACTS_BY_NAME = new Map(CMS_OPERATION_CONTRACTS.map(x=>[x.name,x]));
