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
  openVaultSecret,
  probeVaultSecret,
  vaultFormatForMetadata,
  VAULT_FORMAT_CANONICAL,
  VAULT_FORMAT_LEGACY_IAM,
  last4,
  makeCredentialRef,
} from './crypto/aes-gcm.js';
export { createCredentialResolver } from './runtime/resolver.js';


export {
  oauthAad,
  oauthKeyId,
  sealOauthToken,
  unsealOauthToken,
  sealLegacyIamOauthToken,
} from './crypto/oauth-envelope.js';
