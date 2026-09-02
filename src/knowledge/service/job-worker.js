import { runIndex, planIndex, retrieve } from '../engine.js';
import { openSqliteStore } from '../stores/sqlite.js';
import { createGeminiEmbedder } from '../providers/gemini.js';
import { inventory } from '../source.js';
import { scopeKey } from '../config.js';

// Parsing and vector ranking run in a child process, keeping HTTP acceptance responsive.
process.once('message', async ({ root, config, filename, request, maxFiles }) => {
  let store;
  try {
    if (request.operation !== 'search' && inventory(root, config.scope).length > maxFiles) throw new Error(`Scope exceeds ${maxFiles} files; choose a smaller include set.`);
    store = await openSqliteStore(filename);
    const embedder = request.operation !== 'plan' && (request.embed || request.semantic) ? createGeminiEmbedder({ apiKey: process.env.GEMINI_API_KEY }) : undefined;
    let result;
    if (request.operation === 'plan') result = (await planIndex({ root, config, store, embed: request.embed })).receipt;
    else if (request.operation === 'index') result = await runIndex({ root, config, store, embedder, embed: request.embed, maxInputs: request.max_inputs, maxCharacters: request.max_characters });
    else {
      const generation = request.generation_id ? await store.getGeneration(scopeKey(config), request.generation_id) : await store.active(scopeKey(config));
      const under = (file, selection) => selection === '.' || file === selection || file.startsWith(selection + '/');
      if (generation?.files.some(file => !config.scope.include.some(p => under(file.path, p)) || config.scope.exclude.some(p => under(file.path, p)))) {
        throw new Error('Generation exceeds the requested scope; select a matching scope or reindex.');
      }
      result = await retrieve({ store, config, text: request.query, semantic: request.semantic, embedder,
        topK: request.top_k, tokenBudget: request.token_budget, generationId: request.generation_id });
    }
    await store.close(); store = null;
    process.send({ ok: true, result }, () => process.exit(0));
  } catch (error) {
    await store?.close();
    // Provider error strings may include sensitive request details. Never persist them.
    const message = request.embed || request.semantic ? 'Embedding job failed; check provider configuration, budgets, and availability.' : String(error.message).slice(0, 500);
    process.send({ ok: false, error: message }, () => process.exit(1));
  }
});
