import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
import { starterCampaigns, catalogMeta } from "./src/catalog.mjs";

const root=path.dirname(fileURLToPath(import.meta.url));
const dist=path.join(root,"dist");
const css=await readFile(path.join(root,"src/style.css"),"utf8");
const preview=await readFile(path.join(root,"src/preview.js"),"utf8");
const base="growth/starter-campaigns/increase-sales/v1";
const files=[];
const sha256=v=>createHash("sha256").update(v).digest("hex");
async function put(filename,body,contentType="application/json"){
 const target=path.join(dist,filename);
 await mkdir(path.dirname(target),{recursive:true});
 const content=typeof body==="string"?body:JSON.stringify(body,null,2)+"\n";
 await writeFile(target,content);
 files.push({path:filename,key:base+"/"+filename,sha256:sha256(content),size_bytes:Buffer.byteLength(content),content_type:contentType});
}
function standalone(templateId){
 const t=starterCampaigns.find(x=>x.id===templateId);
 const title=t?"Preview | "+t.name:"Increase Sales | Starter Library";
 const embed=JSON.stringify({metadata:catalogMeta,templates:starterCampaigns}).replace(/</g,"\\u003c");
 return '<!doctype html>\n<html lang="en" data-template="'+templateId+'">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="AgentSam Growth interactive Increase Sales campaign starter previews"><title>'+title+'</title><style id="starter-css">'+css+'</style></head>\n<body><div id="app"></div><script id="starter-catalog" type="application/json">'+embed+'</script><script>'+preview+'</script></body></html>\n';
}
if(starterCampaigns.length!==14||new Set(starterCampaigns.map(t=>t.id)).size!==14||new Set(starterCampaigns.map(t=>t.visual_key)).size!==14)throw new Error("Expected 14 unique Increase Sales starters and compositions");
for(const t of starterCampaigns){
 if(t.objective_key!=="increase_sales"||t.preview?.mode!=="demo_only"||!t.fields?.length||!t.assets?.website||!t.assets?.email||!t.assets?.social||!t.required_checks?.length)throw new Error("Invalid template contract: "+t.id);
}
await rm(dist,{recursive:true,force:true});
await put("index.html",standalone(""),"text/html");
for(const t of starterCampaigns){
 await put(t.slug+".html",standalone(t.id),"text/html");
 await put("templates/"+t.slug+".json",t);
 for(const [kind,creative] of Object.entries(t.assets)){
  await put("creative/"+t.slug+"/"+kind+".json",{schema:"agentsam.growth.creative-draft.v1",template_id:t.id,template_version:t.template_version,channel:kind,approval_state:"not_requested",published:false,creative,source:"starter_preview_only",binding_required:true});
 }
}
await put("starter-campaigns.json",{metadata:catalogMeta,templates:starterCampaigns});
await put("schema.json",JSON.parse(await readFile(path.join(root,"src/schema.json"),"utf8")));
await put("README.md",await readFile(path.join(root,"src/DISTRIBUTION.md"),"utf8"),"text/markdown");
const manifest={schema:"agentsam.growth.starter-pack-manifest.v1",version:catalogMeta.version,family:"increase_sales",objective_key:"increase_sales",template_count:14,interactive_preview_count:14,file_count:files.length+1,r2_bucket:"cms",r2_prefix:base+"/",access:"private_until_a_host_serves_it",cms_authority:"existing cms_* tables only",production_ready:false,preview_ready:true,scope:"portable preview assets and import contracts; not a live deployment",templates:starterCampaigns.map(t=>({id:t.id,name:t.name,preview:t.slug+".html",definition:"templates/"+t.slug+".json",creative_prefix:"creative/"+t.slug+"/"})),files};
await writeFile(path.join(dist,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
if(manifest.file_count!==117)throw new Error("Incorrect file count "+manifest.file_count);
console.log("Built "+starterCampaigns.length+" interactive previews, "+manifest.file_count+" distribution files into "+dist);
