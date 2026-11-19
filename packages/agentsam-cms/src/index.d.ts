import type { AgentJsonSchema, AgentOperationContract, AgentOperationDefinition } from '@inneranimalmedia/agentsam-contracts';

export type CmsIdentity = { accountId:string; installationId:string; actorId:string };
export type CmsJsonSchema = AgentJsonSchema;
export type CmsDefinition = {
  kind:'section'|'block';
  key:string;
  version:number;
  status?:string;
  settings_schema:CmsJsonSchema;
  allowedBlocks?:string[];
  [key:string]:unknown;
};
export type CmsComponent = {
  id:string; kind:'section'|'block'; definitionKey:string;
  settings:Record<string,unknown>; visible:boolean; blocks?:CmsComponent[];
};
export type CmsDocument = {
  id:string; title:string; slug:string; version:number;
  sections:CmsComponent[];
  publishedVersion:number|null;
  createdAt:string; updatedAt:string;
  [key:string]:unknown;
};
export type CmsAuthorization = {
  operation:string;
  requestedAlias:string|null;
  capability:string;
  effect:string;
  identity:CmsIdentity;
  resource:{pageId:string|null;componentId:string|null};
  input:Record<string,unknown>;
};
export type CmsRepository = {
  createPage(identity:CmsIdentity,input:{pageId:string;title:string;slug:string;idempotencyKey?:string}):Promise<unknown>|unknown;
  readPage(identity:CmsIdentity,pageId:string):Promise<CmsDocument|null>|CmsDocument|null;
  mutate(identity:CmsIdentity,args:{pageId:string;expectedVersion:number;effect:string;idempotencyKey:string|null;fingerprint:string|null;apply:(draft:CmsDocument)=>unknown}):Promise<{document:CmsDocument;result:any;duplicate:boolean}>|{document:CmsDocument;result:any;duplicate:boolean};
  history(identity:CmsIdentity,pageId:string,limit?:number):Promise<any[]>|any[];
  getRevision(identity:CmsIdentity,pageId:string,version:number):Promise<CmsDocument|null>|CmsDocument|null;
  getPublication(identity:CmsIdentity,pageId:string,version?:number|null):Promise<unknown>|unknown;
};
export type CmsOperationEffect =
  | 'read' | 'draft_create' | 'draft_update' | 'draft_soft_remove'
  | 'draft_reorder' | 'draft_visibility' | 'draft_restore' | 'live_publish';
export type CmsOperationContract =
  Omit<AgentOperationContract,'input_schema'|'output_schema'> & {
    input_schema:CmsJsonSchema;
    output_schema:CmsJsonSchema;
    effect:CmsOperationEffect;
    /** @deprecated Use id. */
    readonly name:string;
    /** @deprecated Use capabilities[0]. */
    readonly capability:string;
  };
export type CmsOperation =
  Omit<AgentOperationDefinition<Record<string,unknown>,Record<string,unknown>,unknown>,'input_schema'|'output_schema'> & {
    input_schema:CmsJsonSchema;
    output_schema:CmsJsonSchema;
    model_visible?:boolean;
    aliasFor?:string;
  };
export type CmsMachineOptions = {
  defineSamOperation:(definition:AgentOperationDefinition<Record<string,unknown>,Record<string,unknown>,unknown>)=>CmsOperation;
  repository:CmsRepository;
  definitions?:CmsDefinition[];
  resolveTrustedContext:(context?:unknown)=>Promise<CmsIdentity|null>|CmsIdentity|null;
  authorize:(request:CmsAuthorization)=>Promise<boolean|{allow:boolean;publicationApproved?:boolean}>|boolean|{allow:boolean;publicationApproved?:boolean};
  createId?:()=>string;
  includeCompatibilityAliases?:boolean;
};
export declare const CMS_OPERATION_CONTRACTS: ReadonlyArray<CmsOperationContract>;
export declare const CMS_CONTRACTS_BY_NAME: ReadonlyMap<string,CmsOperationContract>;
export declare const CMS_COMPATIBILITY_ALIASES: ReadonlyArray<{name:string;canonical:string;input_schema:CmsJsonSchema}>;
export declare function createCmsOperations(options:CmsMachineOptions):ReadonlyArray<CmsOperation>;
export declare function validateCmsSchema(value:unknown,schema:CmsJsonSchema,at?:string):void;

