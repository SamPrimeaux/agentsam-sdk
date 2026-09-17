import grpc from '@grpc/grpc-js';
import { createRequire } from 'node:module';
import {
  ERROR_CODE,
  ERROR_REASON,
  canonicalCodeFromHttpStatus,
  createErrorEnvelope,
  defaultHttpStatusForCode,
  grpcStatusForCode,
} from '../../errors/contract.js';

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
const protoErrorCode = code => errorsPb.ErrorCode[`ERROR_CODE_${code}`] ?? errorsPb.ErrorCode.ERROR_CODE_UNKNOWN;
const errorCodeNames = new Map(Object.entries(errorsPb.ErrorCode).map(([key, value]) => [value, key.replace(/^ERROR_CODE_/, '')]));

const grpcToHttp = new Map(Object.entries({
  1: 499, 2: 500, 3: 400, 4: 504, 5: 404, 6: 409, 7: 403, 8: 429,
  9: 400, 10: 409, 11: 400, 12: 501, 13: 500, 14: 503, 15: 500, 16: 401,
}).map(([key, value]) => [Number(key), value]));

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
    failure.setCode(protoErrorCode(ERROR_CODE.INTERNAL));
    failure.setMessage(job.error);
    failure.setRetryable(false);
    failure.setReason(ERROR_REASON.EXECUTION_FAILED);
    failure.setHttpStatus(500);
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
  const legacyCode = error?.code === 'CONFLICT' ? ERROR_CODE.ABORTED : error?.code;
  const code = Object.values(ERROR_CODE).includes(legacyCode) ? legacyCode : canonicalCodeFromHttpStatus(error?.status);
  const reason = error?.reason || (code === ERROR_CODE.UNAUTHENTICATED ? ERROR_REASON.AUTH_INVALID
    : code === ERROR_CODE.PERMISSION_DENIED ? ERROR_REASON.PERMISSION_DENIED
      : code === ERROR_CODE.NOT_FOUND ? ERROR_REASON.TARGET_NOT_FOUND
        : code === ERROR_CODE.ABORTED ? ERROR_REASON.CONFLICT
          : code === ERROR_CODE.RESOURCE_EXHAUSTED ? ERROR_REASON.CAPACITY_EXHAUSTED
            : code === ERROR_CODE.UNAVAILABLE ? ERROR_REASON.PROVIDER_UNAVAILABLE
              : code === ERROR_CODE.INVALID_ARGUMENT ? ERROR_REASON.INPUT_INVALID
                : ERROR_REASON.INTERNAL);
  const envelope = createErrorEnvelope({
    code,
    reason,
    message: safeMessage,
    retryable: error?.retryable ?? (error?.status === 429 || error?.status === 503),
    retry_after_ms: error?.retry_after_ms ?? null,
    http_status: error?.status ?? defaultHttpStatusForCode(code),
    provider: error?.provider ?? null,
    provider_code: error?.provider_code ?? null,
  });
  const detail = new errorsPb.ErrorDetail();
  detail.setCode(protoErrorCode(envelope.code));
  detail.setMessage(envelope.message);
  detail.setRetryable(envelope.retryable);
  detail.setReason(envelope.reason);
  if (envelope.http_status != null) detail.setHttpStatus(envelope.http_status);
  if (envelope.retry_after_ms != null) detail.setRetryAfterMs(envelope.retry_after_ms);
  if (envelope.provider) detail.setProvider(envelope.provider);
  if (envelope.provider_code) detail.setProviderCode(envelope.provider_code);
  const metadata = new grpc.Metadata();
  metadata.set('agentsam-error-bin', Buffer.from(detail.serializeBinary()));
  return Object.assign(new Error(safeMessage), {
    code: grpcStatusForCode(envelope.code),
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
  const rpcCode = detail ? errorCodeNames.get(detail.getCode()) || 'UNKNOWN' : undefined;
  return Object.assign(new Error(message), {
    status: detail?.hasHttpStatus?.() ? detail.getHttpStatus() : grpcToHttp.get(error?.code) ?? 500,
    grpcCode: error?.code,
    rpcCode,
    reason: detail?.getReason?.() || ERROR_REASON.UNKNOWN,
    retryable: detail?.getRetryable() || false,
    retry_after_ms: detail?.hasRetryAfterMs?.() ? detail.getRetryAfterMs() : null,
    provider: detail?.hasProvider?.() ? detail.getProvider() : null,
    provider_code: detail?.hasProviderCode?.() ? detail.getProviderCode() : null,
  });
}

export function isTerminalJob(job) { return job.status === 'completed' || job.status === 'failed'; }
