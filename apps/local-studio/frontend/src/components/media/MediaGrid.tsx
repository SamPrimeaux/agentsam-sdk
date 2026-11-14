import { Box, Check, FileStack, Film, Folder, Images, Play } from "lucide-react";
import { MediaAssetMenu } from "./MediaAssetMenu";
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
      {kind === "video" && !asset.local_directory ? (
        <span className="agentsam-media-thumb__play" aria-hidden="true"><Play size={14} fill="currentColor" /></span>
      ) : null}
      {duration ? <span className="agentsam-media-thumb__duration">{duration}</span> : null}
    </div>
  );
}

export function MediaItems({
  assets,
  view,
  selected,
  anySelected,
  inspectingId,
  onOpen,
  onToggle,
  onEdit,
  onCopy,
  onExport,
  onDelete,
}: {
  assets: MediaAsset[];
  view: "grid" | "list";
  selected: Set<string>;
  anySelected: boolean;
  inspectingId?: string | null;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onEdit: (asset: MediaAsset) => void;
  onCopy: (asset: MediaAsset) => void;
  onExport: (asset: MediaAsset) => void;
  onDelete: (asset: MediaAsset) => void;
}) {
  return (
    <ul className={view === "grid" ? "agentsam-media-grid" : "agentsam-media-list"} role="list">
      {assets.map((asset) => {
        const checked = selected.has(asset.id);
        const ext = extensionOf(asset);
        return (
          <li key={asset.id} className={`agentsam-media-item${checked ? " is-selected" : ""}${anySelected ? " is-selecting" : ""}${inspectingId === asset.id ? " is-inspected" : ""}`}>
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
            <MediaAssetMenu
              asset={asset}
              onOpen={(item) => onOpen(item.id)}
              onEdit={onEdit}
              onCopy={onCopy}
              onExport={onExport}
              onDelete={onDelete}
            />
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
