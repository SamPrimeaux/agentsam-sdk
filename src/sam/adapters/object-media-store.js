/**
 * Real R2-compatible SAM media store. Requires an authorized host binding.
 * No provider SDK, D1 table, public URL or Cloudflare credential is assumed.
 * The object prefix enforces account/installation isolation.
 */
const LIMIT = 50 * 1024 * 1024;
function identity(v) {
  if (typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(v))
    throw new Error('invalid_media_resource_identifier');
  return v;
}
function bytesOf(value) {
  if (!(value instanceof Uint8Array) || value.byteLength < 1 || value.byteLength > LIMIT)
    throw new Error('media_bytes_invalid');
  return Uint8Array.from(value);
}
async function sha256(bytes) {
  const hash = await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2,'0')).join('');
}
function prefix(accountId,installationId) {
  return 'sam-media-v1/'+identity(accountId)+'/'+identity(installationId)+'/';
}
async function readObject(bucket,key) {
  const obj=await bucket.get(key);
  return obj ? new Uint8Array(await obj.arrayBuffer()) : null;
}
function asJson(bytes) {
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error('media_metadata_invalid'); }
}
export function createObjectMediaStore({bucket,index=null}={}) {
  if (!bucket || typeof bucket.get!=='function' ||
    typeof bucket.put!=='function' || typeof bucket.delete!=='function')
    throw new TypeError('authorized_object_store_with_get_put_delete_required');
  if (index && typeof index.register!=='function')
    throw new TypeError('metadata_index_register_required');
  async function getOwnedAsset({assetId,accountId,installationId}) {
    const id=identity(String(assetId));
    const base=prefix(accountId,installationId)+id;
    const metadata=await readObject(bucket,base+'.json');
    if (!metadata) return null;
    const row=asJson(metadata);
    if (row.id!==id || row.accountId!==accountId ||
      row.installationId!==installationId) throw new Error('media_integrity_or_scope_mismatch');
    const bytes=await readObject(bucket,base+'.bin');
    if (!bytes || bytes.byteLength!==row.byteLength || await sha256(bytes)!==row.sha256)
      throw new Error('media_integrity_or_scope_mismatch');
    return {...row,bytes};
  }
  async function store({accountId,installationId,bytes,contentType,
    sourceAssetId=null,sourceHash=null,derivativeHash=null,
    transformations=[],metadata={}}) {
    const base=prefix(accountId,installationId);
    const data=bytesOf(bytes);
    const digest=await sha256(data);
    if (derivativeHash && digest!==derivativeHash) throw new Error('derivative_hash_mismatch');
    const parent=sourceAssetId ?
      await getOwnedAsset({assetId:sourceAssetId,accountId,installationId}) : null;
    if (sourceAssetId && !parent) throw new Error('media_source_not_found_or_forbidden');
    if (parent && sourceHash!==parent.sha256) throw new Error('media_source_version_conflict');
    if (typeof contentType!=='string' || !/^[\w.+-]+\/[\w.+-]+$/.test(contentType))
      throw new Error('invalid_media_content_type');
    if (!Array.isArray(transformations) || !transformations.every(x=>typeof x==='string') ||
      !metadata || typeof metadata!=='object' || Array.isArray(metadata))
      throw new Error('invalid_media_metadata');
    const id='ast_'+crypto.randomUUID().replaceAll('-','');
    const asset={
      id,accountId,installationId,contentType,byteLength:data.byteLength,
      sha256:digest,sourceAssetId,sourceHash:parent?.sha256||null,
      transformations,metadata,createdAt:new Date().toISOString(),
    };
    const key=base+id;
    try {
      await bucket.put(key+'.bin',data,{httpMetadata:{contentType}});
      await bucket.put(key+'.json',JSON.stringify(asset),{
        httpMetadata:{contentType:'application/json'}});
      if (index) await index.register({...asset,objectKey:key});
    } catch (error) {
      // The new candidate alone is removed; the source asset is immutable.
      await Promise.allSettled([bucket.delete(key+'.json'),bucket.delete(key+'.bin')]);
      throw error;
    }
    return {id,...asset};
  }
  return Object.freeze({
    importAsset:store,writeDerivative:store,getOwnedAsset,
  });
}
