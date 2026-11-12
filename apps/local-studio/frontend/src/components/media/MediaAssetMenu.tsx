import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Copy, Download, Ellipsis, Eye, Pencil, Trash2 } from "lucide-react";
import { canDeleteMediaAsset, canEditMediaMetadata, previewUrl, providerOf, type MediaAsset } from "./media-utils";

export function MediaAssetMenu({
  asset,
  onOpen,
  onEdit,
  onCopy,
  onExport,
  onDelete,
}: {
  asset: MediaAsset;
  onOpen: (asset: MediaAsset) => void;
  onEdit: (asset: MediaAsset) => void;
  onCopy: (asset: MediaAsset) => void;
  onExport: (asset: MediaAsset) => void;
  onDelete: (asset: MediaAsset) => void;
}) {
  const preview = previewUrl(asset);
  const copyable = Boolean(preview) && providerOf(asset) !== "local" && !asset.meta?.require_signed_urls;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="agentsam-media-item__more" aria-label={"Actions for " + asset.filename} title="Asset actions">
          <Ellipsis size={17} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="bottom" align="end" sideOffset={5} collisionPadding={12} className="agentsam-media-item__menu">
          <DropdownMenu.Item onSelect={() => onOpen(asset)}><Eye size={15} /> Open details</DropdownMenu.Item>
          <DropdownMenu.Item disabled={!canEditMediaMetadata(asset)} onSelect={() => onEdit(asset)}
            title={canEditMediaMetadata(asset) ? "Edit Cloudflare image metadata" : "Editing is not supported for this source"}>
            <Pencil size={15} /> Edit metadata
          </DropdownMenu.Item>
          <DropdownMenu.Item disabled={!copyable} onSelect={() => onCopy(asset)}
            title={copyable ? "Copy public delivery URL" : "No public delivery URL is available"}>
            <Copy size={15} /> Copy URL
          </DropdownMenu.Item>
          <DropdownMenu.Item disabled={!preview} onSelect={() => onExport(asset)}
            title={preview ? "Download the currently available preview" : "No downloadable preview is available"}>
            <Download size={15} /> Export preview
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item disabled={!canDeleteMediaAsset(asset)} className="is-danger" onSelect={() => onDelete(asset)}
            title={canDeleteMediaAsset(asset) ? "Confirm permanent deletion" : "This source is read-only"}>
            <Trash2 size={15} /> Delete…
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
