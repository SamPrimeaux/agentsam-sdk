import {
  DEFAULT_HTTP_STATUS,
  ERROR_CODE,
  ERROR_DOMAIN,
  ERROR_REASON_POLICY,
  ERROR_RESOLUTION_OWNER,
  ERROR_SCHEMA_VERSION,
  ERROR_SEVERITY,
  ERROR_SOURCE_KIND,
  GRPC_STATUS,
  REMEDIATION_ACTION,
} from './vocabulary.js';
import { fingerprintError } from './fingerprint.js';
import { redactErrorValue, redactString, sanitizeNativeEvidence } from './redaction.js';

const REASON_PATTERN = /^[a-z][a-z0-9_]{0,127}$/;
const VALUES = object => new Set(Object.values(object));
const CODE_VALUES = VALUES(ERROR_CODE);
const SEVERITY_VALUES = VALUES(ERROR_SEVERITY);
const SOURCE_VALUES = VALUES(ERROR_SOURCE_KIND);
const OWNER_VALUES = VALUES(ERROR_RESOLUTION_OWNER);
const DOMAIN_VALUES = VALUES(ERROR_DOMAIN);
const ACTION_VALUES = VALUES(REMEDIATION_ACTION);
const GRPC_CODE_BY_NUMBER = new Map(Object.entries(GRPC_STATUS).map(([name, value]) => [value, ERROR_CODE[name]]));
const HTTP_OVERRIDES = new Map([
  [400, ERROR_CODE.INVALID_ARGUMENT], [401, ERROR_CODE.UNAUTHENTICATED], [403, ERROR_CODE.PERMISSION_DENIED],
  [404, ERROR_CODE.NOT_FOUND], [408, ERROR_CODE.DEADLINE_EXCEEDED], [409, ERROR_CODE.ABORTED],
  [412, ERROR_CODE.FAILED_PRECONDITION], [413, ERROR_CODE.RESOURCE_EXHAUSTED], [415, ERROR_CODE.INVALID_ARGUMENT],
  [422, ERROR_CODE.INVALID_ARGUMENT], [429, ERROR_CODE.RESOURCE_EXHAUSTED], [499, ERROR_CODE.CANCELLED],
  [500, ERROR_CODE.INTERNAL], [501, ERROR_CODE.UNIMPLEMENTED], [502, ERROR_CODE.UNAVAILABLE],
  [503, ERROR_CODE.UNAVAILABLE], [504, ERROR_CODE.DEADLINE_EXCEEDED], [520, ERROR_CODE.UNAVAILABLE],
  [521, ERROR_CODE.UNAVAILABLE], [522, ERROR_CODE.UNAVAILABLE], [523, ERROR_CODE.UNAVAILABLE],
  [524, ERROR_CODE.DEADLINE_EXCEEDED], [525, ERROR_CODE.UNAVAILABLE], [526, ERROR_CODE.UNAVAILABLE],
  [530, ERROR_CODE.UNAVAILABLE],
]);
const USER_ACTIONS = new Set([
  REMEDIATION_ACTION.REAUTHENTICATE,
  REMEDIATION_ACTION.CONNECT_PROVIDER,
  REMEDIATION_ACTION.CONFIGURE_PROVIDER_CREDENTIAL,
  REMEDIATION_ACTION.REFRESH_PROVIDER_CREDENTIAL,
  REMEDIATION_ACTION.REQUEST_PERMISSION,
  REMEDIATION_ACTION.REENROLL_DEVICE,
  REMEDIATION_ACTION.INSTALL_DEPENDENCY,
  REMEDIATION_ACTION.UPGRADE_DEPENDENCY,
  REMEDIATION_ACTION.CONFIGURE_DEPENDENCY,
  REMEDIATION_ACTION.CHANGE_CONFIGURATION,
  REMEDIATION_ACTION.CHANGE_INPUT,
  REMEDIATION_ACTION.REDUCE_SCOPE,
  REMEDIATION_ACTION.INCREASE_QUOTA,
  REMEDIATION_ACTION.ADD_BUDGET,
  REMEDIATION_ACTION.SELECT_MODEL,
  REMEDIATION_ACTION.CHANGE_REGION,
  REMEDIATION_ACTION.RESTART_RUNTIME,
]);

function clean(value) { return value == null ? '' : String(value).trim(); }
function optional(value, max = 512) { const text = clean(value); return text ? redactString(text, max) : null; }
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
function normalizeSource(source, fallbackName = 'agentsam-sdk') {
  const input = source && typeof source === 'object' ? source : {};
  const kind = clean(input.kind || ERROR_SOURCE_KIND.AGENTSAM);
  if (!SOURCE_VALUES.has(kind)) throw new TypeError(`Unknown AgentSam error source kind: ${kind}`);
  return Object.freeze({
    kind,
    name: optional(input.name || fallbackName, 256) || fallbackName,
    service: optional(input.service, 256),
  });
}
function normalizeRemediation(remediation, policy) {
  const input = remediation && typeof remediation === 'object' ? remediation : {};
  const action = clean(input.action || policy.remediation_action || REMEDIATION_ACTION.NONE);
  if (!ACTION_VALUES.has(action)) throw new TypeError(`Unknown AgentSam remediation action: ${action}`);
  return Object.freeze({
    action,
    message: optional(input.message, 2_000),
    automatic: input.automatic === true,
    command: optional(input.command, 1_000),
    url: optional(input.url, 2_000),
  });
}
function normalizeResource(resource) {
  if (!resource || typeof resource !== 'object') return null;
  const type = optional(resource.type, 128);
  if (!type) return null;
  return Object.freeze({ type, id: optional(resource.id, 512), name: optional(resource.name, 512) });
}
function normalizeEnvironment(environment) {
  if (!environment || typeof environment !== 'object') return null;
  return Object.freeze({
    detected_version: optional(environment.detected_version, 512),
    required_version: optional(environment.required_version, 512),
    component: optional(environment.component, 512),
    runtime: optional(environment.runtime, 512),
    platform: optional(environment.platform, 512),
  });
}

