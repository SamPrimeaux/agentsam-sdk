import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {spawn} from "node:child_process";
const root=path.dirname(fileURLToPath(import.meta.url));
const dist=path.join(root,"dist");
const mf=JSON.parse(await readFile(path.join(dist,"manifest.json"),"utf8"));
const zipPath=path.join(root,"release/agentsam-growth-increase-sales-v1.zip");
const publish=process.argv.includes("--publish");
const onlyViews=process.argv.includes("--views-only");
const from=Number((process.argv.find(x=>x.startsWith("--from="))||"--from=0").split("=")[1]);
const limit=Number((process.argv.find(x=>x.startsWith("--limit="))||"--limit=300").split("=")[1]);
const entries=[
 {path:"release/agentsam-growth-increase-sales-v1.zip",key:mf.r2_prefix+"agentsam-growth-increase-sales-v1.zip",content_type:"application/zip",file:zipPath},
 {path:"manifest.json",key:mf.r2_prefix+"manifest.json",content_type:"application/json",file:path.join(dist,"manifest.json")},
 ...mf.files.map(x=>({...x,file:path.join(dist,x.path),key:mf.r2_prefix+x.path}))
];
const chosen=onlyViews?entries.filter(x=>x.path==="manifest.json"||x.path.endsWith(".html")||x.path.endsWith(".zip")):entries.slice(from,from+limit);
if(mf.template_count!==14||mf.r2_bucket!=="cms"||mf.file_count!==117)throw new Error("Invalid manifest");
for(const entry of chosen){
 const bytes=await readFile(entry.file);
 if(entry.sha256&&createHash("sha256").update(bytes).digest("hex")!==entry.sha256)throw new Error("Checksum mismatch "+entry.path);
}
if(!publish){console.log(JSON.stringify({dry_run:true,bucket:mf.r2_bucket,prefix:mf.r2_prefix,total:entries.length,count:chosen.length}));process.exit(0);}
async function put(entry){
 return await new Promise((resolve,reject)=>{
  const p=spawn("wrangler",["r2","object","put",mf.r2_bucket+"/"+entry.key,"--file",entry.file,"--remote","--force","--content-type",entry.content_type],{cwd:root,stdio:["ignore","pipe","pipe"]});
  let error="";
  p.stderr.on("data",d=>error+=d.toString());p.stdout.on("data",()=>{});
  p.on("error",reject);p.on("close",code=>code===0?resolve(entry.key):reject(new Error(entry.key+" "+error.slice(-800))));
 });
}
let next=0,done=0;const errors=[];
async function worker(){
 for(;;){
  const i=next++;if(i>=chosen.length)return;
  const x=chosen[i];let success=false;
  for(let attempt=1;attempt<=3&&!success;attempt++){
   try{await put(x);success=true;done++;console.log("STORED "+x.key);}
   catch(e){if(attempt===3)errors.push(String(e));else await new Promise(r=>setTimeout(r,500*attempt));}
  }
 }
}
await Promise.all(Array.from({length:4},()=>worker()));
console.log(JSON.stringify({uploaded:done,failed:errors.length,total:chosen.length,errors},null,2));
if(errors.length)process.exitCode=1;
