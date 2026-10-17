#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const [,,inputArg,dirArg] = process.argv;
if (!inputArg || !dirArg) {
 console.error("Usage: node cms-blueprint-intake.mjs machine-receipt.json output-dir");
 process.exit(2);
}
const input=JSON.parse(fs.readFileSync(path.resolve(inputArg),"utf8"));
if(!input || typeof input!=="object" || !Array.isArray(input.sources))throw Error("sources[] discovery receipts required");
const brand=String(input.brand||"IAM").toUpperCase();
if(!/^[A-Z][A-Z0-9]{1,5}$/.test(brand))throw Error("brand must be 2-6 alphanumeric characters");
const theme=input.theme ?? null;
if(theme && (typeof theme.themeId!=="string" || !theme.themeId.trim() || !(theme.tenantId===null || typeof theme.tenantId==="string"))) throw Error("theme must reference a cms_themes.themeId and tenantId (string or null)");
const sources=input.sources.map((s,i)=>{
 if(!s.uri||!["repository","r2","file","url"].includes(s.kind))throw Error("Invalid source "+i);
 return {uri:s.uri,sha256:s.sha256||null,kind:s.kind,permission:s.permission||null,confidence:s.confidence||"unknown",description:s.description||""};
});
const blueprint=[
 ["case-hero","HERO",["title","hero","intro","services"]],
 ["case-chapter","CHAP",["heading","body","media"]],
 ["case-media","MEDIA",["media"]],
 ["case-carousel","CARO",["heading","slides"]],
 ["case-breaker","BRKR",["media"]],
 ["case-next","NEXT",["label","name","href","media"]]
];
const content=input.content&&typeof input.content==="object"?input.content:{};
const rows=blueprint.map(([key,code,slots])=>{
 const sku=brand+"-SEC-"+code+"-V1";
 return {sku,definition_key:key,definition_version:"1.0.0",origin:"package",kind:"section",status:"draft",slots,source_uris:sources.map(s=>s.uri),settings:content[key]||{},needs_validation:true};
});
const sortedSources=sources.map(s=>({...s,receiptHash:crypto.createHash("sha256").update(JSON.stringify(s)).digest("hex")}));
const output={schema:"iam.cms.machine-intake.v1",brand,project:input.project||null,tokens:input.tokens||{},sources:sortedSources,items:rows,requirements:["source integrity","rights review","D1 SKU collision check","type/schema check","media binding","renderer preview","approval"]};
const proposal={schema:"iam.cms.case-study-intake.v1",slug:input.slug||"untitled-case-study",brand,pagePresetSku:brand+"-PG-CSM-V1",tokens:input.tokens||{},sources:sortedSources,sections:rows.map((r,i)=>({definition:{definitionKey:r.definition_key,definitionVersion:r.definition_version,inventorySku:r.sku,origin:r.origin},order:i,status:"active",settings:r.settings,blocks:[],media:{}})),lifecycle:"draft_pending_review"};
const out=path.resolve(dirArg);fs.mkdirSync(out,{recursive:true});
const write=(n,data)=>fs.writeFileSync(path.join(out,n),JSON.stringify(data,null,2)+"\n");
write("intake.json",output);
write("content-intake.json",{schema:"iam.cms.content-intake.v1",brand,project:input.project||null,slug:proposal.slug,slots:rows.map(r=>({sku:r.sku,fields:r.slots.map(key=>({key,value:r.settings[key]??null,source:null,confidence:"unknown"}))}))});
write("page-proposal.json",proposal);
fs.writeFileSync(path.join(out,"inventory.csv"),"sku,definition_key,definition_version,kind,status\n"+rows.map(r=>[r.sku,r.definition_key,r.definition_version,r.kind,r.status].join(",")).join("\n")+"\n");
console.log(JSON.stringify({ok:true,items:rows.length,sources:sources.length,output:out,published:false}));
