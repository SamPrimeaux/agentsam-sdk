import { randomUUID } from 'node:crypto';
import { validateConfig, fingerprint, scopeKey, cacheNamespace, gitEvidence } from './config.js';
import { PARSER, inventory, readSource, parseSource } from './source.js';
import { createContextPack } from './context-pack.js';

export const embeddingProfileId = profile => fingerprint({ ...profile, input_format: 'agentsam-code-content:1' });
export function validateVector(vector, dimensions) {
  if (!Array.isArray(vector) || vector.length !== dimensions || vector.some(x => typeof x !== 'number' || !Number.isFinite(x)) || !vector.some(x => x !== 0)) throw new Error(`Embedding response must contain ${dimensions} finite values and a nonzero norm.`);
  return vector;
}
function changes(before = [], after = []) {
  const old = new Map(before.map(f => [f.path, f.hash])), now = new Map(after.map(f => [f.path, f.hash]));
  return { added: after.filter(f => !old.has(f.path)).map(f => f.path), changed: after.filter(f => old.has(f.path) && old.get(f.path) !== f.hash).map(f => f.path), removed: before.filter(f => !now.has(f.path)).map(f => f.path) };
}
/** Planning never persists, calls an embedding provider, or changes active state. */
export async function planIndex({ root, config: input, store, embed = false }) {
  const config = validateConfig(input), scope = scopeKey(config), namespace = cacheNamespace(config);
  const previous = await store?.active(scope), profileId = embed ? embeddingProfileId(config.embedding) : null;
  const files = [], chunks = [], symbols = [], edges = [], parseWrites = [], skipped = [];
  const parseProfile = fingerprint([PARSER, config.chunking]);
  let parsedFiles = 0;
  for (const file of inventory(root, config.scope)) {
    const source = readSource(root, file);
    if (!source) { skipped.push(file); continue; }
    const key = `${namespace}:parse:${fingerprint([source.hash, file.split('.').pop(), parseProfile])}`;
    let parsed = await store?.cacheGet(key);
    if (!parsed) { parsed = parseSource(file, source.content, config.chunking.max_chars); parseWrites.push([key, parsed]); parsedFiles++; }
    files.push({ path: file, hash: source.hash, bytes: source.bytes, parser: parsed.parser });
    for (const [ordinal, c] of parsed.chunks.entries()) chunks.push({ ...c, path: file, ordinal, id: fingerprint([file, ordinal, c.content_hash]), embedding_key: embed ? `${namespace}:vector:${profileId}:${c.content_hash}` : null });
    symbols.push(...parsed.symbols.map(s => ({ ...s, path: file })));
    edges.push(...parsed.edges.map(e => ({ ...e, path: file })));
  }
  const missing = new Map();
  if (embed) for (const chunk of chunks) {
    if (!missing.has(chunk.embedding_key) && !(await store?.cacheGet(chunk.embedding_key))) missing.set(chunk.embedding_key, chunk.content);
  }
  const sourceHash = fingerprint(files.map(f => [f.path, f.hash]));
  const configHash = fingerprint([config.scope, config.chunking, PARSER, profileId]);
  const noChange = previous?.source_hash === sourceHash && previous?.config_hash === configHash && !missing.size;
  return { root, config, previous, files, chunks, symbols, edges, parseWrites, missing,
    receipt: { scope: config.scope, files: files.length, chunks: chunks.length, symbols: symbols.length, edges: edges.length,
      parsed_files: parsedFiles, embedding_inputs: missing.size, embedding_characters: [...missing.values()].reduce((n, s) => n + s.length, 0),
      estimated_tokens: Math.ceil([...missing.values()].reduce((n, s) => n + s.length + 24, 0) / 4), token_estimate_method: 'characters / 4; not billable usage',
      profile_id: profileId, skipped, changes: changes(previous?.files, files), no_change: Boolean(noChange), source_hash: sourceHash, config_hash: configHash } };
}

