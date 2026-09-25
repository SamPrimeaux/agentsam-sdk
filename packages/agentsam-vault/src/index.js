export {
  CREDENTIAL_KINDS,
  CREDENTIAL_STATUSES,
  CREDENTIAL_AUTHORITY,
  normalizeCredentialRecord,
  defineCredentialProvider,
} from './contracts/credential.js';
export { DEFAULT_CREDENTIAL_PROVIDERS, createProviderRegistry } from './providers/registry.js';
export {
  importVaultMasterKey,
  parseVaultMasterKeyBytes,
  mintVaultMasterKeyV1,
  encryptVaultSecret,
  decryptVaultSecret,
  last4,
  makeCredentialRef,
} from './crypto/aes-gcm.js';
export { createCredentialResolver } from './runtime/resolver.js';

