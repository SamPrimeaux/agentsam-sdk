export type CmsIdentity = { accountId:string; installationId:string; actorId:string };
export type CmsJsonSchema = {
  type?: 'object'|'array'|'string'|'number'|'integer'|'boolean';
  properties?: Record<string,CmsJsonSchema>;
  required?: string[];
  additionalProperties?: boolean|CmsJsonSchema;
  items?: CmsJsonSchema;
  enum?: unknown[];
  const?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  minProperties?: number;
  pattern?: string;
  [key:string]:unknown;
};
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
export type CmsOperationContract = {
  name:string; capability:string; effect:string; description:string;
  input_schema:CmsJsonSchema; output_schema:CmsJsonSchema;
};
export type CmsOperation = {
  id:string; input_schema:CmsJsonSchema; output_schema:CmsJsonSchema;
  model_visible?:boolean; aliasFor?:string;
  handler:(input:Record<string,unknown>,context?:unknown)=>Promise<Record<string,unknown>>;
  [key:string]:unknown;
};
export type CmsMachineOptions = {
  defineSamOperation:(definition:Record<string,unknown>)=>CmsOperation;
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
