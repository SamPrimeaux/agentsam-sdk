/**
 * Embedding / vector policy contracts (shared with codebaseindex).
 *
 * RULES (authoritative):
 * 1. No hardcoded default provider.
 * 2. No preferred provider in SDK core.
 * 3. No silent fallback between providers or models.
 * 4. `none` is always valid where the operation permits it.
 * 5. Availability from live discovery only.
 * 6. Explicit user selection wins.
 * 7. Saved profile reuse only when fingerprint-compatible.
 * 8. Profile mismatch fails closed.
 * 9. Cost/locality are metadata, not routing authority.
 * 10. Ollama lanes are experimental/local proof — never product default.
 *
 * AGENTSAM_WAI (Workers AI binding) is AgentSam Intelligence baseline ONLY:
 * setup explanations, scope suggestions, tooltips, capability help, error
 * interpretation. NEVER automatic for embeddings, long agent jobs, or provider
 * substitution.
 *
 * Guidance resolution order:
 *   1. User-selected guidance model
 *   2. User configured preference
 *   3. AGENTSAM_WAI
 *   4. Deterministic machine explanation only
 *
 * Machine intelligence always wins over advisory Intelligence.
 */

/**
 * @typedef {object} EmbeddingProfile
 * @property {'agentsam.embedding-profile.v1'} schema
 * @property {string} id
 * @property {string} provider
 * @property {string|null} model
 * @property {number} dimensions
 * @property {string} revision
 * @property {Record<string, unknown>} [parameters]
 * @property {string} fingerprint  sha256 of canonical profile fields
 * @property {boolean} [experimental]
 * @property {'local'|'remote'|'none'} [locality]
 */

/**
 * @typedef {'safe'|'reindex'|'reembed'|'migrate'|'destructive'|'unsupported'} ChangeImpact
 */

export const EMBEDDING_PROVIDER_POLICY = Object.freeze({
  noHardcodedDefault: true,
  noSilentFallback: true,
  noneAlwaysAllowed: true,
  ollamaIsExperimentalOnly: true,
  agentsamWaiForGuidanceOnly: true,
});

export {};
