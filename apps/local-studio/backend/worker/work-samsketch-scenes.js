/**
 * Account-owned SamSketch documents. Reuses agentsam_artifacts + ARTIFACTS R2.
 * Every request is passed a verified auth_users.id by work-service.
 * The requested scene id and R2 path are never an authorization boundary.
 */
const BASE = /^\/api\/work\/samsketch\/scenes(?:\/(sketch_[a-z0-9-]{12,80}))?$/;
const respond = (body,status=200,headers={}) => Response.json(body,{
  status,headers:{'cache-control':'private, no-store',...headers},
});
const MAX_DOCUMENT_BYTES=1_500_000;
const KIND=new Set(['desktop','phone','panel','orb','box','ring','cad','template']);
const vec=v=>Array.isArray(v)&&v.length===3&&v.every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=100000);
const color=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
const clean=v=>typeof v==='string'?v.trim():'';
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');

export const isSamSketchSceneRequest=path=>BASE.test(path);
export function validateSamSketchDocument(doc) {
  if(!doc||typeof doc!=='object'||doc.version!==1||!Array.isArray(doc.items)
    ||doc.items.length>2500||!clean(doc.name)||doc.name.length>120
    ||!['agentsam','inneranimalmedia'].includes(doc.brand)
    ||!Number.isInteger(doc.chapter)||doc.chapter<0||doc.chapter>3)return false;
  const ids=new Set();
  for(const item of doc.items){
    if(!item||typeof item!=='object'||!clean(item.id)||item.id.length>128||ids.has(item.id)
      ||!clean(item.name)||item.name.length>160||!KIND.has(item.kind)
      ||!vec(item.position)||!vec(item.rotation)||!vec(item.scale)
      ||!color(item.color)||!['clay','metal','glass'].includes(item.material)
      ||typeof item.visible!=='boolean')return false;
    ids.add(item.id);
    if(item.templateId!==undefined&&(!clean(item.templateId)||item.templateId.length>160))return false;
    if(item.partOverrides!==undefined){
      const entries=Object.entries(item.partOverrides);
      if(entries.length>2500)return false;
      for(const [key,v] of entries){
        if(!key||key.length>160||!v||typeof v!=='object'
          ||(v.position!==undefined&&!vec(v.position))
          ||(v.rotation!==undefined&&!vec(v.rotation))
          ||(v.scale!==undefined&&!vec(v.scale))
          ||(v.color!==undefined&&!color(v.color))
          ||(v.visible!==undefined&&typeof v.visible!=='boolean'))return false;
      }
    }
  }
  return true;
}
const safeMeta=row=>{
  try{const x=JSON.parse(row.metadata_json||'{}');return x&&typeof x==='object'&&!Array.isArray(x)?x:{};}
  catch{return {};}
};
const summary=row=>({
 id:row.id,name:row.name,revision:Number(safeMeta(row).revision)||1,
 updatedAt:new Date(Number(row.updated_at)*1000).toISOString(),
 itemCount:Number(safeMeta(row).itemCount)||0,
 contentHash:row.content_hash,
 preview:row.thumbnail_r2_key?'/api/work/library/artifacts/'+encodeURIComponent(row.id)+'/file?preview=1':null,
});
const recordQuery="SELECT id,user_id,name,r2_key,content_hash,updated_at,metadata_json,thumbnail_r2_key FROM agentsam_artifacts WHERE id=? AND user_id=? AND artifact_type='samsketch-scene' AND archived_at IS NULL";
const objectKey=(owner,id,rev)=>'samsketch/'+encodeURIComponent(owner)+'/'+encodeURIComponent(id)+'/rev-'+rev+'-'+crypto.randomUUID()+'.json';
const toBytes=string=>new TextEncoder().encode(string);

