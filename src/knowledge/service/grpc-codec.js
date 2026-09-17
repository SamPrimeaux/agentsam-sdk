import grpc from '@grpc/grpc-js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const knowledgePb = require('../../rpc/generated/knowledge_pb.js');
const errorsPb = require('../../rpc/generated/errors_pb.js');
const { KnowledgeServiceService, KnowledgeServiceClient } = require('../../rpc/generated/knowledge_grpc_pb.js');
const { Timestamp } = require('google-protobuf/google/protobuf/timestamp_pb.js');

const operationToProto = {
  index: knowledgePb.JobOperation.JOB_OPERATION_INDEX,
  plan: knowledgePb.JobOperation.JOB_OPERATION_PLAN,
  search: knowledgePb.JobOperation.JOB_OPERATION_SEARCH,
};
const operationFromProto = new Map(Object.entries(operationToProto).map(([key, value]) => [value, key]));
const statusToProto = {
  queued: knowledgePb.JobStatus.JOB_STATUS_QUEUED,
  running: knowledgePb.JobStatus.JOB_STATUS_RUNNING,
  completed: knowledgePb.JobStatus.JOB_STATUS_COMPLETED,
  failed: knowledgePb.JobStatus.JOB_STATUS_FAILED,
};
const statusFromProto = new Map(Object.entries(statusToProto).map(([key, value]) => [value, key]));
const errorCodeToProto = {
  INVALID_ARGUMENT: errorsPb.ErrorCode.ERROR_CODE_INVALID_ARGUMENT,
  UNAUTHENTICATED: errorsPb.ErrorCode.ERROR_CODE_UNAUTHENTICATED,
  PERMISSION_DENIED: errorsPb.ErrorCode.ERROR_CODE_PERMISSION_DENIED,
  NOT_FOUND: errorsPb.ErrorCode.ERROR_CODE_NOT_FOUND,
  CONFLICT: errorsPb.ErrorCode.ERROR_CODE_CONFLICT,
  RESOURCE_EXHAUSTED: errorsPb.ErrorCode.ERROR_CODE_RESOURCE_EXHAUSTED,
  UNAVAILABLE: errorsPb.ErrorCode.ERROR_CODE_UNAVAILABLE,
  DEADLINE_EXCEEDED: errorsPb.ErrorCode.ERROR_CODE_DEADLINE_EXCEEDED,
  CANCELLED: errorsPb.ErrorCode.ERROR_CODE_CANCELLED,
  INTERNAL: errorsPb.ErrorCode.ERROR_CODE_INTERNAL,
  JOB_FAILED: errorsPb.ErrorCode.ERROR_CODE_JOB_FAILED,
};
const errorCodeNames = new Map(Object.entries(errorsPb.ErrorCode).map(([key, value]) => [value, key.replace(/^ERROR_CODE_/, '')]));

const httpToGrpc = new Map([
  [400, grpc.status.INVALID_ARGUMENT], [401, grpc.status.UNAUTHENTICATED], [403, grpc.status.PERMISSION_DENIED],
  [404, grpc.status.NOT_FOUND], [409, grpc.status.ALREADY_EXISTS], [413, grpc.status.RESOURCE_EXHAUSTED],
  [415, grpc.status.INVALID_ARGUMENT], [429, grpc.status.RESOURCE_EXHAUSTED], [503, grpc.status.UNAVAILABLE],
]);
const grpcToHttp = new Map([
  [grpc.status.CANCELLED, 499], [grpc.status.INVALID_ARGUMENT, 400], [grpc.status.DEADLINE_EXCEEDED, 504],
  [grpc.status.NOT_FOUND, 404], [grpc.status.ALREADY_EXISTS, 409], [grpc.status.PERMISSION_DENIED, 403],
  [grpc.status.RESOURCE_EXHAUSTED, 429], [grpc.status.FAILED_PRECONDITION, 412], [grpc.status.ABORTED, 409],
  [grpc.status.UNAUTHENTICATED, 401], [grpc.status.UNAVAILABLE, 503],
]);

