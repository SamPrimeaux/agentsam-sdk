/**
 * AgentSamEvidence contract. One source of truth for phases, kinds, content types
 * and error codes; validation, docs and the generated package README all read it.
 * No project, account or host values live here.
 */
export const EVIDENCE_SCHEMA = 'agentsam.evidence.v1';
export const EVIDENCE_FLOW_MAP_SCHEMA = 'agentsam.evidence.flow-map.v1';
export const EVIDENCE_CAPTURE_SCHEMA = 'agentsam.evidence.capture.v1';
export const EVIDENCE_BUILD_PHASE = '04-Build';

export const EVIDENCE_PHASES = Object.freeze([
  Object.freeze({ id: '01-Brief', dated: false, purpose: 'Prompt, ticket, references and the "before" snapshot.' }),
  Object.freeze({ id: '02-Recon', dated: true, purpose: 'Audits, baseline probes and tool versions found before building.' }),
  Object.freeze({ id: '03-Flow', dated: false, purpose: 'The declared flow map: what must exist before anything is captured.' }),
  Object.freeze({ id: '04-Build', dated: true, purpose: 'Captures made while the work happens, one folder per flow.' }),
  Object.freeze({ id: '05-Review', dated: true, purpose: 'Web-ready copies for review; Final/ holds the approved set.' }),
  Object.freeze({ id: '06-Handoff', dated: false, purpose: 'Only what an editor needs: markers and exporter output.' }),
]);

export const EVIDENCE_KINDS = Object.freeze(['still', 'clip', 'trace', 'log', 'diff', 'doc']);

export const EXT_TYPES = Object.freeze({
  json: 'application/json', html: 'text/html; charset=utf-8', md: 'text/markdown', txt: 'text/plain', log: 'text/plain', srt: 'application/x-subrip',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif',
  svg: 'image/svg+xml', webm: 'video/webm', mp4: 'video/mp4', mov: 'video/quicktime', glb: 'model/gltf-binary',
});

export function evidenceError(code, detail) {
  const error = new Error(code);
  error.code = code;
  if (detail !== undefined) error.detail = detail;
  return error;
}

export function renderEvidenceReadme({ runId, subject, project, startedAt }) {
  const phases = EVIDENCE_PHASES.map((p) => `- \`${p.id}\`${p.dated ? ' (dated subfolders)' : ''}: ${p.purpose}`).join('\n');
  return [
    `# ${subject}`,
    '',
    `Run \`${runId}\` for project \`${project.slug}\`, started ${startedAt}.`,
    '',
    'Sorting by name follows the workflow. Folders appear when something is captured in them.',
    '',
    phases,
    '',
    '## Naming',
    '',
    '`Flow-Step-State[variant]-Name.ext`, zero-padded and CamelCase, so sorted order is storyboard order.',
    'A letter after the state number marks a variant (before/after or A/B).',
    '',
    '## Completion',
    '',
    '`evidence.manifest.json` is written last. If it is missing, the run was never sealed.',
    '',
  ].join('\n');
}