async function thumbnail(preview,bucket,owner,id,rev){
 if(preview===undefined||preview===null)return null;
 if(typeof preview!=='string'||!/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(preview)||preview.length>340000)
   throw new Error('invalid_preview');
 const data=Uint8Array.from(atob(preview.slice('data:image/webp;base64,'.length)),c=>c.charCodeAt(0));
 if(data.byteLength>250000)throw new Error('invalid_preview');
 const key='samsketch/'+encodeURIComponent(owner)+'/'+encodeURIComponent(id)+'/thumb-'+rev+'-'+crypto.randomUUID()+'.webp';
 await bucket.put(key,data,{httpMetadata:{contentType:'image/webp'}});
 return key;
}
async function payload(request){
 if(Number(request.headers.get('content-length')||0)>MAX_DOCUMENT_BYTES+400000)throw new Error('payload_too_large');
 const raw=await request.text();
 if(raw.length>MAX_DOCUMENT_BYTES+400000)throw new Error('payload_too_large');
 const data=JSON.parse(raw);
 const document=data?.document;
 const bytes=toBytes(JSON.stringify(document));
 if(bytes.byteLength>MAX_DOCUMENT_BYTES||!validateSamSketchDocument(document))throw new Error('invalid_document');
 return {data,document,bytes};
}
async function readDocument(row,bucket){
 const obj=await bucket.get(row.r2_key);
 if(!obj)return null;
 const bytes=await obj.arrayBuffer();
 if(await sha(bytes)!==row.content_hash)return null;
 const doc=JSON.parse(new TextDecoder().decode(bytes));
 return validateSamSketchDocument(doc)?doc:null;
}
export async function handleSamSketchSceneRequest(request,env,owner){
 const path=new URL(request.url).pathname,match=BASE.exec(path);
 if(!match)return respond({ok:false,error:'not_found'},404);
 if(!owner)return respond({ok:false,error:'unauthorized'},401);
 if(!env.DB?.prepare||!env.ARTIFACTS?.get||!env.ARTIFACTS?.put)
   return respond({ok:false,error:'storage_unavailable'},503);
 const id=match[1],method=request.method.toUpperCase(),bucket=env.ARTIFACTS;
 const db=env.DB;
 try{
  if(!id&&method==='GET'){
   const rows=await db.prepare("SELECT id,name,r2_key,content_hash,updated_at,metadata_json,thumbnail_r2_key FROM agentsam_artifacts WHERE user_id=? AND artifact_type='samsketch-scene' AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 200").bind(owner).all();
   return respond({ok:true,scenes:(rows.results||[]).map(summary)});
  }
  if(!id&&method==='POST'){
   const {data,document,bytes}=await payload(request);
   const sceneId=data?.id;
   if(typeof sceneId!=='string'||!/^sketch_[a-z0-9-]{12,80}$/.test(sceneId))return respond({ok:false,error:'invalid_scene_id'},400);
   const existing=await db.prepare("SELECT id,user_id,artifact_type FROM agentsam_artifacts WHERE id=?").bind(sceneId).first();
   if(existing){
     if(existing.user_id!==owner||existing.artifact_type!=='samsketch-scene')return respond({ok:false,error:'scene_id_conflict'},409);
     const row=await db.prepare(recordQuery).bind(sceneId,owner).first();
     return row?respond({ok:true,scene:summary(row),created:false}):respond({ok:false,error:'scene_unavailable'},409);
   }
   const digest=await sha(bytes),key=objectKey(owner,sceneId,1);
   await bucket.put(key,bytes,{httpMetadata:{contentType:'application/json'}});
   const confirmed=await bucket.get(key);
   if(!confirmed||await sha(await confirmed.arrayBuffer())!==digest){
     await bucket.delete?.(key);return respond({ok:false,error:'scene_write_unverified'},502);
   }
   let previewKey=null;
   try{
     previewKey=await thumbnail(data.preview,bucket,owner,sceneId,1);
     const user=await db.prepare("SELECT default_account_id FROM auth_users WHERE id=?").bind(owner).first();
     const tenant=clean(user?.default_account_id)||owner;
     const result=await db.prepare("INSERT OR IGNORE INTO agentsam_artifacts (id,user_id,tenant_id,name,artifact_type,r2_key,source,file_size_bytes,content_hash,r2_bucket,scope,visibility,artifact_status,validation_status,mime_type,thumbnail_r2_key,metadata_json) VALUES (?,?,?,?,'samsketch-scene',?,'samsketch.editor',?,?,'artifacts','user','private','draft','asset-verified','application/json',?,?)")
       .bind(sceneId,owner,tenant,document.name,key,bytes.byteLength,digest,previewKey,JSON.stringify({revision:1,itemCount:document.items.length})).run();
     if(result.meta?.changes!==1){
       await bucket.delete?.(key);if(previewKey)await bucket.delete?.(previewKey);
       const current=await db.prepare(recordQuery).bind(sceneId,owner).first();
       // Two browser retries can race: losing the unique ID insert is not a second scene.
       return current?respond({ok:true,scene:summary(current),created:false}):
         respond({ok:false,error:'scene_id_conflict'},409);
     }
   }catch(e){
     await bucket.delete?.(key);if(previewKey)await bucket.delete?.(previewKey);
     throw e;
   }
   const row=await db.prepare(recordQuery).bind(sceneId,owner).first();
   return respond({ok:true,scene:summary(row),created:true},201);
  }
  if(!id)return respond({ok:false,error:'method_not_allowed'},405);
  const row=await db.prepare(recordQuery).bind(id,owner).first();
  if(!row)return respond({ok:false,error:'scene_not_found'},404);
  if(method==='GET'){
   const document=await readDocument(row,bucket);
   if(!document)return respond({ok:false,error:'scene_asset_missing_or_invalid'},424);
   return respond({ok:true,scene:summary(row),document},200,{'etag':'"'+row.content_hash+'"'});
  }
  if(method==='DELETE'){
   await db.prepare("UPDATE agentsam_artifacts SET archived_at=unixepoch(),updated_at=unixepoch() WHERE id=? AND user_id=? AND artifact_type='samsketch-scene' AND archived_at IS NULL").bind(id,owner).run();
   return respond({ok:true});
  }
  if(method==='PUT'){
   if(request.headers.get('if-match')!=='"'+row.content_hash+'"')return respond({ok:false,error:'revision_conflict'},409);
   const {data,document,bytes}=await payload(request);
   const revision=(Number(safeMeta(row).revision)||1)+1,key=objectKey(owner,id,revision),digest=await sha(bytes);
   await bucket.put(key,bytes,{httpMetadata:{contentType:'application/json'}});
   const confirmed=await bucket.get(key);
   if(!confirmed||await sha(await confirmed.arrayBuffer())!==digest){
     await bucket.delete?.(key);return respond({ok:false,error:'scene_write_unverified'},502);
   }
   let previewKey=null;
   try{
     previewKey=await thumbnail(data.preview,bucket,owner,id,revision);
     const metadata={...safeMeta(row),revision,itemCount:document.items.length};
     const result=await db.prepare("UPDATE agentsam_artifacts SET name=?,r2_key=?,file_size_bytes=?,content_hash=?,thumbnail_r2_key=?,metadata_json=?,updated_at=unixepoch() WHERE id=? AND user_id=? AND artifact_type='samsketch-scene' AND archived_at IS NULL AND content_hash=?")
       .bind(document.name,key,bytes.byteLength,digest,previewKey||row.thumbnail_r2_key,JSON.stringify(metadata),id,owner,row.content_hash).run();
     if(result.meta?.changes!==1){
       await bucket.delete?.(key);if(previewKey)await bucket.delete?.(previewKey);
       return respond({ok:false,error:'revision_conflict'},409);
     }
   }catch(e){
     await bucket.delete?.(key);if(previewKey)await bucket.delete?.(previewKey);
     throw e;
   }
   const updated=await db.prepare(recordQuery).bind(id,owner).first();
   return respond({ok:true,scene:summary(updated)});
  }
  return respond({ok:false,error:'method_not_allowed'},405);
 }catch(e){
   const error=e instanceof Error?e.message:'scene_request_failed';
   if(['invalid_document','invalid_preview','invalid_scene_id','payload_too_large'].includes(error))
     return respond({ok:false,error},400);
   console.error('samsketch_scene_request_failed',error);
   return respond({ok:false,error:'scene_request_failed'},500);
 }
}
