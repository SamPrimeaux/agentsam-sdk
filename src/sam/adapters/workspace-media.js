/**
 * Host-only local asset ingestion. The model provides a relative workspace path;
 * principal, workspace root, allowed types, and storage adapter are host-owned.
 */
import path from 'node:path';
import { realpath, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { defineSamOperation } from '../define.js';
import { inspectGlb } from '../operation-packs/generated-v2/glb.js';

const formats = new Map([
  ['.png','image/png'], ['.jpg','image/jpeg'], ['.jpeg','image/jpeg'],
  ['.webp','image/webp'], ['.glb','model/gltf-binary'],
]);

export function createWorkspaceMediaImportOperation({ root, assetStore, resolveTrustedContext, authorize } = {}) {
  if (!root || !path.isAbsolute(root) || !assetStore?.importAsset
      || typeof resolveTrustedContext !== 'function' || typeof authorize !== 'function') {
    throw new TypeError('workspace_media_import_host_dependencies_required');
  }
  return defineSamOperation({
    id:'media.local.import', version:1, module:'media', action:'local.import',
    summary:'Import an image or GLB from an authorized project workspace into the installed Media Library before inspecting, editing, or removing a background.',
    risk:'write', capabilities:['media.asset.write'],
    execution:{lanes:['local'],model:'never',network:'none',sideEffects:'local_write'},
    input_schema:{
      type:'object',
      properties:{ relativePath:{type:'string',minLength:1} },
      required:['relativePath'], additionalProperties:false,
    },
    async handler(input = {}, runtime = {}) {
      if (!input || Object.keys(input).some(k=>k!=='relativePath') ||
          typeof input.relativePath !== 'string' || !input.relativePath.trim()) {
        throw new Error('media_import_input_invalid');
      }
      const trusted = await resolveTrustedContext(runtime);
      if (!trusted?.accountId || !trusted?.actorId || !trusted?.installationId) {
        throw new Error('trusted_identity_required');
      }
      const permission = await authorize({ operation:'media.local.import', input,
        policy:{effect:'media_asset_create',target_scope:'project_media'},identity:trusted });
      if (permission !== true && permission?.allow !== true) throw new Error('capability_or_resource_denied');
      const base = await realpath(root);
      const requested = path.resolve(base,input.relativePath);
      if (!requested.startsWith(base + path.sep)) throw new Error('media_path_outside_project');
      let candidate;
      try { candidate = await realpath(requested); }
      catch (error) {
        if (error?.code === 'ENOENT') throw new Error('media_source_not_found');
        throw error;
      }
      if (!candidate.startsWith(base + path.sep)) throw new Error('media_path_outside_project');
      const extension = path.extname(candidate).toLowerCase();
      const contentType = formats.get(extension);
      if (!contentType) throw new Error('unsupported_media_format');
      const fileStat = await stat(candidate);
      if (!fileStat.isFile() || fileStat.size < 1 || fileStat.size > 50*1024*1024) throw new Error('media_file_invalid_or_oversized');
      const bytes = await readFile(candidate);
      if (extension === '.glb') inspectGlb(bytes); // fail closed on malformed 3D
      else {
        const image = (await import('sharp')).default;
        const info = await image(bytes).metadata();
        if (!info.width || !info.height || info.width*info.height > 40_000_000) throw new Error('media_image_invalid_dimensions');
      }
      const stored = await assetStore.importAsset({
        accountId:trusted.accountId,installationId:trusted.installationId,
        bytes, contentType,metadata:{filename:path.basename(candidate)},
      });
      return {ok:true,assetId:stored.id,sha256:stored.sha256,contentType,
        byteLength:stored.byteLength,originalPreserved:true};
    },
  });
}

export function projectInstallationId(projectRoot) {
  if (!projectRoot || !path.isAbsolute(projectRoot)) throw new TypeError('absolute_project_root_required');
  return 'local_' + createHash('sha256').update(path.resolve(projectRoot)).digest('hex').slice(0,24);
}
