import { defineSamOperation } from '../define.js';
import { renderSamArtifact } from '../artifacts/render.js';

export const artifactRenderOp = defineSamOperation({
  id: 'artifact.render', version: 1, module: 'artifact', action: 'render',
  summary: 'Render evidence-backed findings, plans and wireframe sections to portable HTML and Markdown.',
  purpose: 'Turn already verified or explicitly unverified structured work into a presentable artifact.',
  outcome: 'Return an in-memory HTML/Markdown bundle and SHA-256 manifest; no implicit filesystem writes.',
  description: 'Deterministic SAM artifact composition; caller owns findings, evidence and storage.',
  execution: { lanes: ['local','remote','sandbox'], model:'never', embedding:'never',network:'never',sideEffects:'none',provider_spend:'never' },
  risk: 'read_only', capabilities: ['artifact.render'], artifacts:['sam.artifact.bundle.v1'],
  status:'stable', handler(input={}) {return renderSamArtifact(input);}
});
