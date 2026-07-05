import { createTrace, errorResult, okResult } from '../../core/ToolResult.js';
import { cfGet, requireCloudflareEnv } from './client.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function defaultEnv() {
  return globalThis.process?.env || {};
}

function pickResult(data) {
  return asArray(data?.result);
}

async function collect(label, task) {
  try {
    return { label, ok: true, data: await task() };
  } catch (error) {
    return {
      label,
      ok: false,
      data: [],
      warning: {
        label,
        code: error?.code || 'cloudflare_collect_failed',
        message: error?.message || String(error),
        details: error?.details,
      },
    };
  }
}

export async function scanCloudflareInventory(input = {}, context = {}) {
  const trace = createTrace({ runtime: context.runtime || 'local' });

  let cfg;
  try {
    cfg = requireCloudflareEnv(input.env || context.env || defaultEnv());
  } catch (error) {
    return errorResult(
      'cloudflare.inventory',
      error?.code || 'cloudflare_env_missing',
      error?.message || 'Missing Cloudflare environment',
      error?.details,
      trace,
    );
  }

  const accountId = input.accountId || cfg.accountId;
  const token = input.token || cfg.token;

  const results = await Promise.all([
    collect('zones', async () => pickResult(await cfGet(`/zones?account.id=${encodeURIComponent(accountId)}&per_page=100`, token))),
    collect('workers', async () => pickResult(await cfGet(`/accounts/${accountId}/workers/scripts`, token))),
    collect('d1Databases', async () => pickResult(await cfGet(`/accounts/${accountId}/d1/database`, token))),
    collect('r2Buckets', async () => pickResult(await cfGet(`/accounts/${accountId}/r2/buckets`, token))),
    collect('kvNamespaces', async () => pickResult(await cfGet(`/accounts/${accountId}/storage/kv/namespaces`, token))),
    collect('queues', async () => pickResult(await cfGet(`/accounts/${accountId}/queues`, token))),
    collect('pagesProjects', async () => pickResult(await cfGet(`/accounts/${accountId}/pages/projects`, token))),
  ]);

  const data = {
    accountId,
    zones: [],
    workers: [],
    d1Databases: [],
    r2Buckets: [],
    kvNamespaces: [],
    queues: [],
    pagesProjects: [],
    warnings: [],
  };

  for (const row of results) {
    data[row.label] = row.data;
    if (!row.ok) data.warnings.push(row.warning);
  }

  data.summary = {
    zones: data.zones.length,
    workers: data.workers.length,
    d1Databases: data.d1Databases.length,
    r2Buckets: data.r2Buckets.length,
    kvNamespaces: data.kvNamespaces.length,
    queues: data.queues.length,
    pagesProjects: data.pagesProjects.length,
    warnings: data.warnings.length,
  };

  return okResult('cloudflare.inventory', data, trace);
}
