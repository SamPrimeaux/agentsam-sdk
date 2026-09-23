const DEFAULT_KIND_ROUTES = Object.freeze({
  'deploy.': { logical_queue: 'deployments', executor: 'workflow' },
  'infra.': { logical_queue: 'deployments', executor: 'workflow' },
  'cad.': { logical_queue: 'cad', executor: 'queue' },
  'code.index': { logical_queue: 'indexing', executor: 'queue' },
  'repository.index': { logical_queue: 'indexing', executor: 'queue' },
  'cms.': { logical_queue: 'cms', executor: 'queue' },
  'commerce.': { logical_queue: 'cms', executor: 'queue' },
  'webhook.': { logical_queue: 'webhooks', executor: 'queue' },
});

function firstKindMatch(kind, routes) {
  for (const [prefix, route] of Object.entries(routes)) {
    if (kind === prefix || kind.startsWith(prefix)) return route;
  }
  return null;
}

export function routeWork(task = {}, policy = {}) {
  const kind = String(task.kind || '').trim();
  if (!kind) throw new TypeError('task.kind is required');

  if (task.interactive === true || task.requires_immediate_response === true) {
    return {
      mode: 'interactive',
      logical_queue: 'interactive',
      executor: 'inline',
      reason: 'interactive_requirement',
    };
  }

  const aiCalls = Number(task.estimated_ai_calls || 0);
  const independent = task.independent_items === true || Number(task.item_count || 0) > 1;
  const latency = task.latency ?? 'normal';
  const batchThreshold = Number(policy.batch_ai_min_calls ?? 50);

  if (
    task.ai_provider &&
    aiCalls >= batchThreshold &&
    independent &&
    ['deferred', 'background', 'hours'].includes(latency)
  ) {
    const provider = String(task.ai_provider).toLowerCase();
    if (provider === 'openai' || provider === 'google' || provider === 'gemini') {
      return {
        mode: 'batch_ai',
        logical_queue: 'batch_ai',
        executor: provider === 'openai' ? 'openai_batch' : 'gemini_batch',
        reason: 'bulk_independent_ai_work',
      };
    }
  }

  const configuredRoutes = {
    ...DEFAULT_KIND_ROUTES,
    ...(policy.kind_routes || {}),
  };
  const matched = firstKindMatch(kind, configuredRoutes);
  if (matched) {
    return {
      mode: 'background',
      ...matched,
      reason: 'kind_policy',
    };
  }

  if (task.machine_required === true) {
    return {
      mode: 'background',
      logical_queue: 'jobs',
      executor: 'execos',
      reason: 'machine_requirement',
    };
  }

  return {
    mode: 'background',
    logical_queue: 'jobs',
    executor: 'queue',
    reason: 'default_durable_work',
  };
}

export function shouldRequireProvisionApproval(action, policy = {}) {
  const normalized = String(action || '');
  if (policy.allow_infrastructure_mutation === true) return false;
  return ['provision', 'configure', 'delete'].includes(normalized);
}
