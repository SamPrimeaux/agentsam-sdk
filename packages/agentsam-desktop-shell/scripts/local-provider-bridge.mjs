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

const DEVICE_PROVIDERS = Object.freeze(['openai', 'anthropic', 'gemini', 'cursor', 'xai', 'cloudflare']);

function credentialMap(raw = {}) {
  const map = new Map();
  for (const provider of DEVICE_PROVIDERS) {
    const value = typeof raw?.[provider] === 'string' ? raw[provider].trim() : '';
    if (value) map.set(provider, { value, source: 'device_keychain' });
  }
  return map;
}

async function inventoryFor(credentials, fetchImpl) {
  return collectCredentialScopedInventory({
    credentialPlane: 'device_keychain',
    resolveCredential: makeMapCredentialResolver(credentials),
    fetchImpl,
    curateWorkersAi: false,
  });
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
      return { ok: true, ...sanitizeInventoryForClient(inventory) };
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
