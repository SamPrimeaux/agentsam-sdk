import { CAD_PROJECT_TOOLS } from '../../../lib/cad/project-tools.js';
import { createHash } from 'node:crypto';

/**
 * Reuse existing CAD API routes with an already authenticated host request.
 * This adapter never accepts an arbitrary URL, cookies, or credentials from a
 * model/tool argument. Cloud Worker and local host can supply different routes
 * through their *own* authenticated transport, not through the guest iframe.
 */
export function createCadHttpPorts({ request } = {}) {
  if (typeof request !== 'function') throw new Error('sam_cad_authenticated_request_required');
  const call = async (path, method, payload, scope) => {
    const response = await request(path, {
      method, signal: scope?.signal,
      ...(payload ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) } : {}),
    }, scope?.principal);
    if (!response || typeof response.json !== 'function') {
      throw new Error('sam_cad_invalid_host_response');
    }
    const type = response.headers?.get?.('content-type') ?? '';
    if (!type.includes('application/json')) throw new Error('sam_cad_invalid_host_response');
    const data = await response.json();
    if (!response.ok || data?.ok === false || data?.error) {
      const code = typeof data?.error === 'string' ? data.error :
        (data?.error?.code || 'sam_cad_host_request_failed');
      throw new Error(code);
    }
    return data;
  };
  const artifactUrl = ({ project_id, revision, file }) => {
    if (typeof project_id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(project_id)
        || !Number.isInteger(revision) || revision < 1 || revision > Number.MAX_SAFE_INTEGER
        || (file !== undefined && (typeof file !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(file)))) {
      throw new Error('sam_cad_artifact_path_invalid');
    }
    return '/api/cad/artifacts/' + encodeURIComponent(project_id) + '/' + revision
      + (file ? '/' + encodeURIComponent(file) : '');
  };
  const artifactRequest = async (path, options, scope) => {
    const res = await request(path, { ...options, signal: scope?.signal }, scope?.principal);
    if (!res || typeof res.status !== 'number') throw new Error('sam_cad_invalid_host_response');
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(typeof data?.error === 'string' ? data.error : 'sam_cad_host_request_failed');
    }
    return res;
  };
  const hash = body => createHash('sha256').update(body).digest('hex');

  return {
    artifacts: {
      async put({ project_id, revision, file, bytes, ifMatchSha256 }, scope) {
        const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
        if (body.length < 1 || body.length > 25 * 1024 * 1024) throw new Error('sam_cad_artifact_size_invalid');
        const sha256 = hash(body);
        if (ifMatchSha256 && !/^[a-f0-9]{64}$/.test(ifMatchSha256)) throw new Error('sam_cad_artifact_etag_invalid');
        const res = await artifactRequest(artifactUrl({ project_id, revision, file }), {
          method: 'PUT', body,
          headers: { 'content-type': 'application/octet-stream', 'x-content-sha256': sha256,
                     ...(ifMatchSha256 ? { 'if-match': '"' + ifMatchSha256 + '"' } : {}) },
        }, scope);
        const receipt = await res.json();
        if (receipt?.ok !== true || receipt.sha256 !== sha256 || receipt.bytes !== body.length
            || receipt.project !== project_id || receipt.revision !== revision) {
          throw new Error('sam_cad_artifact_receipt_mismatch');
        }
        return receipt;
      },
      async get(args, scope) {
        const res = await artifactRequest(artifactUrl(args), { method: 'GET' }, scope);
        const bytes = Buffer.from(await res.arrayBuffer());
        const sha256 = hash(bytes);
        if (res.headers.get('x-content-sha256') !== sha256) throw new Error('sam_cad_artifact_read_hash_mismatch');
        return { bytes, sha256 };
      },
      async list({ project_id, revision }, scope) {
        const res = await artifactRequest(artifactUrl({ project_id, revision }) + '?list=1', { method: 'GET' }, scope);
        const data = await res.json();
        if (!data?.ok || !Array.isArray(data.artifacts)) throw new Error('sam_cad_artifact_list_invalid');
        return data.artifacts;
      },
      async delete(args, scope) {
        const res = await artifactRequest(artifactUrl(args), { method: 'DELETE' }, scope);
        const data = await res.json();
        if (!data?.ok || data.deleted !== true) throw new Error('sam_cad_artifact_delete_invalid');
        return data;
      },
    },
    projectTools: {
      async execute(name, args, scope) {
        if (!CAD_PROJECT_TOOLS.some(tool => tool.name === name)) throw new Error('sam_cad_unrecognized_project_tool');
        const data = await call('/api/cad/project/tools/' + encodeURIComponent(name),
          'POST', args, scope);
        return data.result;
      },
    },
    jobs: {
      async submit(args, scope) {
        if (!['openscad', 'freecad', 'blender'].includes(args.engine)) throw new Error('sam_cad_invalid_engine');
        const route = args.engine === 'openscad' ? '/api/cad/openscad/generate'
          : args.engine === 'freecad' ? '/api/cad/freecad/script'
            : '/api/cad/blender/script';
        return call(route, 'POST', args, scope);
      },
      async get(args, scope) {
        return call('/api/cad/jobs/' + encodeURIComponent(args.job_id), 'GET', null, scope);
      },
      async execute(args, scope) {
        return call('/api/cad/jobs/' + encodeURIComponent(args.job_id) + '/execute',
          'POST', { project_id: args.project_id, workspace_id: args.workspace_id }, scope);
      },
    },
  };
}
