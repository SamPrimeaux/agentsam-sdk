/**
 * Resolve a usable secret for a capability — env is last-resort compatibility,
 * not the product UX.
 *
 * Precedence (hosted Web Worker path):
 *   1. explicit override
 *   2. account vault (user_secrets unwrap via credential_ref)
 *   3. permitted environment variable (provider adapter)
 *   4. null
 */

/**
 * @typedef {object} CredentialResolverOptions
 * @property {(query: { provider: string, capability?: string }) => Promise<{ ref: string, last4?: string }|null>} [lookupVaultMeta]
 * @property {(ref: string) => Promise<string|null>} [unwrap]
 * @property {Record<string, string|undefined>} [env]
 * @property {Record<string, string>} [envMap] provider → env var name
 */

const DEFAULT_ENV_MAP = Object.freeze({
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  cursor: 'CURSOR_API_KEY',
  xai: 'XAI_API_KEY',
  cloudflare: 'CLOUDFLARE_API_TOKEN',
  agentsam: 'AGENTSAM_API_KEY',
});

/**
 * @param {CredentialResolverOptions} options
 */
export function createCredentialResolver(options = {}) {
  const envMap = { ...DEFAULT_ENV_MAP, ...(options.envMap || {}) };
  const env = options.env || {};

  return Object.freeze({
    /**
     * @param {{ provider: string, capability?: string, explicit?: string|null }} query
     * @returns {Promise<{ source: 'explicit'|'vault'|'environment', value: string, last4?: string }|null>}
     */
    async resolve(query) {
      const provider = String(query?.provider || '').trim().toLowerCase();
      if (!provider) return null;

      const explicit = String(query?.explicit || '').trim();
      if (explicit) {
        return { source: 'explicit', value: explicit, last4: explicit.slice(-4) };
      }

      if (typeof options.lookupVaultMeta === 'function' && typeof options.unwrap === 'function') {
        const meta = await options.lookupVaultMeta({
          provider,
          capability: query.capability,
        });
        if (meta?.ref) {
          const value = await options.unwrap(meta.ref);
          if (value) {
            return {
              source: 'vault',
              value,
              last4: meta.last4 || value.slice(-4),
            };
          }
        }
      }

      const envName = envMap[provider];
      const fromEnv = envName ? String(env[envName] || '').trim() : '';
      if (fromEnv) {
        return { source: 'environment', value: fromEnv, last4: fromEnv.slice(-4) };
      }

      return null;
    },
  });
}
