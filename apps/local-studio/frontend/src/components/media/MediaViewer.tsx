import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Maximize2, PanelRight, Trash2, X } from "lucide-react";
import { KindGlyph } from "./MediaGrid";
import {
  classifyAsset,
  formatBytes,
  formatDuration,
  identityLabel,
  previewUrl,
  providerLabel,
  providerOf,
  type MediaAsset,
} from "./media-utils";

export function MediaViewer({
  asset,
  onClose,
  onPrev,
  onNext,
  onDelete,
}: {
  asset: MediaAsset;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onDelete: (asset: MediaAsset) => Promise<boolean>;
}) {
  const kind = classifyAsset(asset);
  const hosted = providerOf(asset) === "cf_images";
  const privateDelivery = Boolean(asset.meta?.require_signed_urls);
  const variants = hosted
    ? (Array.isArray(asset.meta?.variants) ? asset.meta.variants : []).filter((url): url is string => {
      if (typeof url !== "string") return false;
      try { return new URL(url).protocol === "https:"; } catch { return false; }
    })
    : [];
  const [chosenVariant, setChosenVariant] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<"storage" | "delivery" | "keys" | "sourcing">("storage");
  const preview = chosenVariant || previewUrl(asset);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setConfirming(false);
    setChosenVariant(null);
    setInspectorTab("storage");
  }, [asset.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && onPrev) onPrev();
      if (event.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  const rows: Array<[string, string | null]> = [
    ["Source", providerLabel(providerOf(asset))],
    ["Type", asset.mime_type || asset.content_type || kind],
    ["Size", formatBytes(asset.size_bytes) === "—" ? null : formatBytes(asset.size_bytes)],
    ["Dimensions", asset.width && asset.height ? `${asset.width} × ${asset.height}` : null],
    ["Duration", formatDuration(asset.duration_ms)],
    ["Bucket", asset.r2_bucket || null],
    ["Key", asset.r2_key || null],
    ["Image ID", asset.cloudflare_image_id || null],
    ["Stream UID", asset.cloudflare_stream_uid || null],
  ];

  return (
    <div className="agentsam-media-viewer" role="dialog" aria-modal="true" aria-label={asset.filename}>
      <header className="agentsam-media-viewer__bar">
        <button type="button" className="agentsam-media-icon" onClick={onClose} aria-label="Close viewer"><X size={16} /></button>
        <h2 title={asset.filename}>{asset.filename}</h2>
        <div className="agentsam-media-viewer__nav">
          <button type="button" className="agentsam-media-icon" onClick={onPrev} disabled={!onPrev} aria-label="Previous"><ChevronLeft size={16} /></button>
          <button type="button" className="agentsam-media-icon" onClick={onNext} disabled={!onNext} aria-label="Next"><ChevronRight size={16} /></button>
          <button
            type="button"
            className={`agentsam-media-icon${inspectorOpen ? " is-active" : ""}`}
            onClick={() => setInspectorOpen((v) => !v)}
            aria-label="Toggle details"
            aria-pressed={inspectorOpen}
          >
            <PanelRight size={16} />
          </button>
          {preview ? (
            <a className="agentsam-media-icon" href={preview} target="_blank" rel="noopener noreferrer" aria-label="Open selected media delivery">
              <Maximize2 size={16} />
            </a>
          ) : null}
        </div>
      </header>
      <div className="agentsam-media-viewer__body">
        <div className="agentsam-media-viewer__stage">
          {kind === "video" && providerOf(asset) === "local" && preview ? (
            <video src={preview} controls playsInline preload="metadata" aria-label={asset.filename} />
          ) : (kind === "image" || kind === "video") && preview ? (
            <img src={preview} alt={asset.filename} />
          ) : (
            <span className="agentsam-media-viewer__glyph"><KindGlyph kind={kind} size={56} /></span>
          )}
        </div>
        {inspectorOpen ? (
          <aside className="agentsam-media-viewer__aside">
            {hosted ? (
              <nav className="agentsam-media-viewer__tabs" aria-label="Hosted image settings">
                {(["storage", "delivery", "keys", "sourcing"] as const).map((tab) => (
                  <button key={tab} type="button" className={inspectorTab === tab ? "is-active" : undefined}
                    onClick={() => setInspectorTab(tab)} aria-current={inspectorTab === tab ? "page" : undefined}>
                    {tab === "sourcing" ? "Sourcing Kit" : tab[0].toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </nav>
            ) : null}
            {inspectorTab === "storage" || !hosted ? (
              <>
                <h3>Storage</h3>
                <p className="agentsam-media-viewer__identity">{identityLabel(asset)}</p>
                <dl>
                  {rows.filter(([, value]) => value).map(([label, value]) => (
                    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                  ))}
                </dl>
              </>
            ) : null}
            {hosted && inspectorTab === "delivery" ? (
              <section className="agentsam-media-viewer__detail">
                <h3>Delivery variants</h3>
                <p>Cloudflare serves these variants on demand. Selecting one changes only the preview, not the original image.</p>
                {privateDelivery ? (
                  <p role="status">Private image: use an authorized server-signed URL to deliver variants. No public URL is generated here.</p>
                ) : variants.length ? (
                  <div className="agentsam-media-viewer__variants">
                    {variants.map((url) => {
                      const name = new URL(url).pathname.split("/").pop() || "Variant";
                      return <button type="button" key={url} className={preview === url ? "is-active" : undefined}
                        onClick={() => setChosenVariant(url)}>{name}</button>;
                    })}
                  </div>
                ) : <p>No published delivery variants were returned for this image.</p>}
                {!privateDelivery && preview ? (
                  <button type="button" className="agentsam-media-btn" onClick={() => void navigator.clipboard?.writeText(preview)}>
                    Copy selected delivery URL
                  </button>
                ) : null}
              </section>
            ) : null}
            {hosted && inspectorTab === "keys" ? (
              <section className="agentsam-media-viewer__detail">
                <h3>Access & signing</h3>
                <p>{privateDelivery ? "This image requires signed delivery. Signing secrets stay server-side." :
                  "Public variants can be delivered without a signing token."}</p>
                <a className="agentsam-media-btn" href="/settings/storage">Storage & provider keys</a>
              </section>
            ) : null}
            {hosted && inspectorTab === "sourcing" ? (
              <section className="agentsam-media-viewer__detail">
                <h3>Sourcing Kit</h3>
                <p>Use this hosted image in Canvas, Product Studio, or a CMS component. Keep image identity and variant separate from the source file.</p>
                <button type="button" className="agentsam-media-btn"
                  onClick={() => void navigator.clipboard?.writeText(asset.cloudflare_image_id || asset.id)}>
                  Copy image ID
                </button>
                <a className="agentsam-media-btn" href="/settings/storage">Provider configuration</a>
              </section>
            ) : null}
            <div className="agentsam-media-viewer__actions">
              {preview ? <a className="agentsam-media-btn" href={preview} target="_blank" rel="noopener noreferrer">Open</a> : null}
              {preview && providerOf(asset) !== "local" ? (
                <button type="button" className="agentsam-media-btn" onClick={() => void navigator.clipboard?.writeText(preview)}>
                  Copy link
                </button>
              ) : null}
              {providerOf(asset) !== "local" ? <a className="agentsam-media-btn" href={`/admin/moviemode?import=${encodeURIComponent(asset.id)}`}>
                Use in MovieMode
              </a> : null}
            </div>
            {providerOf(asset) !== "local" ? <div className="agentsam-media-viewer__danger">
              {confirming ? (
                <>
                  <p>Delete this file from Cloudflare? This can’t be undone.</p>
                  <div>
                    <button
                      type="button"
                      className="agentsam-media-btn is-danger"
                      disabled={deleting}
                      onClick={async () => {
                        setDeleting(true);
                        const ok = await onDelete(asset);
                        setDeleting(false);
                        if (!ok) setConfirming(false);
                      }}
                    >
                      {deleting ? <Loader2 size={14} className="agentsam-media-spin" /> : <Trash2 size={14} />} Delete permanently
                    </button>
                    <button type="button" className="agentsam-media-btn" disabled={deleting} onClick={() => setConfirming(false)}>Cancel</button>
                  </div>
                </>
              ) : (
                <button type="button" className="agentsam-media-btn is-ghost-danger" onClick={() => setConfirming(true)}>
                  <Trash2 size={14} /> Delete
                </button>
              )}
            </div> : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
