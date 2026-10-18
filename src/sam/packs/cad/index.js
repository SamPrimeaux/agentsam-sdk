import { defineSamOperation } from '../../define.js';
import { createCadProductionOperations } from '../../../lib/cad/production-operations.js';
import { CAD_PROJECT_TOOLS } from '../../../lib/cad/project-tools.js';

/**
 * Donor compatibility only. UI labels never grant tool execution permission.
 * Each destination is an existing CAD operation or provider-specific tool.
 */
export const CAD_DONOR_OPERATOR_MAPPINGS = Object.freeze({
  generateFreeCAD: { operation: 'cad.job.generate', engine: 'freecad' },
  generateBlender: { operation: 'cad.job.generate', engine: 'blender' },
  generateOpenSCAD: { operation: 'cad.job.generate', engine: 'openscad' },
  executeScript: { operation: 'cad.job.execute' },
  exportGLB: { operation: 'cad.model.export', format: 'glb' },
  generateObject: { existing_tool: 'meshy_text_to_3d' },
  meshyRig: { existing_tool: 'meshy_rig' },
  meshyAnimate: { existing_tool: 'meshy_animate' },
  meshyRemesh: { existing_tool: 'meshy_remesh' },
  meshyConvert: { existing_tool: 'meshy_convert' },
  meshyResize: { existing_tool: 'meshy_resize' },
  meshyUvUnwrap: { existing_tool: 'meshy_uv_unwrap' },
  meshyRetexture: { existing_tool: 'meshy_retexture' },
  repairGeometry: { planner_required: true },
  addCube: { viewport_only: true },
  deleteSelected: { viewport_only: true },
  resetScene: { viewport_only: true },
});

const PROJECT_NAMES = Object.freeze({
  design_project_get: 'cad.project.get',
  design_project_validate: 'cad.project.validate',
  design_apply_operation: 'cad.project.apply',
  design_project_save: 'cad.project.save',
  design_project_restore: 'cad.project.restore',
  design_model_build: 'cad.model.build',
  design_model_inspect: 'cad.model.inspect',
  design_model_render: 'cad.model.render',
  design_model_export: 'cad.model.export',
});
const ID = { type: 'string', minLength: 1, maxLength: 100, pattern: '^[A-Za-z0-9_-]+$' };
const JOB_INPUT = {
  type: 'object',
  properties: {
    project_id: ID,
    workspace_id: ID,
    engine: { type: 'string', enum: ['openscad', 'freecad', 'blender'] },
    prompt: { type: 'string', minLength: 3, maxLength: 12000 },
    job_id: ID,
    model_key: { type: 'string', minLength: 1, maxLength: 140 },
  },
  additionalProperties: false,
};
const needsApproval = new Set(['design_apply_operation', 'design_project_save', 'design_project_restore',
  'design_model_build', 'design_model_render', 'design_model_export']);

/**
 * Create actually executable CAD operations bound to a *trusted host*.
 * Ports are existing authorities, not alternative file/database/job stores:
 *  projectTools.execute(name,args,{principal,signal}) -> canonical design_project_* receipt
 *  jobs.submit(args,{principal,signal}) -> existing agentsam_cad_jobs record
 *  jobs.get(args,{principal,signal}) -> owner-scoped job
 *  jobs.execute(args,{principal,signal}) -> authorized runner dispatch
 *
 * The host owns hooks/permission prompts, OAuth, runner routing and revision policy.
 * Do not install the pack at all if no real authorized service exists.
 */
export function createCadOperations({
  projectTools, jobs, production, resolveTrustedContext, authorize, requestApproval,
} = {}) {
  if (!projectTools && !jobs && !production) throw new Error('sam_cad_host_adapter_required');
  if (typeof resolveTrustedContext !== 'function' || typeof authorize !== 'function'
      || typeof requestApproval !== 'function') {
    throw new Error('sam_cad_trusted_authorization_and_approval_required');
  }
  if (projectTools && typeof projectTools.execute !== 'function') {
    throw new Error('sam_cad_project_tool_executor_required');
  }
  if (jobs && ['submit', 'get', 'execute'].some(name => typeof jobs[name] !== 'function')) {
    throw new Error('sam_cad_job_executor_required');
  }

  const scoped = async (action, input, ctx, approve = false) => {
    const principal = await resolveTrustedContext(ctx);
    if (!principal?.accountId || !principal?.actorId || !principal?.tenantId) {
      throw new Error('sam_cad_trusted_principal_required');
    }
    const projectId = input?.project_id ?? input?.project?.id;
    if (!projectId || typeof projectId !== 'string') {
      throw new Error('sam_cad_project_id_required');
    }
    if (await authorize({ principal, action, projectId, jobId: input?.job_id }) !== true) {
      throw new Error('sam_cad_access_denied');
    }
    if (approve && await requestApproval({ principal, action, projectId, input }) !== true) {
      throw new Error('sam_cad_approval_required');
    }
    return { principal, signal: ctx?.signal };
  };

  const project = projectTools ? CAD_PROJECT_TOOLS.map(tool => {
    const id = PROJECT_NAMES[tool.name];
    if (!id) throw new Error('sam_cad_unmapped_project_tool:' + tool.name);
    const write = needsApproval.has(tool.name);
    return defineSamOperation({
      id, version: 1, module: 'cad', action: id.slice(4),
      summary: tool.description, description: tool.description,
      execution: {
        lanes: ['local', 'remote'], model: 'never', network: 'required',
        sideEffects: write ? 'remote_write' : 'none',
      },
      risk: write ? 'write' : 'read_only',
      capabilities: [tool.capability_key, id],
      input_schema: tool.input_schema,
      status: 'stable',
      async handler(input = {}, ctx = {}) {
        const scope = await scoped(tool.name, input, ctx, write);
        return projectTools.execute(tool.name, input, scope);
      },
    });
  }) : [];

  const job = (id, action, summary, schema, handler, write) => defineSamOperation({
    id, version: 1, module: 'cad', action,
    summary, description: summary,
    execution: { lanes: ['local', 'remote'], model: 'never', network: 'required',
      sideEffects: write ? 'remote_write' : 'none' },
    risk: write ? 'write' : 'read_only',
    capabilities: [id],
    input_schema: schema,
    status: 'stable',
    handler: async (input = {}, ctx = {}) => {
      const scope = await scoped(action, input, ctx, write);
      return handler(input, scope);
    },
  });

  const jobOps = !jobs ? [] : [
    job('cad.job.generate', 'job.generate',
      'Submit a typed CAD generation intent to an authorized OpenSCAD, FreeCAD or Blender job runner. Do not ask the user to write scripts.',
      { ...JOB_INPUT, required: ['project_id', 'workspace_id', 'engine', 'prompt'] },
      (input, scope) => jobs.submit(input, scope), true),
    job('cad.job.status', 'job.status',
      'Read the status and real generated artifacts of a project-scoped CAD job.',
      { ...JOB_INPUT, required: ['project_id', 'job_id'] },
      (input, scope) => jobs.get(input, scope), false),
    job('cad.job.execute', 'job.execute',
      'Execute an approved existing script_ready CAD job using the connected CAD runner.',
      { ...JOB_INPUT, required: ['project_id', 'workspace_id', 'job_id'] },
      (input, scope) => jobs.execute(input, scope), true),
  ];
  const productionOps = production ? createCadProductionOperations({
    provider: production.provider, supportedOperationIds: production.supportedOperationIds,
    resolveTrustedContext, authorize, requestApproval,
  }) : [];
  return [...project, ...jobOps, ...productionOps];
}
