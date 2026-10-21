import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { ContentAsset, ContentState, FileRecord, ModelAssetExt } from "@inneranimalmedia/agentsam-content";
import { CONTENT_STATE_TRANSITIONS } from "@inneranimalmedia/agentsam-content";
import { useContentRuntime } from "./context.js";
import { fmtDuration, stateColor, styles, tokens } from "./theme.js";
import { ImageInspector } from "./inspectors/ImageInspector.js";
import { VideoInspector } from "./inspectors/VideoInspector.js";
import { ModelInspector, type ModelViewportProps } from "./inspectors/ModelInspector.js";
import { DeliveryInspector } from "./inspectors/DeliveryInspector.js";
import { UsageInspector } from "./inspectors/UsageInspector.js";
import { Section, KV, Chips, TextField } from "./inspectors/shared.js";

export interface AssetDetailProps {
  asset: ContentAsset;
  onClose?: () => void;
  onTabChange?: (tab: string) => void;
  renderModelViewport?: (vp: ModelViewportProps) => ReactNode;
  fileStorage?: {
    targets(): Array<{ id: string; label: string; state: string; capabilities: string[] }>;
    get(assetId: string): Promise<FileRecord>;
    export(assetId: string, targetId?: string): Promise<{ name: string; mime?: string; bytes: AsyncIterable<Uint8Array>; targetId: string }>;
    delete(assetId: string): Promise<FileRecord>;
    restore(assetId: string): Promise<FileRecord>;
  };
  share?: { available(asset: ContentAsset): boolean; run(asset: ContentAsset): Promise<void> };
}