function timestamp(value) {
  const message = new Timestamp();
  message.fromDate(new Date(value));
  return message;
}
function iso(message) { return message ? message.toDate().toISOString() : null; }
function jobId(value) {
  const id = new knowledgePb.JobId();
  id.setValue(value || '');
  return id;
}

export { grpc, knowledgePb, errorsPb, KnowledgeServiceService, KnowledgeServiceClient };

export function encodeJob(job) {
  const message = new knowledgePb.Job();
  message.setId(jobId(job.id));
  message.setStatus(statusToProto[job.status] ?? knowledgePb.JobStatus.JOB_STATUS_UNSPECIFIED);
  message.setAttempts(job.attempts || 0);
  message.setCreatedAt(timestamp(job.created_at));
  message.setUpdatedAt(timestamp(job.updated_at));
  if (job.result !== null && job.result !== undefined) message.setResultJson(JSON.stringify(job.result));
  if (job.error) {
    const failure = new errorsPb.ErrorDetail();
    failure.setCode(errorsPb.ErrorCode.ERROR_CODE_JOB_FAILED);
    failure.setMessage(job.error);
    failure.setRetryable(false);
    message.setFailure(failure);
  }
  return message;
}

export function decodeJob(message) {
  const resultJson = message.getResultJson();
  const failure = message.hasFailure() ? message.getFailure() : null;
  return {
    id: message.hasId() ? message.getId().getValue() : '',
    status: statusFromProto.get(message.getStatus()) || 'unknown',
    attempts: message.getAttempts(),
    created_at: iso(message.getCreatedAt()),
    updated_at: iso(message.getUpdatedAt()),
    result: resultJson ? JSON.parse(resultJson) : null,
    error: failure ? failure.getMessage() : null,
  };
}

export function encodeRepositoryList(value) {
  const response = new knowledgePb.ListRepositoriesResponse();
  response.setRepositoriesList(value.repositories.map(repo => {
    const ref = new knowledgePb.RepositoryRef();
    ref.setAlias(repo.alias);
    ref.setRepositoryId(repo.repository_id || '');
    return ref;
  }));
  response.setEmbeddingsEnabled(value.embeddings_enabled);
  return response;
}

export function decodeRepositoryList(message) {
  const details = message.getRepositoriesList().map(repo => ({ alias: repo.getAlias(), repository_id: repo.getRepositoryId() }));
  return { repositories: details.map(repo => repo.alias), repository_details: details, embeddings_enabled: message.getEmbeddingsEnabled() };
}

export function decodeSubmitRequest(message) {
  const body = { repository: message.getRepository(), operation: operationFromProto.get(message.getOperation()) };
  if (message.hasScope()) body.scope = message.getScope();
  if (message.hasInclude()) body.include = message.getInclude().getValuesList();
  if (message.hasExclude()) body.exclude = message.getExclude().getValuesList();
  if (message.hasEmbed()) body.embed = message.getEmbed();
  if (message.hasSemantic()) body.semantic = message.getSemantic();
  if (message.hasQuery()) body.query = message.getQuery();
  if (message.hasTopK()) body.top_k = message.getTopK();
  if (message.hasTokenBudget()) body.token_budget = message.getTokenBudget();
  if (message.hasGenerationId()) body.generation_id = message.getGenerationId();
  if (message.hasMaxInputs()) body.max_inputs = message.getMaxInputs();
  if (message.hasMaxCharacters()) body.max_characters = message.getMaxCharacters();
  return { body, idempotencyKey: message.hasIdempotencyKey() ? message.getIdempotencyKey() : undefined };
}

