export const ERROR_SCHEMA_VERSION = 1;

// Mirrors google.rpc.Code / gRPC canonical status names without importing a Node gRPC runtime.
export const ERROR_CODE = Object.freeze({
  OK: 'OK',
  CANCELLED: 'CANCELLED',
  UNKNOWN: 'UNKNOWN',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  DEADLINE_EXCEEDED: 'DEADLINE_EXCEEDED',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',
  FAILED_PRECONDITION: 'FAILED_PRECONDITION',
  ABORTED: 'ABORTED',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  UNIMPLEMENTED: 'UNIMPLEMENTED',
  INTERNAL: 'INTERNAL',
  UNAVAILABLE: 'UNAVAILABLE',
  DATA_LOSS: 'DATA_LOSS',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
});

export const GRPC_STATUS = Object.freeze({
  OK: 0,
  CANCELLED: 1,
  UNKNOWN: 2,
  INVALID_ARGUMENT: 3,
  DEADLINE_EXCEEDED: 4,
  NOT_FOUND: 5,
  ALREADY_EXISTS: 6,
  PERMISSION_DENIED: 7,
  RESOURCE_EXHAUSTED: 8,
  FAILED_PRECONDITION: 9,
  ABORTED: 10,
  OUT_OF_RANGE: 11,
  UNIMPLEMENTED: 12,
  INTERNAL: 13,
  UNAVAILABLE: 14,
  DATA_LOSS: 15,
  UNAUTHENTICATED: 16,
});

// Stable AgentSam-specific reasons. Add reasons deliberately; callers should not branch on messages.
export const ERROR_REASON = Object.freeze({
  UNKNOWN: 'unknown',

  INPUT_INVALID: 'input_invalid',
  INPUT_OUT_OF_RANGE: 'input_out_of_range',
  PRECONDITION_FAILED: 'precondition_failed',
  UNSUPPORTED_OPERATION: 'unsupported_operation',

  AUTH_MISSING: 'auth_missing',
  AUTH_INVALID: 'auth_invalid',
  IDENTITY_MISSING: 'identity_missing',
  PERMISSION_DENIED: 'permission_denied',

  TARGET_NOT_FOUND: 'target_not_found',
  ALREADY_EXISTS: 'already_exists',
  CONFLICT: 'conflict',
  STALE_VERSION: 'stale_version',

  RATE_LIMITED: 'rate_limited',
  QUOTA_EXHAUSTED: 'quota_exhausted',
  CAPACITY_EXHAUSTED: 'capacity_exhausted',

  TRANSPORT_UNREACHABLE: 'transport_unreachable',
  TRANSPORT_REFUSED: 'transport_refused',
  TRANSPORT_TIMEOUT: 'transport_timeout',
  UPSTREAM_INVALID_RESPONSE: 'upstream_invalid_response',
  DNS_UNRESOLVED: 'dns_unresolved',
  TLS_HANDSHAKE_FAILED: 'tls_handshake_failed',
  TLS_CERTIFICATE_INVALID: 'tls_certificate_invalid',
  TUNNEL_CONNECTOR_UNAVAILABLE: 'tunnel_connector_unavailable',

  CANCELLED: 'cancelled',
  DEADLINE_EXCEEDED: 'deadline_exceeded',
  EXECUTION_TIMEOUT: 'execution_timeout',
  EXECUTION_FAILED: 'execution_failed',

  PROVIDER_UNAVAILABLE: 'provider_unavailable',
  MODEL_NOT_FOUND: 'model_not_found',
  POLICY_BLOCKED: 'policy_blocked',
  COPYRIGHT_BLOCKED: 'copyright_blocked',

  PERSISTENCE_FAILED: 'persistence_failed',
  DATA_CORRUPT: 'data_corrupt',
  DATA_LOSS: 'data_loss',

  REPOSITORY_SCOPE_VIOLATION: 'repository_scope_violation',
  REPOSITORY_CHANGED: 'repository_changed',
  INDEX_STALE: 'index_stale',
  INDEX_FAILED: 'index_failed',
  EMBEDDING_FAILED: 'embedding_failed',
  VECTOR_STORE_FAILED: 'vector_store_failed',

  CAD_CONSTRAINT_UNSATISFIED: 'cad_constraint_unsatisfied',
  CAD_GEOMETRY_INVALID: 'cad_geometry_invalid',
  CAD_KERNEL_FAILED: 'cad_kernel_failed',
  CAD_EXPORT_FAILED: 'cad_export_failed',
  CAD_RENDER_FAILED: 'cad_render_failed',

  INTERNAL: 'internal',
});

