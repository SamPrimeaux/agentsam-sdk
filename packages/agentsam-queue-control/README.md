# @inneranimalmedia/agentsam-queue-control

Portable queue and execution-control primitives for AgentSam.

The package deliberately separates four concerns:

- **WorkGraph** answers what depends on what.
- **Queue Control** answers when, where, and how a ready work unit executes.
- **Provider adapters** perform the concrete queue or runtime operation.
- **MCP/CLI/HTTP/UI** are exposure surfaces, not execution authority.

## Goals

- Cloudflare-first without Cloudflare lock-in.
- One stable job envelope across CAD, code indexing, CMS, commerce, deployment, webhook, batch-AI, and future worker types.
- Logical queues stay stable while physical topology can start compact and split later.
- Deterministic routing keeps LLMs out of timers, polling loops, retries, and ordinary scheduling.
- Infrastructure creation is approval-gated by default.
- OpenAI/Gemini batch execution is represented as an executor choice, not confused with the queue itself.

## Fast start

```js
import {
  QueueControl,
  MemoryQueueAdapter,
  buildQueueTopology,
} from '@inneranimalmedia/agentsam-queue-control';

const queue = new QueueControl({
  adapter: new MemoryQueueAdapter(),
  topology: buildQueueTopology({
    namespace: 'my-app',
    environment: 'dev',
    mode: 'compact',
  }),
});

queue.register('cad.*', async (job) => {
  return buildCadModel(job.payload);
});

await queue.enqueue({
  account_id: account.id,
  kind: 'cad.generate',
  payload: { project_id: 'project_123' },
});
```

The same application contract can later swap the adapter for Cloudflare Queues without rewriting job definitions.

## Logical vs physical queues

A developer can use stable logical lanes such as:

```text
deployments
cad
indexing
cms
webhooks
batch_ai
```

In `compact` mode those lanes share one physical queue plus a DLQ. In `segmented` mode they can map to separate physical queues. Apps do not need to change when topology changes.

## Cloudflare

Two adapters are intentionally separate:

- `CloudflareQueueBindingAdapter`: runtime publishing through Worker Queue bindings.
- `CloudflareQueueApiAdapter`: control-plane provisioning through Cloudflare's account API.

This avoids mixing application messages with infrastructure mutation credentials.

Provisioning is approval-gated by `QueueControl.provision()` unless the host explicitly sets `routingPolicy.allow_infrastructure_mutation = true`.

## Batch AI

`routeWork()` can classify deferred, independent bulk inference as `openai_batch` or `gemini_batch`. Queue Control records and routes that decision; provider-specific batch clients can execute it behind the same job contract.

## Multi-worker job kinds

Use namespaced kinds instead of one giant worker:

```text
deploy.worker
infra.migrate
cad.generate
cad.render
code.index
repository.index
cms.publish
commerce.order.sync
webhook.process
ai.batch.submit
```

Dispatch supports exact kinds and prefix wildcards such as `cad.*`.

## Relationship to WorkGraph

Queue Control does not replace `@inneranimalmedia/work-graph`. A WorkGraph can release ready nodes; Queue Control then schedules those nodes to an executor. Completion receipts can be projected back into the graph by the host.

## Relationship to AgentSam tools and MCP

The canonical capability/tool contract should sit above transports. A tool may be called inline, queued, from a WorkGraph, from a hook, from CLI, or exposed through MCP. Queue Control only owns execution routing and job lifecycle semantics.