export function encodeSubmitRequest(body, idempotencyKey) {
  const message = new knowledgePb.SubmitJobRequest();
  if (body?.repository !== undefined) message.setRepository(body.repository);
  if (body?.operation !== undefined) message.setOperation(operationToProto[body.operation] ?? knowledgePb.JobOperation.JOB_OPERATION_UNSPECIFIED);
  if (body?.scope !== undefined) message.setScope(body.scope);
  if (body?.include !== undefined) {
    const list = new knowledgePb.StringList();
    list.setValuesList(body.include);
    message.setInclude(list);
  }
  if (body?.exclude !== undefined) {
    const list = new knowledgePb.StringList();
    list.setValuesList(body.exclude);
    message.setExclude(list);
  }
  if (body?.embed !== undefined) message.setEmbed(body.embed);
  if (body?.semantic !== undefined) message.setSemantic(body.semantic);
  if (body?.query !== undefined) message.setQuery(body.query);
  if (body?.top_k !== undefined) message.setTopK(body.top_k);
  if (body?.token_budget !== undefined) message.setTokenBudget(body.token_budget);
  if (body?.generation_id !== undefined) message.setGenerationId(body.generation_id);
  if (body?.max_inputs !== undefined) message.setMaxInputs(body.max_inputs);
  if (body?.max_characters !== undefined) message.setMaxCharacters(body.max_characters);
  if (idempotencyKey !== undefined) message.setIdempotencyKey(idempotencyKey);
  return message;
}

export function encodeGetJobRequest(id, RequestType = knowledgePb.GetJobRequest) {
  const request = new RequestType();
  request.setJobId(jobId(id));
  return request;
}
export function decodeJobId(request) { return request.hasJobId() ? request.getJobId().getValue() : ''; }

export function encodeJobEvent(job, sequence) {
  const event = new knowledgePb.JobEvent();
  event.setJob(encodeJob(job));
  event.setObservedAt(timestamp(new Date().toISOString()));
  event.setSequence(sequence);
  return event;
}
export function decodeJobEvent(event) {
  return { job: decodeJob(event.getJob()), observed_at: iso(event.getObservedAt()), sequence: event.getSequence() };
}

export function metadataForToken(token) {
  if (!token) throw new Error('A service token is required.');
  const metadata = new grpc.Metadata();
  metadata.set('authorization', `Bearer ${token}`);
  return metadata;
}
export function authorizationFromMetadata(metadata) {
  const values = metadata?.get('authorization') || [];
  return values.find(entry => typeof entry === 'string') || '';
}

export function toGrpcError(error) {
  const safeMessage = error?.status ? error.message : 'Service request failed.';
  const detail = new errorsPb.ErrorDetail();
  detail.setCode(errorCodeToProto[error?.code] ?? errorsPb.ErrorCode.ERROR_CODE_INTERNAL);
  detail.setMessage(safeMessage);
  detail.setRetryable(error?.status === 429 || error?.status === 503);
  const metadata = new grpc.Metadata();
  metadata.set('agentsam-error-bin', Buffer.from(detail.serializeBinary()));
  return Object.assign(new Error(safeMessage), {
    code: httpToGrpc.get(error?.status) ?? grpc.status.INTERNAL,
    details: safeMessage,
    metadata,
  });
}

export function fromGrpcError(error) {
  let detail = null;
  try {
    const values = error?.metadata?.get('agentsam-error-bin') || [];
    const binary = values.find(value => Buffer.isBuffer(value));
    if (binary) detail = errorsPb.ErrorDetail.deserializeBinary(new Uint8Array(binary));
  } catch { /* fall back to gRPC status */ }
  const message = detail?.getMessage() || error?.details || error?.message || 'Knowledge RPC failed.';
  return Object.assign(new Error(message), {
    status: grpcToHttp.get(error?.code) ?? 500,
    grpcCode: error?.code,
    rpcCode: detail ? errorCodeNames.get(detail.getCode()) || 'INTERNAL' : undefined,
    retryable: detail?.getRetryable() || false,
  });
}

export function isTerminalJob(job) { return job.status === 'completed' || job.status === 'failed'; }
