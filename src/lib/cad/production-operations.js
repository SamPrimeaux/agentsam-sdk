import { defineSamOperation } from '../../sam/define.js';

/** Contract intentions; only advertise runtime operations backed by an authorized provider. */
export const CAD_PRODUCTION_CAPABILITIES = Object.freeze([
  ['cad.geometry.validate', 'Validate dimensional CAD entities and constraints.', 'read'],
  ['cad.bim.ifc.export', 'Export a semantic IFC building model from an approved revision.', 'write'],
  ['cad.solid.export', 'Export precision BREP solids from approved geometry.', 'write'],
  ['cad.drawing.generate', 'Generate dimensioned vector and PDF engineering drawing sheets.', 'write'],
  ['cad.schedule.generate', 'Generate model-derived schedules, not invented cost figures.', 'write'],
  ['cad.quantity.takeoff', 'Calculate traceable measured material quantities.', 'write'],
  ['cad.document.prepare', 'Prepare coordinated technical documentation and review input.', 'write'],
  ['cad.scene.build', 'Build a BIM-linked source scene with model element identities.', 'write'],
  ['cad.scene.optimize', 'Generate an optimized scene with stable source-element links.', 'write'],
  ['cad.walkthrough.package', 'Package navigable geometry and interactions for an authorized viewer.', 'write'],
  ['cad.presentation.render', 'Render a source-revision-linked architectural image.', 'write'],
  ['cad.video.render', 'Render real encoded video from approved model-derived scenes.', 'write'],
  ['cad.video.project.export', 'Export editable video-production source.', 'write'],
  ['cad.deliverables.package', 'Package verified assets with revision and provenance manifests.', 'write'],
]);

const capIds = new Set(CAD_PRODUCTION_CAPABILITIES.map(x => x[0]));
const ID = { type: 'string', minLength: 1, maxLength: 160 };
const inputSchema = {
  type: 'object',
  required: ['project_id', 'revision', 'output_id'],
  properties: {
    project_id: ID, revision: { type: 'integer', minimum: 1 }, output_id: ID,
    workspace_id: ID,
    parameters: { type: 'object', additionalProperties: true },
  },
  additionalProperties: false,
};

/** An explicit provider port must be installed, authorized and accountable.
 * No operation is registered merely because Blender/FreeCAD/OCCT is installed.
 */
export function createCadProductionOperations({ provider, supportedOperationIds,
  resolveTrustedContext, authorize, requestApproval } = {}) {
  if (!provider || typeof provider.execute !== 'function'
      || !Array.isArray(supportedOperationIds)
      || typeof resolveTrustedContext !== 'function'
      || typeof authorize !== 'function'
      || typeof requestApproval !== 'function')
    throw new Error('cad_production_authorized_provider_required');
  const ids = new Set(supportedOperationIds);
  for (const id of ids) if (!capIds.has(id)) throw new Error('unknown_cad_production_capability:' + id);
  return CAD_PRODUCTION_CAPABILITIES.filter(([id]) => ids.has(id)).map(([id, description, risk]) =>
    defineSamOperation({
      id, version: 1, module: 'cad', action: id.slice(4), summary: description,
      description, status: 'stable',
      execution: { lanes: ['local', 'remote'], model: 'never', network: 'required',
        sideEffects: risk === 'write' ? 'remote_write' : 'none' },
      risk: risk === 'write' ? 'write' : 'read_only',
      capabilities: [id], input_schema: inputSchema,
      handler: async (input = {}, ctx = {}) => {
        const principal = await resolveTrustedContext(ctx);
        if (!principal?.accountId || !principal?.tenantId || !principal?.actorId)
          throw new Error('sam_cad_trusted_principal_required');
        const authorized = await authorize({ principal, operation: id,
          projectId: input.project_id, workspaceId: input.workspace_id, input });
        if (authorized !== true) throw new Error('sam_cad_permission_denied');
        if (risk === 'write' && await requestApproval({
          principal, action: id, projectId: input.project_id, input,
        }) !== true) throw new Error('sam_cad_approval_required');
        const result = await provider.execute(id, input, { principal, signal: ctx?.signal });
        if (!result || result.ok !== true || result.operation !== id)
          throw new Error('cad_production_provider_execution_unverified:' + id);
        if (risk === 'write' && (!result.artifact?.uri || !/^[a-f0-9]{64}$/.test(result.artifact.sha256 ?? '')
          || !result.receiptId || !result.executor?.name || !result.executor?.version))
          throw new Error('cad_production_artifact_receipt_required:' + id);
        return result;
      },
    }));
}
