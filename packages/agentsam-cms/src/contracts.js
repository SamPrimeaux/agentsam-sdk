/**
 * CMS-owned operation declarations.
 *
 * Portable operation metadata is typed by @inneranimalmedia/agentsam-contracts.
 * This file owns only CMS semantics: effects, resource schemas and CMS results.
 * A host supplies persistence, identity resolution, authorization and rendering.
 *
 * @typedef {'read'|'draft_create'|'draft_update'|'draft_soft_remove'|'draft_reorder'|'draft_visibility'|'draft_restore'|'live_publish'} CmsOperationEffect
 * @typedef {import('@inneranimalmedia/agentsam-contracts').AgentOperationContract & {
 *   effect:CmsOperationEffect;
 *   readonly name:string;
 *   readonly capability:string;
 * }} CmsOperationContract
 */
const string = { type:'string', minLength:1 };
const integer = { type:'integer', minimum:0 };
const positive = { type:'integer', minimum:1 };
const digest = { type:'string', minLength:64, maxLength:64, pattern:'^[a-f0-9]{64}$' };
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
const result = (properties, required = Object.keys(properties)) => base(
  { ok:{type:'boolean'}, ...properties },
  ['ok',...required],
);
const mutationResult = extra => result({
  pageId:string, version:positive, digest, idempotent:{type:'boolean'}, ...extra,
});
function operation({id,capability,effect,description,input_schema,output_schema}) {
  const contract = {
    id,
    version:1,
    module:'cms',
    action:id.slice(4),
    summary:description,
    description,
    execution:{
      lanes:['platform','local'],
      model:'never',
      network:'optional',
      sideEffects:effect==='read'?'none':effect==='live_publish'?'deploy':'remote_write',
    },
    risk:effect==='read'?'read_only':effect==='live_publish'?'privileged':'write',
    capabilities:[capability],
    idempotencyMode:effect==='read'?'not_applicable':'supported',
    status:'stable',
    effect,
    input_schema,
    output_schema,
  };
  Object.defineProperties(contract,{
    name:{value:id,enumerable:false},
    capability:{value:capability,enumerable:false},
  });
  return Object.freeze(contract);
}

/** @type {ReadonlyArray<CmsOperationContract>} */
export const CMS_OPERATION_CONTRACTS = Object.freeze([
  operation({
    id:'cms.definition.list',capability:'cms.definition.read',effect:'read',
    description:'List installed CMS section and block definitions, versioned settings schemas and allowed composition rules.',
    input_schema:base({kind:{type:'string',enum:['section','block']},key:string,status:{type:'string'}}),
    output_schema:result({definitions:{type:'array',items:object}}),
  }),
  operation({
    id:'cms.resource.inspect',capability:'cms.resource.read',effect:'read',
    description:'Read an authorized page, section or block, its versioned draft structure and definition references.',
    input_schema:base({...page,componentId:string},['pageId']),
    output_schema:result({page:object,resource:object}),
  }),
  operation({
    id:'cms.page.createDraft',capability:'cms.page.write',effect:'draft_create',
    description:'Create a new private page draft with an independent draft revision; never publish it.',
    input_schema:base({...page,title:string,slug:string,...idempotency},['pageId','title','slug']),
    output_schema:result({pageId:string,version:positive,published:{type:'boolean',const:false},idempotent:{type:'boolean'}}),
  }),
  operation({
    id:'cms.component.create',capability:'cms.component.write',effect:'draft_create',
    description:'Install a section or nested block from an available typed definition into a page draft.',
    input_schema:base({...versioned,kind:{type:'string',enum:['section','block']},definitionKey:string,parentId:string,settings,position:integer,...idempotency},['pageId','expectedVersion','kind','definitionKey']),
    output_schema:mutationResult({componentId:string}),
  }),
  operation({
    id:'cms.component.update',capability:'cms.component.write',effect:'draft_update',
    description:'Apply a settings patch to an existing draft component with optimistic concurrency and definition-schema validation.',
    input_schema:base({...component,patch,...idempotency},['pageId','componentId','expectedVersion','patch']),
    output_schema:mutationResult({componentId:string}),
  }),
  operation({
    id:'cms.component.duplicate',capability:'cms.component.write',effect:'draft_create',
    description:'Clone a placed section or block as an independent draft instance with a new component ID.',
    input_schema:base({...component,...idempotency},['pageId','componentId','expectedVersion']),
    output_schema:mutationResult({componentId:string}),
  }),
  operation({
    id:'cms.component.remove',capability:'cms.component.write',effect:'draft_soft_remove',
    description:'Remove a section or block from a private draft, recording a recoverable revision and preserving published content.',
    input_schema:base({...component,...idempotency},['pageId','componentId','expectedVersion']),
    output_schema:mutationResult({componentId:string,removed:{type:'boolean',const:true}}),
  }),
  operation({
    id:'cms.component.reorder',capability:'cms.component.write',effect:'draft_reorder',
    description:'Move a component within its composition parent using a concurrency-checked draft revision.',
    input_schema:base({...component,targetIndex:integer,...idempotency},['pageId','componentId','expectedVersion','targetIndex']),
    output_schema:mutationResult({componentId:string}),
  }),
  operation({
    id:'cms.component.visibility',capability:'cms.component.write',effect:'draft_visibility',
    description:'Change only draft component visibility; live publication stays unchanged.',
    input_schema:base({...component,visible:{type:'boolean'},...idempotency},['pageId','componentId','expectedVersion','visible']),
    output_schema:mutationResult({componentId:string,visible:{type:'boolean'}}),
  }),
  operation({
    id:'cms.revision.history',capability:'cms.revision.read',effect:'read',
    description:'Retrieve an authorized page draft revision history, authorship, content digests and publication pointers.',
    input_schema:base({...page,limit:{type:'integer',minimum:1,maximum:100}},['pageId']),
    output_schema:result({pageId:string,revisions:{type:'array',items:object}}),
  }),
  operation({
    id:'cms.revision.restore',capability:'cms.revision.write',effect:'draft_restore',
    description:'Restore a historical snapshot into a NEW private draft revision, without changing the live publication.',
    input_schema:base({...versioned,revision:positive,...idempotency},['pageId','expectedVersion','revision']),
    output_schema:mutationResult({restoredFrom:positive,published:{type:'boolean',const:false}}),
  }),
  operation({
    id:'cms.page.preview',capability:'cms.page.read',effect:'read',
    description:'Resolve a private draft preview document and hash. Never treat preview as publication or issue public access.',
    input_schema:base({...page},['pageId']),
    output_schema:result({pageId:string,version:positive,document:object,digest,published:{type:'boolean',const:false}}),
  }),
  operation({
    id:'cms.page.publish',capability:'cms.page.publish',effect:'live_publish',
    description:'Explicitly publish exactly the authorized draft revision as a separate immutable live snapshot.',
    input_schema:base({...versioned,confirmation:{type:'boolean',const:true},...idempotency},['pageId','expectedVersion','confirmation']),
    output_schema:mutationResult({publishedVersion:positive}),
  }),
]);
export const CMS_CONTRACTS_BY_NAME = new Map(CMS_OPERATION_CONTRACTS.map(x=>[x.id,x]));