export async function runIndex({ root, config, store, embedder, embed = false, maxInputs = 100, maxCharacters = 200000 }) {
  if (!store) throw new Error('A writable knowledge store is required.');
  if (!Number.isInteger(maxInputs) || maxInputs < 0 || !Number.isInteger(maxCharacters) || maxCharacters < 0) throw new Error('Embedding budgets must be nonnegative integers.');
  const plan = await planIndex({ root, config, store, embed });
  const { receipt } = plan;
  if (receipt.no_change) return { ...receipt, generation_id: plan.previous.id, published: false };
  if (receipt.embedding_inputs > maxInputs || receipt.embedding_characters > maxCharacters) throw new Error(`Embedding budget exceeded: ${receipt.embedding_inputs} unique inputs / ${receipt.embedding_characters} characters. Review index plan before raising limits.`);
  if (embed && plan.missing.size) {
    if (!embedder?.embed) throw new Error('An embedding adapter is required.');
    embedder.validate?.(plan.config.embedding);
  }
  for (const [key, parsed] of plan.parseWrites) await store.cachePut(key, parsed);
  for (const [key, text] of plan.missing) {
    const vector = validateVector(await embedder.embed(text, plan.config.embedding, { kind: 'document' }), plan.config.embedding.dimensions);
    // Completed work remains reusable even if a later request or publication fails.
    await store.cachePut(key, vector);
  }
  // A generation describes one coherent source snapshot. Never publish after a mid-run edit.
  const check = [];
  for (const file of inventory(root, plan.config.scope)) { const source = readSource(root, file); if (source) check.push([file, source.hash]); }
  if (fingerprint(check) !== receipt.source_hash) throw new Error('Repository changed while indexing; cached work retained, active generation unchanged. Rerun.');
  const generation = { id: randomUUID(), scope_key: scopeKey(plan.config), created_at: new Date().toISOString(),
    source_hash: receipt.source_hash, config_hash: receipt.config_hash, config: plan.config, profile_id: receipt.profile_id,
    git: gitEvidence(root), files: plan.files, chunks: plan.chunks, symbols: plan.symbols, edges: plan.edges, receipt };
  await store.publish(generation, plan.previous?.id || null);
  return { ...receipt, generation_id: generation.id, published: true };
}

export async function retrieve({ store, config: input, text, semantic = false, embedder, topK = 8, tokenBudget = 8000, generationId }) {
  const config = validateConfig(input);
  if (typeof text !== 'string' || !text.trim()) throw new Error('A nonempty query is required.');
  if (!Number.isInteger(topK) || topK < 1 || topK > 100 || !Number.isInteger(tokenBudget) || tokenBudget < 256) throw new Error('topK must be 1..100 and tokenBudget at least 256.');
  const generation = generationId ? await store?.getGeneration(scopeKey(config), generationId) : await store?.active(scopeKey(config));
  if (!generation) throw new Error('No generation found for this repository/scope. Run agentsam index run.');
  let queryVector;
  if (semantic) {
    if (generation.profile_id !== embeddingProfileId(config.embedding)) throw new Error('Active generation uses a different embedding profile or AST only. Run index plan --embed and index run --embed.');
    if (!embedder?.embed) throw new Error('An embedding adapter is required for semantic search.');
    queryVector = validateVector(await embedder.embed(text, generation.config.embedding, { kind: 'query' }), generation.config.embedding.dimensions);
  }
  const scores = queryVector && store.rankVectors ? await store.rankVectors([...new Set(generation.chunks.map(c => c.embedding_key))], queryVector) : null;
  const terms = text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) || [], ranked = [];
  for (const chunk of generation.chunks) {
    const haystack = `${chunk.path} ${chunk.symbol || ''} ${chunk.content}`.toLowerCase();
    const lexical = terms.filter(t => haystack.includes(t)).length / Math.max(1, terms.length);
    let score = lexical;
    if (scores) {
      score = scores.get(chunk.embedding_key);
      if (!Number.isFinite(score)) throw new Error('Generation references a missing or incompatible vector.');
    } else if (queryVector) {
      const vector = validateVector(await store.cacheGet(chunk.embedding_key), queryVector.length);
      let dot = 0, aa = 0, bb = 0;
      for (let i = 0; i < vector.length; i++) { dot += vector[i] * queryVector[i]; aa += vector[i] ** 2; bb += queryVector[i] ** 2; }
      score = dot / Math.sqrt(aa * bb);
    }
    if (queryVector || score > 0) ranked.push({ ...chunk, score });
  }
  ranked.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.ordinal - b.ordinal);
  let estimatedTokens = 0;
  const hits = [];
  for (const hit of ranked) {
    const tokens = Math.ceil(hit.content.length / 4);
    if (estimatedTokens + tokens > tokenBudget) continue;
    hits.push({ chunk_id: hit.id, content: hit.content, score: hit.score, lane: /\.[cm]?[jt]sx?$/i.test(hit.path) ? 'code' : 'docs',
      path: hit.path, line_start: hit.start_line, line_end: hit.end_line, commit_sha: generation.git.commit, ref: generation.git.branch,
      stale: Boolean(generationId), reasons: [semantic ? 'cosine' : 'lexical'], source_authority: 'repository-snapshot',
      metadata: { generation_id: generation.id, symbol: hit.symbol, content_hash: hit.content_hash, freshness: 'working tree not checked' } }); estimatedTokens += tokens;
    if (hits.length === topK) break;
  }
  return createContextPack({ queryId: randomUUID(), query: { text, workspace_id: config.workspace_id, top_k: topK, token_budget: tokenBudget }, hits,
    diagnostics: { generation_id: generation.id, source_hash: generation.source_hash, scope: generation.config.scope, mode: semantic ? 'semantic-exact' : 'lexical', freshness: 'snapshot; working tree not checked' } });
}
