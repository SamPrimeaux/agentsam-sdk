import { useEffect, useState } from "react";
import { fetchAccount, saveAccountProfile, updateAccountPassword } from "../../lib/api";

export default function AccountPage() {
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");

  const [profileSaving, setProfileSaving] = useState(false);
  const [profileNote, setProfileNote] = useState<{ ok: boolean; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordNote, setPasswordNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetchAccount()
      .then((d) => {
        setDisplayName(d.display_name || "");
        setAvatarUrl(d.avatar_url || "");
        setEmail(d.email || "");
        setRole(d.role || "member");
      })
      .finally(() => setLoading(false));
  }, []);

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileNote(null);
    try {
      await saveAccountProfile({ display_name: displayName, avatar_url: avatarUrl });
      setProfileNote({ ok: true, text: "Profile saved." });
    } catch (err) {
      setProfileNote({ ok: false, text: err instanceof Error ? err.message : "Save failed." });
    } finally {
      setProfileSaving(false);
    }
  }

  async function onUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordSaving(true);
    setPasswordNote(null);
    try {
      await updateAccountPassword({ current_password: currentPassword, new_password: newPassword });
      setPasswordNote({ ok: true, text: "Password updated." });
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPasswordNote({ ok: false, text: err instanceof Error ? err.message : "Update failed." });
    } finally {
      setPasswordSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="console-page">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="console-page">
      <h1>Account</h1>
      <p className="console-page-subtitle">Security, profile, and mail integrations for Fuel &amp; Free Time admin.</p>

      <div className="account-grid">
        <section className="account-card">
          <h2>Profile &amp; security</h2>
          <p className="account-card-desc">
            Signed-in admin identity and password. Storefront SEO and spam controls live under Online Store preferences.
          </p>

          <div className="account-card-body">
            <form className="account-form" onSubmit={onSaveProfile}>
              <h3>Profile</h3>
              <p className="account-form-hint">Shown in the sidebar and mail composer.</p>

              <label className="account-label" htmlFor="acct-display-name">
                Display name
              </label>
              <input
                id="acct-display-name"
                className="account-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />

              <label className="account-label" htmlFor="acct-avatar-url">
                Avatar URL (optional)
              </label>
              <input
                id="acct-avatar-url"
                className="account-input"
                placeholder="https://…"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
              />

              <label className="account-label" htmlFor="acct-login-email">
                Login email
              </label>
              <input id="acct-login-email" className="account-input" value={email} readOnly disabled />

              {profileNote && (
                <div className={`admin-note ${profileNote.ok ? "success" : "error"}`}>{profileNote.text}</div>
              )}

              <button type="submit" className="account-btn-primary" disabled={profileSaving}>
                {profileSaving ? "Saving…" : "Save profile"}
              </button>
            </form>

            <aside className="account-side">
              <h3>Signed in as</h3>
              <span className="account-role-badge">{role}</span>
              <p className="account-side-desc">Admin access</p>
              <p className="account-side-desc">
                Storefront SEO and spam controls live under{" "}
                <a href="/admin/store#preferences">Online Store preferences</a>.
              </p>
            </aside>
          </div>
        </section>

        <section className="account-card">
          <form className="account-form" onSubmit={onUpdatePassword}>
            <h3>Change password</h3>
            <p className="account-form-hint">Minimum 8 characters. Applies to this admin login only.</p>

            <label className="account-label" htmlFor="acct-current-password">
              Current password
            </label>
            <input
              id="acct-current-password"
              type="password"
              className="account-input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />

            <label className="account-label" htmlFor="acct-new-password">
              New password
            </label>
            <input
              id="acct-new-password"
              type="password"
              className="account-input"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />

            {passwordNote && (
              <div className={`admin-note ${passwordNote.ok ? "success" : "error"}`}>{passwordNote.text}</div>
            )}

            <button type="submit" className="account-btn-primary" disabled={passwordSaving}>
              {passwordSaving ? "Updating…" : "Update password"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
