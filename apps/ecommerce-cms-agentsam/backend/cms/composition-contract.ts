/**
 * Pure CMS composition. The existing cms_* D1 schema owns installed
 * definitions, placed sections, nested blocks, global groups and revisions.
 * This module cannot register renderers or create another data authority.
 */
export type ComponentKind = "section"|"theme_block"|"section_block"|"app_block";
export type Region = "template"|"header"|"footer"|`custom.${string}`;
export interface PresetBlock {
  key:string; definitionKey:string; settings:Record<string,unknown>;
  children:PresetBlock[];
}
export interface Preset {
  key:string;label:string;category:string;settings:Record<string,unknown>;
  blocks:PresetBlock[];
}
export interface InstalledDefinition {
  key:string;version:string;kind:ComponentKind;owner:string;status:string;
  rendererRef:string|null;presets:Preset[];placement:string[];
  allowedChildren:string[];maxChildren:number|null;
}
export interface BlockRow {
  id:string;section_id:string;parent_block_id:string|null;
  block_key:string;block_type:string;sort_order:number;
  status?:string;content_json?:string;
}
export interface BlockNode {
  id:string;key:string;type:string;order:number;
  settings:Record<string,unknown>;children:BlockNode[];
}
export type TypedValue =
  | {mode:"static";value:unknown}
  | {mode:"dynamic";source:{resource:string;field:string;type:string}};
const ID=/^[a-z][a-z0-9-]{0,63}$/;
const SOURCE=/^[a-z][a-z0-9_.-]{0,127}$/;
const record=(v:unknown):v is Record<string,unknown> =>
  v!==null&&typeof v==="object"&&!Array.isArray(v);
const fail=(reason:string):never=>{throw new Error("cms_composition_"+reason);};
const safe=(v:unknown):Record<string,unknown>=>record(v)?structuredClone(v):{};
const str=(v:unknown):string=>typeof v==="string"?v:"";

function parsePresetBlock(value:unknown,depth=0):PresetBlock {
  if(depth>8||!record(value)||!ID.test(str(value.key))||
     !ID.test(str(value.definitionKey)))return fail("invalid_preset_block");
  if(value.children!==undefined&&!Array.isArray(value.children))
    return fail("invalid_preset_children");
  const children=((value.children as unknown[]|undefined)||[]).map(v=>parsePresetBlock(v,depth+1));
  if(new Set(children.map(v=>v.key)).size!==children.length)
    return fail("duplicate_preset_child");
  return {key:str(value.key),definitionKey:str(value.definitionKey),
    settings:safe(value.settings),children};
}
export function parsePresets(value:unknown):Preset[] {
  if(value===undefined||value===null)return [];
  if(!Array.isArray(value))return fail("invalid_presets");
  const seen=new Set<string>();
  return value.map(raw=>{
    if(!record(raw)||!ID.test(str(raw.key))||!str(raw.label).trim())
      return fail("invalid_preset");
    const key=str(raw.key);
    if(seen.has(key))return fail("duplicate_preset");
    seen.add(key);
    if(raw.blocks!==undefined&&!Array.isArray(raw.blocks))
      return fail("invalid_preset_blocks");
    const blocks=((raw.blocks as unknown[]|undefined)||[]).map(v=>parsePresetBlock(v));
    if(new Set(blocks.map(v=>v.key)).size!==blocks.length)
      return fail("duplicate_preset_child");
    return {key,label:str(raw.label),category:str(raw.category)||"General",
      settings:safe(raw.settings),blocks};
  });
}
/** Read installed cms_definitions metadata, never overwrite canonical D1 rows. */
export function installedDefinition(row:{
  definition_key:string;kind:string;origin:string;version:string;status:string;
  metadata?:Record<string,unknown>;allowedBlocks?:string[];maxBlocks?:number|null;
}):InstalledDefinition {
  const m=row.metadata||{};
  const supportedKinds=["theme_block","section_block","app_block"];
  if (row.kind!=="section" && row.kind!=="block") return fail("invalid_kind");
  if (row.kind==="block" && m.blockKind!==undefined &&
      !supportedKinds.includes(String(m.blockKind))) return fail("invalid_block_kind");
  const kind:ComponentKind=row.kind==="section"?"section":
    m.blockKind==="app_block"?"app_block":
    m.blockKind==="section_block"?"section_block":"theme_block";
  if (m.placement!==undefined && !Array.isArray(m.placement))
    return fail("invalid_placement");
  const rawPlacement=(m.placement as unknown[]|undefined)||[];
  if (!rawPlacement.every(v=>typeof v==="string" &&
      /^(template|header|footer|custom\.[a-z0-9-]+)$/.test(v)))
    return fail("invalid_placement");
  const placement=rawPlacement as string[];
  return {key:row.definition_key,version:row.version,kind,
    owner:str(m.owner)||row.origin,status:row.status,
    rendererRef:str(m.rendererRef)||null,presets:parsePresets(m.presets),
    placement,allowedChildren:row.allowedBlocks||[],maxChildren:row.maxBlocks??null};
}
export function placementAllowed(def:InstalledDefinition,region:Region):boolean {
  return def.kind==="section"&&def.status==="active"&&
    (def.placement.length===0||def.placement.includes(region));
}
/**
 * Preserve the cms_section_blocks parent_block_id tree to the renderer.
 * Reject orphans, cycles, wrong section ids and unexpected nesting.
 */