const DEFAULT_HTTP_STATUS = Object.freeze({
  [ERROR_CODE.CANCELLED]: 499,
  [ERROR_CODE.UNKNOWN]: 500,
  [ERROR_CODE.INVALID_ARGUMENT]: 400,
  [ERROR_CODE.DEADLINE_EXCEEDED]: 504,
  [ERROR_CODE.NOT_FOUND]: 404,
  [ERROR_CODE.ALREADY_EXISTS]: 409,
  [ERROR_CODE.PERMISSION_DENIED]: 403,
  [ERROR_CODE.RESOURCE_EXHAUSTED]: 429,
  [ERROR_CODE.FAILED_PRECONDITION]: 400,
  [ERROR_CODE.ABORTED]: 409,
  [ERROR_CODE.OUT_OF_RANGE]: 400,
  [ERROR_CODE.UNIMPLEMENTED]: 501,
  [ERROR_CODE.INTERNAL]: 500,
  [ERROR_CODE.UNAVAILABLE]: 503,
  [ERROR_CODE.DATA_LOSS]: 500,
  [ERROR_CODE.UNAUTHENTICATED]: 401,
});

const HTTP_CODE_OVERRIDES = Object.freeze({
  400: ERROR_CODE.INVALID_ARGUMENT,
  401: ERROR_CODE.UNAUTHENTICATED,
  403: ERROR_CODE.PERMISSION_DENIED,
  404: ERROR_CODE.NOT_FOUND,
  408: ERROR_CODE.DEADLINE_EXCEEDED,
  409: ERROR_CODE.ABORTED,
  412: ERROR_CODE.FAILED_PRECONDITION,
  413: ERROR_CODE.RESOURCE_EXHAUSTED,
  415: ERROR_CODE.INVALID_ARGUMENT,
  422: ERROR_CODE.INVALID_ARGUMENT,
  429: ERROR_CODE.RESOURCE_EXHAUSTED,
  499: ERROR_CODE.CANCELLED,
  500: ERROR_CODE.INTERNAL,
  501: ERROR_CODE.UNIMPLEMENTED,
  502: ERROR_CODE.UNAVAILABLE,
  503: ERROR_CODE.UNAVAILABLE,
  504: ERROR_CODE.DEADLINE_EXCEEDED,
  520: ERROR_CODE.UNAVAILABLE,
  521: ERROR_CODE.UNAVAILABLE,
  522: ERROR_CODE.UNAVAILABLE,
  523: ERROR_CODE.UNAVAILABLE,
  524: ERROR_CODE.DEADLINE_EXCEEDED,
  525: ERROR_CODE.UNAVAILABLE,
  526: ERROR_CODE.UNAVAILABLE,
  530: ERROR_CODE.UNAVAILABLE,
});

const GRPC_CODE_BY_NUMBER = new Map(Object.entries(GRPC_STATUS).map(([name, value]) => [value, ERROR_CODE[name]]));

export function canonicalCodeFromHttpStatus(status) {
  return HTTP_CODE_OVERRIDES[Number(status)] || (Number(status) >= 500 ? ERROR_CODE.INTERNAL : ERROR_CODE.UNKNOWN);
}

export function canonicalCodeFromGrpcStatus(status) {
  return GRPC_CODE_BY_NUMBER.get(Number(status)) || ERROR_CODE.UNKNOWN;
}

export function defaultHttpStatusForCode(code) {
  return DEFAULT_HTTP_STATUS[code] || 500;
}

export function grpcStatusForCode(code) {
  return GRPC_STATUS[code] ?? GRPC_STATUS.UNKNOWN;
}

