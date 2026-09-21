import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Cloud, ExternalLink, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OAuthConnectionRecord } from "./types";

function formatDate(epoch: number | null | undefined) {
  if (!epoch) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(epoch * 1000));
}

export function IntegrationDrawer({
  open,
  connection,
  busy,
  onOpenChange,
  onConnect,
  onDisconnect,
}: {
  open: boolean;
  connection: OAuthConnectionRecord | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: () => void;
  onDisconnect: () => Promise<void>;
}) {
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const connected = connection?.status === "connected";
  const details = connection?.connection;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setConfirmDisconnect(false);
        onOpenChange(next);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/70 data-[state=closed]:opacity-0 data-[state=open]:opacity-100 motion-safe:transition-opacity motion-safe:duration-150" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-card shadow-hairline data-[state=closed]:translate-x-full data-[state=open]:translate-x-0 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out">
          <header className="flex items-start justify-between gap-4 border-b border-border p-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-accent shadow-hairline">
                <Cloud className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-lg font-medium tracking-tight">
                  Cloudflare
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                  Connection status and authorization details
                </DialogPrimitive.Description>
              </div>
            </div>
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Close details">
                <X className="size-4" aria-hidden="true" />
              </Button>
            </DialogPrimitive.Close>
          </header>

          <div className="flex-1 space-y-6 overflow-y-auto p-5">
            <section className="rounded-2xl bg-muted p-4 shadow-hairline">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Connection
                  </p>
                  <p className="mt-2 text-base font-medium text-foreground">
                    {connected ? "Connected" : "Not connected"}
                  </p>
                </div>
                <span
                  className={
                    connected
                      ? "rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent"
                      : "rounded-full bg-card px-2.5 py-1 text-xs text-muted-foreground shadow-hairline"
                  }
                >
                  {connected ? "Active" : "Available"}
                </span>
              </div>
            </section>

            {details ? (
              <section aria-labelledby="cloudflare-details-heading">
                <h3 id="cloudflare-details-heading" className="text-sm font-medium text-foreground">
                  Authorization details
                </h3>
                <dl className="mt-3 divide-y divide-border rounded-2xl bg-muted px-4 shadow-hairline">
                  <div className="flex items-start justify-between gap-4 py-3">
                    <dt className="text-sm text-muted-foreground">Account ID</dt>
                    <dd className="max-w-56 break-all text-right font-mono text-xs text-foreground">
                      {details.cloudflare_account_id || "Selected during consent"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-sm text-muted-foreground">Granted scopes</dt>
                    <dd className="text-sm tabular-nums text-foreground">{details.scopes.length}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-sm text-muted-foreground">Updated</dt>
                    <dd className="text-right text-sm text-foreground">{formatDate(details.updated_at)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-sm text-muted-foreground">Expires</dt>
                    <dd className="text-right text-sm text-foreground">{formatDate(details.expires_at)}</dd>
                  </div>
                </dl>
              </section>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Connecting opens Cloudflare’s consent screen. Local Studio stores the returned tokens
                encrypted with this deployment’s own vault key.
              </p>
            )}
          </div>

          <footer className="border-t border-border p-5">
            {connected ? (
              confirmDisconnect ? (
                <div className="space-y-3 rounded-xl bg-destructive/10 p-3">
                  <p className="text-sm text-foreground">
                    Disconnect this Cloudflare account from Local Studio?
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDisconnect(false)}>
                      Cancel
                    </Button>
                    <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => void onDisconnect()}>
                      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                      Confirm disconnect
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setConfirmDisconnect(true)}>
                    Disconnect
                  </Button>
                  <Button type="button" onClick={onConnect} disabled={busy}>
                    Reconnect
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              )
            ) : (
              <Button type="button" className="w-full" onClick={onConnect} disabled={busy || !connection?.available}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {busy ? "Opening Cloudflare…" : "Connect Cloudflare"}
              </Button>
            )}
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
