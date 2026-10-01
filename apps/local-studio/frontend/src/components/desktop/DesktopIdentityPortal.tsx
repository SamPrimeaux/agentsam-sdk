import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  beginNativeLogin,
  listenForNativeIdentityCallbacks,
  logoutNativeSession,
  restoreNativeSession,
  type NativeIdentityProvider,
  type NativeIdentityStatus,
} from "@/lib/desktop/native-auth";
import { ProviderIcon, friendlyAuthError } from "./ProviderPresentation";

const PROVIDERS: Array<{ id: NativeIdentityProvider; label: string }> = [
  { id: "google", label: "Continue with Google" },
  { id: "github", label: "Continue with GitHub" },
  { id: "cloudflare", label: "Continue with Cloudflare" },
];

function userLabel(status: NativeIdentityStatus | null): string {
  return (
    status?.user?.displayName ||
    status?.user?.display_name ||
    status?.user?.email ||
    "AgentSam account"
  );
}

export function DesktopIdentityPortal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [status, setStatus] = useState<NativeIdentityStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    void listenForNativeIdentityCallbacks(
      (nextStatus) => {
        if (!active) return;
        setStatus(nextStatus);
        setBusy(null);
        setMessage("Signed in. Your desktop session is stored in the system secure credential store.");
        window.setTimeout(() => onOpenChange(false), 650);
      },
      (error) => {
        if (!active) return;
        setBusy(null);
        setMessage(friendlyAuthError(error.message));
      },
    )
      .then((dispose) => {
        if (!active) dispose();
        else unlisten = dispose;
      })
      .catch(() => {
        // Hosted/browser surfaces do not expose Tauri events.
      });

    return () => {
      active = false;
      unlisten?.();
    };
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setMessage(null);
    void restoreNativeSession()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((error) => {
        if (active) {
          setStatus({ ok: false, authenticated: false, user: null });
          setMessage(friendlyAuthError(error instanceof Error ? error.message : String(error)));
        }
      });
    return () => {
      active = false;
    };
  }, [open]);

  async function startLogin(provider: NativeIdentityProvider) {
    setBusy(provider);
    setMessage("Opening your default browser. Return here after sign-in completes.");
    try {
      const result = await beginNativeLogin(provider);
      if (result) {
        setStatus(result);
        setBusy(null);
        setMessage("Signed in. Your desktop session is stored in the system secure credential store.");
        window.setTimeout(() => onOpenChange(false), 650);
      }
    } catch (error) {
      setBusy(null);
      setMessage(friendlyAuthError(error instanceof Error ? error.message : String(error)));
    }
  }

  async function signOut() {
    setBusy("logout");
    setMessage(null);
    try {
      await logoutNativeSession();
      setStatus({ ok: true, authenticated: false, user: null });
      setMessage("Signed out and removed the desktop session from the secure credential store.");
    } catch (error) {
      setStatus({ ok: true, authenticated: false, user: null });
      setMessage(
        `Local credentials were cleared, but session revocation reported: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        portalToBody
        className="w-[min(92vw,460px)] max-w-none overflow-hidden border border-border bg-card p-0 text-card-foreground shadow-2xl"
      >
        <div className="border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <img src="/brand/agentsam-mark.svg" alt="" className="size-10 rounded-xl bg-[#12141a] p-2" />
            <DialogTitle className="text-base font-semibold">AgentSam account</DialogTitle>
          </div>
          <DialogDescription className="mt-1 text-sm leading-5 text-muted-foreground">
            Sign in through your system browser. Provider authorization such as Cloudflare resource
            access remains a separate grant from your AgentSam account session.
          </DialogDescription>
        </div>

        <div className="space-y-4 px-6 py-6">
          {status?.authenticated ? (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full border border-border bg-background p-2">
                  <CheckCircle2 className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{userLabel(status)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Restored from the OS secure credential store and verified against the identity
                    service.
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                className="mt-4 w-full justify-center"
                disabled={busy !== null}
                onClick={() => void signOut()}
              >
                {busy === "logout" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <LogOut className="size-4" />
                )}
                Sign out
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                <div>
                  <div className="text-sm font-medium">Signed out</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    The OAuth handoff is single-use and PKCE-bound. Session identifiers never travel
                    in the deep-link URL.
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                {PROVIDERS.map((provider) => (
                  <Button
                    key={provider.id}
                    variant="outline"
                    className="h-12 w-full justify-start gap-3 rounded-xl border border-white/20 bg-white text-slate-900 shadow-sm hover:bg-white/90 hover:text-slate-900 disabled:opacity-60"
                    disabled={busy !== null}
                    onClick={() => void startLogin(provider.id)}
                  >
                    <ProviderIcon provider={provider.id} />
                    <span className="flex-1 text-left font-medium">{provider.label}</span>
                    {busy === provider.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ExternalLink className="size-4" />
                    )}
                  </Button>
                ))}
              </div>
            </>
          )}

          {message ? (
            <div
              className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
              role="status"
            >
              {message}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