export function buildBlockTree(sectionId:string,rows:readonly BlockRow[],maxDepth=8):BlockNode[] {
  const nodes=new Map<string,BlockNode>(),sources=new Map<string,BlockRow>();
  for(const row of rows){
    if(row.section_id!==sectionId)return fail("cross_section_block");
    if(!row.id||nodes.has(row.id))return fail("duplicate_block_id");
    if(row.status==="archived")continue;
    let settings:Record<string,unknown>;
    try{settings=safe(row.content_json?JSON.parse(row.content_json):{});}
    catch{return fail("invalid_block_content");}
    nodes.set(row.id,{id:row.id,key:row.block_key,type:row.block_type,
      order:row.sort_order,settings,children:[]});
    sources.set(row.id,row);
  }
  const visiting=new Set<string>(),visited=new Set<string>();
  const visit=(id:string,depth:number):void=>{
    if(depth>maxDepth)return fail("block_depth_exceeded");
    if(visiting.has(id))return fail("block_cycle");
    if(visited.has(id))return;
    const row=sources.get(id);
    if(!row)return fail("missing_block");
    visiting.add(id);
    if(row.parent_block_id){
      if(!nodes.has(row.parent_block_id))return fail("orphan_block");
      visit(row.parent_block_id,depth+1);
    }
    visiting.delete(id);visited.add(id);
  };
  for(const id of nodes.keys())visit(id,0);
  const roots:BlockNode[]=[];
  for(const [id,node] of nodes){
    const parent=sources.get(id)?.parent_block_id;
    if(parent)nodes.get(parent)!.children.push(node);else roots.push(node);
  }
  const order=(items:BlockNode[]):void=>{
    items.sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
    for(const item of items)order(item.children);
  };
  order(roots);
  return roots;
}
/** Only an authorized adapter may resolve a dynamic resource field. */
export function resolveTypedValue(
  settingType:string,binding:TypedValue,
  resolve:(source:{resource:string;field:string;type:string})=>unknown
):unknown {
  if(binding.mode==="static")return binding.value;
  if(binding.mode!=="dynamic"||!record(binding.source))
    return fail("invalid_binding");
  const {resource,field,type}=binding.source;
  if(!SOURCE.test(resource)||!SOURCE.test(field))return fail("invalid_binding_source");
  const textual=["text","textarea","rich_text","inline_richtext"];
  if(type!==settingType&&!(textual.includes(type)&&textual.includes(settingType)))
    return fail("incompatible_binding_type");
  const value=resolve({resource,field,type});
  if(value===undefined)return fail("unresolved_binding");
  if([...textual,"url","link","color"].includes(settingType)&&typeof value!=="string")
    return fail("binding_value_type");
  if(["number","range"].includes(settingType)&&
      (typeof value!=="number"||!Number.isFinite(value)))
    return fail("binding_value_type");
  if(settingType==="boolean"&&typeof value!=="boolean")
    return fail("binding_value_type");
  return value;
}
