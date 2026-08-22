/**
 * AgentSam Identity contracts.
 *
 * These are intentionally storage-agnostic. The IAM adapter maps them to
 * existing D1 tables (auth_users, accounts, memberships, sessions).
 */

export const IdentityContractVersion = '1.0';

export function normalizeIdentityUser(user) {
  return {
    id: user?.id ?? null,
    email: user?.email ?? null,
    displayName: user?.displayName ?? user?.name ?? null,
    type: user?.type ?? 'human',
  };
}
