import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  validateFinancialAuthorizationUrl,
  type FinancialAuthorizationHandoff,
  type FinancialConnectionProvider,
} from "../provider-connections.js";

export type FinancialProviderConnectFlowProps = {
  open: boolean;
  onClose: () => void;
  /** No default provider names: the authenticated host supplies the discovery result. */
  providers: readonly FinancialConnectionProvider[];
  /** Calls an authenticated host endpoint to mint a short-lived provider authorization URL. */
  onAuthorize?: (provider: FinancialConnectionProvider) => Promise<FinancialAuthorizationHandoff>;
  /** Optional host-managed details screen for already-linked providers. */
  onManage?: (provider: FinancialConnectionProvider) => void;
  heading?: string;
  /** Override for navigation tests or embedded/native runtimes. */
  navigate?: (url: string) => void;
};

type Screen = "providers" | "review";
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function FinancialProviderConnectFlow({
  open, onClose, providers, onAuthorize, onManage, heading = "Financial connections", navigate,
}: FinancialProviderConnectFlowProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("providers");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  onCloseRef.current = onClose;

  const selected = providers.find((provider) => provider.id === selectedId);
  const canAuthorize = !!selected && selected.status !== "connected" && selected.status !== "unavailable" && !!onAuthorize;
  const canManage = !!selected && selected.status === "connected" && !!onManage;

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setScreen("providers");
      setError(null);
      setBusy(false);
      return;
    }
    if (typeof document === "undefined") return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      } else if (event.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
          .filter((element) => element.getClientRects().length > 0);
        if (!focusable.length) { event.preventDefault(); return; }
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        } else if (!dialogRef.current.contains(document.activeElement)) {
          event.preventDefault(); first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  function choose(provider: FinancialConnectionProvider) {
    if (provider.status === "unavailable" || busy) return;
    setSelectedId(provider.id);
    setError(null);
    setScreen("review");
  }

  async function authorize() {
    if (!selected || !canAuthorize || busy || !onAuthorize) return;
    setBusy(true);
    setError(null);
    try {
      const handoff = await onAuthorize(selected);
      const url = validateFinancialAuthorizationUrl(handoff.authorizationUrl,
        typeof window !== "undefined" ? window.location.href : undefined);
      if (navigate) navigate(url);
      else if (typeof window !== "undefined") window.location.assign(url);
      else throw new Error("Browser navigation is not available.");
      // A redirect is not proof of connection. The host verifies status after callback.
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the connection.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const content = (
    <div className="fin-connect-overlay" onPointerDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <div className="fin-connect-dialog" ref={dialogRef} role="dialog" aria-modal="true"
        aria-labelledby={titleId} aria-describedby={descriptionId}>
        <div className="fin-connect-handle" aria-hidden="true"><span /></div>
        <header className="fin-connect-header">
          <div className="fin-connect-heading">
            {screen === "review" && <button type="button" className="fin-connect-back"
              onClick={() => { setScreen("providers"); setError(null); }} disabled={busy}
              aria-label="Back to providers">←</button>}
            <div>
              <h2 id={titleId}>{screen === "review" ? (selected?.name ?? heading) : heading}</h2>
              <p id={descriptionId}>{screen === "review"
                ? "Review this connection before continuing."
                : "Choose which service to link to this workspace."}</p>
            </div>
          </div>
          <button ref={closeRef} className="fin-connect-close" type="button"
            aria-label="Close connections" onClick={onClose} disabled={busy}>×</button>
        </header>

        <div className="fin-connect-body">
          {screen === "providers" ? (
            providers.length ? <ul className="fin-connect-providers">
              {providers.map((provider) => {
                const disabled = provider.status === "unavailable";
                return <li key={provider.id}>
                  <button type="button" className="fin-connect-provider" disabled={disabled}
                    onClick={() => choose(provider)}>
                    <span className="fin-connect-mark" aria-hidden="true">{provider.name.slice(0, 2).toUpperCase()}</span>
                    <span className="fin-connect-provider-text">
                      <strong>{provider.name}</strong>
                      <small>{provider.description || provider.category || "Financial service"}</small>
                      {provider.statusDetail && <small>{provider.statusDetail}</small>}
                    </span>
                    <span className={"fin-connect-status fin-connect-status-" + provider.status}>
                      {provider.status === "connected" ? "Connected" :
                        provider.status === "action_required" ? "Needs attention" :
                        provider.status === "unavailable" ? "Unavailable" : "Connect"}
                    </span>
                  </button>
                </li>;
              })}
            </ul> : <div className="fin-connect-empty">
              <h3>No connection options yet</h3>
              <p>Your workspace has not returned any supported financial providers.</p>
            </div>
          ) : selected ? (
            <div className="fin-connect-review">
              <div className="fin-connect-provider-summary">
                <span className="fin-connect-mark" aria-hidden="true">{selected.name.slice(0, 2).toUpperCase()}</span>
                <div><strong>{selected.name}</strong><p>{selected.description || selected.category || "Financial service"}</p></div>
              </div>
              <h3>{selected.status === "connected" ? "Connection status" : "What this connection allows"}</h3>
              {selected.status === "connected" ? (
                <p className="fin-connect-note">This service is marked connected by your workspace. Manage it through your provider or workspace settings.</p>
              ) : (
                <>
                  {selected.permissions?.length ? <ul className="fin-connect-permissions">
                    {selected.permissions.map((permission) => <li key={permission}>{permission}</li>)}
                  </ul> : <p className="fin-connect-note">
                    Your provider will show the exact access being requested before you approve.
                  </p>}
                  <p className="fin-connect-note">Authorization happens with the provider. AgentSam should not ask for your payment credentials or provider password here.</p>
                </>
              )}
              {error && <p className="fin-connect-error" role="alert">{error}</p>}
            </div>
          ) : <p role="status">This provider is no longer available.</p>}
        </div>
        <footer className="fin-connect-footer">
          {screen === "providers" ? <button className="fin-connect-secondary" type="button"
            onClick={onClose}>Done</button> : (
            <>
              <button className="fin-connect-secondary" type="button"
                disabled={busy} onClick={() => { setScreen("providers"); setError(null); }}>Back</button>
              {canManage ? <button className="fin-connect-primary" type="button"
                onClick={() => onManage?.(selected!)}>Manage connection</button>
                : <button className="fin-connect-primary" type="button" disabled={!canAuthorize || busy}
                  onClick={authorize}>{busy ? "Opening provider…" : selected?.status === "action_required"
                    ? "Reconnect securely" : "Continue securely"}</button>}
            </>
          )}
        </footer>
      </div>
    </div>
  );
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
