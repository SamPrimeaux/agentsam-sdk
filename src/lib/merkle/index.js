export { buildMerkleTree } from './tree.js';
export { saveSnapshot, readSnapshot, validateSnapshot } from './snapshot.js';
export { diffTrees } from './diff.js';
export { DEFAULT_IGNORES, normalizePolicy } from './policy.js';
export { policyHash } from './hash.js';
export async function buildSemanticMetadata(...args) {
  const semantic = await import('./semantic.js');
  return semantic.buildSemanticMetadata(...args);
}
export { validateSemanticMetadata, metadataRoot, FILEMETA_FORMAT, FILEMETA_VERSION } from './filemeta.js';
