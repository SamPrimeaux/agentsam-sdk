import { CAD_PROJECT_TOOLS } from '../../../lib/cad/project-tools.js';

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
  return {
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
