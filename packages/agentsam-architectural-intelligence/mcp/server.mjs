#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const profiles=JSON.parse(fs.readFileSync(path.resolve(here,'../data/materials.json'),'utf8'));
const refs=JSON.parse(fs.readFileSync(path.resolve(here,'../data/sources.json'),'utf8'));
const schemaNum={type:'number'};
const argObj=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
export const tools=[
 {name:'arch.material.lookup',description:'Look up actual cross section for standard surfaced-dry North American nominal 2-inch lumber with scope and AWC evidence.',inputSchema:argObj({nominal:{type:'string',enum:Object.keys(profiles.profiles)},condition:{type:'string',const:'surfaced_dry'}},['nominal','condition'])},
 {name:'arch.assembly.thickness',description:'Calculate full specified assembly thickness from supplied layers; does not infer missing layers.',inputSchema:argObj({layers:{type:'array',minItems:1,maxItems:128,items:argObj({name:{type:'string'},thickness_in:{type:'number',minimum:0}},['name','thickness_in'])}},['layers'])},
 {name:'arch.qa.compare_dimensions',description:'Compare two independent geometric measurements against specified tolerance.',inputSchema:argObj({expected_in:schemaNum,measured_in:schemaNum,tolerance_in:{type:'number',minimum:0}},['expected_in','measured_in','tolerance_in'])},
 {name:'arch.references.list',description:'Return curated authority URLs, scope and license; does not fetch pages live.',inputSchema:argObj({ids:{type:'array',items:{type:'string'}}})},
 {name:'arch.capabilities.status',description:'Disclose implemented reference capabilities; exclude unauthenticated CAD engine claims.',inputSchema:argObj({})}
];
function fail(msg) {throw new Error(msg);}
function num(v,name) {if(typeof v!=='number'||!Number.isFinite(v)) fail(name+' must be finite number'); return v;}
export function execute(name,a={}) {
 if(!a||typeof a!=='object'||Array.isArray(a))fail('object arguments required');
 if(name==='arch.material.lookup'){
  if(a.condition!=='surfaced_dry')fail('Explicit condition surfaced_dry required');
  const dims=profiles.profiles[a.nominal];
  if(!dims)fail('unsupported nominal material size');
  return {status:'verified_reference',nominal:a.nominal,actual:{thickness_in:dims[0],width_in:dims[1],
    thickness_mm:Math.round(dims[0]*25.4*1e6)/1e6,width_mm:Math.round(dims[1]*25.4*1e6)/1e6},
    classification:profiles.classification,scope:profiles.limitations,authority:profiles.authority,
    source:profiles.source,source_reviewed:profiles.source_reviewed};
 }
 if(name==='arch.assembly.thickness'){
  if(!Array.isArray(a.layers)||!a.layers.length||a.layers.length>128)fail('nonempty layers required, maximum 128');
  let total=0;
  for(const l of a.layers){if(!l||typeof l.name!=='string'||!l.name.trim())fail('layer name required');let v=num(l.thickness_in,'thickness');if(v<0)fail('negative thickness');total+=v;}
  total=Math.round(total*1e9)/1e9;
  return {status:'calculated_from_inputs',total_in:total,total_mm:Math.round(total*25.4*1e6)/1e6,
     source:'supplied_layers',warning:'No independent evidence that layers form a valid real assembly.'};
 }
 if(name==='arch.qa.compare_dimensions'){
  const e=num(a.expected_in,'expected_in'),m=num(a.measured_in,'measured_in'),tol=num(a.tolerance_in,'tolerance_in');
  if(tol<0)fail('negative tolerance');
  const delta=Math.abs(e-m);
  return {status:delta<=tol+1e-12?'pass':'fail',difference_in:Math.round(delta*1e9)/1e9,
      tolerance_in:tol,expected_in:e,measured_in:m,
      warning:'Source independence and field accuracy must be established separately.'};
 }
 if(name==='arch.references.list'){
  if(a.ids!==undefined&&(!Array.isArray(a.ids)||!a.ids.every(x=>typeof x==='string')))fail('ids must be string array');
  return {status:'curated_index',reviewed:refs.reviewed,
    sources:refs.sources.filter(s=>!a.ids||a.ids.includes(s.id)),
    warning:'Not a live fetch or project authority determination.'};
 }
 if(name==='arch.capabilities.status')return {status:'ready',implemented:tools.map(x=>x.name),
     not_implemented:['design.bim.*','design.solid.*','architectural.code.compliance','IFC export and validation'],
     warning:'Check actual SAM tools registry for these CAD/BIM adapters separately.'};
 fail('unknown tool: '+name);
}
function send(value){process.stdout.write(JSON.stringify(value)+'\n');}
export function route(message){
 if(!message||typeof message!=='object'||!Object.hasOwn(message,'id'))return null;
 const id=message.id;
 if(message.method==='initialize')return {jsonrpc:'2.0',id,result:{
    protocolVersion:message.params?.protocolVersion==='2024-11-05'?'2024-11-05':'2025-06-18',
    capabilities:{tools:{listChanged:false}},serverInfo:{name:'agentsam-architectural-knowledge',version:'0.1.0'}}};
 if(message.method==='ping')return {jsonrpc:'2.0',id,result:{}};
 if(message.method==='tools/list')return {jsonrpc:'2.0',id,result:{tools}};
 if(message.method==='tools/call'){
   try{if(!tools.some(x=>x.name===message.params?.name))fail('unknown tool');
    const value=execute(message.params.name,message.params.arguments??{});
    return {jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value,isError:false}};
   }catch(e){return {jsonrpc:'2.0',id,result:{content:[{type:'text',text:String(e.message)}],isError:true}};}
 }
 return {jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
 rl.on('line',line=>{try{const answer=route(JSON.parse(line));if(answer)send(answer);}
 catch(e){send({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});}});
}
