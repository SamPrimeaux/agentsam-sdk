import { createOpenAIResponsesAdapter } from './openai-responses.js';
import { createAnthropicMessagesAdapter } from './anthropic-messages.js';
import { createGeminiGenerateContentAdapter } from './gemini-generate-content.js';
import { createOllamaChatAdapter } from './ollama-chat.js';

export function createProviderAdapter(options = {}) {
  const record = options.modelRecord;
  if (!record?.provider) throw new TypeError('modelRecord.provider is required');
  const provider = String(record.provider).toLowerCase();

  if (provider === 'openai') {
    return createOpenAIResponsesAdapter({
      apiKey: options.credential?.value,
      modelRecord: record,
      fetchImpl: options.fetchImpl,
      emit: options.emit,
    });
  }

  if (provider === 'grok' || provider === 'xai') {
    return createOpenAIResponsesAdapter({
      providerId: 'grok',
      baseUrl: 'https://api.x.ai/v1',
      apiKey: options.credential?.value,
      modelRecord: record,
      fetchImpl: options.fetchImpl,
      emit: options.emit,
    });
  }

  if (provider === 'anthropic') {
    return createAnthropicMessagesAdapter({
      apiKey: options.credential?.value,
      modelRecord: record,
      fetchImpl: options.fetchImpl,
      emit: options.emit,
    });
  }

  if (provider === 'gemini') {
    return createGeminiGenerateContentAdapter({
      apiKey: options.credential?.value,
      modelRecord: record,
      fetchImpl: options.fetchImpl,
      emit: options.emit,
    });
  }

  if (provider === 'ollama') {
    return createOllamaChatAdapter({
      endpoint: options.endpoint,
      modelRecord: record,
      fetchImpl: options.fetchImpl,
      emit: options.emit,
    });
  }

  throw new Error(`interactive_provider_adapter_unavailable:${provider}`);
}
