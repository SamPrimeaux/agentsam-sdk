import fs from 'node:fs';
import { buildMerkleTree } from '../../packages/agentsam-repository/src/merkle/index.js';
import { gitIgnoredPaths } from '../lib/merkle/git-ignore.js';
import { analyzeExecutionBoundaries } from '../indexing/execution-boundary.js';

export async function scanTrustBoundary(projectRoot = process.cwd(), options = {}) {
  const root = fs.realpathSync(projectRoot);
  const ignored = options.exclude || await gitIgnoredPaths(root);
  const snapshot = options.snapshot || await buildMerkleTree(root, { semantic: true, exclude: ignored });
  if (!snapshot.semantic) throw new Error('Semantic Merkle metadata is required for trust-boundary scanning');
  const analysis = analyzeExecutionBoundaries(snapshot.semantic);
  return {
    ...analysis,
    project_root: root,
    merkle_root: snapshot.rootHash,
    metadata_root: snapshot.semantic.rootHash,
    evidence: {
      authority: 'agentsam-merkle+agentsam-filemeta',
      merkle_root: snapshot.rootHash,
      metadata_root: snapshot.semantic.rootHash,
      policy_hash: snapshot.policyHash || null,
    },
  };
}