/** Host-resolved merchant CMS. No SDK database provisioning. */
export declare const CMS_PAGE_KINDS: ReadonlyArray<string>;
export type CmsMerchantIdentity = {accountId:string;siteId:string;actorId:string};
export type CmsMerchantAuthorization = {operation:string;effect:'read'|'write'|'publish';identity:CmsMerchantIdentity;resource:Record<string,unknown>};
export type CmsMerchantRepository = {
  getSite(scope:CmsMerchantIdentity):Promise<{id:string;account_id?:string;accountId?:string}|null>;
  listPages(scope:CmsMerchantIdentity,options:Record<string,unknown>):Promise<unknown>;
  readPage(scope:CmsMerchantIdentity,id:string):Promise<unknown>;
  createPageDraft(scope:CmsMerchantIdentity,input:Record<string,unknown>):Promise<unknown>;
  updatePageDraft(scope:CmsMerchantIdentity,input:Record<string,unknown>):Promise<unknown>;
  duplicatePageDraft(scope:CmsMerchantIdentity,input:Record<string,unknown>):Promise<unknown>;
  archivePage(scope:CmsMerchantIdentity,input:Record<string,unknown>):Promise<unknown>;
  history(scope:CmsMerchantIdentity,input:Record<string,unknown>):Promise<unknown>;
  restoreRevision(scope:CmsMerchantIdentity,input:Record<string,unknown>):Promise<unknown>;
  previewPage(scope:CmsMerchantIdentity,input:Record<string,unknown>):Promise<unknown>;
  publishPage(scope:CmsMerchantIdentity,input:Record<string,unknown>):Promise<unknown>;
  rollbackPage(scope:CmsMerchantIdentity,input:Record<string,unknown>):Promise<unknown>;
  getPublication(scope:CmsMerchantIdentity,input:Record<string,unknown>):Promise<unknown>;
  listThemes(scope:CmsMerchantIdentity):Promise<unknown>;
  installTheme(scope:CmsMerchantIdentity,input:Record<string,unknown>):Promise<unknown>;
  publishTheme(scope:CmsMerchantIdentity,input:Record<string,unknown>):Promise<unknown>;
  listNavigation(scope:CmsMerchantIdentity):Promise<unknown>;
  saveNavigation(scope:CmsMerchantIdentity,input:Record<string,unknown>):Promise<unknown>;
  listAssets(scope:CmsMerchantIdentity):Promise<unknown>;
};
export type CmsMerchantHostOptions = {
  repository:CmsMerchantRepository;
  resolveTrustedContext:(context?:unknown)=>CmsMerchantIdentity|Promise<CmsMerchantIdentity>;
  authorize:(req:CmsMerchantAuthorization)=>boolean|{allow:boolean;publicationApproved?:boolean}|Promise<boolean|{allow:boolean;publicationApproved?:boolean}>;
  createId?:()=>string;
};
export type CmsMerchantApi = {
  sites:{current(context?:unknown):Promise<unknown>};
  pages:{
    list(input?:Record<string,unknown>,context?:unknown):Promise<unknown>;
    read(input:{pageId:string},context?:unknown):Promise<unknown>;
    create(input:Record<string,unknown>,context?:unknown):Promise<unknown>;
    update(input:Record<string,unknown>,context?:unknown):Promise<unknown>;
    duplicate(input:Record<string,unknown>,context?:unknown):Promise<unknown>;
    archive(input:Record<string,unknown>,context?:unknown):Promise<unknown>;
    revisions(input:Record<string,unknown>,context?:unknown):Promise<unknown>;
    restore(input:Record<string,unknown>,context?:unknown):Promise<unknown>;
    preview(input:Record<string,unknown>,context?:unknown):Promise<unknown>;
    publish(input:Record<string,unknown>,context?:unknown):Promise<unknown>;
    rollback(input:Record<string,unknown>,context?:unknown):Promise<unknown>;
    published(input:Record<string,unknown>,context?:unknown):Promise<unknown>;
  };
  themes:{
    list(context?:unknown):Promise<unknown>;
    install(input:Record<string,unknown>,context?:unknown):Promise<unknown>;
    publish(input:Record<string,unknown>,context?:unknown):Promise<unknown>;
  };
  navigation:{
    list(context?:unknown):Promise<unknown>;
    save(input:Record<string,unknown>,context?:unknown):Promise<unknown>;
  };
  assets:{list(context?:unknown):Promise<unknown>};
};
export declare function createMerchantCms(options:CmsMerchantHostOptions):CmsMerchantApi;