export function AssetDetail(props: AssetDetailProps) {
  const runtime = useContentRuntime();
  const { asset } = props;
  const [tab, setTab] = useState<string>("inspect");
  const [error, setError] = useState<string | null>(null);
  const [fileRecord, setFileRecord] = useState<FileRecord | null>(null);
  const [exportTarget, setExportTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const canRead = runtime.can("content.read");
  const canEdit = runtime.can("content.edit");
  const targets = props.fileStorage?.targets() ?? [];
  const exportTargets = targets.filter((target) => target.state === "connected" && target.capabilities.includes("export") && target.capabilities.includes("read"));
  const canTrash = Boolean(runtime.can("content.delete") && props.fileStorage && fileRecord && !fileRecord.deleted && fileRecord.locations.some((location) => targets.some((target) => target.id === location.targetId && target.state === "connected" && target.capabilities.includes("delete"))));
  const canRestore = Boolean(runtime.can("content.delete") && props.fileStorage && fileRecord?.deleted && targets.some((target) => target.state === "connected" && target.capabilities.includes("restore")));

  useEffect(() => {
    let alive = true;
    setFileRecord(null);
    props.fileStorage?.get(asset.id).then((record) => alive && setFileRecord(record)).catch((err) => {
      if (alive) setError(err instanceof Error ? err.message : String(err));
    });
    return () => { alive = false; };
  }, [asset.id, props.fileStorage]);

  const tabs = ["inspect", "delivery", "usage", "provenance"];
  const nextStates = (CONTENT_STATE_TRANSITIONS[asset.state] ?? []).filter((next) =>
    runtime.can(next === "live" || next === "approved" ? "content.publish" : "content.review"),
  );

  const transition = async (to: ContentState) => {
    setError(null);
    try {
      await runtime.transition(asset.id, to);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const rate = (r: -1 | 1) => void runtime.rate(asset.id, r);

  const download = async (targetId?: string) => {
    if (!props.fileStorage) return;
    setBusy(true);
    setError(null);
    try {
      const file = await props.fileStorage.export(asset.id, targetId);
      const chunks: Uint8Array[] = [];
      for await (const chunk of file.bytes) chunks.push(chunk);
      const blob = new Blob(chunks as BlobPart[], { type: file.mime ?? asset.mime ?? "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name || asset.filename || asset.id;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const trash = async () => {
    if (!props.fileStorage) return;
    if (!confirmTrash) { setConfirmTrash(true); return; }
    setBusy(true);
    setError(null);
    try {
      setFileRecord(await props.fileStorage.delete(asset.id));
      setConfirmTrash(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  const restore = async () => {
    if (!props.fileStorage) return;
    setBusy(true);
    setError(null);
    try { setFileRecord(await props.fileStorage.restore(asset.id)); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="acs-detail" role="region" aria-label="Content details" style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${tokens.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {asset.semanticAlias ?? asset.title ?? asset.filename ?? asset.id}
          </b>
          <span style={{ color: stateColor(asset.state), fontSize: 12 }}>● {asset.state}</span>
          {props.onClose && (
            <button style={{ ...styles.button, marginLeft: "auto" }} onClick={props.onClose}>
              ✕
            </button>
          )}
        </div>
        <div style={{ fontSize: 12, color: tokens.textDim, marginTop: 4 }}>
          {asset.id} · {asset.kind} · {asset.origin}
        </div>

        <div className="acs-detail__actions" aria-label="Item actions">
          {canRead && exportTargets.length > 0 && <button type="button" disabled={busy} onClick={() => void download(exportTargets[0]?.id)}>Download</button>}
          {canRead && exportTargets.length > 1 && <label className="acs-export-target">Export location
            <select value={exportTarget} onChange={(event) => setExportTarget(event.target.value)}>
              <option value="">Choose source</option>
              {exportTargets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
            </select>
          </label>}
          {canRead && exportTargets.length > 0 && <button type="button" disabled={busy || (exportTargets.length > 1 && !exportTarget)} onClick={() => void download(exportTarget || exportTargets[0]?.id)}>Export</button>}
          {canEdit && <button type="button" onClick={() => setTab("inspect")}>Edit</button>}
          {props.share?.available(asset) && <button type="button" disabled={busy} onClick={() => void props.share?.run(asset).catch((err) => setError(err instanceof Error ? err.message : String(err)))}>Share</button>}
          {canTrash && <button type="button" className="acs-danger" disabled={busy} onClick={() => void trash()}>{confirmTrash ? "Confirm trash" : "Trash"}</button>}
          {canRestore && <button type="button" disabled={busy} onClick={() => void restore()}>Restore</button>}
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {nextStates.map((s) => (
            <button key={s} style={styles.button} onClick={() => transition(s)}>
              → {s}
            </button>
          ))}
          <button style={styles.button} title="Rate up" onClick={() => rate(1)}>
            👍{asset.rating === 1 ? " ✓" : ""}
          </button>
          <button style={styles.button} title="Rate down" onClick={() => rate(-1)}>
            👎{asset.rating === -1 ? " ✓" : ""}
          </button>
        </div>
        {error && <div style={{ color: tokens.bad, fontSize: 12, marginTop: 6 }}>{error}</div>}

        <div style={{ display: "flex", gap: 4, marginTop: 12 }}>
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                props.onTabChange?.(t);
              }}
              style={{
                ...styles.button,
                background: tab === t ? tokens.accent : styles.button.background,
                color: tab === t ? "#fff" : tokens.text,
                borderColor: tab === t ? tokens.accent : tokens.border,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="acs-detail__scroll" style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {tab === "inspect" && <AssetPreview asset={asset} renderModelViewport={props.renderModelViewport} />}
        {tab === "inspect" && asset.kind === "image" && <ImageInspector asset={asset} readOnly={!canEdit} />}
        {tab === "inspect" && asset.kind === "video" && <VideoInspector asset={asset} readOnly={!canEdit} />}
        {tab === "inspect" && asset.kind === "model" && (
          <ModelInspector asset={asset} renderViewport={props.renderModelViewport} readOnly={!canEdit} />
        )}
        {tab === "inspect" && !["image", "video", "model"].includes(asset.kind) && <GenericInspector asset={asset} readOnly={!canEdit} />}
        {tab === "delivery" && <DeliveryInspector asset={asset} />}
        {tab === "usage" && <UsageInspector asset={asset} />}
        {tab === "provenance" && <ProvenancePanel asset={asset} />}
        {tab === "provenance" && fileRecord && <FileLocations record={fileRecord} />}
      </div>
    </div>
  );
}

function AssetPreview(props: { asset: ContentAsset; renderModelViewport?: (vp: ModelViewportProps) => ReactNode }) {
  const runtime = useContentRuntime();
  const { asset } = props;
  const src = runtime.deliveryUrl(asset, { width: 1920 }) ?? runtime.posterUrl(asset, 1280);
  return <div className={`acs-preview acs-preview--${asset.kind}`}>
    {asset.kind === "image" && src && <img src={src} alt={asset.alt ?? asset.title ?? ""} />}
    {asset.kind === "video" && src && <video src={src} poster={runtime.posterUrl(asset, 1280) ?? undefined} controls preload="none" />}
    {asset.kind === "audio" && src && <audio src={src} controls preload="none" />}
    {asset.kind === "model" && (props.renderModelViewport ? props.renderModelViewport({
      asset,
      camera: { theta: 0, phi: 1.2, radius: 5, fov: 45, ...((asset.ext ?? {}) as ModelAssetExt).camera },
      placement: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1, ...((asset.ext ?? {}) as ModelAssetExt).placement },
    }) : <div className="acs-preview__fallback">3D preview requires a host renderer.</div>)}
    {asset.kind === "document" && src && <iframe title={asset.title ?? asset.filename ?? "Document preview"} src={src} sandbox="" />}
    {asset.kind === "font" && <div className="acs-preview__fallback">Font file · {asset.mime ?? "unknown format"}</div>}
    {!src && asset.kind !== "model" && asset.kind !== "font" && <div className="acs-preview__fallback">No preview is available from this source.</div>}
  </div>;
}

function GenericInspector(props: { asset: ContentAsset; readOnly: boolean }) {
  const runtime = useContentRuntime();
  const asset = props.asset;
  const ext = asset.ext ?? {};
  return <>
    <Section title="Original file">
      <KV label="Filename" value={asset.filename} />
      <KV label="Format" value={asset.mime} />
      <KV label="Bytes" value={asset.bytes} />
      <KV label="Dimensions" value={asset.width && asset.height ? `${asset.width} × ${asset.height}` : undefined} />
      <KV label="Duration" value={asset.durationMs ? fmtDuration(asset.durationMs) : undefined} />
      {typeof ext.pages === "number" && <KV label="Pages" value={ext.pages} />}
    </Section>
    <Section title="Details">
      <TextField label="Title" value={asset.title ?? ""} disabled={props.readOnly} onCommit={(value) => void runtime.editAsset(asset.id, { title: value })} />
      <KV label="Alt text" value={asset.alt} />
      <KV label="Caption" value={asset.caption} />
    </Section>
    <DeliveryInspector asset={asset} />
    <UsageInspector asset={asset} />
  </>;
}

function FileLocations(props: { record: FileRecord }) {
  return <Section title="File locations">
    <KV label="Permissions" value={`${props.record.permissions.visibility} · owner ${props.record.permissions.ownerAccountId}`} />
    {props.record.locations.map((location) => <KV key={`${location.targetId}:${location.ref.ref}`} label={location.targetId} value={`${location.ref.provider} · ${location.kind} · ${location.online ? "available" : "offline"}`} />)}
    <Section title="Variants and revisions">
      {props.record.derivatives.length === 0 && <KV label="Variants" value="No derivatives recorded" />}
      {props.record.derivatives.map((variant) => <KV key={variant.name} label={variant.name} value={`${variant.format ?? "unknown format"} · ${variant.bytes ?? "—"} bytes`} />)}
      <KV label="Metadata revision" value={props.record.asset.fileRevision ?? 0} />
    </Section>
  </Section>;
}

function ProvenancePanel(props: { asset: ContentAsset }) {
  const { asset } = props;
  const p = asset.provenance;
  return (
    <div>
      <Section title="Origin">
        <KV label="Origin" value={asset.origin} />
        <KV label="Source type" value={asset.source.type} />
        <KV label="Source ref" value={asset.source.ref} />
        <KV label="Batch" value={asset.source.batch} />
        <KV label="Created by" value={`${asset.createdBy.type}${asset.createdBy.ref ? ` (${asset.createdBy.ref})` : ""}`} />
      </Section>

      {p.generation && (
        <Section title="Generation">
          <KV label="Model" value={p.generation.model} />
          <KV label="Prompt" value={p.generation.prompt} />
          <KV label="Prompt hash" value={p.generation.promptHash} />
          <KV label="Job" value={p.generation.jobId} />
          {p.generation.sourceAssetIds && <Chips items={p.generation.sourceAssetIds} />}
        </Section>
      )}

      {p.import && (
        <Section title="Import">
          <KV label="Batch" value={p.import.batch} />
          <KV label="Source URL" value={p.import.sourceUrl} />
          <KV label="Archive" value={p.import.archive} />
        </Section>
      )}

      <Section title="History">
        {p.history.map((h, i) => (
          <KV
            key={i}
            label={new Date(h.at).toLocaleString()}
            value={`${h.action}${h.actor ? ` · ${h.actor.type}${h.actor.ref ? `:${h.actor.ref}` : ""}` : ""}`}
          />
        ))}
      </Section>
    </div>
  );
}
