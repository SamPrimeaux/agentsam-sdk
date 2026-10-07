import { useMemo, useState } from "react";
import type { ContentAsset } from "@inneranimalmedia/agentsam-content";
import { useContentRuntime, useLibrary, useRuntimeCapabilities } from "./context.js";
import { fmtBytes, fmtDuration, stateColor, styles, tokens } from "./theme.js";
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

const KIND_ICON: Record<string, string> = {
  image: "🖼",
  video: "🎬",
  model: "🧊",
  audio: "🎧",
  document: "📄",
  font: "🔤",
};

/**
 * Library grid. The grid path is manifest → viewport thumbnails →
 * preview derivative → original only on demand: cards render poster/
 * thumbnail URLs only, never source media and never live players.
 *
 * Provider / intelligence chrome comes from runtime.capabilities() —
 * never hardcoded R2|Images|Drive|Vectorize tabs.
 */
export function ContentLibrary(props: ContentLibraryProps) {
  const runtime = useContentRuntime();
  const caps = useRuntimeCapabilities();
  const [view, setView] = useState(props.initialView ?? "all");
  const [search, setSearch] = useState("");
  const query = useMemo(
    () => ({ search: search || undefined, limit: props.pageSize ?? 100 }),
    [search, props.pageSize],
  );
  const { assets, total, loading, loadingMore, hasMore, loadMore } = useLibrary(view, query);

  const providerLabels = caps?.providers.map((p) => p.id).join(" · ") || "providers…";
  const localLabel =
    caps?.local.availability === "available"
      ? "local ready"
      : caps?.local.availability === "attachable"
        ? "local attachable"
        : "local unavailable";
  const knowledgeLabel = caps?.knowledge.backends?.length
    ? caps.knowledge.backends.join(", ")
    : caps?.knowledge.search
      ? "knowledge on"
      : "knowledge off";

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, minHeight: 0 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${tokens.border}`, flexWrap: "wrap" }}>
        {runtime.collections.map((c) => (
          <button
            key={c.id}
            onClick={() => setView(c.id)}
            style={{
              ...styles.button,
              background: view === c.id ? tokens.accent : styles.button.background,
              color: view === c.id ? "#fff" : tokens.text,
              borderColor: view === c.id ? tokens.accent : tokens.border,
            }}
          >
            {c.label}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search assets…"
          style={{
            marginLeft: "auto",
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${tokens.border}`,
            background: tokens.panelAlt,
            color: tokens.text,
            minWidth: 180,
          }}
        />
        <span style={{ color: tokens.textDim, fontSize: 12 }}>
          {loading
            ? "Loading…"
            : hasMore
              ? assets.length + " loaded"
              : total + " asset" + (total === 1 ? "" : "s")}
        </span>
      </div>

      <div
        data-testid="runtime-capabilities"
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          padding: "6px 16px",
          borderBottom: `1px solid ${tokens.border}`,
          color: tokens.textDim,
          fontSize: 11,
        }}
      >
        <span>providers: {providerLabels}</span>
        <span>{localLabel}</span>
        <span>{knowledgeLabel}</span>
        {caps?.brand.resolver ? <span>brand resolver on</span> : <span>brand resolver off</span>}
      </div>

      <MediaDropzone
        onAssetCreated={props.onAssetCreated}
        projectId={props.projectId}
        brandId={props.brandId}
      />

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          {assets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              selected={props.selectedId === asset.id}
              onSelect={() => props.onSelect?.(asset)}
            />
          ))}
        </div>
        {!loading && assets.length === 0 && (
          <div style={{ color: tokens.textDim, textAlign: "center", padding: 48 }}>
            No assets in this view.
          </div>
        )}
        {hasMore && (
          <div style={{ display: "flex", justifyContent: "center", padding: "18px 0 6px" }}>
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              style={{ ...styles.button, minWidth: 132 }}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AssetCard(props: { asset: ContentAsset; selected: boolean; onSelect: () => void }) {
  const runtime = useContentRuntime();
  const { asset } = props;
  // Poster/thumbnail only — never the master, never a player.
  const thumb = runtime.posterUrl(asset, 360);
  const liveCount = asset.usage.filter((u) => u.live && !u.detachedAt).length;

  return (
    <div
      onClick={props.onSelect}
      style={{
        ...styles.panel,
        overflow: "hidden",
        cursor: "pointer",
        outline: props.selected ? `2px solid ${tokens.accent}` : "none",
      }}
    >
      <div style={{ aspectRatio: "4 / 3", background: tokens.panelAlt, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        {thumb ? (
          <img
            src={thumb}
            alt={asset.alt ?? asset.title ?? asset.filename ?? asset.id}
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ fontSize: 36 }}>{KIND_ICON[asset.kind] ?? "📦"}</span>
        )}
        {asset.kind === "video" && (
          <span style={{ position: "absolute", right: 6, bottom: 6, background: "#000a", padding: "1px 6px", borderRadius: 6, fontSize: 11 }}>
            {fmtDuration(asset.durationMs)}
          </span>
        )}
      </div>
      <div style={{ padding: 10 }}>
        <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 600, fontSize: 13 }}>
          {asset.semanticAlias ?? asset.title ?? asset.filename ?? asset.id}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, fontSize: 11, color: tokens.textDim }}>
          <span style={{ color: stateColor(asset.state) }}>● {asset.state}</span>
          <span>{asset.origin}</span>
          <span style={{ marginLeft: "auto" }}>{fmtBytes(asset.bytes)}</span>
        </div>
        {liveCount > 0 && (
          <div style={{ fontSize: 11, color: tokens.good, marginTop: 4 }}>
            in use · {liveCount} live surface{liveCount === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </div>
  );
}
