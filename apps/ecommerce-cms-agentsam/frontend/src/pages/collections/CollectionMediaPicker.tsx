import { useEffect, useState } from "react";
import StudioIcon from "../products/StudioIcon";
import { collectionsApi } from "./api";
import { AdminApiError } from "../../lib/api";
import type { MediaPageRequest, MediaProvider } from "./api";
import type { MediaAsset } from "./model";
import { safeMediaUrl } from "./model";

interface Props { title: string; open: boolean; onClose: () => void; onSelect: (asset: MediaAsset) => void }
const firstPage = (): MediaPageRequest => ({ page: 1, cursor: null });
function mergeAssets(previous: MediaAsset[], incoming: MediaAsset[]) {
  const assets = new Map(previous.map(asset => [String(asset.id), asset]));
  for (const asset of incoming) {
    if (safeMediaUrl(asset.url)) assets.set(String(asset.id), asset);
  }
  return [...assets.values()];
}
export default function CollectionMediaPicker({ title, open, onClose, onSelect }: Props) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState<MediaProvider>("default");
  const [hosted, setHosted] = useState(false);
  const [request, setRequest] = useState<MediaPageRequest>(firstPage);
  const [next, setNext] = useState<MediaPageRequest | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [chosen, setChosen] = useState<MediaAsset | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  function resetListing() {
    setAssets([]); setNext(null); setTotal(null); setBusy(true);
    setError(""); setRequest(firstPage()); setRefresh(value => value + 1);
  }
  function changeProvider(value: MediaProvider) {
    if (value === provider) return;
    setChosen(null); setUploadError(""); setProvider(value); resetListing();
  }
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      setBusy(true); setError("");
      try {
        const result = await collectionsApi.media(query.trim(), request, provider, controller.signal);
        if (controller.signal.aborted) return;
        if (result.hosted) setHosted(true);
        setAssets(previous => mergeAssets(request.page === 1 ? [] : previous, result.assets));
        setNext(result.next);
        setTotal(result.total);
        // Cloudflare Images V2 has cursor traversal but no filename-search
        // parameter. Search every returned page, not just the first 60.
        if (query.trim() && result.cursorSearch && result.next) {
          setRequest(result.next);
        } else {
          setBusy(false);
        }
      } catch (caught) {
        if (controller.signal.aborted) return;
        const message = caught instanceof Error ? caught.message : "Media unavailable";
        if (caught instanceof AdminApiError && caught.status === 403) {
          setHosted(true);
          const missing = caught.details?.missing_scopes;
          const reason = missing?.length ? "Missing Cloudflare permissions: " + missing.join(", ") : caught.details?.message || message;
          setError(provider === "default" ? reason + " Reconnect Cloudflare or choose Registered media, then retry." : reason);
        } else {
          if (/cloudflare|oauth|account_selection/i.test(message)) setHosted(true);
          setError(message);
        }
        setBusy(false);
      }
    }, query.trim() && request.page === 1 ? 240 : 0);
    return () => { controller.abort(); clearTimeout(handle); };
  }, [open, query, request, provider, refresh]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); previous?.focus?.(); };
  }, [open, onClose]);

  function loadMore() {
    if (busy || error || !next) return;
    setBusy(true); setRequest(next);
  }
  async function upload(file?: File) {
    if (!file || uploading) return;
    if (!file.type.startsWith("image/")) { setUploadError("Choose an image file."); return; }
    setUploading(true); setUploadError("");
    try {
      const asset = await collectionsApi.uploadMedia(file, provider);
      if (!safeMediaUrl(asset.url)) throw new Error("The new image has no selectable delivery URL.");
      setChosen(asset);
      setQuery("");
      resetListing();
    } catch (caught) {
      setUploadError(caught instanceof Error ? caught.message : "Image upload failed.");
    } finally { setUploading(false); }
  }
  if (!open) return null;
  return <div className="cs-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="cs-dialog cs-media-dialog" role="dialog" aria-modal="true" aria-label={title}>
      <header className="cs-dialog-head">
        <div><span className="cs-overline">Asset library</span><h2>{title}</h2><p>Browse, search or add images without leaving this collection.</p></div>
        <button className="cs-icon-button" type="button" aria-label="Close media picker" onClick={onClose}><StudioIcon name="close" /></button>
      </header>
      <div className="cs-media-toolbar">
        <div className="cs-input-search"><StudioIcon name="search" size={16}/><input aria-label="Search media" value={query} placeholder="Search your media library" onChange={e => { setQuery(e.target.value); resetListing(); }} /></div>
        <label className="cs-button cs-media-upload">
          {uploading ? "Uploading…" : "Add image"}
          <input type="file" accept="image/*" aria-label="Upload image" disabled={uploading} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void upload(file); }} />
        </label>
        <button type="button" className="cs-button" disabled={uploading} onClick={resetListing}>Refresh</button>
      </div>
      {hosted && <div className="cs-media-sources">
        <button type="button" className="cs-button" aria-pressed={provider === "default"} onClick={() => changeProvider("default")}>Cloudflare Images</button>
        <button type="button" className="cs-button" aria-pressed={provider === "inneranimalmedia"} onClick={() => changeProvider("inneranimalmedia")}>Registered media</button>
        <a href="/api/connections/cloudflare/start?packs=media%2Cdata&return_to=%2Fmedia" target="_blank" rel="noopener noreferrer">Connect Cloudflare (new tab)</a>
      </div>}
      {error && <div className="cs-alert error" role="alert">{error} <button type="button" className="cs-button" onClick={() => { setBusy(true); setError(""); setRefresh(value => value + 1); }}>Retry</button></div>}
      {uploadError && <div className="cs-alert error" role="alert">{uploadError}</div>}
      <div className="cs-media-grid" onScroll={e => { const node = e.currentTarget; if (node.scrollHeight - node.scrollTop - node.clientHeight < 180) loadMore(); }}>
        {assets.map(a => {
          const selected = chosen !== null && String(chosen.id) === String(a.id);
          return <button key={a.id} type="button" aria-pressed={selected} className={`cs-media-tile ${selected ? "selected" : ""}`} onClick={() => setChosen(a)}>
            <img src={safeMediaUrl(a.url)} alt={a.filename} loading="lazy" />
            <span title={a.filename}>{a.filename}</span>
            {selected && <span className="cs-media-check"><StudioIcon name="check" size={14}/></span>}
          </button>;
        })}
        {!busy && !error && assets.length === 0 && !next && <p className="cs-muted cs-media-page-end">No matching images. Try another search or add an image.</p>}
        {busy && <p role="status" className="cs-muted cs-media-page-end">{query.trim() ? "Searching media…" : "Loading media…"}</p>}
        {!busy && !error && next && <button className="cs-button cs-media-page-end" type="button" onClick={loadMore}>Load more images</button>}
      </div>
      <footer className="cs-dialog-foot">
        <div className="cs-media-count" aria-live="polite">
          {assets.length} {query.trim() ? "matches" : "images loaded"}{total !== null ? ` · ${total} results` : ""}{next || busy ? " · more available or loading" : ""}
          {chosen && <span className="cs-media-selected-name" title={chosen.filename}>Selected: {chosen.filename}</span>}
        </div>
        <div><button className="cs-button" onClick={onClose} type="button">Cancel</button><button className="cs-button primary" type="button" disabled={!chosen || uploading} onClick={() => { if (chosen) { onSelect(chosen); onClose(); } }}>Use selected image</button></div>
      </footer>
    </section>
  </div>;
}
