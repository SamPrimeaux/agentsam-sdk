import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { invokeIdentity, secureStoreGet } from "@/lib/desktop/tauri";

type LocalIdentityStatus = {
  ok?: boolean;
  authenticated?: boolean;
  user?: {
    id?: string;
    email?: string;
    display_name?: string | null;
    displayName?: string | null;
  } | null;
  error?: string;
};

const SESSION_ACCOUNT = "identity_session";

async function readLocalIdentityStatus(): Promise<LocalIdentityStatus> {
  const sessionId = await secureStoreGet(SESSION_ACCOUNT);
  if (!sessionId) return { ok: true, authenticated: false, user: null };
  return (await invokeIdentity({
    op: "status",
    session_id: sessionId,
  })) as LocalIdentityStatus;
}

export function DesktopIdentityPortal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [status, setStatus] = useState<LocalIdentityStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void readLocalIdentityStatus()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onMessage(event: MessageEvent) {
      const data = event.data as
        | {
            type?: string;
            authenticated?: boolean;
            user?: LocalIdentityStatus["user"];
            provider?: string;
          }
        | undefined;
      if (!data?.type) return;

      if (data.type === "agentsam:desktop-identity" && data.authenticated) {
        setStatus({ ok: true, authenticated: true, user: data.user || null });
        setMessage("Signed in. Your account session is stored in the system secure credential store.");
        window.setTimeout(() => onOpenChange(false), 500);
        return;
      }

      if (data.type === "agentsam:desktop-provider-request") {
        const label = data.provider
          ? `${data.provider.charAt(0).toUpperCase()}${data.provider.slice(1)}`
          : "Provider";
        setMessage(
          `${label} is an optional provider connection. Provider authorization is separate from your AgentSam account session and will use its provider-specific connection flow.`,
        );
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(90vh,860px)] w-[min(94vw,1080px)] max-w-none overflow-hidden border-border bg-[#050508] p-0 text-foreground">
        <DialogTitle className="sr-only">AgentSam identity</DialogTitle>
        <DialogDescription className="sr-only">
          Portable Local Studio identity powered by the packaged AgentSam identity system.
        </DialogDescription>

        {status?.authenticated ? (
          <div className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-full border border-emerald-500/30 bg-black/60 px-3 py-1.5 text-xs text-emerald-300 backdrop-blur">
            <CheckCircle2 className="size-3.5" />
            {status.user?.displayName || status.user?.display_name || status.user?.email || "Account session"}
          </div>
        ) : null}

        <iframe
          title="AgentSam sign in"
          src="/auth/login.html?desktop=1&next=/agentsam"
          className="h-full w-full border-0 bg-[#050508]"
          allow="clipboard-read; clipboard-write"
        />

        {message ? (
          <div
            className="absolute bottom-4 left-1/2 z-20 max-w-[min(90%,720px)] -translate-x-1/2 rounded-lg border border-white/10 bg-black/80 px-4 py-2 text-center text-xs text-white/75 shadow-xl backdrop-blur"
            role="status"
          >
            {message}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
