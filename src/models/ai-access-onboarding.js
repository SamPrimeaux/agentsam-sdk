/**
 * Onboarding guidance when a user has no usable AI path yet.
 *
 * Paths (any one unlocks AgentSam model options):
 *   1. Local Ollama + at least one model
 *   2. Provider API key (OpenAI / Anthropic / Gemini / …) → their allotted models
 *   3. Signed-in Local Studio identity + Cloudflare OAuth (Workers AI / account tools)
 */

export const LOCAL_STUDIO_ORIGIN = 'https://agentsam.inneranimalmedia.com';

/** Identity login (Sign in with Cloudflare) — PKCE public client. */
export const CF_OAUTH_LOGIN_START = `${LOCAL_STUDIO_ORIGIN}/api/oauth/cloudflare/start?next=/agentsam`;

/** Resource connector (MCP / Workers / D1) — same CF OAuth client, different callback. */
export const CF_OAUTH_CONNECT_START = `${LOCAL_STUDIO_ORIGIN}/api/connections/cloudflare/start`;

/** Login portal with explicit next (desktop / CLI). */
export const LOCAL_STUDIO_LOGIN = `${LOCAL_STUDIO_ORIGIN}/auth/login?next=/agentsam`;

/**
 * Redirect URIs that must be registered on the Cloudflare OAuth client
 * "AgentSam Local Studio" (PKCE, Token Authentication Method = None).
 */
export const CF_OAUTH_REQUIRED_REDIRECTS = Object.freeze([
  `${LOCAL_STUDIO_ORIGIN}/api/oauth/cloudflare/callback`,
  `${LOCAL_STUDIO_ORIGIN}/api/connections/cloudflare/callback`,
  'http://localhost:3000/api/connections/cloudflare/callback',
  'http://localhost:3000/api/oauth/cloudflare/callback',
]);

/**
 * @param {{ inventory?: object, ollama?: object, providers?: object[] }} discovered
 *   Shape compatible with discoverIngestModelOptions() / collectModelsStatus().
 */
export function assessAiAccess(discovered = {}) {
  const providers = discovered.inventory?.providers
    || discovered.providers
    || [];
  const configuredProviders = providers.filter((p) => p?.configured === true);
  const ollamaOnline = Boolean(discovered.ollama?.online || discovered.inventory?.local?.online);
  const ollamaModels = discovered.ollama?.models || discovered.inventory?.local?.models || [];
  const hasOllamaModels = ollamaOnline && Array.isArray(ollamaModels) && ollamaModels.length > 0;
  const hasProviderKeys = configuredProviders.length > 0;
  const embedOptions = Array.isArray(discovered.options)
    ? discovered.options.filter((o) => o.value && o.value !== 'none')
    : [];

  const ready = hasOllamaModels || hasProviderKeys || embedOptions.length > 0;

  return {
    ready,
    hasOllamaModels,
    hasProviderKeys,
    configuredProviders: configuredProviders.map((p) => p.id),
    ollamaOnline,
    ollamaModelCount: hasOllamaModels ? ollamaModels.length : 0,
    embedOptionCount: embedOptions.length,
  };
}

/**
 * Human-readable onboarding block for CLI notes / stderr.
 * @param {ReturnType<typeof assessAiAccess>} access
 * @param {{ wantCloudAi?: boolean }} [opts]
 */
export function formatAiAccessOnboarding(access, opts = {}) {
  const lines = [];
  if (access.ready) {
    lines.push('AI access: ready');
    if (access.hasProviderKeys) {
      lines.push(`  providers  ${access.configuredProviders.join(', ')}`);
    }
    if (access.hasOllamaModels) {
      lines.push(`  ollama     online · ${access.ollamaModelCount} model(s)`);
    }
    if (access.embedOptionCount) {
      lines.push(`  embed menu ${access.embedOptionCount} option(s)`);
    }
    return lines.join('\n');
  }

  lines.push('AI access: not configured yet');
  lines.push('');
  lines.push('Pick ONE path to unlock AgentSam model options:');
  lines.push('');
  lines.push('  1) Local models (Ollama) — free, offline');
  lines.push('       https://ollama.com/download');
  lines.push('       ollama pull mxbai-embed-large');
  lines.push('       ollama pull qwen2.5-coder');
  lines.push('       agentsam ollama status');
  lines.push('');
  lines.push('  2) Provider API key — use models your key is allotted');
  lines.push('       agentsam providers');
  lines.push('       (OpenAI · Anthropic · Gemini · Cursor · xAI · Cloudflare token)');
  lines.push('');
  lines.push('  3) Local Studio identity + Cloudflare OAuth');
  lines.push('       (Workers AI / account tools / MCP connector)');
  lines.push(`       Login:  ${LOCAL_STUDIO_LOGIN}`);
  lines.push(`       CF sign-in: ${CF_OAUTH_LOGIN_START}`);
  lines.push(`       CF connect: ${CF_OAUTH_CONNECT_START}`);
  if (opts.wantCloudAi) {
    lines.push('');
    lines.push('  Cloudflare OAuth client must allow these redirect URIs:');
    for (const uri of CF_OAUTH_REQUIRED_REDIRECTS) {
      lines.push(`       • ${uri}`);
    }
  }
  lines.push('');
  lines.push('AST/text-only indexing still works with embedding: none ($0).');
  return lines.join('\n');
}
