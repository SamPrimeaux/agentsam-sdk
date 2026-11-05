/**
 * One Library discovery adapter. Source ownership stays with existing D1
 * artifacts, CMS sites, and media records; this module owns no resources.
 */
const safe = value => String(value ?? '').trim();
const safeWebUrl = value => {
  const raw = safe(value);
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try { const parsed = new URL(raw); return parsed.protocol === 'https:' ? parsed.href : null; }
  catch { return null; }
};
const dt = value => {
  if (typeof value === 'number' && Number.isFinite(value)) return value * 1000;
  const raw = safe(value);
  if (!raw) return null;
  const date = Date.parse(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z');
  return Number.isFinite(date) ? date : null;
};
const readableSize = value => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
};
function kindOf(name, mime, category) {
  const type = safe(category).toLowerCase();
  if (['theme','template','page-build','site-build','design','scene'].includes(type)) return 'design';
  if (['product','mockup','merchandise'].includes(type)) return 'product';
  const lower = (safe(name) + ' ' + safe(mime)).toLowerCase();
  if (/image\//.test(lower) || /\.(png|jpe?g|webp|gif|svg|avif)\b/.test(lower)) return 'image';
  if (/video\//.test(lower) || /\.(mp4|webm|mov|m4v|mkv)\b/.test(lower)) return 'video';
  if (/audio\//.test(lower) || /\.(mp3|wav|ogg|m4a)\b/.test(lower)) return 'audio';
  if (/\.(glb|gltf|obj|fbx|stl|3mf|usdz)\b/.test(lower)) return 'model';
  if (/\.(pptx|ppt)\b/.test(lower)) return 'presentation';
  if (/\.(xlsx|xls|csv)\b/.test(lower)) return 'spreadsheet';
  if (/\.(md|txt)\b/.test(lower)) return 'note';
  if (/\.(ts|tsx|js|jsx|mjs|py|rs|go|css|html|json|yaml|yml)\b/.test(lower)) return 'code';
  if (/\.(zip|tar|gz|7z|rar)\b/.test(lower)) return 'archive';
  return 'document';
}
const when = value => {
  const timestamp = dt(value);
  return { updatedAt: timestamp, updatedLabel: timestamp ? new Date(timestamp).toLocaleDateString() : null };
};

/** No cross-account queries, key guessing, or provider-auth assumptions. */
export async function listAccountLibraryResources(db, owner) {
  if (!owner || !db?.prepare) return [];
  const reads = [
    db.prepare(`SELECT id,name,artifact_type,mime_type,file_size_bytes,updated_at,
        thumbnail_r2_key,preview_r2_key,public_url,thumbnail_url,preview_url,is_public,archived_at,metadata_json
      FROM agentsam_artifacts WHERE user_id=? ORDER BY updated_at DESC LIMIT 400`).bind(owner).all(),
    db.prepare(`SELECT a.id,a.filename,a.label,a.mime_type,a.category,a.size,a.thumbnail_url,a.public_url,
        a.updated_at,s.name AS site_name
      FROM cms_assets a JOIN cms_sites s ON s.id=a.site_id
      WHERE s.account_id=? ORDER BY a.updated_at DESC LIMIT 250`).bind(owner).all(),
    db.prepare(`SELECT id,filename,media_kind,content_type,size_bytes,provider,source_uri,
        provider_resource_id,updated_at,status,duration_ms
      FROM media_assets WHERE created_by_user_id=? ORDER BY updated_at DESC LIMIT 250`).bind(owner).all(),
    db.prepare(`SELECT id,artifact_key,artifact_type,content_mode,created_at,version,status,
        metadata_json FROM cms_artifacts WHERE account_id=? ORDER BY created_at DESC LIMIT 100`).bind(owner).all(),
  ];
  const results = await Promise.all(reads.map(async task => {
    try { return (await task)?.results ?? []; }
    catch (e) { console.warn('work_library_source_failed',String(e?.name || 'database_error')); return []; }
  }));
  const [artifacts,cmsAssets,media,templates] = results;

  const stored = artifacts.map(row => {
    const name = safe(row.name) || 'Untitled artifact';
    const kind = kindOf(name,row.mime_type,row.artifact_type);
    const base = '/api/work/library/artifacts/'+encodeURIComponent(row.id)+'/file';
    const richPreview = safeWebUrl(row.thumbnail_url) || safeWebUrl(row.preview_url);
    const staticPublic = row.is_public ? safeWebUrl(row.public_url) : null;
    let attributes = {};
    try { attributes = JSON.parse(row.metadata_json || '{}') || {}; } catch { /* Leave invalid legacy metadata untouched. */ }
    return {
      starred: attributes.library?.starred === true,
      id:'artifact:'+row.id,name,kind,source:'artifacts',mime:safe(row.mime_type)||null,
      providerId:row.id,sizeLabel:readableSize(row.file_size_bytes),
      ...when(row.updated_at),
      deleted: Boolean(row.archived_at),
      preview: (kind==='image'||kind==='video'||kind==='document') ?
        (richPreview || (row.thumbnail_r2_key || row.preview_r2_key ? base+'?preview=1' : (kind==='image'?base:null))) : null,
      open:staticPublic || base, resourceType:'artifact',
    };
  });
  const cms = cmsAssets.map(row => {
    const name = safe(row.label || row.filename) || 'CMS asset';
    const kind = kindOf(name,row.mime_type,row.category);
    const url = safeWebUrl(row.public_url);
    const image = kind === 'image' ? safeWebUrl(row.thumbnail_url) || url : null;
    return {
      id:'cms:'+row.id,name,kind,source:'artifacts',
      mime:safe(row.mime_type)||null,providerId:row.id,
      sizeLabel:readableSize(row.size),
      ...when(row.updated_at),preview:image,open:url,resourceType:'cms',
      sourceLabel:row.site_name ? 'CMS · '+row.site_name : 'CMS',
    };
  });
  const registered = media.map(row => {
    const name = safe(row.filename) || 'Media asset';
    const kind = kindOf(name,row.content_type,row.media_kind);
    // A provider identity is not proof that a private object has a public URL.
    const url = safeWebUrl(row.source_uri);
    const source = row.provider === 'cloudflare_stream' ? 'stream'
      : row.provider === 'cloudflare_images' ? 'cf_images'
      : row.provider === 'google_drive' ? 'google-drive'
      : row.provider === 'r2' ? 'r2' : row.provider === 'local' ? 'local' : 'artifacts';
    return {
      id:'media:'+row.id,name,kind,source,mime:safe(row.content_type)||null,
      providerId:row.provider_resource_id||row.id,sizeLabel:readableSize(row.size_bytes),
      ...when(row.updated_at),
      preview:kind==='image'&&url?url:null,
      open:url,resourceType:'media',durationMs:Number(row.duration_ms)||null,
    };
  });
  const themes = templates.map(row => {
    const name = safe(row.artifact_key).replace(/[-_]+/g,' ') || 'CMS design';
    return {
      id:'cms-artifact:'+row.id,name,kind:kindOf(name,null,row.artifact_type),
      source:'artifacts',providerId:row.id,
      ...when(row.created_at),preview:null,open:null,resourceType:'cms-artifact',
      sourceLabel:'CMS · '+row.artifact_type,
    };
  });
  return [...stored,...cms,...registered,...themes];
}

/** Account-owned private artifact file, resolved in the platform's own bucket. */
export async function serveAccountLibraryFile(env,owner,id,preview=false) {
  if (!owner || !env.DB?.prepare || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return Response.json({error:'not_found'},{status:404});
  }
  const row = await env.DB.prepare(
    `SELECT r2_bucket,r2_key,preview_r2_key,thumbnail_r2_key,mime_type,name
     FROM agentsam_artifacts WHERE id=? AND user_id=? LIMIT 1`
  ).bind(id,owner).first();
  if (!row) return Response.json({error:'not_found'},{status:404});
  const bucketName = safe(row.r2_bucket || 'artifacts');
  const bucket = bucketName === 'artifacts' ? env.ARTIFACTS
    : bucketName === 'inneranimalmedia-autorag' ? env.AUTORAG_BUCKET : null;
  if (!bucket?.get) return Response.json({error:'file_unavailable'},{status:404});
  const key = preview ? safe(row.thumbnail_r2_key || row.preview_r2_key || row.r2_key) : safe(row.r2_key);
  if (!key) return Response.json({error:'file_unavailable'},{status:404});
  const object = await bucket.get(key);
  if (!object) return Response.json({error:'file_unavailable'},{status:404});
  const mime = safe(object.httpMetadata?.contentType || (preview ? '' : row.mime_type)).toLowerCase();
  const inline = /^(image\/(png|jpeg|webp|gif|avif)|application\/pdf|video\/(mp4|webm)|audio\/(mpeg|wav|ogg))$/.test(mime);
  const downloadName = safe(row.name || id).replace(/[\r\n"\\]/g,'_').slice(0,100);
  const headers = {
    'content-type':inline?mime:'application/octet-stream',
    'content-disposition':(inline?'inline':'attachment')+'; filename="'+downloadName+'"',
    'cache-control':'private, no-store',
    'x-content-type-options':'nosniff',
    'content-security-policy':"default-src 'none'; frame-ancestors 'self'",
    'cross-origin-resource-policy':'same-origin',
  };
  return new Response(object.body,{status:200,headers});
}

/** Rename, favorite, and archive the original artifact row. No new registry. */
export async function mutateAccountLibraryArtifact(request, env, owner, id) {
  if (!owner || !env.DB?.prepare || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return Response.json({error:'not_found'}, {status:404});
  }
  const existing = await env.DB.prepare('SELECT id FROM agentsam_artifacts WHERE id=? AND user_id=? LIMIT 1')
    .bind(id,owner).first();
  if (!existing) return Response.json({error:'not_found'}, {status:404});
  let body;
  try { body = await request.json(); }
  catch { return Response.json({error:'invalid_request'}, {status:400}); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({error:'invalid_request'}, {status:400});
  const allowed = ['name','starred','archived'];
  const fields = [];
  const binds = [];
  if (Object.keys(body).some(key=>!allowed.includes(key))) return Response.json({error:'invalid_fields'}, {status:400});
  if (Object.hasOwn(body,'name')) {
    const value = safe(body.name);
    if (!value || value.length > 160) return Response.json({error:'invalid_name'}, {status:400});
    fields.push('name=?'); binds.push(value);
  }
  if (Object.hasOwn(body,'starred')) {
    if (typeof body.starred !== 'boolean') return Response.json({error:'invalid_favorite'}, {status:400});
    fields.push("metadata_json=json_set(CASE WHEN json_valid(metadata_json) THEN metadata_json ELSE '{}' END,'$.library.starred',json(?))");
    binds.push(body.starred ? 'true' : 'false');
  }
  if (Object.hasOwn(body,'archived')) {
    if (typeof body.archived !== 'boolean') return Response.json({error:'invalid_archive'}, {status:400});
    fields.push(body.archived ? 'archived_at=unixepoch()' : 'archived_at=NULL');
  }
  if (!fields.length) return Response.json({error:'no_changes'}, {status:400});
  await env.DB.prepare('UPDATE agentsam_artifacts SET '+fields.join(', ')+',updated_at=unixepoch() WHERE id=? AND user_id=?')
    .bind(...binds,id,owner).run();
  return Response.json({ok:true}, {headers:{'cache-control':'private, no-store'}});
}
