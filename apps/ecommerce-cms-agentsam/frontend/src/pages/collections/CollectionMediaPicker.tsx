import { useEffect, useState } from "react";
import StudioIcon from "../products/StudioIcon";
import { collectionsApi } from "./api";
import type { MediaAsset } from "./model";
import { safeMediaUrl } from "./model";

interface Props { title: string; open: boolean; onClose: () => void; onSelect: (asset: MediaAsset) => void }
export default function CollectionMediaPicker({ title, open, onClose, onSelect }: Props) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    let live = true;
    queueMicrotask(()=>{if(live){setBusy(true);setError("");}});
    const handle = window.setTimeout(() => {
      collectionsApi.media(query.trim()).then(items => { if (live) setAssets(items.filter(a => safeMediaUrl(a.url))); })
        .catch(e => { if (live) setError(e instanceof Error ? e.message : "Media unavailable"); })
        .finally(() => { if (live) setBusy(false); });
    }, query ? 240 : 0);
    return () => { live = false; clearTimeout(handle); };
  }, [open, query]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); previous?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  const chosen = assets.find(a => a.id === selected);
  return <div className="cs-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="cs-dialog cs-media-dialog" role="dialog" aria-modal="true" aria-label={title}>
      <header className="cs-dialog-head">
        <div><span className="cs-overline">Asset library</span><h2>{title}</h2><p>Choose an existing image. No URLs to copy or paste.</p></div>
        <button className="cs-icon-button" type="button" aria-label="Close media picker" onClick={onClose}><StudioIcon name="close" /></button>
      </header>
      <div className="cs-input-search"><StudioIcon name="search" size={16}/><input aria-label="Search media" value={query} placeholder="Search your uploaded images" onChange={e => setQuery(e.target.value)} /></div>
      {error && <div className="cs-alert error" role="alert">{error}</div>}
      <div className="cs-media-grid">
        {busy ? <p className="cs-muted">Loading media…</p> : assets.length ? assets.map(a =>
          <button key={a.id} type="button" className={`cs-media-tile ${selected === a.id ? "selected" : ""}`} onClick={() => setSelected(a.id)}>
            <img src={safeMediaUrl(a.url)} alt={a.filename} loading="lazy" />
            <span title={a.filename}>{a.filename}</span>
            {selected === a.id && <span className="cs-media-check"><StudioIcon name="check" size={14}/></span>}
          </button>
        ) : <p className="cs-muted">No matching images. Add assets in Content → Media Library.</p>}
      </div>
      <footer className="cs-dialog-foot">
        <a href="/admin/content">Open media library</a>
        <div><button className="cs-button" onClick={onClose} type="button">Cancel</button><button className="cs-button primary" type="button" disabled={!chosen} onClick={() => { if (chosen) { onSelect(chosen); onClose(); } }}>Use selected image</button></div>
      </footer>
    </section>
  </div>;
}
