import { Box, Check, FileStack, Film, Folder, Images } from "lucide-react";
import {
  classifyAsset,
  extensionOf,
  formatBytes,
  formatDuration,
  previewUrl,
  providerLabel,
  providerOf,
  type MediaAsset,
  type MediaKind,
} from "./media-utils";

export function KindGlyph({ kind, size = 22 }: { kind: MediaKind; size?: number }) {
  if (kind === "video") return <Film size={size} />;
  if (kind === "model") return <Box size={size} />;
  if (kind === "file") return <FileStack size={size} />;
  return <Images size={size} />;
}

function Thumb({ asset }: { asset: MediaAsset }) {
  const kind = classifyAsset(asset);
  const preview = previewUrl(asset);
  const duration = formatDuration(asset.duration_ms);
  return (
    <div className={`agentsam-media-thumb is-${kind}`}>
      {(kind === "image" || kind === "video") && preview ? (
        <img src={preview} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="agentsam-media-thumb__glyph">{asset.local_directory ? <Folder size={22} /> : <KindGlyph kind={kind} />}</span>
      )}
      {duration ? <span className="agentsam-media-thumb__duration">{duration}</span> : null}
    </div>
  );
}

export function MediaItems({
  assets,
  view,
  selected,
  anySelected,
  onOpen,
  onToggle,
}: {
  assets: MediaAsset[];
  view: "grid" | "list";
  selected: Set<string>;
  anySelected: boolean;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <ul className={view === "grid" ? "agentsam-media-grid" : "agentsam-media-list"} role="list">
      {assets.map((asset) => {
        const checked = selected.has(asset.id);
        const ext = extensionOf(asset);
        return (
          <li key={asset.id} className={`agentsam-media-item${checked ? " is-selected" : ""}${anySelected ? " is-selecting" : ""}`}>
            <button
              type="button"
              className="agentsam-media-item__check"
              role="checkbox"
              aria-checked={checked}
              aria-label={`Select ${asset.filename}`}
              onClick={() => onToggle(asset.id)}
            >
              {checked ? <Check size={13} /> : null}
            </button>
            <button type="button" className="agentsam-media-item__open" onClick={() => onOpen(asset.id)}>
              <Thumb asset={asset} />
              <span className="agentsam-media-item__meta">
                <strong title={asset.filename}>{asset.filename}</strong>
                <span>
                  {[ext, formatBytes(asset.size_bytes) === "—" ? null : formatBytes(asset.size_bytes), providerLabel(providerOf(asset))]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
