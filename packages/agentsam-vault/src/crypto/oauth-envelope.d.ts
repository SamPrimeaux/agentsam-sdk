/** Portable OAuth-token envelope contracts. */
export function oauthKeyId(material: string): Promise<string>;
export function oauthAad(provider: string, userId: string, accountIdentifier: string): string;
export function sealOauthToken(material: string, plaintext: string, aad: string): Promise<string>;
export function unsealOauthToken(material: string, blob: string, aad?: string | null): Promise<string>;
/** Test/migration helper for generating the legacy IAM no-AAD format. */
export function sealLegacyIamOauthToken(material: string, plaintext: string): Promise<string>;