export function canonicalCodeFromHttpStatus(status) {
  const value = Number(status || 0);
  return HTTP_OVERRIDES.get(value) || (value >= 500 ? ERROR_CODE.INTERNAL : ERROR_CODE.UNKNOWN);
}
export function canonicalCodeFromGrpcStatus(status) { return GRPC_CODE_BY_NUMBER.get(Number(status)) || ERROR_CODE.UNKNOWN; }
export function defaultHttpStatusForCode(code) { return DEFAULT_HTTP_STATUS[code] ?? 500; }
export function grpcStatusForCode(code) { return GRPC_STATUS[code] ?? GRPC_STATUS.UNKNOWN; }

export function createErrorEnvelope(input = {}) {
  const reason = clean(input.reason || 'unknown');
  if (!REASON_PATTERN.test(reason)) throw new TypeError(`Invalid AgentSam error reason: ${reason}`);
  const policy = ERROR_REASON_POLICY[reason] || ERROR_REASON_POLICY.unknown;
  const code = clean(input.code || policy.code);
  if (!CODE_VALUES.has(code) || code === ERROR_CODE.OK) throw new TypeError(`Unknown AgentSam error code: ${code}`);
  if (ERROR_REASON_POLICY[reason] && code !== policy.code) {
    throw new TypeError(`AgentSam error reason ${reason} requires canonical code ${policy.code}, received ${code}`);
  }
  const severity = clean(input.severity || policy.severity);
  if (!SEVERITY_VALUES.has(severity)) throw new TypeError(`Unknown AgentSam error severity: ${severity}`);
  const retryable = input.retryable == null ? Boolean(policy.retryable) : Boolean(input.retryable);
  const resolutionOwner = clean(input.resolution_owner || policy.resolution_owner);
  if (!OWNER_VALUES.has(resolutionOwner)) throw new TypeError(`Unknown AgentSam error resolution owner: ${resolutionOwner}`);
  const domain = clean(input.domain || ERROR_DOMAIN.RUNTIME);
  if (!DOMAIN_VALUES.has(domain)) throw new TypeError(`Unknown AgentSam error domain: ${domain}`);
  const remediation = normalizeRemediation(input.remediation, policy);
  if (severity === ERROR_SEVERITY.TRANSIENT && !retryable) throw new TypeError('transient AgentSam errors must be retryable');
  if ((remediation.action === REMEDIATION_ACTION.RETRY || remediation.action === REMEDIATION_ACTION.RETRY_LATER) && !retryable) {
    throw new TypeError(`${remediation.action} remediation requires retryable=true`);
  }
  if (severity === ERROR_SEVERITY.BLOCKING_INTERNAL && USER_ACTIONS.has(remediation.action)) {
    throw new TypeError(`blocking_internal errors cannot prescribe user remediation action ${remediation.action}`);
  }
  const source = normalizeSource(input.source);
  const native = sanitizeNativeEvidence(input.native);
  const environment = normalizeEnvironment(input.environment);
  const envelope = {
    ok: false,
    schema_version: ERROR_SCHEMA_VERSION,
    code,
    reason,
    severity,
    source,
    resolution_owner: resolutionOwner,
    domain,
    tool: optional(input.tool, 256),
    stage: optional(input.stage, 256),
    message: redactString(input.message || 'Operation failed', 4_000),
    retryable,
    retry_after_ms: input.retry_after_ms == null ? null : Math.max(0, Math.round(Number(input.retry_after_ms) || 0)),
    remediation,
    resource: normalizeResource(input.resource),
    native,
    environment,
    http_status: input.http_status == null ? defaultHttpStatusForCode(code) : Number(input.http_status),
    grpc_status: input.grpc_status == null ? grpcStatusForCode(code) : Number(input.grpc_status),
    transport: optional(input.transport, 256),
    provider: optional(input.provider, 256),
    provider_code: optional(input.provider_code, 512),
    request_id: optional(input.request_id, 512),
    trace_id: optional(input.trace_id, 512),
    fingerprint: '',
    occurrence_count: Number.isInteger(input.occurrence_count) && input.occurrence_count > 0 ? input.occurrence_count : 1,
    details: input.details == null ? null : redactErrorValue(input.details),
  };
  if (!Number.isInteger(envelope.http_status) || envelope.http_status < 100 || envelope.http_status > 599) envelope.http_status = null;
  if (!Number.isInteger(envelope.grpc_status) || envelope.grpc_status < 0 || envelope.grpc_status > 16) envelope.grpc_status = null;
  envelope.fingerprint = optional(input.fingerprint, 128) || fingerprintError(envelope);
  return deepFreeze(envelope);
}

export function isErrorEnvelope(value) {
  return Boolean(value && typeof value === 'object' && value.ok === false && value.schema_version === ERROR_SCHEMA_VERSION && CODE_VALUES.has(value.code) && typeof value.reason === 'string');
}

export function assertErrorEnvelope(value) {
  if (!isErrorEnvelope(value)) throw new TypeError('Expected an AgentSam ErrorEnvelope');
  return createErrorEnvelope(value);
}

export function serializeError(value) { return JSON.stringify(assertErrorEnvelope(value)); }
export function parseError(value) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (parsed?.schema_version !== ERROR_SCHEMA_VERSION) throw new TypeError(`Unsupported AgentSam error schema version: ${parsed?.schema_version ?? 'missing'}`);
  return createErrorEnvelope(parsed);
}
