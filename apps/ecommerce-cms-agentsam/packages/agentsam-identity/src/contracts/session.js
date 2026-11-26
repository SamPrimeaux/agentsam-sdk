/** Session contract shared by identity adapters. */
export function normalizeIdentitySession(session) {
  return {
    id: session?.id ?? null,
    userId: session?.userId ?? session?.user_id ?? null,
    expiresAt: session?.expiresAt ?? session?.expires_at ?? null,
    revokedAt: session?.revokedAt ?? session?.revoked_at ?? null,
  };
}
