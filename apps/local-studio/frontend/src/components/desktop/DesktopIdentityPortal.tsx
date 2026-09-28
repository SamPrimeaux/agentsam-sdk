import { useEffect, useState } from "react";
import { Building2, CheckCircle2, Cloud, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { getTauriInvoke } from "@/lib/desktop/tauri";

type Provider = "google" | "cloudflare" | "inneranimalmedia";
type DesktopAuthStatus = {
  authenticated: boolean;
  provider?: string | null;
  message: string;
};

export function DesktopIdentityPortal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, setPending] = useState<Provider | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<DesktopAuthStatus | null>(null);

  useEffect(() => {
    if (!open) return;
    const invoke = getTauriInvoke();
    if (!invoke) return;
    let active = true;
    void invoke("desktop_auth_status", {
      req: { app_id: "local-studio", studio_origin: "" },
    }).then((value) => {
      if (active) setStatus(value as DesktopAuthStatus);
    }).catch((error) => {
      if (active) setMessage(error instanceof Error ? error.message : String(error));
    });
    return () => { active = false; };
  }, [open]);

  async function signIn(provider: Provider) {
    const invoke = getTauriInvoke();
    if (!invoke) {
      setMessage("Desktop identity is available in the installed Local Studio app.");
      return;
    }
    const command =
      provider === "google"
        ? "start_google_desktop_login"
        : provider === "cloudflare"
          ? "start_cloudflare_oauth_login"
          : "start_iam_oauth_login";
    setPending(provider);
    setMessage(null);
    try {
      const result = (await invoke(command, {
        req: { app_id: "local-studio", studio_origin: "" },
      })) as { access_token_present?: boolean; provider?: string };
      setStatus({ authenticated: true, provider: result.provider || provider, message: "signed_in" });
      setMessage(
        result.access_token_present
          ? "Signed in. Your account token is stored in the system keychain."
          : "Continue in your browser; Local Studio remains available offline.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border bg-background text-foreground">
        <div className="space-y-2">
          <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-card">
            <span className="text-lg font-semibold">A</span>
          </div>
          <DialogTitle>AgentSam Identity</DialogTitle>
          <DialogDescription>
            Sign in without blocking local files, SQLite, terminals, or agentsamd.
          </DialogDescription>
        </div>
        <div className="grid gap-3 py-2">
          {status?.authenticated ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              <CheckCircle2 className="size-4" />
              Desktop session restored from Keychain
              <span className="ml-auto font-mono text-xs">{status.provider}</span>
            </div>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            className="h-11 justify-start gap-3"
            disabled={pending !== null}
            onClick={() => void signIn("google")}
          >
            {pending === "google" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Sign in with Google
            <span className="ml-auto font-mono text-xs text-muted-foreground">desktop PKCE</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-11 justify-start gap-3"
            disabled={pending !== null}
            onClick={() => void signIn("cloudflare")}
          >
            {pending === "cloudflare" ? <Loader2 className="size-4 animate-spin" /> : <Cloud className="size-4" />}
            Sign in with Cloudflare
            <span className="ml-auto font-mono text-xs text-muted-foreground">offline access</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-11 justify-start gap-3"
            disabled={pending !== null}
            onClick={() => void signIn("inneranimalmedia")}
          >
            {pending === "inneranimalmedia" ? <Loader2 className="size-4 animate-spin" /> : <Building2 className="size-4" />}
            Sign in with InnerAnimalMedia
            <span className="ml-auto font-mono text-xs text-muted-foreground">IAM</span>
          </Button>
        </div>
        {message ? <p className="text-sm text-muted-foreground" role="status">{message}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
