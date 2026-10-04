import type { NativeIdentityProvider } from "@/lib/desktop/native-auth";

const ICON = "size-5 shrink-0";

export function ProviderIcon({ provider }: { provider: NativeIdentityProvider }) {
  if (provider === "google") {
    return (
      <svg className={ICON} viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    );
  }
  if (provider === "github") {
    return (
      <svg className={ICON} viewBox="0 0 24 24" fill="#181717" aria-hidden="true">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.43 9.8 8.2 11.38.6.11.82-.26.82-.58 0-.29-.01-1.06-.01-2.08-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.2.08 1.83 1.23 1.83 1.23 1.07 1.83 2.81 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 013-.41c1.02.01 2.05.14 3 .41 2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.28 0 .32.21.69.83.57C20.57 21.79 24 17.3 24 12c0-6.63-5.37-12-12-12z" />
      </svg>
    );
  }
  return (
    <svg className={ICON} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#F6821F" d="M17.5 19H7a5 5 0 0 1-.6-9.96A6 6 0 0 1 17.9 9.5 4.8 4.8 0 0 1 17.5 19z" />
    </svg>
  );
}

const FRIENDLY: Record<string, string> = {
  identity_service_not_configured:
    "This build isn't connected to the AgentSam identity service. Update the app, or contact support if this persists.",
  identity_service_origin_invalid: "The identity service address is invalid. Update the app.",
  identity_service_origin_requires_https: "The identity service must use HTTPS. Update the app.",
  userinfo_failed: "Could not read your profile from the provider.",
  token_exchange_failed: "Could not complete sign-in with the provider.",
  desktop_identity_session_missing: "The provider sign-in completed, but the desktop session could not be restored.",
  native_login_not_pending: "This sign-in request is no longer active. Start sign-in again.",
  native_login_expired: "This sign-in request expired. Start sign-in again.",
  google_desktop_session_http_: "Google sign-in could not complete the desktop session.",
};

/** Human message for the UI; the raw code goes to the console for diagnostics. */
export function friendlyAuthError(raw: string): string {
  const code = (raw || "").trim();
  const key = Object.keys(FRIENDLY).find((k) => code.includes(k));
  if (key) {
    console.warn("[auth] sign-in error:", code);
    return FRIENDLY[key];
  }
  return code || "Sign-in failed. Please try again.";
}
