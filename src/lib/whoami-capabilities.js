/**
 * Honest whoami capability projection — driven by credentials + live discovery,
 * not hardcoded "sqlite / local_exact / 5 providers" stubs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { collectModelsStatus } from '../commands/models.js';
import { listProviderCredentialStatus } from './provider-credentials.js';
import {
  listCloudflareFeaturePacks,
  scopesForFeaturePacks,
} from '../../packages/connectors/cloudflare/src/index.js';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function detectLocalD1Bindings(cwd = process.cwd()) {
  const names = [];
  for (const file of ['wrangler.toml', 'wrangler.jsonc', 'wrangler.json']) {
    const full = path.join(cwd, file);
    if (!fs.existsSync(full)) continue;
    try {
      const text = fs.readFileSync(full, 'utf8');
      for (const match of text.matchAll(/database_name\s*=\s*["']([^"']+)["']/g)) {
        names.push(match[1]);
      }
      for (const match of text.matchAll(/"database_name"\s*:\s*"([^"]+)"/g)) {
        names.push(match[1]);
      }
    } catch {
      /* ignore */
    }
  }
  return [...new Set(names)];
}

function detectHyperdriveHints(cwd = process.cwd()) {
  const ids = [];
  for (const file of ['wrangler.toml', 'wrangler.jsonc', 'wrangler.json']) {
    const full = path.join(cwd, file);
    if (!fs.existsSync(full)) continue;
    try {
      const text = fs.readFileSync(full, 'utf8');
      if (/hyperdrive/i.test(text)) ids.push('hyperdrive_binding');
      for (const match of text.matchAll(/id\s*=\s*["']([a-f0-9-]{20,})["']/gi)) {
        if (/hyperdrive/i.test(text.slice(Math.max(0, match.index - 80), match.index + 20))) {
          ids.push(match[1]);
        }
      }
    } catch {
      /* ignore */
    }
  }
  return [...new Set(ids)];
}

/**
 * @param {{ env?: NodeJS.ProcessEnv, home?: string, cwd?: string, discoverRemote?: boolean }} [options]
 */
export async function projectWhoamiCapabilities(options = {}) {
  const env = options.env || process.env;
  const cwd = options.cwd || process.cwd();
  const discoverRemote = options.discoverRemote !== false;

  const providerStatus = listProviderCredentialStatus({ env, home: options.home });
  const configuredProviders = providerStatus.filter((row) => row.configured);

  let modelsStatus = null;
  try {
    modelsStatus = await collectModelsStatus({
      env,
      home: options.home,
      discoverRemote,
      includeLocal: true,
    });
  } catch (error) {
    modelsStatus = { error: error?.message || String(error), providers: [], models: [] };
  }

  const modelRows = Array.isArray(modelsStatus?.models) ? modelsStatus.models : [];
  const byProvider = {};
  for (const row of modelRows) {
    const provider = row.provider || 'unknown';
    byProvider[provider] = (byProvider[provider] || 0) + 1;
  }

  const d1Bindings = detectLocalD1Bindings(cwd);
  const hyperdrive = detectHyperdriveHints(cwd);
  const hasCfToken = Boolean(
    clean(env.CLOUDFLARE_API_TOKEN)
    || configuredProviders.some((row) => row.provider === 'cloudflare' && row.configured),
  );
  const hasOpenai = configuredProviders.some((row) => row.provider === 'openai');
  const hasSupabase = Boolean(
    clean(env.SUPABASE_URL) || clean(env.SUPABASE_DB_URL) || clean(env.DATABASE_URL),
  );

  const database = {
    available: true,
    drivers: [
      { id: 'sqlite', mode: 'read_write', source: 'local_project' },
      ...(d1Bindings.length
        ? [{ id: 'd1', mode: hasCfToken ? 'read_write_delete' : 'bound_needs_cf_auth', source: 'wrangler', databases: d1Bindings }]
        : []),
      ...(hyperdrive.length
        ? [{ id: 'hyperdrive', mode: hasCfToken ? 'read_write' : 'bound_needs_cf_auth', source: 'wrangler', bindings: hyperdrive }]
        : []),
      ...(hasSupabase
        ? [{ id: 'supabase_postgres', mode: 'read_write', source: 'env' }]
        : []),
    ],
    next: !hasCfToken && (d1Bindings.length || hyperdrive.length)
      ? 'agentsam cloudflare login --pack data   # authorize D1/Hyperdrive/Vectorize'
      : hasSupabase
        ? null
        : 'Optional: agentsam cloudflare login --pack data',
  };

  const vectors = {
    available: true,
    drivers: [
      { id: 'local_exact', mode: 'read_write', source: 'sdk' },
      ...(hasCfToken
        ? [{ id: 'cloudflare_vectorize', mode: 'read_write', source: 'cloudflare', authorize: 'agentsam cloudflare login --pack data' }]
        : [{ id: 'cloudflare_vectorize', mode: 'needs_authorization', source: 'cloudflare', authorize: 'agentsam cloudflare login --pack data' }]),
    ],
  };

  const models = {
    available: configuredProviders.length > 0 || modelRows.length > 0,
    configuredProviders: configuredProviders.map((row) => row.provider),
    discovered_model_counts: byProvider,
    discovered_total: modelRows.length,
    source: 'provider_api_when_key_present',
    next: configuredProviders.length
      ? 'agentsam models   # refresh live inventory from your stored provider keys'
      : 'agentsam providers   # store OPENAI_API_KEY / etc, then agentsam models',
    note: 'Allowed models = whatever each connected provider key returns (not a static SDK list).',
  };

  const cloudflare = {
    available: hasCfToken,
    packs: listCloudflareFeaturePacks().map((pack) => ({
      id: pack.id,
      label: pack.label,
      description: pack.description,
      capability_count: pack.capabilities.length,
    })),
    agentsam_pack_scopes: scopesForFeaturePacks(['agentsam']).length,
    next: hasCfToken
      ? 'agentsam cloudflare permissions --json'
      : 'agentsam cloudflare login --pack agentsam',
  };

  const tools = {
    agentsam_tools: {
      hyperdrive: hyperdrive.length > 0 || hasCfToken,
      supabase: hasSupabase,
      d1: d1Bindings.length > 0,
      next: 'Enable via CF pack data + provider vault — then agentsam tools / MCP',
    },
  };

  return {
    repository: { available: true },
    database,
    vectors,
    models,
    deploy: { available: hasCfToken || Boolean(clean(env.CLOUDFLARE_ACCOUNT_ID)) },
    cloudflare,
    tools,
    edit: {
      providers: 'agentsam providers',
      models: 'agentsam models',
      cloudflare_packs: 'agentsam cloudflare login --pack <data|compute|ai|agentsam>',
      capabilities: 'agentsam capabilities',
    },
  };
}
