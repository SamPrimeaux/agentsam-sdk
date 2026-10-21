import { useMemo, useState } from "react";
import type { ContentAsset, ContentKind, ContentQuery } from "@inneranimalmedia/agentsam-content";
import { useContentRuntime, useLibrary, useRuntimeCapabilities } from "./context.js";
import { fmtBytes, fmtDuration } from "./theme.js";
import { MediaDropzone } from "./MediaDropzone.js";

export interface ContentLibraryProps {
  onSelect?: (asset: ContentAsset) => void;
  selectedId?: string | null;
  initialView?: string;
  pageSize?: number;
  projectId?: string;
  brandId?: string;
  onAssetCreated?: (asset: ContentAsset, file: File) => void | Promise<void>;
}

const KINDS: Array<{ id: ContentKind | "all"; label: string }> = [
  { id: "all", label: "All types" },
  { id: "image", label: "Images" },
  { id: "video", label: "Videos" },
  { id: "model", label: "3D" },
  { id: "document", label: "Documents" },
  { id: "audio", label: "Audio" },
  { id: "font", label: "Fonts" },
];

const KIND_ICON: Record<string, string> = {
  image: "Image",
  video: "Video",
  model: "3D",
  audio: "Audio",
  document: "Document",
  font: "Font",
};

/** Account-scoped library. The host runtime remains the source of both assets and capabilities. */
export function ContentLibrary(props: ContentLibraryProps) {
  const runtime = useContentRuntime();
  const { capabilities: caps, error: capabilitiesError } = useRuntimeCapabilities();
  const [view, setView] = useState(props.initialView ?? "all");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<ContentKind | "all">("all");
  const [provider, setProvider] = useState("all");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const query = useMemo(() => {
    const next: Partial<ContentQuery> = { limit: props.pageSize ?? 48 };
    if (search.trim()) next.search = search.trim();
    if (kind !== "all") next.kind = kind;
    if (provider !== "all") next.provider = provider;
    return next;
  }, [search, kind, provider, props.pageSize]);
  const { assets, total, loading, loadingMore, hasMore, loadMore, error } = useLibrary(view, query);

  return (
    <section className="acs-library" aria-label="Content library">
      <header className="acs-library__toolbar">
        <div className="acs-collection-tabs" role="group" aria-label="Collections">
          {runtime.collections.map((collection) => (
            <button key={collection.id} type="button" aria-pressed={view === collection.id} onClick={() => setView(collection.id)}>
              {collection.label}
            </button>
          ))}
        </div>
        <label className="acs-search">
          <span className="acs-sr-only">Search content</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files" type="search" />
        </label>
        <label className="acs-filter">
          <span className="acs-sr-only">Filter by type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as ContentKind | "all")}>
            {KINDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="acs-filter">
          <span className="acs-sr-only">Filter by source</span>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="all">All sources</option>
            {(caps?.providers ?? []).map((item) => <option key={item.id} value={item.id}>{providerLabel(runtime.theme, item.id)}</option>)}
          </select>
        </label>
        <div className="acs-layout-toggle" role="group" aria-label="Layout">
          <button type="button" aria-pressed={layout === "grid"} onClick={() => setLayout("grid")}>Grid</button>
          <button type="button" aria-pressed={layout === "list"} onClick={() => setLayout("list")}>List</button>
        </div>
        <span className="acs-count" aria-live="polite">{loading ? "Loading" : `${total} ${total === 1 ? "item" : "items"}`}</span>
      </header>

      <div className="acs-capabilities" aria-label="Available providers">
        {(caps?.providers ?? []).map((item) => <span key={item.id}>{providerLabel(runtime.theme, item.id)}</span>)}
        {caps?.local.availability && <span>Local file access · {caps.local.availability}</span>}
        {!caps && !capabilitiesError && <span>Discovering available sources…</span>}
        {capabilitiesError && <span role="alert">Provider capabilities unavailable: {capabilitiesError}</span>}
      </div>

      <MediaDropzone onAssetCreated={props.onAssetCreated} projectId={props.projectId} brandId={props.brandId} />

      <div className="acs-library__body">
        {loading && assets.length === 0 && <div className="acs-state" role="status">Loading your content…</div>}
        {!loading && error && <div className="acs-state acs-state--error" role="alert">Could not load content. {error}</div>}
        {!loading && !error && assets.length === 0 && (
          <div className="acs-state">
            <strong>{search || kind !== "all" || provider !== "all" ? "No matching content" : "Your library is empty"}</strong>
            <span>{search || kind !== "all" || provider !== "all" ? "Try changing or clearing a filter." : "Content from connected and local sources will appear here."}</span>
          </div>
        )}
        {error && assets.length > 0 && <div className="acs-inline-error" role="alert">Some content could not be refreshed: {error}</div>}
        <div className={`acs-assets acs-assets--${layout}`}>
          {assets.map((asset) => (
            <AssetCard key={asset.id} asset={asset} selected={props.selectedId === asset.id} onSelect={() => props.onSelect?.(asset)} />
          ))}
        </div>
        {hasMore && <div className="acs-load-more"><button type="button" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more"}</button></div>}
      </div>
    </section>
  );
}

function AssetCard(props: { asset: ContentAsset; selected: boolean; onSelect: () => void }) {
  const runtime = useContentRuntime();
  const { asset } = props;
  const thumb = runtime.posterUrl(asset, 480);
  const liveCount = asset.usage.filter((u) => u.live && !u.detachedAt).length;
  const label = asset.semanticAlias ?? asset.title ?? asset.filename ?? asset.id;
  return (
    <article className={`acs-card${props.selected ? " is-selected" : ""}`}>
      <button type="button" className="acs-card__open" onClick={props.onSelect} aria-label={`Open ${label}`}>
        <span className="acs-card__thumb">
          {thumb ? <img src={thumb} alt="" loading="lazy" decoding="async" /> : <span>{KIND_ICON[asset.kind] ?? asset.kind}</span>}
          {asset.kind === "video" && asset.durationMs !== undefined && <small>{fmtDuration(asset.durationMs)}</small>}
        </span>
        <span className="acs-card__copy">
          <strong title={label}>{label}</strong>
          <span className="acs-card__meta"><i className="acs-card__state" data-state={asset.state}>● {asset.state}</i><i>{asset.providerRefs.map((ref) => providerLabel(runtime.theme, ref.provider)).join(", ") || "No location"}</i><i>{fmtBytes(asset.bytes)}</i></span>
          {liveCount > 0 && <span className="acs-card__usage">In use · {liveCount} live {liveCount === 1 ? "surface" : "surfaces"}</span>}
        </span>
      </button>
      <button type="button" className="acs-card__action" onClick={props.onSelect} aria-label={`Open details for ${label}`} title="Open details">Open</button>
    </article>
  );
}

function providerLabel(theme: Record<string, string>, providerId: string): string {
  return theme[`providerLabel.${providerId}`] ?? providerId;
}