export function classifyCloudflareFailure({ httpStatus, cloudflareCode } = {}) {
  const status = Number(httpStatus || 0) || null;
  const cf = Number(cloudflareCode || 0) || null;
  if (cf === 1033) return { code: ERROR_CODE.UNAVAILABLE, reason: ERROR_REASON.TUNNEL_CONNECTOR_UNAVAILABLE, retryable: true };
  if (status === 521) return { code: ERROR_CODE.UNAVAILABLE, reason: ERROR_REASON.TRANSPORT_REFUSED, retryable: true };
  if (status === 522 || status === 523) return { code: ERROR_CODE.UNAVAILABLE, reason: ERROR_REASON.TRANSPORT_UNREACHABLE, retryable: true };
  if (status === 524) return { code: ERROR_CODE.DEADLINE_EXCEEDED, reason: ERROR_REASON.TRANSPORT_TIMEOUT, retryable: true };
  if (status === 525) return { code: ERROR_CODE.UNAVAILABLE, reason: ERROR_REASON.TLS_HANDSHAKE_FAILED, retryable: false };
  if (status === 526) return { code: ERROR_CODE.UNAVAILABLE, reason: ERROR_REASON.TLS_CERTIFICATE_INVALID, retryable: false };
  if (status === 520 || status === 502) return { code: ERROR_CODE.UNAVAILABLE, reason: ERROR_REASON.UPSTREAM_INVALID_RESPONSE, retryable: true };
  if (status === 530) return { code: ERROR_CODE.UNAVAILABLE, reason: ERROR_REASON.TRANSPORT_UNREACHABLE, retryable: true };
  return { code: canonicalCodeFromHttpStatus(status), reason: ERROR_REASON.UNKNOWN, retryable: status != null && status >= 500 };
}

export function classifyOAuthFailure(error) {
  switch (String(error || '').toLowerCase()) {
    case 'invalid_client': return { code: ERROR_CODE.UNAUTHENTICATED, reason: ERROR_REASON.AUTH_INVALID, retryable: false };
    case 'invalid_grant': return { code: ERROR_CODE.UNAUTHENTICATED, reason: ERROR_REASON.AUTH_INVALID, retryable: false };
    case 'unauthorized_client':
    case 'access_denied': return { code: ERROR_CODE.PERMISSION_DENIED, reason: ERROR_REASON.PERMISSION_DENIED, retryable: false };
    case 'invalid_scope':
    case 'invalid_request':
    case 'unsupported_grant_type': return { code: ERROR_CODE.INVALID_ARGUMENT, reason: ERROR_REASON.INPUT_INVALID, retryable: false };
    default: return { code: ERROR_CODE.UNKNOWN, reason: ERROR_REASON.UNKNOWN, retryable: false };
  }
}

export function createErrorEnvelope({
  code = ERROR_CODE.UNKNOWN,
  reason = ERROR_REASON.UNKNOWN,
  message = 'Operation failed',
  retryable = false,
  retry_after_ms = null,
  http_status = null,
  grpc_status = null,
  provider = null,
  provider_code = null,
  transport = null,
  request_id = null,
  trace_id = null,
  resource = null,
  details = null,
} = {}) {
  if (!Object.values(ERROR_CODE).includes(code)) throw new TypeError(`Unknown AgentSam error code: ${code}`);
  if (!Object.values(ERROR_REASON).includes(reason)) throw new TypeError(`Unknown AgentSam error reason: ${reason}`);
  const effectiveHttp = http_status == null ? defaultHttpStatusForCode(code) : Number(http_status);
  const effectiveGrpc = grpc_status == null ? grpcStatusForCode(code) : Number(grpc_status);
  return Object.freeze({
    ok: false,
    schema_version: ERROR_SCHEMA_VERSION,
    code,
    reason,
    message: String(message || 'Operation failed'),
    retryable: Boolean(retryable),
    retry_after_ms: retry_after_ms == null ? null : Math.max(0, Number(retry_after_ms)),
    http_status: Number.isInteger(effectiveHttp) ? effectiveHttp : null,
    grpc_status: Number.isInteger(effectiveGrpc) ? effectiveGrpc : null,
    provider: provider || null,
    provider_code: provider_code || null,
    transport: transport || null,
    request_id: request_id || null,
    trace_id: trace_id || null,
    resource: resource || null,
    details: details || null,
  });
}
