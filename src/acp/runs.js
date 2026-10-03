import { randomUUID } from 'node:crypto';
import { appendAgentRunEvent, createLocalQueueControl } from './dependencies.js';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * Create a portable root AgentSam run and schedule it as an agent.run job.
 *
 * This is a control-plane operation only. It does not call a model. A runtime
 * consumer later claims the queued job and performs execution.
 */
export async function createRootRun(database, {
  runId = null,
  accountId = null,
  conversationId = null,
  objective = '',
  role = 'lead',
  mode = 'agent',
  modelKey = null,
  reasoningEffort = null,
  serviceTier = null,
  runtimeRequirements = {},
  metadata = {},
  priority = 'normal',
  sourceClient = 'agentsam-acp',
  surface = 'control-plane',
} = {}) {
  if (!database || typeof database.prepare !== 'function') {
    throw new TypeError('database with prepare() is required');
  }

  const id = clean(runId) || `arun_${randomUUID()}`;
  const account = clean(accountId) || 'local';
  const now = Math.floor(Date.now() / 1000);
  const resolvedMode = clean(mode) || 'agent';
  const resolvedRole = clean(role) || 'lead';
  const resolvedObjective = clean(objective);
  const requirements = object(runtimeRequirements);
  const meta = object(metadata);

  await database.prepare(`
    INSERT INTO agentsam_agent_run (
      id, account_id, conversation_id, source_client, surface, mode, model_key,
      reasoning_effort, requested_service_tier, selected_by, status,
      created_at_unix, updated_at_unix
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'automatic', 'queued', ?, ?)
  `).bind(
    id,
    account,
    clean(conversationId) || null,
    clean(sourceClient) || 'agentsam-acp',
    clean(surface) || 'control-plane',
    resolvedMode,
    clean(modelKey) || null,
    clean(reasoningEffort) || null,
    clean(serviceTier) || null,
    now,
    now,
  ).run();

  await appendAgentRunEvent(database, {
    runId: id,
    eventType: 'run.created',
    phase: 'boot',
    label: 'Agent run created',
    evidence: {
      objective: resolvedObjective || null,
      role: resolvedRole,
      runtime_requirements: requirements,
    },
    dedupeKey: `root:${id}:created`,
    createdAt: now,
  });

  await appendAgentRunEvent(database, {
    runId: id,
    eventType: 'run.queued',
    phase: 'boot',
    label: 'Agent run queued',
    evidence: { role: resolvedRole },
    dedupeKey: `root:${id}:queued`,
    createdAt: now,
  });

  const queueControl = createLocalQueueControl(database);
  const queued = await queueControl.enqueue(
    {
      kind: 'agent.run',
      account_id: account,
      priority,
      payload: {
        run_id: id,
        parent_run_id: null,
        objective: resolvedObjective || null,
        role: resolvedRole,
        runtime_requirements: requirements,
        metadata: meta,
      },
    },
    {
      id: `job_agent_run_${id}`,
      account_id: account,
      source_run_id: id,
      conversation_id: clean(conversationId) || null,
      idempotency_key: `agent-run:${id}`,
      priority,
      metadata: meta,
    },
  );

  return {
    schema: 'agentsam.run-start.v1',
    run_id: id,
    status: 'queued',
    queue: queued.plan?.physical_queue || null,
    queue_job: queued.job,
    published: queued.published,
  };
}
