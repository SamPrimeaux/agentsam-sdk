import {
  grpc,
  KnowledgeServiceClient,
  decodeJob,
  decodeJobEvent,
  decodeRepositoryList,
  encodeGetJobRequest,
  encodeSubmitRequest,
  fromGrpcError,
  knowledgePb,
  metadataForToken,
} from './grpc-codec.js';

function normalizeTimeout(value, fallback) {
  const timeout = value === undefined ? fallback : value;
  if (timeout == null) return null;
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('timeoutMs must be a positive number or null.');
  return timeout;
}

function validateJobId(id) {
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid job id.');
  return id;
}

/** Node/native gRPC client. Keep this separate from the fetch-only Worker-safe client. */
export function createKnowledgeGrpcClient({
  target,
  token,
  timeoutMs = 15000,
  credentials = grpc.credentials.createInsecure(),
  clientOptions,
} = {}) {
  if (typeof target !== 'string' || !target.trim()) throw new Error('A gRPC target is required.');
  if (!token) throw new Error('A service token is required.');
  const client = new KnowledgeServiceClient(target.trim(), credentials, clientOptions);

  const unary = (method, request, options = {}) => new Promise((resolve, reject) => {
    const timeout = normalizeTimeout(options.timeoutMs, timeoutMs);
    const callOptions = timeout == null ? {} : { deadline: new Date(Date.now() + timeout) };
    client[method](request, metadataForToken(token), callOptions, (error, response) => {
      if (error) reject(fromGrpcError(error));
      else resolve(response);
    });
  });

  async function repositories(options = {}) {
    const response = await unary('listRepositories', new knowledgePb.ListRepositoriesRequest(), options);
    return decodeRepositoryList(response);
  }

  async function submit(body, idempotencyKey, options = {}) {
    const response = await unary('submitJob', encodeSubmitRequest(body, idempotencyKey), options);
    return decodeJob(response);
  }

  async function job(id, options = {}) {
    const response = await unary('getJob', encodeGetJobRequest(validateJobId(id)), options);
    return decodeJob(response);
  }

  async function* watch(id, options = {}) {
    validateJobId(id);
    const timeout = normalizeTimeout(options.timeoutMs, null);
    const callOptions = timeout == null ? {} : { deadline: new Date(Date.now() + timeout) };
    const stream = client.watchJob(
      encodeGetJobRequest(id, knowledgePb.WatchJobRequest),
      metadataForToken(token),
      callOptions,
    );
    const queue = [];
    let done = false;
    let failure = null;
    let wake = null;
    const notify = () => { const resolve = wake; wake = null; resolve?.(); };
    const onData = event => { queue.push(decodeJobEvent(event)); notify(); };
    const onEnd = () => { done = true; notify(); };
    const onError = error => {
      if (options.signal?.aborted && error?.code === grpc.status.CANCELLED) {
        done = true;
      } else {
        failure = fromGrpcError(error);
        done = true;
      }
      notify();
    };
    const onAbort = () => stream.cancel();
    stream.on('data', onData);
    stream.once('end', onEnd);
    stream.once('error', onError);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted) onAbort();

    try {
      while (!done || queue.length) {
        if (!queue.length) await new Promise(resolve => { wake = resolve; });
        while (queue.length) yield queue.shift();
        if (failure) throw failure;
      }
      if (failure) throw failure;
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
      stream.off('data', onData);
      if (!done) stream.cancel();
    }
  }

  return Object.freeze({
    repositories,
    submit,
    job,
    watch,
    close() { client.close(); },
  });
}
