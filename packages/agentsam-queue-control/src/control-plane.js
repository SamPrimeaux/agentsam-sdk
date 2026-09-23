import { createJobEnvelope, assertJobEnvelope } from './contracts.js';
import { buildQueueTopology, resolvePhysicalQueue } from './topology.js';
import { routeWork, shouldRequireProvisionApproval } from './policy.js';
import { JobDispatcher } from './dispatch.js';

export class QueueControl {
  constructor({
    adapter,
    topology = buildQueueTopology(),
    routingPolicy = {},
    approval = null,
    dispatcher = new JobDispatcher(),
  } = {}) {
    if (!adapter) throw new TypeError('adapter is required');
    this.adapter = adapter;
    this.topology = topology;
    this.routingPolicy = routingPolicy;
    this.approval = approval;
    this.dispatcher = dispatcher;
  }

  register(kind, handler) {
    this.dispatcher.register(kind, handler);
    return this;
  }

  plan(task) {
    const route = routeWork(task, this.routingPolicy);
    return {
      ...route,
      physical_queue: route.logical_queue === 'interactive'
        ? null
        : resolvePhysicalQueue(this.topology, route.logical_queue),
    };
  }

  async enqueue(task, input = {}) {
    const plan = this.plan(task);
    const job = createJobEnvelope({
      ...input,
      kind: task.kind,
      payload: input.payload ?? task.payload ?? null,
      account_id: input.account_id ?? task.account_id,
      logical_queue: plan.logical_queue,
      executor: plan.executor,
      priority: input.priority ?? task.priority ?? 'normal',
    });

    if (plan.mode === 'interactive') {
      return { job, plan, published: false };
    }

    assertJobEnvelope(job);
    const physicalQueue = resolvePhysicalQueue(this.topology, plan.logical_queue);
    const receipt = await this.adapter.publish(physicalQueue, job, {
      logical_queue: plan.logical_queue,
    });
    return { job, plan, published: true, publish_receipt: receipt ?? null };
  }

  async enqueueMany(tasks, common = {}) {
    const grouped = new Map();

    for (const task of tasks) {
      const plan = this.plan(task);
      if (plan.mode === 'interactive') {
        throw new Error('enqueueMany does not accept interactive tasks');
      }
      const job = createJobEnvelope({
        ...common,
        account_id: common.account_id ?? task.account_id,
        kind: task.kind,
        payload: task.payload ?? null,
        logical_queue: plan.logical_queue,
        executor: plan.executor,
        priority: task.priority ?? common.priority ?? 'normal',
      });
      const queue = resolvePhysicalQueue(this.topology, plan.logical_queue);
      const bucket = grouped.get(queue) ?? [];
      bucket.push(job);
      grouped.set(queue, bucket);
    }

    const receipts = [];
    for (const [queue, jobs] of grouped) {
      const receipt = this.adapter.publishBatch
        ? await this.adapter.publishBatch(queue, jobs)
        : await Promise.all(jobs.map((job) => this.adapter.publish(queue, job)));
      receipts.push({ queue, count: jobs.length, receipt });
    }
    return receipts;
  }

  async provision(options = {}) {
    if (typeof this.adapter.ensureTopology !== 'function') {
      throw new Error('adapter_does_not_support_provisioning');
    }

    if (shouldRequireProvisionApproval('provision', this.routingPolicy)) {
      if (typeof this.approval !== 'function') {
        const error = new Error('queue_provision_approval_required');
        error.code = 'approval_required';
        throw error;
      }
      const allowed = await this.approval({
        action: 'provision',
        topology: this.topology,
        options,
      });
      if (!allowed) {
        const error = new Error('queue_provision_denied');
        error.code = 'approval_denied';
        throw error;
      }
    }

    return this.adapter.ensureTopology(this.topology, options);
  }

  async consume(messages, context = {}) {
    const results = [];
    for (const message of messages) {
      const job = message?.body ?? message;
      assertJobEnvelope(job);
      try {
        const result = await this.dispatcher.dispatch(job, context);
        if (typeof message?.ack === 'function') message.ack();
        results.push({ job_id: job.id, ok: true, result });
      } catch (error) {
        if (typeof message?.retry === 'function') message.retry();
        results.push({
          job_id: job.id,
          ok: false,
          error: String(error?.message || error),
          code: error?.code ?? null,
        });
      }
    }
    return results;
  }
}
