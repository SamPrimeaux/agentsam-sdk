import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type {
  SettingsAccountHost,
  SettingsAccountOverview,
  SettingsAccountProfilePatch,
  SettingsAccountSession,
} from "../contracts/account";

/**
 * Self-service account panel. Every value comes from the host's account authority;
 * nothing here is a fixture or a brand constant. Colors come from the active theme
 * (`bg-primary`, `--settings-*` inks), so the panel re-skins with any brand.
 */

const ERROR_COPY: Record<string, string> = {
  session_required: "Your session expired. Sign in again to manage your account.",
  current_password_required: "Enter your current password to continue.",
  current_password_invalid: "That current password is incorrect.",
  passwords_do_not_match: "The new passwords don't match.",
  password_too_short: "Use at least 8 characters for your password.",
  display_name_required: "Display name can't be empty.",
  avatar_url_must_be_https: "Avatar URL must start with https://",
  notification_email_invalid: "Enter a valid notification email.",
  timezone_invalid: "Choose a valid time zone.",
  field_too_long: "One of the fields is too long.",
  session_not_found: "That session already ended.",
  account_security_migration_required: "Account security isn't installed on this host yet.",
  account_api_not_supported: "This host doesn't provide account self-service.",
};

function describeError(error: unknown) {
  const code = error instanceof Error ? error.message : String(error || "");
  return ERROR_COPY[code] || "Something went wrong. Try again.";
}

