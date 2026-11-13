/**
 * Portable, content-addressed packaging contract for CMS stock sources.
 *
 * Stable semantic identity: cms-component:platform/<slug>@<release>
 * Immutable manifest:    packages/platform/<slug>/<release>/manifest.json
 * Deduplicated objects:  blobs/sha256/<first-two>/<full-sha256>
 *
 * This module does not own component definitions, installations or D1 identity.
 * Those remain cms_definitions, cms_components and cms_component_templates.
 */
import {createHash} from 'node:crypto';

export const STOCK_PACKAGE_SCHEMA = 'inneranimalmedia.cms-component-package.v2';
export const STOCK_INDEX_SCHEMA = 'inneranimalmedia.cms-component-index.v2';
export const STORAGE_BUCKET = 'theme-store';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value,null,2)+'\n');
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const versionPattern = /^[1-9]\d*\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/;
const filePattern = /^(?:vendor\/)?[a-zA-Z0-9_.-]+$/;

export function sha256(bytes) { return digest(bytes); }
export function stockObjectKey(hash) {
  if(!/^[a-f0-9]{64}$/.test(hash))throw Error('stock_object_hash_invalid');
  return 'blobs/sha256/'+hash.slice(0,2)+'/'+hash;
}
export function stockPackageRef(slug,version='1.0.0') {
  if(!slugPattern.test(slug)||!versionPattern.test(version))throw Error('stock_package_identity_invalid');
  return 'cms-component:platform/'+slug+'@'+version;
}
export function stockManifestKey(slug,version='1.0.0') {
  stockPackageRef(slug,version);
  return 'packages/platform/'+slug+'/'+version+'/manifest.json';
}
export function stockContentType(path) {
  return path.endsWith('.html')?'text/html; charset=utf-8':
    path.endsWith('.js')?'text/javascript; charset=utf-8':
    path.endsWith('.md')?'text/markdown; charset=utf-8':'application/octet-stream';
}

/**
 * The checked-in v1 catalog is the source inventory and provenance record,
 * NOT a second live registry. This transformation only repackages its files.
 */
export function createStockPackage(item,{version=item.release_version||'1.0.0'}={}) {
  const slug=item?.slug;
  if(!slugPattern.test(slug||'')||item.id!=='agentsam.stock.'+slug)
    throw Error('stock_source_identity_invalid');
  if(!filePattern.test(item.main_html||'')||!/^[a-f0-9]{64}$/.test(item.main_sha256))
    throw Error('stock_source_entrypoint_invalid');
  const files=[...(item.files||[])].sort((a,b)=>a.path.localeCompare(b.path));
  if(!files.length||new Set(files.map(f=>f.path)).size!==files.length)
    throw Error('stock_source_files_invalid');
  for(const file of files) {
    if(!filePattern.test(file.path)||!Number.isSafeInteger(file.bytes)||file.bytes<0
       ||!/^[a-f0-9]{64}$/.test(file.sha256))
      throw Error('stock_source_file_invalid');
  }
  const main=files.find(file=>file.path===item.main_html);
  if(!main||main.sha256!==item.main_sha256)
    throw Error('stock_source_entrypoint_mismatch');
  const manifest={
    schema:STOCK_PACKAGE_SCHEMA,
    id:'platform/'+slug,
    kind:'cms-component-source',
    version,
    renderer_key:'platform/'+slug,
    entrypoint:item.main_html,
    preview_route:item.preview_path,
    files:files.map(f=>({
      path:f.path,
      sha256:f.sha256,
      bytes:f.bytes,
      content_type:stockContentType(f.path),
      object_key:stockObjectKey(f.sha256),
    })),
    provenance:{source_id:item.id,source_kind:item.source},
  };
  const bytes=jsonBytes(manifest);
  return {
    ref:stockPackageRef(slug,version),
    key:stockManifestKey(slug,version),
    sha256:digest(bytes),
    bytes,
    manifest,
  };
}

export function createStockIndex(packages) {
  if(!Array.isArray(packages)||packages.length===0)throw Error('stock_index_empty');
  const sorted=[...packages].sort((a,b)=>a.ref.localeCompare(b.ref));
  if(new Set(sorted.map(p=>p.ref)).size!==sorted.length)throw Error('stock_index_duplicate');
  const document={
    schema:STOCK_INDEX_SCHEMA,
    entries:sorted.map(pkg=>({
      ref:pkg.ref,
      manifest_key:pkg.key,
      manifest_sha256:pkg.sha256,
      renderer_key:pkg.manifest.renderer_key,
      preview_route:pkg.manifest.preview_route,
    })),
  };
  const bytes=jsonBytes(document);
  return {
    key:'catalogs/cms-components/releases/'+digest(bytes)+'.json',
    sha256:digest(bytes),
    bytes,
    document,
  };
}

/** Resolve an asset via its pinned manifest, never by guessing a filename URL. */
export function resolveStockObject(manifest,relativePath) {
  if(manifest?.schema!==STOCK_PACKAGE_SCHEMA||!filePattern.test(relativePath||''))
    throw Error('stock_package_resolution_invalid');
  const file=manifest.files.find(entry=>entry.path===relativePath);
  if(!file||file.object_key!==stockObjectKey(file.sha256))
    throw Error('stock_package_file_not_found');
  return {...file,bucket:STORAGE_BUCKET};
}

export function validateStockSourceFile(item,file,bytes) {
  if(!filePattern.test(file.path) || Buffer.byteLength(bytes)!==file.bytes
     ||digest(bytes)!==file.sha256)
    throw Error('stock_file_integrity_failed: '+item.slug+'/'+file.path);
  return true;
}
