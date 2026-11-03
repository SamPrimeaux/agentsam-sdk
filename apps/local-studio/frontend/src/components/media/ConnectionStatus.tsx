import { useEffect, useRef, useState } from "react";
import { Cloud } from "lucide-react";
import { formatCount, type CfFamily, type CfResources } from "./media-utils";

function familyText(fam: CfFamily | undefined, detail?: string) {
  const status = fam?.status || "unknown";
  if (status === "connected") return detail || "Connected";
  if (status === "empty") return "Empty";
  if (status === "needs_scope") return "Permission required";
  if (status === "unavailable") return "Not enabled";
  if (status === "error") return fam?.error ? `Error · ${fam.error}` : "Provider error";
  if (status === "not_connected") return "Not connected";
  return status;
}

/** One compact status pill; the per-service detail lives in a popover instead of a permanent banner. */
export function ConnectionStatus({
  resources,
  bucketCount,
  connectUrl,
}: {
  resources: CfResources | null;
  bucketCount: number;
  connectUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const status = resources?.status || (resources ? "unknown" : "checking");
  const tone = status === "connected" || status === "empty" ? "ok"
    : status === "checking" ? "idle"
      : status === "not_connected" || status === "error" ? "bad" : "warn";
  const label = status === "checking" ? "Checking Cloudflare…"
    : status === "not_connected" ? "Cloudflare not connected"
      : status === "needs_scope" ? "Cloudflare · permissions needed"
        : status === "partial" ? "Cloudflare · partly available"
          : status === "error" ? "Cloudflare · error"
            : "Cloudflare connected";
  const account = resources?.account?.id;
  const missing = resources?.missing_scopes || [];

  return (
    <div className="agentsam-media-status" ref={rootRef}>
      <button
        type="button"
        className={`agentsam-media-status__pill is-${tone}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="agentsam-media-status__dot" aria-hidden="true" />
        <Cloud size={14} aria-hidden="true" />
        <span>{label}</span>
      </button>
      {open && resources ? (
        <div className="agentsam-media-status__panel" role="dialog" aria-label="Cloudflare connection">
          {account ? <p className="agentsam-media-status__account">Account <code>{account}</code></p> : null}
          <dl>
            <div><dt>R2</dt><dd>{familyText(resources.r2, `${formatCount(bucketCount) ?? 0} bucket${bucketCount === 1 ? "" : "s"}`)}</dd></div>
            <div><dt>Images</dt><dd>{familyText(resources.images, formatCount(resources.images?.count) ? `${formatCount(resources.images?.count)} images` : undefined)}</dd></div>
            <div><dt>Stream</dt><dd>{familyText(resources.stream, formatCount(resources.stream?.count) ? `${formatCount(resources.stream?.count)} videos` : undefined)}</dd></div>
          </dl>
          {missing.length ? <p className="agentsam-media-status__warn">Missing scopes: {missing.slice(0, 6).join(", ")}</p> : null}
          <a className="agentsam-media-btn" href={connectUrl}>
            {status === "not_connected" ? "Connect Cloudflare" : "Reconnect or expand scopes"}
          </a>
        </div>
      ) : null}
    </div>
  );
}
