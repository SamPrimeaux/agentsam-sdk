import { defineSamOperation } from '../define.js';
import { execute, tools } from '../../../packages/agentsam-architectural-intelligence/mcp/server.mjs';

/**
 * Source-scoped local knowledge operations, not physical CAD engine capability.
 * The same schema and pure computation are exposed over stdio MCP and SAM.
 */
const skills={
  'arch.material.lookup':'agentsam-arch-materials',
  'arch.assembly.thickness':'agentsam-arch-assemblies',
  'arch.qa.compare_dimensions':'agentsam-arch-verify',
  'arch.references.list':'agentsam-arch-orchestrate',
  'arch.capabilities.status':'agentsam-arch-orchestrate',
};
export const architecturalKnowledgeOps=tools.map(tool=>defineSamOperation({
  id:tool.name,
  module:'arch',
  action:tool.name.slice('arch.'.length),
  version:1,
  summary:tool.description,
  description:tool.description,
  input_schema:tool.inputSchema,
  skill:skills[tool.name],
  execution:{lanes:['local','remote','sandbox'],model:'never',network:'none',sideEffects:'none'},
  risk:'read_only',
  capabilities:[tool.name],
  docs:{section:'Architectural Knowledge'},
  status:'stable',
  handler:async input=>execute(tool.name,input),
}));
