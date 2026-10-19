/**
 * Typed CAD task modes resolve to real registered SAM operations.
 * These are execution intents, not chat styles or prompt prefixes.
 * Principal/permissions/approvals remain authoritative in the installed
 * CAD operation pack, never in a browser-controlled argument.
 */
export const CAD_RUN_MODES = Object.freeze({
  'cad.inspect': { operation: 'cad.project.get', effect: 'read' },
  'cad.create': { operation: 'cad.project.save', effect: 'write' },
  'cad.edit': { operation: 'cad.project.apply', effect: 'write' },
  'cad.export': { operation: 'cad.model.export', effect: 'export' },
  'cad.generate': { operation: 'cad.job.generate', effect: 'write' },
});
const validId = input => typeof input === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(input);
const validRevision = input => Number.isSafeInteger(input) && input >= 0;

function paramsForMode(mode, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('cad_run_invalid_input');
  switch (mode) {
    case 'cad.inspect': {
      if (!validId(input.project_id)) throw new Error('cad_run_project_id_required');
      const args = { project_id: input.project_id };
      if (input.revision !== undefined) {
        if (!validRevision(input.revision) || input.revision < 1) throw new Error('cad_run_invalid_revision');
        args.revision = input.revision;
      }
      return args;
    }
    case 'cad.create': {
      // No synthetic blank CAD documents. The host/model tooling must first
      // produce an actual validated project document with this authoritative API.
      if (!input.project || typeof input.project !== 'object' || Array.isArray(input.project)
        || !validId(input.project.id) || !validRevision(input.expected_revision)) {
        throw new Error('cad_run_project_document_and_revision_required');
      }
      return { project: input.project, expected_revision: input.expected_revision,
        ...(typeof input.message === 'string' ? { message: input.message.slice(0,2000) } : {}) };
    }
    case 'cad.edit': {
      if (!validId(input.project_id) || !validRevision(input.expected_revision)
        || !input.operation || typeof input.operation !== 'object' || Array.isArray(input.operation)
        || typeof input.operation.type !== 'string') {
        throw new Error('cad_run_edit_operation_and_revision_required');
      }
      return { project_id: input.project_id, expected_revision: input.expected_revision,
        operation: input.operation,
        ...(typeof input.message === 'string' ? { message: input.message.slice(0,2000) } : {}) };
    }
    case 'cad.export': {
      if (!validId(input.project_id) || !['glb','stl','obj'].includes(input.format)
        || (input.revision !== undefined && (!validRevision(input.revision) || input.revision < 1))) {
        throw new Error('cad_run_export_project_format_required');
      }
      return { project_id: input.project_id, format: input.format,
        ...(input.revision !== undefined ? { revision: input.revision } : {}) };
    }
    case 'cad.generate': {
      if (!validId(input.project_id) || !validId(input.workspace_id)
        || !['freecad','blender','openscad'].includes(input.engine)
        || typeof input.prompt !== 'string' || input.prompt.trim().length < 3
        || input.prompt.length > 12000) {
        throw new Error('cad_run_generation_scope_engine_prompt_required');
      }
      return { project_id: input.project_id, workspace_id: input.workspace_id,
        engine: input.engine, prompt: input.prompt.trim() };
    }
    default: throw new Error('cad_run_unknown_mode');
  }
}

export async function executeCadRunMode({ mode, input }, { sam, authorizeMode } = {}) {
  const definition = CAD_RUN_MODES[mode];
  if (!definition) throw new Error('cad_run_unknown_mode');
  if (!sam || typeof sam.invoke !== 'function') throw new Error('cad_run_sam_runtime_unavailable');
  // Validate BEFORE authorization to avoid granting permissions for unknown input.
  const args = paramsForMode(mode, input);
  if (typeof authorizeMode !== 'function') throw new Error('cad_run_mode_authorization_required');
  const authorized = await authorizeMode({ mode, operation: definition.operation, effect: definition.effect, input: args });
  if (authorized !== true) throw new Error('cad_run_mode_denied');
  // SAM performs its own principal/project scope checks, tool permissions,
  // provider/runner availability and explicit approval on write/export.
  const result = await sam.invoke(definition.operation, args);
  if (result?.ok === false || result?.status === 'error') {
    throw new Error(result?.error?.message || result?.error || 'cad_run_operation_failed');
  }
  return Object.freeze({ schema: 'agentsam.cad.run.v1', mode, operation: definition.operation, result });
}
