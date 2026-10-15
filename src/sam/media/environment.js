/**
 * SAM media host inspection: declarative evidence, not automatic cloud access.
 * Never reads .env or secrets, never probes remote storage, never mutates files.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

export const MEDIA_SELECTION_PATH = '.agentsam/media/storage.v1.json';
const codePackages = ['sharp','@jsquash/png','@jsquash/jpeg','@jsquash/webp','@jsquash/resize'];
const nativeTools = ['vtracer','potrace','inkscape','blender','openscad','FreeCADCmd','ffmpeg'];
function readSmall(file) {
  try { return existsSync(file) && statSync(file).size <= 128000 ? readFileSync(file,'utf8') : null; }
  catch { return null; }
}
function bindingHints(root) {
  const configs = [];
  for (const name of ['wrangler.toml','wrangler.json','wrangler.jsonc']) {
    const data = readSmall(path.join(root,name));
    if (!data) continue;
    const toml = name.endsWith('toml');
    const r2 = toml ? /\[\[r2_buckets\]\]/.test(data) : /"r2_buckets"\s*:/.test(data);
    const d1 = toml ? /\[\[d1_databases\]\]/.test(data) : /"d1_databases"\s*:/.test(data);
    if (r2 || d1) configs.push({file:name,r2_declared:r2,d1_declared:d1,
      access_verified:false});
  }
  return configs;
}
function projectPackageProbe(root) {
  // Resolve from the inspected project, never the SDK installation.
  // Resolution reads metadata only and does not execute foreign packages.
  const resolve = createRequire(path.join(root,'package.json')).resolve;
  return (name) => {
    try { resolve(name); return true; }
    catch { return false; }
  };
}
function checkBinary(name) {
  const result = spawnSync(name,['--version'],{timeout:900,stdio:'ignore'});
  return !result.error && result.status===0;
}
export function readMediaStorageSelection(root=process.cwd()) {
  const raw=readSmall(path.join(path.resolve(root),MEDIA_SELECTION_PATH));
  if (!raw) return null;
  try {
    const obj=JSON.parse(raw);
    if (obj?.schema!=='agentsam.media.storage.v1' ||
        !['local','r2','r2_d1'].includes(obj.kind) ||
        Object.keys(obj).some(k=>!['schema','kind','selected_at'].includes(k))) {
      return {error:'invalid_media_storage_selection'};
    }
    return obj;
  } catch { return {error:'invalid_media_storage_selection'}; }
}
export function inspectMediaEnvironment({root=process.cwd(),connected={},
  packageProbe=null,binaryProbe=checkBinary}={}) {
  const projectRoot=path.resolve(root), manifests=bindingHints(projectRoot);
  const r2Declared=manifests.some(x=>x.r2_declared);
  const d1Declared=manifests.some(x=>x.d1_declared);
  const hasBucket=typeof connected.objectStore?.get==='function' &&
    typeof connected.objectStore?.put==='function';
  const hasIndex=typeof connected.index?.register==='function';
  const selected=readMediaStorageSelection(projectRoot);
  const packageAvailable=packageProbe||projectPackageProbe(projectRoot);
  const packages=Object.fromEntries(codePackages.map(name=>[name,{
    installed:Boolean(packageAvailable(name)),validated:false}]));
  const tools=Object.fromEntries(nativeTools.map(name=>[name,{
    installed:Boolean(binaryProbe(name)),validated:false}]));
  return {
    schema:'agentsam.media.environment.v1',root:projectRoot,read_only:true,
    selected: selected?.kind||null,selection_error:selected?.error||null,
    manifests,
    storage:[
      {kind:'local',status:'available',requires:[],
        note:'Host-local installation-scoped storage; operational reads/writes require permission.'},
      {kind:'r2',status:hasBucket?'adapter_connected':r2Declared?'configuration_detected':'not_detected',
        requires:hasBucket?[]:['authorized_object_store_adapter'],
        note:'R2-compatible object storage, no SQL requirement.'},
      {kind:'r2_d1',status:hasBucket&&hasIndex?'adapter_connected':
        r2Declared&&d1Declared?'configuration_detected':'not_detected',
        requires:[...(!hasBucket?['authorized_object_store_adapter']:[]),
          ...(!hasIndex?['authorized_metadata_index_adapter']:[])],
        note:'Object storage with an optional host-owned metadata index.'},
    ],
    packages,tools,
    opportunities:{
      wasm_raster:codePackages.filter(k=>k.startsWith('@jsquash/') && packages[k].installed),
      vector_trace:tools.vtracer.installed||tools.potrace.installed,
      laser_cad:tools.inkscape.installed||tools.openscad.installed||
        tools.FreeCADCmd.installed,
      glb:tools.blender.installed,
    },
    caution:'Discovery is not authorization, an executed transform, or proof of remote access.',
  };
}
