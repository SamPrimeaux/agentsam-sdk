import type {
  SettingsAccountHost,
  SettingsAccountOverview,
  SettingsAccountProfile,
  SettingsAccountSession,
  SettingsBackupCodeStatus,
} from "@inneranimalmedia/agentsam-settings/contracts";

/**
 * Settings account authority for the web host: the identity package's
 * /api/account and /api/auth routes on this origin, using the session cookie.
 */
async function accountRequest<T extends { ok?: boolean; error?: string }>(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({ ok: false, error: "invalid_response" }))) as T;
  if (!response.ok || payload.ok !== true) throw new Error(payload.error || `request_failed_${response.status}`);
  return payload;
}

export const studioAccountHost: SettingsAccountHost = {
  async readAccount() {
    return (await accountRequest<{ ok: boolean; account: SettingsAccountOverview }>("/api/account")).account;
  },
  async updateAccountProfile(patch) {
    return (await accountRequest<{ ok: boolean; profile: SettingsAccountProfile }>("/api/account/profile", "PATCH", patch)).profile;
  },
  async changePassword({ currentPassword, password, confirmPassword }) {
    await accountRequest("/api/auth/password", "POST", {
      current_password: currentPassword,
      password,
      confirm_password: confirmPassword,
    });
  },
  async listAccountSessions() {
    return (await accountRequest<{ ok: boolean; sessions: SettingsAccountSession[] }>("/api/account/sessions")).sessions;
  },
  async revokeAccountSession(id) {
    await accountRequest(`/api/account/sessions/${encodeURIComponent(id)}`, "DELETE");
  },
  async revokeOtherAccountSessions() {
    return (await accountRequest<{ ok: boolean; revoked: number }>("/api/account/sessions/revoke-others", "POST")).revoked;
  },
  async regenerateBackupCodes(currentPassword) {
    const result = await accountRequest<{ ok: boolean; codes: string[]; backupCodes: SettingsBackupCodeStatus }>(
      "/api/account/backup-codes", "POST", currentPassword ? { current_password: currentPassword } : {},
    );
    return { codes: result.codes, status: result.backupCodes };
  },
  async signOut() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => null);
    window.location.assign("/auth/login");
  },
};