function formatWhen(unix: number | null) {
  if (!unix) return "—";
  const date = new Date(unix * 1000);
  const diff = Date.now() - date.getTime();
  if (diff >= 0 && diff < 60_000) return "Just now";
  if (diff >= 0 && diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff >= 0 && diff < 86_400_000) return `${Math.round(diff / 3_600_000)} h ago`;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function sessionLabel(session: SettingsAccountSession) {
  const kind = session.type === "desktop" ? "Desktop app" : "Web browser";
  const via = session.provider === "backup_code"
    ? "backup code"
    : session.provider === "email" ? "password" : session.provider;
  return `${kind} · signed in with ${via}`;
}

function timeZones(current: string | null) {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  const zones = typeof intl.supportedValuesOf === "function" ? intl.supportedValuesOf("timeZone") : [];
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return [...new Set([current, local, ...zones].filter((zone): zone is string => Boolean(zone)))];
}

function Panel({ title, description, action, children }: {
  title: string; description?: string; action?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="py-5 first:pt-0">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          {description && <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-foreground">{label}</span>
      <span className="mt-1.5 block">{children}</span>
      {hint && <span className="mt-1 block text-[10px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-[12px] text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-60";
const primaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-[12px] font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-[12px] font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

function Notice({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : "status"}
      className={tone === "error" ? "text-[11px] text-[var(--settings-danger-ink)]" : "text-[11px] text-[var(--settings-success-ink)]"}>
      {children}
    </p>
  );
}

function ProfileForm({ host, overview, onSaved }: {
  host: SettingsAccountHost; overview: SettingsAccountOverview; onSaved: () => Promise<void>;
}) {
  const { profile } = overview;
  const [draft, setDraft] = useState({
    displayName: profile.displayName || "",
    avatarUrl: profile.avatarUrl || "",
    timezone: profile.timezone || "",
    notificationEmail: profile.notificationEmail || "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const zones = useMemo(() => timeZones(profile.timezone), [profile.timezone]);

  const patch = useMemo(() => {
    const out: SettingsAccountProfilePatch = {};
    const norm = (v: string) => v.trim() || null;
    if (draft.displayName.trim() !== (profile.displayName || "")) out.displayName = draft.displayName.trim();
    if (norm(draft.avatarUrl) !== profile.avatarUrl) out.avatarUrl = norm(draft.avatarUrl);
    if (norm(draft.timezone) !== profile.timezone) out.timezone = norm(draft.timezone);
    if (norm(draft.notificationEmail) !== profile.notificationEmail) out.notificationEmail = norm(draft.notificationEmail);
    return out;
  }, [draft, profile]);
  const dirty = Object.keys(patch).length > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    setBusy(true); setMessage(null);
    try {
      await host.updateAccountProfile(patch);
      await onSaved();
      setMessage({ tone: "success", text: "Profile saved." });
    } catch (error) {
      setMessage({ tone: "error", text: describeError(error) });
    } finally { setBusy(false); }
  }

  const initials = (draft.displayName || profile.email).trim().slice(0, 1).toUpperCase();
  return (
    <Panel title="Profile" description="How you appear across every app that signs in with this account.">
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-border/70 p-4">
        <div className="flex items-center gap-3">
          {draft.avatarUrl.startsWith("https://")
            ? <img src={draft.avatarUrl} alt="" className="size-12 rounded-full border border-border object-cover"/>
            : <span aria-hidden className="grid size-12 place-items-center rounded-full bg-muted text-[16px] font-semibold">{initials}</span>}
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{draft.displayName || profile.email}</p>
            <p className="truncate text-[11px] text-muted-foreground">{profile.email}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display name">
            <input className={inputClass} value={draft.displayName} maxLength={80} required autoComplete="name"
              onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))}/>
          </Field>
          <Field label="Sign-in email" hint="Your login identity. Contact support to change it.">
            <input className={inputClass} value={profile.email} disabled readOnly/>
          </Field>
          <Field label="Avatar URL" hint="An https:// image link.">
            <input className={inputClass} value={draft.avatarUrl} inputMode="url" placeholder="https://"
              onChange={(e) => setDraft((d) => ({ ...d, avatarUrl: e.target.value }))}/>
          </Field>
          <Field label="Notification email" hint="Where alerts go, if different from your sign-in email.">
            <input className={inputClass} type="email" value={draft.notificationEmail} autoComplete="email"
              onChange={(e) => setDraft((d) => ({ ...d, notificationEmail: e.target.value }))}/>
          </Field>
          <Field label="Time zone">
            <select className={inputClass} value={draft.timezone}
              onChange={(e) => setDraft((d) => ({ ...d, timezone: e.target.value }))}>
              <option value="">Not set</option>
              {zones.map((zone) => <option key={zone} value={zone}>{zone.replace(/_/g, " ")}</option>)}
            </select>
          </Field>
          <Field label="Member since">
            <input className={inputClass} value={formatWhen(profile.createdAt)} disabled readOnly/>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={primaryButton} disabled={!dirty || busy}>{busy ? "Saving…" : "Save profile"}</button>
          {dirty && !busy && <button type="button" className={secondaryButton} onClick={() => setDraft({
            displayName: profile.displayName || "", avatarUrl: profile.avatarUrl || "",
            timezone: profile.timezone || "", notificationEmail: profile.notificationEmail || "",
          })}>Discard</button>}
          {message && <Notice tone={message.tone}>{message.text}</Notice>}
        </div>
      </form>
    </Panel>
  );
}

function PasswordForm({ host, hasPassword, onSaved }: {
  host: SettingsAccountHost; hasPassword: boolean; onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState({ currentPassword: "", password: "", confirmPassword: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage(null);
    try {
      await host.changePassword({ ...draft, currentPassword: hasPassword ? draft.currentPassword : undefined });
      setDraft({ currentPassword: "", password: "", confirmPassword: "" });
      await onSaved();
      setMessage({ tone: "success", text: hasPassword ? "Password changed." : "Password added. You can now sign in with email." });
    } catch (error) {
      setMessage({ tone: "error", text: describeError(error) });
    } finally { setBusy(false); }
  }
  return (
    <Panel title={hasPassword ? "Password" : "Add a password"}
      description={hasPassword
        ? "Change the password you use to sign in with email."
        : "You sign in with a connected provider. Add a password to also sign in with email."}>
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-border/70 p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {hasPassword && <Field label="Current password">
            <input className={inputClass} type="password" autoComplete="current-password" required value={draft.currentPassword}
              onChange={(e) => setDraft((d) => ({ ...d, currentPassword: e.target.value }))}/>
          </Field>}
          <Field label="New password" hint="At least 8 characters.">
            <input className={inputClass} type="password" autoComplete="new-password" minLength={8} required value={draft.password}
              onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}/>
          </Field>
          <Field label="Confirm new password">
            <input className={inputClass} type="password" autoComplete="new-password" minLength={8} required value={draft.confirmPassword}
              onChange={(e) => setDraft((d) => ({ ...d, confirmPassword: e.target.value }))}/>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={primaryButton} disabled={busy || !draft.password}>
            {busy ? "Saving…" : hasPassword ? "Change password" : "Add password"}
          </button>
          {message && <Notice tone={message.tone}>{message.text}</Notice>}
        </div>
      </form>
    </Panel>
  );
}

function BackupCodes({ host, overview, onSaved }: {
  host: SettingsAccountHost; overview: SettingsAccountOverview; onSaved: () => Promise<void>;
}) {
  const { backupCodes, hasPassword } = overview.security;
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const result = await host.regenerateBackupCodes(hasPassword ? password : undefined);
      setCodes(result.codes); setConfirming(false); setPassword("");
      await onSaved();
    } catch (err) {
      setError(describeError(err));
    } finally { setBusy(false); }
  }
  const text = codes ? codes.join("\n") : "";
  function download() {
    const blob = new Blob([`Backup codes for ${overview.profile.email}\nEach code works once.\n\n${text}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "backup-codes.txt"; a.click();
    URL.revokeObjectURL(url);
  }
  async function copy() {
    await navigator.clipboard?.writeText(text);
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  }

  const status = backupCodes.total === 0
    ? "No backup codes yet."
    : `${backupCodes.remaining} of ${backupCodes.total} codes left · generated ${formatWhen(backupCodes.generatedAt)}`;
  return (
    <Panel title="Backup codes"
      description="One-time codes that sign you in if you lose access to your password or provider. Store them somewhere safe."
      action={!confirming && !codes
        ? <button type="button" className={secondaryButton} onClick={() => setConfirming(true)}>
            {backupCodes.total ? "Regenerate codes" : "Generate codes"}
          </button>
        : undefined}>
      <div className="space-y-3 rounded-xl border border-border/70 p-4">
        <p className="text-[12px]">{status}</p>
        {backupCodes.total > 0 && backupCodes.remaining <= 2 && !codes && (
          <p className="text-[11px] text-[var(--settings-warning-ink)]">
            You're running low. Generate a new set.
          </p>
        )}
        {confirming && (
          <form onSubmit={generate} className="space-y-3 rounded-lg border border-border/70 p-3">
            <p className="text-[11px] text-muted-foreground">
              {backupCodes.total ? "Your existing codes will stop working immediately." : "You'll see the codes once."}
            </p>
            {hasPassword && <Field label="Confirm with your password">
              <input className={inputClass} type="password" autoComplete="current-password" required value={password}
                onChange={(e) => setPassword(e.target.value)}/>
            </Field>}
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className={primaryButton} disabled={busy}>{busy ? "Generating…" : "Generate codes"}</button>
              <button type="button" className={secondaryButton} onClick={() => { setConfirming(false); setError(""); }}>Cancel</button>
              {error && <Notice tone="error">{error}</Notice>}
            </div>
          </form>
        )}
        {codes && (
          <div className="space-y-3">
            <p className="text-[11px] text-[var(--settings-warning-ink)]">
              Save these now. They won't be shown again.
            </p>
            <ol className="grid grid-cols-1 gap-2 rounded-lg border border-border/70 bg-muted/40 p-3 font-mono text-[13px] sm:grid-cols-2">
              {codes.map((code) => <li key={code} className="tracking-wider">{code}</li>)}
            </ol>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={secondaryButton} onClick={() => void copy()}>{copied ? "Copied" : "Copy all"}</button>
              <button type="button" className={secondaryButton} onClick={download}>Download .txt</button>
              <button type="button" className={primaryButton} onClick={() => setCodes(null)}>I saved them</button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function Sessions({ host, onChanged }: { host: SettingsAccountHost; onChanged: () => Promise<void> }) {
  const [sessions, setSessions] = useState<SettingsAccountSession[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setSessions(await host.listAccountSessions()); setError(""); }
    catch (err) { setError(describeError(err)); }
  }, [host]);
  useEffect(() => { void load(); }, [load]);

  async function revoke(id: string) {
    setBusy(id); setError("");
    try { await host.revokeAccountSession(id); await load(); await onChanged(); }
    catch (err) { setError(describeError(err)); }
    finally { setBusy(null); }
  }
  async function revokeOthers() {
    setBusy("others"); setError("");
    try { await host.revokeOtherAccountSessions(); await load(); await onChanged(); }
    catch (err) { setError(describeError(err)); }
    finally { setBusy(null); }
  }
  const others = sessions?.filter((s) => !s.current).length || 0;
  return (
    <Panel title="Where you're signed in"
      description="Active sessions for this account. End any you don't recognize."
      action={others > 0
        ? <button type="button" className={secondaryButton} disabled={busy === "others"} onClick={() => void revokeOthers()}>
            {busy === "others" ? "Signing out…" : `Sign out ${others} other${others === 1 ? "" : "s"}`}
          </button>
        : undefined}>
      <div className="rounded-xl border border-border/70">
        {sessions === null && !error && <p className="p-4 text-[11px] text-muted-foreground">Loading sessions…</p>}
        {sessions?.map((session) => (
          <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3 last:border-b-0">
            <div className="min-w-0">
              <p className="text-[12px] font-medium">
                {sessionLabel(session)}
                {session.current && <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] font-normal text-muted-foreground">This device</span>}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Active {formatWhen(session.lastActiveAt)} · started {formatWhen(session.createdAt)}
              </p>
            </div>
            {!session.current && (
              <button type="button" className={secondaryButton} disabled={busy === session.id} onClick={() => void revoke(session.id)}>
                {busy === session.id ? "Ending…" : "Sign out"}
              </button>
            )}
          </div>
        ))}
        {error && <div className="p-4"><Notice tone="error">{error}</Notice></div>}
      </div>
    </Panel>
  );
}

export function SettingsAccountPanel({ host, footer }: { host: SettingsAccountHost; footer?: ReactNode }) {
  const [overview, setOverview] = useState<SettingsAccountOverview | null>(null);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const load = useCallback(async () => {
    try { setOverview(await host.readAccount()); setError(""); }
    catch (err) { setError(describeError(err)); }
  }, [host]);
  useEffect(() => { void load(); }, [load]);

  if (error && !overview) {
    return <Panel title="Account"><div className="rounded-xl border border-border/70 p-4"><Notice tone="error">{error}</Notice>
      <button type="button" className={`${secondaryButton} mt-3`} onClick={() => void load()}>Try again</button></div></Panel>;
  }
  if (!overview) return <p className="py-5 text-[11px] text-muted-foreground">Loading your account…</p>;
  return (
    <>
      <ProfileForm key={JSON.stringify(overview.profile)} host={host} overview={overview} onSaved={load}/>
      <PasswordForm host={host} hasPassword={overview.security.hasPassword} onSaved={load}/>
      <BackupCodes host={host} overview={overview} onSaved={load}/>
      <Sessions host={host} onChanged={load}/>
      {footer}
      <Panel title="Sign out" description="End this session on this device.">
        <button type="button" className={secondaryButton} disabled={signingOut}
          onClick={() => { setSigningOut(true); void host.signOut().finally(() => setSigningOut(false)); }}>
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </Panel>
    </>
  );
}
