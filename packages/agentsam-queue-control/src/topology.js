export const DEFAULT_LOGICAL_QUEUES = Object.freeze({
  interactive: { lane: 'interactive', durability: 'best_effort' },
  jobs: { lane: 'general', durability: 'durable' },
  deployments: { lane: 'infra', durability: 'durable' },
  cad: { lane: 'compute', durability: 'durable' },
  indexing: { lane: 'compute', durability: 'durable' },
  cms: { lane: 'business', durability: 'durable' },
  webhooks: { lane: 'events', durability: 'durable' },
  batch_ai: { lane: 'ai', durability: 'durable' },
  dead_letter: { lane: 'failure', durability: 'durable' },
});

export function buildQueueTopology({
  namespace = 'agentsam',
  environment = 'dev',
  mode = 'compact',
  logicalQueues = DEFAULT_LOGICAL_QUEUES,
} = {}) {
  if (!['compact', 'segmented'].includes(mode)) {
    throw new TypeError('mode must be compact or segmented');
  }

  const prefix = [namespace, environment].filter(Boolean).join('-');
  const physical = {};
  const routes = {};

  if (mode === 'compact') {
    physical.jobs = {
      name: `${prefix}-jobs`,
      dead_letter: `${prefix}-dlq`,
    };
    for (const key of Object.keys(logicalQueues)) {
      if (key === 'interactive') continue;
      routes[key] = key === 'dead_letter' ? physical.jobs.dead_letter : physical.jobs.name;
    }
  } else {
    for (const [key, config] of Object.entries(logicalQueues)) {
      if (key === 'interactive') continue;
      const name = key === 'dead_letter'
        ? `${prefix}-dlq`
        : `${prefix}-${config.lane || key}`;
      physical[key] = {
        name,
        dead_letter: key === 'dead_letter' ? null : `${prefix}-dlq`,
      };
      routes[key] = name;
    }
  }

  return {
    schema_version: '1',
    mode,
    namespace,
    environment,
    logical_queues: logicalQueues,
    physical,
    routes,
  };
}

export function resolvePhysicalQueue(topology, logicalQueue) {
  if (!topology?.routes) throw new TypeError('topology.routes is required');
  const value = topology.routes[logicalQueue];
  if (!value) throw new Error(`logical_queue_not_routed:${logicalQueue}`);
  return value;
}
