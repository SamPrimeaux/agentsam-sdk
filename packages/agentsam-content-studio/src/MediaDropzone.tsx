import { useCallback, useRef, useState } from "react";
import type { ContentAsset } from "@inneranimalmedia/agentsam-content";
import { useContentRuntime } from "./context.js";
import { tokens } from "./theme.js";

export interface MediaDropzoneProps {
  accept?: string[];
  brandId?: string;
  projectId?: string;
  /** Prefer runtime.importAsset; kept for hosts that need a side-effect hook after import. */
  onAssetCreated?: (asset: ContentAsset, file: File) => void | Promise<void>;
}

interface UploadItem {
  id: string;
  name: string;
  status: "reading" | "creating" | "optimizing" | "done" | "error";
  error?: string;
}

export function MediaDropzone(props: MediaDropzoneProps) {
  const runtime = useContentRuntime();
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const ingest = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;
      const seeded: UploadItem[] = list.map((f, i) => ({
        id: `${Date.now()}_${i}_${f.name}`,
        name: f.name,
        status: "reading",
      }));
      setItems((prev) => [...seeded, ...prev]);
      await Promise.all(
        list.map(async (file, i) => {
          const itemId = seeded[i]!.id;
          const setStatus = (status: UploadItem["status"], error?: string) =>
            setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, status, error } : it)));
          try {
            setStatus("creating");
            const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(file.name);
            if (isImage) setStatus("optimizing");
            const asset = await runtime.importAsset({
              file,
              filename: file.name,
              mime: file.type || undefined,
              brandId: props.brandId,
              projectId: props.projectId,
              optimize: isImage,
            });
            await props.onAssetCreated?.(asset, file);
            setStatus("done");
          } catch (error) {
            setStatus("error", error instanceof Error ? error.message : String(error));
          }
        }),
      );
      window.setTimeout(() => {
        setItems((prev) => prev.filter((it) => it.status !== "done"));
      }, 2500);
    },
    [runtime, props.brandId, props.projectId, props.onAssetCreated],
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); void ingest(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      style={{
        margin: "12px 16px 0",
        padding: 16,
        borderRadius: tokens.radius,
        border: `1.5px dashed ${dragging ? tokens.accent : tokens.border}`,
        background: dragging ? tokens.panelAlt : "transparent",
        color: tokens.textDim,
        fontSize: 13,
        textAlign: "center",
        cursor: "pointer",
        transition: "border-color 120ms, background 120ms",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={props.accept?.join(",")}
        onChange={(e) => { if (e.target.files) void ingest(e.target.files); e.target.value = ""; }}
        style={{ display: "none" }}
      />
      {dragging ? "Drop to upload" : "Drag files here, or click to choose"}
      {items.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4, textAlign: "left" }}>
          {items.map((it) => (
            <div
              key={it.id}
              style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, color: it.status === "error" ? tokens.bad : tokens.textDim }}
            >
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</span>
              <span>{it.status === "error" ? (it.error ?? "error") : it.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
