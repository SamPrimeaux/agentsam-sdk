function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function uniquePhysicalQueueNames(topology) {
  return [...new Set(Object.values(topology?.routes || {}).filter(Boolean))];
}

export class CloudflareQueueBindingAdapter {
  constructor({ bindings = {} } = {}) {
    this.bindings = bindings;
  }

  resolve(queue) {
    const binding = this.bindings[queue] ?? this.bindings.default ?? null;
    if (!binding || typeof binding.send !== 'function') {
      throw new Error(`cloudflare_queue_binding_missing:${queue}`);
    }
    return binding;
  }

  async publish(queue, job, options = {}) {
    await this.resolve(queue).send(job, options.send_options);
    return { provider: 'cloudflare-binding', queue, accepted: 1 };
  }

  async publishBatch(queue, jobs) {
    const binding = this.resolve(queue);
    if (typeof binding.sendBatch === 'function') {
      await binding.sendBatch(jobs.map((body) => ({ body })));
    } else {
      await Promise.all(jobs.map((job) => binding.send(job)));
    }
    return { provider: 'cloudflare-binding', queue, accepted: jobs.length };
  }
}

export class CloudflareQueueApiAdapter {
  constructor({
    cloudflareAccountId,
    apiToken,
    fetchImpl = fetch,
    apiBase = 'https://api.cloudflare.com/client/v4',
  } = {}) {
    if (!cloudflareAccountId) throw new TypeError('cloudflareAccountId is required');
    if (!apiToken) throw new TypeError('apiToken is required');
    this.cloudflareAccountId = cloudflareAccountId;
    this.apiToken = apiToken;
    this.fetchImpl = fetchImpl;
    this.apiBase = trimSlash(apiBase);
  }

  async request(path, init = {}) {
    const response = await this.fetchImpl(`${this.apiBase}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.apiToken}`,
        'content-type': 'application/json',
        ...(init.headers || {}),
      },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success === false) {
      const error = new Error(body?.errors?.[0]?.message || `cloudflare_http_${response.status}`);
      error.code = body?.errors?.[0]?.code ? String(body.errors[0].code) : `cloudflare_http_${response.status}`;
      error.status = response.status;
      error.response = body;
      throw error;
    }
    return body?.result ?? body;
  }

  async listQueues() {
    const path = `/accounts/${encodeURIComponent(this.cloudflareAccountId)}/queues`;
    const result = await this.request(path, { method: 'GET' });
    return Array.isArray(result) ? result : [];
  }

  async createQueue(queueName) {
    const path = `/accounts/${encodeURIComponent(this.cloudflareAccountId)}/queues`;
    return this.request(path, {
      method: 'POST',
      body: JSON.stringify({ queue_name: queueName }),
    });
  }

  async attachWorkerConsumer(queueId, {
    script_name,
    batch_size = 10,
    max_wait_time_ms = 5_000,
    max_retries = 3,
    retry_delay = 5,
    max_concurrency,
  } = {}) {
    if (!script_name) throw new TypeError('script_name is required');
    const settings = {
      batch_size,
      max_wait_time_ms,
      max_retries,
      retry_delay,
    };
    if (Number.isInteger(max_concurrency) && max_concurrency > 0) {
      settings.max_concurrency = max_concurrency;
    }

    const path = `/accounts/${encodeURIComponent(this.cloudflareAccountId)}/queues/${encodeURIComponent(queueId)}/consumers`;
    return this.request(path, {
      method: 'POST',
      body: JSON.stringify({
        type: 'worker',
        script_name,
        settings,
      }),
    });
  }

  async ensureTopology(topology, options = {}) {
    const existing = await this.listQueues();
    const byName = new Map(existing.map((queue) => [queue.queue_name ?? queue.name, queue]));
    const created = [];
    const present = [];

    for (const queueName of uniquePhysicalQueueNames(topology)) {
      let queue = byName.get(queueName);
      if (!queue) {
        queue = await this.createQueue(queueName);
        created.push(queueName);
        byName.set(queueName, queue);
      } else {
        present.push(queueName);
      }

      const consumer = options.consumers?.[queueName];
      if (consumer?.script_name) {
        const queueId = queue.queue_id ?? queue.id;
        if (!queueId) throw new Error(`cloudflare_queue_id_missing:${queueName}`);
        await this.attachWorkerConsumer(queueId, consumer);
      }
    }

    return {
      provider: 'cloudflare-api',
      created,
      existing: present,
      queues: [...byName.values()],
    };
  }

  async publish() {
    throw new Error('cloudflare_api_adapter_publish_not_supported_use_queue_binding_or_http_producer');
  }
}
