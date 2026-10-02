#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import {
  assertModelAvailableForProvider,
  collectCredentialScopedInventory,
  makeMapCredentialResolver,
  modelChatEligibility,
  sanitizeInventoryForClient,
} from '../../../src/models/inventory-core.js';
import { createProviderAdapter } from '../../../src/providers/factory.js';
import { resolveProviderCredential } from '../../../src/lib/provider-credentials.js';
import { findCliProjectRoot, readCliPreferences, updateCliPreferences } from '../../../src/lib/cli-preferences.js';
import { getModelRecord, mergeModelReference } from '../../../src/models/index.js';

const DEVICE_PROVIDERS = Object.freeze(['openai', 'anthropic', 'gemini', 'cursor', 'xai', 'cloudflare']);

function credentialMap(raw = {}) {
  const map = new Map();
  for (const provider of DEVICE_PROVIDERS) {
    const value = typeof raw?.[provider] === 'string' ? raw[provider].trim() : '';
    if (value) {
      map.set(provider, { value, source: 'device_keychain' });
      continue;
    }

    // The desktop GUI must see the same machine-scoped credentials as `agentsam models`.
    // This resolves the SDK's supported machine sources (runtime env, secure local vault,
    // and ~/.agentsam/env.d) inside the private Node sidecar. Secret values never return
    // to the webview; only the sanitized inventory does.
    const resolved = resolveProviderCredential(provider);
    if (resolved?.configured === true && resolved.value) {
      map.set(provider, {
        value: resolved.value,
        source: resolved.source || 'machine',
        account_id: resolved.account_id || null,
      });
    }
  }
  return map;
}

async function inventoryFor(credentials, fetchImpl) {
  return collectCredentialScopedInventory({
    credentialPlane: 'machine',
    resolveCredential: makeMapCredentialResolver(credentials),
    fetchImpl,
    curateWorkersAi: false,
  });
}

function selectedModelFor(cwd, inventory) {
  const root = findCliProjectRoot(cwd || process.cwd());
  const preferences = readCliPreferences(root);
  const snapshot = mergeModelReference(preferences?.modelSnapshot);
  const configured = snapshot || getModelRecord(preferences?.modelPreference);
  if (!configured) return { root, selection: null };
  const model = (inventory?.availableModels || []).find((row) =>
    row.provider === configured.provider
      && (row.provider_model_id === configured.provider_model_id || row.model_key === configured.model_key),
  );
  return {
    root,
    selection: model ? { provider: model.provider, model_id: model.provider_model_id, model_key: model.model_key || null } : null,
  };
}

function safeFailure(error, provider = null) {
  const status = Number(error?.status || error?.statusCode || 0);
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  if (status === 401 || status === 403 || /unauthoriz|invalid[_ -]?(?:api[_ -]?)?key|credential/i.test(message)) {
    return { ok: false, error: 'provider_credential_rejected', provider };
  }
  if (code === 'selected_model_not_available_for_credential' || message.startsWith('selected_model_not_available_for_credential:')) {
    return { ok: false, error: 'selected_model_not_available', provider };
  }
  if (message.startsWith('interactive_provider_adapter_unavailable:')) {
    return { ok: false, error: 'provider_adapter_unavailable', provider };
  }
  return { ok: false, error: 'local_provider_request_failed', provider };
}

export async function executeLocalProviderBridge(input = {}, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const credentials = credentialMap(input.credentials);
  const operation = String(input.operation || '').trim();

  try {
    if (operation === 'inventory') {
      const inventory = await inventoryFor(credentials, fetchImpl);
      const { selection } = selectedModelFor(input.cwd, inventory);
      return { ok: true, ...sanitizeInventoryForClient(inventory), selection };
    }

    if (operation === 'select_model') {
      const provider = String(input.provider || '').trim().toLowerCase();
      const modelId = String(input.model_id || '').trim();
      if (!DEVICE_PROVIDERS.includes(provider) || !modelId) {
        return { ok: false, error: 'provider_and_model_required', provider: provider || null };
      }
      const inventory = await inventoryFor(credentials, fetchImpl);
      const modelRecord = assertModelAvailableForProvider(inventory, provider, modelId);
      const eligibility = modelChatEligibility(modelRecord);
      if (!eligibility.chat_eligible) {
        return { ok: false, error: eligibility.eligibility_reason || 'provider_adapter_unavailable', provider };
      }
      const root = findCliProjectRoot(input.cwd || process.cwd());
      updateCliPreferences(root, { modelPreference: modelRecord.model_key, modelSnapshot: modelRecord });
      return { ok: true, provider, model_id: modelId, model_key: modelRecord.model_key || null };
    }

    if (operation === 'chat') {
      const provider = String(input.provider || '').trim().toLowerCase();
      const modelId = String(input.model_id || '').trim();
      if (!DEVICE_PROVIDERS.includes(provider) || !modelId) {
        return { ok: false, error: 'provider_and_model_required', provider: provider || null };
      }
      const credential = credentials.get(provider);
      if (!credential?.value) return { ok: false, error: 'provider_credential_unavailable', provider };

      const inventory = await inventoryFor(credentials, fetchImpl);
      const modelRecord = assertModelAvailableForProvider(inventory, provider, modelId);
      const eligibility = modelChatEligibility(modelRecord);
      if (!eligibility.chat_eligible) {
        return { ok: false, error: eligibility.eligibility_reason || 'provider_adapter_unavailable', provider };
      }

      const adapter = createProviderAdapter({ modelRecord, credential, fetchImpl });
      const messages = Array.isArray(input.messages)
        ? input.messages
            .filter((row) => row && ['system', 'user', 'assistant'].includes(String(row.role)) && typeof row.content === 'string')
            .map((row) => ({ role: String(row.role), content: row.content }))
        : [];
      if (!messages.length) return { ok: false, error: 'messages_required', provider };

      const result = await adapter.create({
        model: modelId,
        modelRecord,
        input: messages,
        timeoutMs: 60_000,
      });
      return {
        ok: true,
        provider,
        model_id: modelId,
        text: String(result?.output_text || ''),
      };
    }

    return { ok: false, error: 'local_provider_operation_invalid' };
  } catch (error) {
    return safeFailure(error, String(input.provider || '').trim().toLowerCase() || null);
  }
}

async function readStdin() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

async function main() {
  let response;
  try {
    response = await executeLocalProviderBridge(await readStdin());
  } catch {
    response = { ok: false, error: 'local_provider_request_invalid' };
  }
  process.stdout.write(JSON.stringify(response));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
