export { repositorySnapshot } from '../capabilities/repository-snapshot.js';
export { buildMerkleTree, diffTrees, readSnapshot, saveSnapshot, validateSnapshot } from '../lib/merkle/index.js';
export { resolveGitContext, tryResolveGitContext, normalizeGitRemote } from '../lib/git-context.js';
export { buildRetrievalPlan, createContextPack } from '../knowledge/index.js';
