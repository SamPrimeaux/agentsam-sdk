function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function uniquePhysicalQueueNames(topology) {
  return [...new Set(Object.values(topology?.routes || {}).filter(Boolean))];
}

const MAX_CLOUDFLARE_DELAY_SECONDS = 86_400;

export function delaySecondsForAvailableAt(availableAt, now = Math.floor(Date.now() / 1000)) {
  if (availableAt == null) return 0;
  const delay = Math.max(0, Math.ceil(Number(availableAt) - Number(now)));
  if (delay > MAX_CLOUDFLARE_DELAY_SECONDS) {
    const error = new RangeError('cloudflare_queue_delay_exceeds_24h');
    error.code = 'delay_exceeds_provider_limit';
    throw error;
  }
  return delay;
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
    const sendOptions = { ...(options.send_options || {}) };
    const delaySeconds = delaySecondsForAvailableAt(job.available_at, options.now);
    if (delaySeconds > 0) sendOptions.delaySeconds = delaySeconds;
    await this.resolve(queue).send(job, Object.keys(sendOptions).length ? sendOptions : undefined);
    return { provider: 'cloudflare-binding', queue, accepted: 1, delay_seconds: delaySeconds };
  }

  async publishBatch(queue, jobs, options = {}) {
    const binding = this.resolve(queue);
    if (typeof binding.sendBatch === 'function') {
      await binding.sendBatch(jobs.map((body) => {
        const delaySeconds = delaySecondsForAvailableAt(body.available_at, options.now);
        return delaySeconds > 0 ? { body, delaySeconds } : { body };
      }));
    } else {
      await Promise.all(jobs.map((job) => {
        const delaySeconds = delaySecondsForAvailableAt(job.available_at, options.now);
        return binding.send(job, delaySeconds > 0 ? { delaySeconds } : undefined);
      }));
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
    dead_letter_queue = null,
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
        ...(dead_letter_queue ? { dead_letter_queue } : {}),
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
        const physical = Object.values(topology.physical || {}).find((entry) => entry?.name === queueName);
        await this.attachWorkerConsumer(queueId, {
          ...consumer,
          dead_letter_queue: consumer.dead_letter_queue || physical?.dead_letter || null,
        });
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
