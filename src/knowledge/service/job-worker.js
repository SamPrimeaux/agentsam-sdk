import { runIndex, planIndex, retrieve } from '../engine.js';
import { openSqliteStore } from '../stores/sqlite.js';
import { createGeminiEmbedder } from '../providers/gemini.js';
import { inventory } from '../source.js';
import { scopeKey } from '../config.js';
import {
  AgentSamError,
  ERROR_REASON,
  createErrorEnvelope,
  normalizeError,
} from '../../errors/index.js';

// Parsing and vector ranking run in a child process, keeping HTTP acceptance responsive.
process.once('message', async ({ root, config, filename, request, maxFiles }) => {
  let store;
  try {
    if (request.operation !== 'search' && inventory(root, config.scope).length > maxFiles) throw new AgentSamError(createErrorEnvelope({
      reason: ERROR_REASON.INPUT_OUT_OF_RANGE,
      message: `Scope exceeds ${maxFiles} files; choose a smaller include set.`,
      source: { kind: 'user', name: 'knowledge_request' },
      resolution_owner: 'user',
      domain: 'knowledge',
      stage: 'inventory',
      remediation: { action: 'reduce_scope', message: 'Narrow the repository include scope and retry.' },
      resource: { type: 'repository', id: config.repository_id || null },
    }));
    store = await openSqliteStore(filename);
    const embedder = request.operation !== 'plan' && (request.embed || request.semantic) ? createGeminiEmbedder({ apiKey: process.env.GEMINI_API_KEY }) : undefined;
    let result;
    if (request.operation === 'plan') result = (await planIndex({ root, config, store, embed: request.embed })).receipt;
    else if (request.operation === 'index') result = await runIndex({ root, config, store, embedder, embed: request.embed, maxInputs: request.max_inputs, maxCharacters: request.max_characters });
    else {
      const generation = request.generation_id ? await store.getGeneration(scopeKey(config), request.generation_id) : await store.active(scopeKey(config));
      const under = (file, selection) => selection === '.' || file === selection || file.startsWith(selection + '/');
      if (generation?.files.some(file => !config.scope.include.some(p => under(file.path, p)) || config.scope.exclude.some(p => under(file.path, p)))) {
        throw new AgentSamError(createErrorEnvelope({
          reason: ERROR_REASON.PRECONDITION_FAILED,
          message: 'Generation exceeds the requested scope; select a matching scope or reindex.',
          source: { kind: 'user', name: 'knowledge_request' },
          domain: 'knowledge',
          stage: 'search',
          remediation: { action: 'change_configuration', message: 'Select a matching indexed scope or reindex the requested scope.' },
          resource: { type: 'repository', id: config.repository_id || null },
        }));
      }
      result = await retrieve({ store, config, text: request.query, semantic: request.semantic, embedder,
        topK: request.top_k, tokenBudget: request.token_budget, generationId: request.generation_id });
    }
    await store.close(); store = null;
    process.send({ ok: true, result }, () => process.exit(0));
  } catch (error) {
    await store?.close();
    const failure = normalizeError(error, {
      source: { kind: 'agentsam', name: 'agentsam-knowledge', service: 'job_worker' },
      domain: 'knowledge',
      stage: request.embed || request.semantic ? 'embedding' : request.operation || 'execute',
      message: request.embed || request.semantic
        ? 'Embedding job failed; inspect the canonical failure for provider/configuration details.'
        : undefined,
    });
    process.send({ ok: false, failure }, () => process.exit(1));
  }
});
