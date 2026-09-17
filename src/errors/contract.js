// Compatibility facade. Canonical runtime ownership lives in packages/agentsam-errors.
export {
  ERROR_SCHEMA_VERSION,
  ERROR_CODE,
  ERROR_REASON,
  ERROR_SEVERITY,
  ERROR_SOURCE_KIND,
  ERROR_RESOLUTION_OWNER,
  ERROR_DOMAIN,
  REMEDIATION_ACTION,
  GRPC_STATUS,
} from '../../packages/agentsam-errors/src/vocabulary.js';

export {
  canonicalCodeFromHttpStatus,
  canonicalCodeFromGrpcStatus,
  defaultHttpStatusForCode,
  grpcStatusForCode,
  createErrorEnvelope,
  isErrorEnvelope,
  assertErrorEnvelope,
  serializeError,
  parseError,
} from '../../packages/agentsam-errors/src/envelope.js';

export { classifyCloudflareFailure } from '../../packages/agentsam-errors/src/adapters/cloudflare.js';
export { classifyOAuthFailure } from '../../packages/agentsam-errors/src/adapters/oauth.js';
