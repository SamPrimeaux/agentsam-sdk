/**
 * Typed CMS authoring settings contract.
 *
 * D1 cms_definitions remains the account-scoped schema authority; this module
 * validates and projects safe, declarative fields to the EXISTING editor.
 * It neither registers components nor chooses a renderer.
 */
export type SettingKind =
  | "text" | "textarea" | "rich_text" | "boolean" | "number" | "range"
  | "select" | "color" | "link" | "media" | "video" | "product"
  | "collection" | "variant" | "url" | "json";
export type ConditionOperator = "equals" | "not_equals" | "in";
export interface DisplayCondition {
  fieldId: string;
  operator: ConditionOperator;
  value: unknown;
}
type SettingBase = {
  label?: string;
  group?: string;
  description?: string;
  help?: string;
  helpText?: string;
  placeholder?: string;
  required?: boolean;
  visibleWhen?: readonly DisplayCondition[];
};
export type SettingDefinition =
  | (SettingBase & {type:"text"|"textarea"|"rich_text"|"richtext";default?:string;minLength?:number;maxLength?:number})
  | (SettingBase & {type:"boolean"|"toggle";default?:boolean})
  | (SettingBase & {type:"number"|"range";default?:number;min?:number;max?:number;step?:number;unit?:string})
  | (SettingBase & {type:"select";default?:string;options:readonly {label:string;value:string;group?:string}[]})
  | (SettingBase & {type:"link"|"destination"|"url";default?:string})
  | (SettingBase & {type:"media"|"video";accept?:readonly string[]})
  | (SettingBase & {type:"product"|"collection"|"variant";resourceType?:string})
  | (SettingBase & {type:"color";default?:string;allowTokenReference?:boolean})
  | (SettingBase & {type:"json";default?:unknown});

export type SettingsSchema = Readonly<Record<string, SettingDefinition>>;
export interface CmsInspectorField {
  key: string;
  label: string;
  type: SettingKind;
  [property:string]: unknown;
}
export type ContractIssue = {
  kind: string;
  fieldKey?: string;
  type?: string;
  property?: string;
  nativeType?: string;
  definitionType?: string;
};
export interface RenderableBlock {
  key:string;
  fields?:CmsInspectorField[];
  [property:string]:unknown;
}
export interface CmsBlockDefinition {
  id:string;
  version:string;
  origin:string;
  fields:unknown;
}
export type FieldProjection = {fields:CmsInspectorField[];issues:ContractIssue[]};

const ID = /^[a-z][a-zA-Z0-9_-]{0,63}$/;
const TYPES:ReadonlySet<string> = new Set<SettingKind>([
  "text","textarea","rich_text","boolean","number","range","select",
  "color","link","media","video","product","collection","variant","url","json",
]);
const ALIASES:Readonly<Record<string,SettingKind>> = {
  richtext:"rich_text",destination:"link",toggle:"boolean",
};
const OPERATORS:ReadonlySet<string> = new Set<ConditionOperator>(["equals","not_equals","in"]);
const object = (v:unknown):v is Record<string,unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const own = (o:Record<string,unknown>,k:string):boolean =>
  Object.prototype.hasOwnProperty.call(o,k);
const optionalProperties = [
  "description","help","group","placeholder","unit","productKey","resourceType",
  "allowTokenReference","accept","media","required","default","min","max",
  "step","minLength","maxLength","binding","options",
] as const;

// Merchant fields must remain serializable; never retain callable values or
// executable objects in an inspector contract.
function serializable(value:unknown):unknown {
  try {
    if (value === undefined || typeof value === "function" ||
      typeof value === "symbol" || typeof value === "bigint") return undefined;
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return undefined;
  }
}

export function normalizeSettingContract(settings:unknown):FieldProjection {
  const issues:ContractIssue[] = [],fields:CmsInspectorField[] = [];
  if (!object(settings)) return {fields,issues:[{kind:"settings-schema-not-object"}]};
  for(const [key,spec] of Object.entries(settings)){
    if(!ID.test(key)||!object(spec)){
      issues.push({kind:"invalid-setting-definition",fieldKey:key});continue;
    }
    const rawType=typeof spec.type==="string"?spec.type:"";
    const type=ALIASES[rawType] ?? rawType;
    if(!TYPES.has(type)){
      issues.push({kind:"unsupported-setting-type",fieldKey:key,type:rawType});continue;
    }
    if(type==="select" && (!Array.isArray(spec.options) ||
      !spec.options.every((o:unknown)=>object(o) &&
        typeof o.value==="string" && typeof o.label==="string"))){
      issues.push({kind:"invalid-select-options",fieldKey:key});continue;
    }
    const field:CmsInspectorField={key,label:String(spec.label||key),type:type as SettingKind};
    for(const name of optionalProperties){
      if(!own(spec,name))continue;
      const value=serializable(spec[name]);
      if(value===undefined){
        issues.push({kind:"invalid-setting-property",fieldKey:key,property:name});continue;
      }
      field[name]=value;
    }
    if(spec.helpText!=null && field.help==null) field.help=String(spec.helpText);
    if(spec.visibleWhen!=null){
      if(!Array.isArray(spec.visibleWhen)||!spec.visibleWhen.every((c:unknown)=>
        object(c) && typeof c.fieldId==="string" && ID.test(c.fieldId) &&
        typeof c.operator==="string" && OPERATORS.has(c.operator) &&
        own(c,"value") && (c.operator!=="in"||Array.isArray(c.value)))){
        issues.push({kind:"invalid-visible-when",fieldKey:key});
      }else{
        field.visibleWhen=serializable(spec.visibleWhen);
      }
    }
    fields.push(field);
  }
  return {fields,issues};
}

/**
 * A D1 definition may customize an ALREADY IMPLEMENTED block, but never
 * invent controls that the renderer/editor has no binding for.
 */
export function overlayRenderableBlockFields(
  nativeBlock:RenderableBlock,
  definition:CmsBlockDefinition,
):{block:RenderableBlock;conflicts:ContractIssue[]} {
  const {fields,issues}=normalizeSettingContract(definition.fields);
  const known=new Map((nativeBlock.fields||[]).map(f=>[f.key,f]));
  const conflicts=[...issues],updates=new Map<string,CmsInspectorField>();
  for(const field of fields){
    const base=known.get(field.key);
    if(!base){
      conflicts.push({kind:"unbound-block-field",fieldKey:field.key});
    }else if(base.type!==field.type){
      conflicts.push({kind:"incompatible-block-field-type",fieldKey:field.key,
        nativeType:base.type,definitionType:field.type});
    }else{
      updates.set(field.key,{...base,...field});
    }
  }
  return {
    block:{
      ...nativeBlock,
      fields:(nativeBlock.fields||[]).map(f=>updates.get(f.key)||f),
      definitionId:definition.id,
      definitionVersion:definition.version,
      definitionOrigin:definition.origin,
      schemaAuthority:updates.size?"cms_definitions":"renderer",
    },
    conflicts,
  };
}
