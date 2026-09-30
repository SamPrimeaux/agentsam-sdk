import fs from 'node:fs';
import path from 'node:path';
import { readCloudflareDeploymentContract } from '../cloudflare/runtime-status.js';

function localIndexPath(root) {
  return path.join(root, '.agentsam', 'knowledge', 'index.sqlite');
}

export function discoverKnowledgeRuntime(root = process.cwd()) {
  const indexPath = localIndexPath(root);
  const localIndex = {
    exists: fs.existsSync(indexPath),
    path: path.relative(root, indexPath),
  };

  let contract = null;
  let contractError = null;
  try {
    contract = readCloudflareDeploymentContract(root);
  } catch (error) {
    contractError = error?.message || String(error);
  }

  const bindings = contract?.bindings || [];
  const ai = bindings.find((row) => row.type === 'ai') || null;
  const vectorize = bindings
    .filter((row) => row.type === 'vectorize')
    .map((row) => ({
      binding: row.name,
      index: row.index_name || null,
      source: row.source || 'wrangler_config',
    }));

  const lanes = [];
  if (localIndex.exists) {
    lanes.push({
      id: 'local-index',
      backend: 'local_exact',
      source: 'local_index',
      configured: true,
    });
  }
  for (const row of vectorize) {
    lanes.push({
      id: 'cloudflare-vectorize:' + row.binding,
      backend: 'cloudflare_vectorize',
      binding: row.binding,
      index: row.index,
      source: row.source,
      configured: Boolean(row.binding && row.index),
    });
  }

  return {
    local_index: localIndex,
    cloudflare: {
      configured: Boolean(contract?.configured),
      worker_name: contract?.worker_name || null,
      config: contract?.config || null,
      ai_binding: ai?.name || null,
      vectorize,
      error: contractError,
    },
    lanes,
  };
}
