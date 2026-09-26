/** Cloudflare Workflows — real API: /accounts/{id}/workflows/... */
import { receipt } from '../api-client.js';

const CAP = 'cloudflare.workflows';

export async function workflowsStatus(client) {
  client.requireAccount('workflows.status');
  try {
    const res = await client.request('GET', client.accountPath('/workflows'), {
      capabilityId: CAP,
      operation: 'workflows.list',
      query: { per_page: 1 },
    });
    return receipt(CAP, 'status', {
      ok: true,
      availability: 'available',
      authorized: true,
      account_id: client.accountId,
      workflow_count_sample: Array.isArray(res.result) ? res.result.length : null,
      result_info: res.result_info,
    });
  } catch (err) {
    if (err.code === 'cloudflare_permission_denied') {
      return receipt(CAP, 'status', {
        ok: false,
        availability: 'available',
        authorized: false,
        ...err.toJSON(),
      });
    }
    throw err;
  }
}

export async function workflowsList(client, { page, per_page } = {}) {
  client.requireAccount('workflows.list');
  const res = await client.request('GET', client.accountPath('/workflows'), {
    capabilityId: CAP,
    operation: 'workflows.list',
    query: { page, per_page },
  });
  return receipt(CAP, 'list', {
    ok: true,
    workflows: res.result || [],
    result_info: res.result_info,
  });
}

export async function workflowsInspect(client, name) {
  client.requireAccount('workflows.inspect');
  const res = await client.request('GET', client.accountPath(`/workflows/${encodeURIComponent(name)}`), {
    capabilityId: CAP,
    operation: 'workflows.inspect',
  });
  return receipt(CAP, 'inspect', { ok: true, workflow: res.result });
}

export async function workflowsVersions(client, name) {
  client.requireAccount('workflows.versions');
  const res = await client.request('GET', client.accountPath(`/workflows/${encodeURIComponent(name)}/versions`), {
    capabilityId: CAP,
    operation: 'workflows.versions',
  });
  return receipt(CAP, 'versions', { ok: true, workflow: name, versions: res.result || [] });
}

export async function workflowsGraph(client, name, versionId) {
  client.requireAccount('workflows.graph');
  if (!versionId) throw Object.assign(new Error('version_id required'), { code: 'version_id_required' });
  const res = await client.request(
    'GET',
    client.accountPath(`/workflows/${encodeURIComponent(name)}/versions/${encodeURIComponent(versionId)}/graph`),
    { capabilityId: CAP, operation: 'workflows.graph' },
  );
  return receipt(CAP, 'graph', { ok: true, workflow: name, version_id: versionId, graph: res.result });
}

export async function workflowsRun(client, name, { instanceId, params } = {}) {
  client.requireAccount('workflows.run');
  const body = {};
  if (instanceId) body.id = instanceId;
  if (params != null) body.params = params;
  const res = await client.request('POST', client.accountPath(`/workflows/${encodeURIComponent(name)}/instances`), {
    capabilityId: CAP,
    operation: 'workflows.run',
    body: Object.keys(body).length ? body : {},
  });
  return receipt(CAP, 'run', { ok: true, workflow: name, instance: res.result });
}

export async function workflowsInstances(client, name, query = {}) {
  client.requireAccount('workflows.instances');
  const res = await client.request('GET', client.accountPath(`/workflows/${encodeURIComponent(name)}/instances`), {
    capabilityId: CAP,
    operation: 'workflows.instances',
    query,
  });
  return receipt(CAP, 'instances', { ok: true, workflow: name, instances: res.result || [], result_info: res.result_info });
}

export async function workflowsInstance(client, name, instanceId) {
  client.requireAccount('workflows.instance');
  const res = await client.request(
    'GET',
    client.accountPath(`/workflows/${encodeURIComponent(name)}/instances/${encodeURIComponent(instanceId)}`),
    { capabilityId: CAP, operation: 'workflows.instance' },
  );
  return receipt(CAP, 'instance', { ok: true, workflow: name, instance: res.result });
}

export async function workflowsStep(client, name, instanceId) {
  client.requireAccount('workflows.step');
  const res = await client.request(
    'GET',
    client.accountPath(`/workflows/${encodeURIComponent(name)}/instances/${encodeURIComponent(instanceId)}/step`),
    { capabilityId: CAP, operation: 'workflows.step' },
  );
  return receipt(CAP, 'step', { ok: true, workflow: name, instance_id: instanceId, step: res.result });
}

export async function workflowsSetStatus(client, name, instanceId, status) {
  client.requireAccount('workflows.status_edit');
  const res = await client.request(
    'PATCH',
    client.accountPath(`/workflows/${encodeURIComponent(name)}/instances/${encodeURIComponent(instanceId)}/status`),
    { capabilityId: CAP, operation: `workflows.${status}`, body: { status } },
  );
  return receipt(CAP, status, { ok: true, workflow: name, instance_id: instanceId, result: res.result });
}

export async function workflowsEvent(client, name, instanceId, eventType, payload = {}) {
  client.requireAccount('workflows.event');
  const res = await client.request(
    'POST',
    client.accountPath(
      `/workflows/${encodeURIComponent(name)}/instances/${encodeURIComponent(instanceId)}/events/${encodeURIComponent(eventType)}`,
    ),
    { capabilityId: CAP, operation: 'workflows.event', body: payload },
  );
  return receipt(CAP, 'event', {
    ok: true,
    workflow: name,
    instance_id: instanceId,
    event_type: eventType,
    result: res.result,
  });
}

export async function workflowsDelete(client, name) {
  client.requireAccount('workflows.delete');
  const res = await client.request('DELETE', client.accountPath(`/workflows/${encodeURIComponent(name)}`), {
    capabilityId: CAP,
    operation: 'workflows.delete',
  });
  return receipt(CAP, 'delete', { ok: true, workflow: name, result: res.result });
}
