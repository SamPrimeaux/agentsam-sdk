/** Cloudflare Pages — /accounts/{id}/pages/projects/... */
import { receipt } from '../api-client.js';

const CAP = 'cloudflare.pages';

export async function pagesStatus(client) {
  client.requireAccount('pages.status');
  try {
    const res = await client.request('GET', client.accountPath('/pages/projects'), {
      capabilityId: CAP,
      operation: 'pages.list',
      query: { per_page: 1 },
    });
    return receipt(CAP, 'status', {
      ok: true,
      availability: 'available',
      authorized: true,
      account_id: client.accountId,
      auth: client.authMeta(),
      project_sample: Array.isArray(res.result) ? res.result.length : null,
    });
  } catch (err) {
    if (err.code === 'cloudflare_permission_denied') {
      return receipt(CAP, 'status', { ok: false, authorized: false, ...err.toJSON() });
    }
    throw err;
  }
}

export async function pagesList(client, query = {}) {
  client.requireAccount('pages.list');
  const res = await client.request('GET', client.accountPath('/pages/projects'), {
    capabilityId: CAP,
    operation: 'pages.list',
    query,
  });
  return receipt(CAP, 'list', {
    ok: true,
    projects: res.result || [],
    result_info: res.result_info,
    auth: client.authMeta(),
  });
}

export async function pagesInspect(client, projectName) {
  client.requireAccount('pages.inspect');
  const res = await client.request('GET', client.accountPath(`/pages/projects/${encodeURIComponent(projectName)}`), {
    capabilityId: CAP,
    operation: 'pages.inspect',
  });
  return receipt(CAP, 'inspect', { ok: true, project: res.result, auth: client.authMeta() });
}

export async function pagesDeployments(client, projectName, query = {}) {
  client.requireAccount('pages.deployments');
  const res = await client.request(
    'GET',
    client.accountPath(`/pages/projects/${encodeURIComponent(projectName)}/deployments`),
    { capabilityId: CAP, operation: 'pages.deployments', query },
  );
  return receipt(CAP, 'deployments', {
    ok: true,
    project: projectName,
    deployments: res.result || [],
    result_info: res.result_info,
  });
}

export async function pagesDeployment(client, projectName, deploymentId) {
  client.requireAccount('pages.deployment');
  const res = await client.request(
    'GET',
    client.accountPath(
      `/pages/projects/${encodeURIComponent(projectName)}/deployments/${encodeURIComponent(deploymentId)}`,
    ),
    { capabilityId: CAP, operation: 'pages.deployment' },
  );
  return receipt(CAP, 'deployment', { ok: true, project: projectName, deployment: res.result });
}

export async function pagesDeploymentLogs(client, projectName, deploymentId) {
  client.requireAccount('pages.logs');
  const res = await client.request(
    'GET',
    client.accountPath(
      `/pages/projects/${encodeURIComponent(projectName)}/deployments/${encodeURIComponent(deploymentId)}/history/logs`,
    ),
    { capabilityId: CAP, operation: 'pages.logs' },
  );
  return receipt(CAP, 'logs', { ok: true, project: projectName, deployment_id: deploymentId, logs: res.result });
}

export async function pagesDomains(client, projectName) {
  client.requireAccount('pages.domains');
  const res = await client.request(
    'GET',
    client.accountPath(`/pages/projects/${encodeURIComponent(projectName)}/domains`),
    { capabilityId: CAP, operation: 'pages.domains' },
  );
  return receipt(CAP, 'domains', { ok: true, project: projectName, domains: res.result || [] });
}

export async function pagesUploadToken(client, projectName) {
  client.requireAccount('pages.upload_token');
  const res = await client.request(
    'GET',
    client.accountPath(`/pages/projects/${encodeURIComponent(projectName)}/upload-token`),
    { capabilityId: CAP, operation: 'pages.upload_token' },
  );
  // JWT is short-lived operational secret — do not echo in human receipts by default
  return receipt(CAP, 'upload_token', {
    ok: true,
    project: projectName,
    has_jwt: Boolean(res.result?.jwt),
    // Only include jwt when caller opts in via client flag later; omit by default
  });
}

export async function pagesPurgeBuildCache(client, projectName) {
  client.requireAccount('pages.purge');
  const res = await client.request(
    'POST',
    client.accountPath(`/pages/projects/${encodeURIComponent(projectName)}/purge_build_cache`),
    { capabilityId: CAP, operation: 'pages.purge_build_cache' },
  );
  return receipt(CAP, 'purge_build_cache', { ok: true, project: projectName, result: res.result });
}

export async function pagesRetryDeployment(client, projectName, deploymentId) {
  client.requireAccount('pages.retry');
  const res = await client.request(
    'POST',
    client.accountPath(
      `/pages/projects/${encodeURIComponent(projectName)}/deployments/${encodeURIComponent(deploymentId)}/retry`,
    ),
    { capabilityId: CAP, operation: 'pages.retry' },
  );
  return receipt(CAP, 'retry', { ok: true, project: projectName, deployment: res.result });
}

export async function pagesRollbackDeployment(client, projectName, deploymentId) {
  client.requireAccount('pages.rollback');
  const res = await client.request(
    'POST',
    client.accountPath(
      `/pages/projects/${encodeURIComponent(projectName)}/deployments/${encodeURIComponent(deploymentId)}/rollback`,
    ),
    { capabilityId: CAP, operation: 'pages.rollback' },
  );
  return receipt(CAP, 'rollback', { ok: true, project: projectName, deployment: res.result });
}
