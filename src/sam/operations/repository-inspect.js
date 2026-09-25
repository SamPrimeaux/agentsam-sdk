import { defineSamOperation } from '../define.js';
import { repositorySnapshot } from '../../capabilities/index.js';

/**
 * Ambient repository authority — not merely “look at files.”
 */
export const repositoryInspect = defineSamOperation({
  id: 'repository.inspect',
  version: 1,
  module: 'repository',
  action: 'inspect',
  summary: 'Establish bounded, content-addressed repository snapshot authority.',
  purpose:
    'Establish a bounded, content-addressed machine understanding of the current repository/environment and expose a reusable repository snapshot authority.',
  outcome:
    'Return repository identity, revision, merkle/AST evidence, package inventory, systems/layers/facets, and snapshot refs other modules can consume.',
  description:
    'Resolve cwd/Git root, portable repository identity, revision/branch/remotes; collect merkle + intelligence; expose bounded index/facet/file views; optionally reuse or save canonical snapshots.',
  skill: { id: 'agentsam-app-fundamentals', help: true },
  accepts: ['cwd', 'repository', 'directory', 'snapshot_file'],
  phases: [
    'resolve_root',
    'resolve_identity',
    'resolve_revision',
    'snapshot_or_scan',
    'classify',
    'project_views',
    'emit_refs',
  ],
  execution: {
    lanes: ['local', 'remote', 'sandbox'],
    model: 'never',
    embedding: 'never',
    network: 'none',
    sideEffects: 'none',
    provider_spend: 'none',
  },
  risk: 'read_only',
  capabilities: ['repository.snapshot', 'repository.ast', 'repository.merkle'],
  artifacts: ['repository.snapshot', 'evidence.refs'],
  cli: { command: [['inspect']] },
  docs: { section: 'Repository', examples: ['repository-inspect-basic'] },
  input_schema: 'protocol/capabilities/repository-snapshot-input.schema.json',
  output_schema: 'protocol/capabilities/repository-snapshot.schema.json',
  status: 'stable',
  async handler(input = {}, ctx = {}) {
    const root = typeof input === 'string'
      ? input
      : (input.root || input.cwd || ctx.cwd || process.cwd());
    const churnDays = Number.isInteger(input.churnDays) ? input.churnDays : 30;
    const snapshot = await repositorySnapshot({ cwd: root, churnDays });
    return {
      summary: snapshot.intelligence?.summary || null,
      repository: snapshot.repository || null,
      revision: snapshot.repository?.revision_sha || null,
      snapshot_id: snapshot.snapshot_id || null,
      snapshot_hash: snapshot.tree?.merkle_root || null,
      merkle_root: snapshot.tree?.merkle_root || null,
      file_count: Array.isArray(snapshot.tree?.paths) ? snapshot.tree.paths.length : null,
      languages: snapshot.intelligence?.languages || null,
      packages: snapshot.packages || null,
      systems: snapshot.intelligence?.top_level || null,
      facets: snapshot.intelligence || null,
      evidence_refs: {
        snapshot_id: snapshot.snapshot_id || null,
        merkle_root: snapshot.tree?.merkle_root || null,
        metadata_root: snapshot.tree?.metadata_root || null,
      },
      snapshot,
    };
  },
});
