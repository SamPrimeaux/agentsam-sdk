import { defineCredentialProvider, CREDENTIAL_KINDS } from '../contracts/credential.js';

/** Provider registry — UI renders fields from this; no hardcoded dropdown lists. */
export const DEFAULT_CREDENTIAL_PROVIDERS = Object.freeze([
  defineCredentialProvider({
    id: 'openai',
    label: 'OpenAI',
    credential: { kind: CREDENTIAL_KINDS.PROVIDER_API_KEY, sensitive: true },
    fields: [{ id: 'api_key', type: 'secret', required: true, label: 'API key' }],
    capabilities: ['models', 'chat', 'embeddings', 'responses'],
    operations: { test: true, rotate: false, revoke: true },
  }),
  defineCredentialProvider({
    id: 'anthropic',
    label: 'Anthropic',
    credential: { kind: CREDENTIAL_KINDS.PROVIDER_API_KEY, sensitive: true },
    fields: [{ id: 'api_key', type: 'secret', required: true, label: 'API key' }],
    capabilities: ['models', 'chat'],
    operations: { test: true, rotate: false, revoke: true },
  }),
  defineCredentialProvider({
    id: 'gemini',
    label: 'Google Gemini',
    credential: { kind: CREDENTIAL_KINDS.PROVIDER_API_KEY, sensitive: true },
    fields: [{ id: 'api_key', type: 'secret', required: true, label: 'API key' }],
    capabilities: ['models', 'chat', 'embeddings'],
    operations: { test: true, rotate: false, revoke: true },
  }),
  defineCredentialProvider({
    id: 'cursor',
    label: 'Cursor',
    credential: { kind: CREDENTIAL_KINDS.PROVIDER_API_KEY, sensitive: true },
    fields: [{ id: 'api_key', type: 'secret', required: true, label: 'API key' }],
    capabilities: ['models', 'chat'],
    operations: { test: true, rotate: false, revoke: true },
  }),
  defineCredentialProvider({
    id: 'xai',
    label: 'xAI',
    credential: { kind: CREDENTIAL_KINDS.PROVIDER_API_KEY, sensitive: true },
    fields: [{ id: 'api_key', type: 'secret', required: true, label: 'API key' }],
    capabilities: ['models', 'chat'],
    operations: { test: true, rotate: false, revoke: true },
  }),
  defineCredentialProvider({
    id: 'cloudflare',
    label: 'Cloudflare',
    credential: { kind: CREDENTIAL_KINDS.OAUTH_CONNECTION, sensitive: true },
    fields: [],
    capabilities: ['workers', 'd1', 'r2', 'ai', 'dns'],
    operations: { test: true, rotate: false, revoke: true },
  }),
  defineCredentialProvider({
    id: 'github',
    label: 'GitHub',
    credential: { kind: CREDENTIAL_KINDS.OAUTH_CONNECTION, sensitive: true },
    fields: [],
    capabilities: ['repos', 'actions'],
    operations: { test: true, rotate: false, revoke: true },
  }),
  defineCredentialProvider({
    id: 'agentsam',
    label: 'AgentSam API key',
    credential: { kind: CREDENTIAL_KINDS.AGENTSAM_API_KEY, sensitive: true },
    fields: [{ id: 'api_key', type: 'secret', required: true, label: 'AGENTSAM_API_KEY (aak_…)' }],
    capabilities: ['sdk', 'control_plane'],
    operations: { test: true, rotate: true, revoke: true },
  }),
]);

/**
 * @param {import('../contracts/credential.js').CredentialProviderDefinition[]} [extra]
 */
export function createProviderRegistry(extra = []) {
  const map = new Map();
  for (const p of [...DEFAULT_CREDENTIAL_PROVIDERS, ...extra]) {
    map.set(p.id, p);
  }
  return Object.freeze({
    get(id) {
      return map.get(String(id || '')) || null;
    },
    list() {
      return [...map.values()];
    },
    listByKind(kind) {
      return [...map.values()].filter((p) => p.credential.kind === kind);
    },
  });
}
