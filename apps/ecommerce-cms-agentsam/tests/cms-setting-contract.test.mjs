import test from "node:test";
import assert from "node:assert/strict";
import {normalizeSettingContract,overlayRenderableBlockFields} from "../backend/cms/setting-contract.ts";
import {attachCmsDefinitions,normalizeCmsDefinition} from "../backend/cms/definition-registry.mjs";

const definition=(kind,key,fields,overrides={})=>normalizeCmsDefinition({
  id:"cmsd_"+key, definition_key:key, kind, label:key, origin:"package",
  version:"1", status:"active", settings_schema_json:JSON.stringify(fields),
  allowed_blocks_json:"[]",metadata_json:"{}",...overrides,
});
const registry=()=>({pages:{
  shop:{sections:{hero:{
    label:"Hero",fields:[{key:"headline",label:"Headline",type:"text"}],
    blocks:[{key:"button",label:"Button",fields:[
      {key:"label",type:"text",label:"Label"},
      {key:"href",type:"link",label:"Link"},
      {key:"style",type:"select",label:"Style",options:[{label:"Primary",value:"primary"}]},
    ],defaultContent:{label:"Shop",href:"/shop",style:"primary"}}],
    defaultContent:{headline:"Original heading"},
  }}},
}});

test("settings contract retains labels, options, defaults, groups, help and declarative visibility",()=>{
 const x=normalizeSettingContract({
   style:{type:"select",label:"Style",default:"primary",group:"Appearance",
      options:[{label:"Primary",value:"primary"},{label:"Custom",value:"custom"}]},
   background:{type:"color",label:"Background",allowTokenReference:true,
     helpText:"Override inherited color",visibleWhen:[
       {fieldId:"style",operator:"equals",value:"custom"},
     ]},
   text:{type:"richtext",label:"Text",default:"hello"},
 });
 assert.deepEqual(x.issues,[]);
 assert.equal(x.fields[0].default,"primary");
 assert.equal(x.fields[0].group,"Appearance");
 assert.equal(x.fields[1].allowTokenReference,true);
 assert.equal(x.fields[1].help,"Override inherited color");
 assert.deepEqual(x.fields[1].visibleWhen,[{fieldId:"style",operator:"equals",value:"custom"}]);
 assert.equal(x.fields[2].type,"rich_text");
});

test("invalid or unsupported controls fail closed, not silently become a text field",()=>{
 const x=normalizeSettingContract({
   bad:{type:"javascript",label:"Execute code"},
   select:{type:"select"},
   invalid:{type:"text",visibleWhen:[{operator:"lambda",fieldId:"a",value:true}]},
   good:{type:"boolean",default:false},
 });
 assert.deepEqual(x.fields.map(f=>f.key),["invalid","good"]);
 assert.ok(x.issues.some(i=>i.kind==="unsupported-setting-type"&&i.fieldKey==="bad"));
 assert.ok(x.issues.some(i=>i.kind==="invalid-select-options"));
 assert.ok(x.issues.some(i=>i.kind==="invalid-visible-when"));
});

test("account D1 block definitions enrich the real Button schema without adding fake blocks",()=>{
 const source=registry();
 const original=structuredClone(source);
 const button=definition("block","button",{
   label:{type:"text",label:"Button text",required:true},
   href:{type:"destination",label:"Destination",help:"Choose internal page"},
   style:{type:"select",label:"Button style",
     options:[{label:"Primary",value:"primary"},{label:"Custom",value:"custom"}]},
 });
 const result=attachCmsDefinitions(source,[button]);
 const s=result.pages.shop.sections.hero;
 assert.deepEqual(source,original);
 assert.equal(s.blocks.length,1);
 assert.equal(s.blocks[0].key,"button");
 assert.equal(s.blocks[0].schemaAuthority,"cms_definitions");
 assert.equal(s.blocks[0].fields[0].label,"Button text");
 assert.equal(s.blocks[0].fields[1].label,"Destination");
 assert.equal(s.blocks[0].fields[1].type,"link");
 assert.equal(s.blocks[0].fields[2].options.length,2);
 assert.equal(s.blocks[0].defaultContent.href,"/shop");
 assert.ok(!s.fields.some(f=>f.key==="href"));
});

test("stale D1 block schema never erases renderer-bound fields or fakes a missing control",()=>{
 const source=registry();
 const stale=definition("block","button",{
   label:{type:"number",label:"Wrong data type"},
   other:{type:"color",label:"Unbound fake control"},
 });
 const result=attachCmsDefinitions(source,[stale]);
 const block=result.pages.shop.sections.hero.blocks[0];
 assert.equal(block.schemaAuthority,"renderer");
 assert.equal(block.fields[0].type,"text");
 assert.equal(block.fields.length,3);
 assert.ok(result.pages.shop.sections.hero.schemaConflicts.some(i=>
   i.kind==="unbound-block-field"&&i.fieldKey==="other"));
 assert.ok(result.pages.shop.sections.hero.schemaConflicts.some(i=>
   i.kind==="incompatible-block-field-type"&&i.fieldKey==="label"));
});

test("unregistered block and inactive definition cannot enter existing CMS catalog",()=>{
 const source=registry();
 const fake=definition("block","unimplemented-button",{label:{type:"text"}});
 const inactive=definition("block","button",{label:{type:"text",label:"Should not appear"}},{status:"draft"});
 const result=attachCmsDefinitions(source,[fake,inactive]);
 assert.equal(result.pages.shop.sections.hero.blocks.length,1);
 assert.equal(result.pages.shop.sections.hero.blocks[0].fields[0].label,"Label");
 assert.equal(result.definitions[0].insertable,false);
 assert.equal(result.definitions[1].insertable,false);
});

test("section field override remains section-scoped and does not erase its Button",()=>{
 const source=registry();
 const hero=definition("section","hero",{headline:{type:"text",label:"Headline text"}});
 const result=attachCmsDefinitions(source,[hero]);
 const s=result.pages.shop.sections.hero;
 assert.equal(s.fields[0].label,"Headline text");
 assert.equal(s.blocks[0].key,"button");
 assert.equal(s.blocks[0].fields.length,3);
 assert.equal(s.defaultContent.headline,"Original heading");
});
