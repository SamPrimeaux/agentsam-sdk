/**
 * Stable compatibility export path.
 * createCloudflareD1Adapter remains IAM-compat behavior
 * (accounts, auth_users, auth_sessions, company, ...).
 * Do NOT repoint this path at portable identity_* tables.
 */
export {
  createIamCompatIdentityAdapter,
  createCloudflareD1Adapter,
} from '../iam-compat/index.js';
