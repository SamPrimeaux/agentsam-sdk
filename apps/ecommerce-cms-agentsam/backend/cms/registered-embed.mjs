// Site-owned editor resolves portable embed releases from the existing D1 registry.
// Only the explicitly configured public package CDN is a valid artifact origin.
const CDN='https://cdn.inneranimalmedia.com/';
const HASH=/^[a-f0-9]{64}$/;
const KEY=/^[a-z][a-z0-9_]{0,63}$/;
const MANIFEST=/^packages\/platform\/[a-z0-9-]+\/[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?\/manifest\.json$/;
const json=(raw,fallback)=>{try{return JSON.parse(raw);}catch{return fallback;}};
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');

export async function registeredEmbed(env,accountId,key) {
  if(!accountId||!KEY.test(key||'')||!env.DB)return null;
  let row;
  try {
    row=await env.DB.prepare(`SELECT t.sku,t.template_name,t.label,t.status AS template_status,
      t.template_data,t.editor_schema_json,d.id AS definition_id,d.definition_key,d.version,
      d.status AS definition_status,d.account_id,d.category,d.metadata_json,
      c.renderer_key,c.implementation_status,c.artifact_r2_bucket,c.artifact_r2_key,c.artifact_sha256
      FROM cms_component_templates t JOIN cms_definitions d ON d.id=t.definition_id
      JOIN cms_components c ON c.definition_id=d.id
      WHERE t.item_type='ui_component' AND t.definition_key=? AND d.definition_key=t.definition_key
        AND d.version=t.definition_version AND d.kind='component'
        AND c.delivery_mode='isolated_embed' AND t.status!='archived' AND d.status!='archived'
        AND (d.account_id=? OR (d.origin='built_in' AND t.is_system=1
          AND t.status='active' AND d.status='active' AND c.implementation_status='verified'))
      ORDER BY CASE WHEN d.account_id=? THEN 0 ELSE 1 END LIMIT 1`).bind(key,accountId,accountId).first();
  } catch(e) {
    if(/no such table/i.test(String(e.message||e)))return null;
    throw e;
  }
  if(!row)return null;
  const defaults=json(row.template_data,null), schema=json(row.editor_schema_json,{}), meta=json(row.metadata_json,{});
  if(!object(defaults)||!Array.isArray(schema.fields))throw Error('cms_embed_registry_contract_invalid');
  const ownerOnly=new Set(Array.isArray(meta.owner_only_fields)?meta.owner_only_fields:[]);
  const fields=schema.fields.map(f=>({...f,...(ownerOnly.has(f.key)?{owner_only:true}:{})}));
  const artifactReady=row.artifact_r2_bucket==='theme-store'&&MANIFEST.test(row.artifact_r2_key||'')&&HASH.test(row.artifact_sha256||'');
  return {key,name:row.label||row.template_name,category:row.category||'Customer Service',
    default_config:defaults,editor_fields:fields,surfaces:['storefront_embed'],
    registration:{sku:row.sku,definitionId:row.definition_id,definitionVersion:row.version,
      rendererKey:row.renderer_key,manifestKey:row.artifact_r2_key,manifestSha256:row.artifact_sha256,
      element:meta.element,artifactReady,previewOnly:row.template_status!=='active'||row.definition_status!=='active'||row.implementation_status!=='verified'}};
}

async function checkedObject(fetcher,key,digest,max) {
  if(!HASH.test(digest||''))throw Error('cms_embed_artifact_hash_invalid');
  const response=await fetcher(CDN+key,{redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('cms_embed_artifact_unavailable');
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength>max||await hash(bytes)!==digest)throw Error('cms_embed_artifact_integrity_failed');
  return bytes;
}

export async function readRegisteredEmbedRuntime(template,fetcher=fetch) {
  const r=template?.registration;
  if(!r?.artifactReady||!/^agentsam-[a-z0-9-]+$/.test(r.element||''))throw Error('cms_embed_release_unavailable');
  const manifest=JSON.parse(new TextDecoder().decode(await checkedObject(fetcher,r.manifestKey,r.manifestSha256,262144)));
  if(manifest.schema!=='inneranimalmedia.cms-component-package.v2'||manifest.renderer_key!==r.rendererKey||
    manifest.embed_key!==template.key||manifest.element!==r.element||!Array.isArray(manifest.files))
    throw Error('cms_embed_manifest_identity_mismatch');
  const f=manifest.files.find(item=>item.path===manifest.entrypoint);
  if(!f||!HASH.test(f.sha256||'')||f.object_key!=='blobs/sha256/'+f.sha256.slice(0,2)+'/'+f.sha256||
    !Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>1048576||!String(f.content_type).startsWith('text/javascript'))
    throw Error('cms_embed_entrypoint_invalid');
  const bytes=await checkedObject(fetcher,f.object_key,f.sha256,1048576);
  if(bytes.byteLength!==f.bytes)throw Error('cms_embed_artifact_size_mismatch');
  return {source:new TextDecoder().decode(bytes),sha256:f.sha256,element:r.element,previewOnly:r.previewOnly};
}
