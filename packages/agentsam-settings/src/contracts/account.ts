/**
 * Self-service account contract. Hosts implement these against the identity
 * package's /api/account routes (or an equivalent authority); the package never
 * reads identity tables or fixtures directly.
 */
export type SettingsAccountProfile = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  timezone: string | null;
  notificationEmail: string | null;
  createdAt: number | null;
};

export type SettingsAccountProfilePatch = Partial<
  Pick<SettingsAccountProfile, "displayName" | "avatarUrl" | "timezone" | "notificationEmail">
>;

export type SettingsBackupCodeStatus = {
  total: number;
  remaining: number;
  generatedAt: number | null;
};

export type SettingsAccountOverview = {
  profile: SettingsAccountProfile;
  security: {
    hasPassword: boolean;
    backupCodes: SettingsBackupCodeStatus;
    activeSessions: number;
  };
  capabilities: {
    canManageCompany: boolean;
    passwordReset: boolean;
  };
};

export type SettingsAccountSession = {
  id: string;
  type: string;
  provider: string;
  createdAt: number | null;
  lastActiveAt: number | null;
  expiresAt: number | null;
  current: boolean;
};

export type SettingsPasswordChange = {
  currentPassword?: string;
  password: string;
  confirmPassword: string;
};

export interface SettingsAccountHost {
  readAccount(): Promise<SettingsAccountOverview>;
  updateAccountProfile(patch: SettingsAccountProfilePatch): Promise<SettingsAccountProfile>;
  changePassword(input: SettingsPasswordChange): Promise<void>;
  listAccountSessions(): Promise<SettingsAccountSession[]>;
  revokeAccountSession(id: string): Promise<void>;
  revokeOtherAccountSessions(): Promise<number>;
  /** Returns the plaintext codes exactly once; they are never readable again. */
  regenerateBackupCodes(currentPassword?: string): Promise<{ codes: string[]; status: SettingsBackupCodeStatus }>;
  signOut(): Promise<void>;
}
