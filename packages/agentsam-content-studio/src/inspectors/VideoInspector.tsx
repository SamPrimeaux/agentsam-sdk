import { useState } from "react";
import type { ContentAsset, VideoAssetExt } from "@inneranimalmedia/agentsam-content";
import { useContentRuntime } from "../context.js";
import { fmtBytes, fmtDuration, styles, tokens } from "../theme.js";
import { Chips, KV, Section, TextField } from "./shared.js";

/**
 * Video detail owns Stream status, playback, captions, downloads,
 * embed and R2 master — never jammed into the image variant page.
 * Poster-first: no player is instantiated until explicitly requested.
 */
export function VideoInspector(props: { asset: ContentAsset }) {
  const runtime = useContentRuntime();
  const { asset } = props;
  const ext = (asset.ext ?? {}) as VideoAssetExt;
  const [playerLoaded, setPlayerLoaded] = useState(false);
  const streamRef = asset.providerRefs.find((r) => r.provider === "cloudflare-stream");
  const masterRef = asset.providerRefs.find((r) => r.provider === "r2");
  const poster = runtime.posterUrl(asset, 640);
  const edit = (fields: Parameters<typeof runtime.editAsset>[1]) =>
    void runtime.editAsset(asset.id, fields);

  return (
    <div>
      <Section title="Playback">
        <div style={{ ...styles.panel, aspectRatio: "16 / 9", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
          {playerLoaded && streamRef ? (
            <iframe
              title={asset.title ?? asset.id}
              src={runtime.providers.get("cloudflare-stream").deliveryUrl(streamRef.ref) ?? undefined}
              style={{ width: "100%", height: "100%", border: 0 }}
              allow="autoplay; fullscreen"
            />
          ) : (
            <>
              {poster && (
                <img src={poster} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.75 }} />
              )}
              <button style={{ ...styles.button, position: "relative", fontSize: 15 }} onClick={() => setPlayerLoaded(true)}>
                ▶ Load player
              </button>
            </>
          )}
        </div>
      </Section>

      <Section title="Stream">
        <KV label="Status" value={ext.streamStatus ?? "—"} />
        <KV label="Duration" value={fmtDuration(asset.durationMs)} />
        <KV label="Resolution" value={ext.resolution ?? (asset.width && asset.height ? `${asset.width} × ${asset.height}` : "—")} />
        <KV label="Stream UID" value={streamRef?.ref} />
        <KV label="HLS" value={ext.hlsUrl ?? (streamRef ? runtime.providers.get("cloudflare-stream").deliveryUrl(streamRef.ref, { format: "hls" }) : "—")} />
        <KV label="DASH" value={ext.dashUrl ?? (streamRef ? runtime.providers.get("cloudflare-stream").deliveryUrl(streamRef.ref, { format: "dash" }) : "—")} />
      </Section>

      <Section title="Settings">
        <KV label="Downloads" value={ext.downloadsEnabled ? "enabled" : "disabled"} />
        <KV label="Signed URLs" value={ext.requireSignedURLs ? "required" : "public"} />
      </Section>

      <Section title="Captions">
        {(ext.captions ?? []).length === 0 && <span style={{ color: tokens.textDim }}>none</span>}
        {(ext.captions ?? []).map((c) => (
          <KV key={c.language} label={c.language} value={c.label} />
        ))}
      </Section>

      <Section title="Embed">
        <KV
          label="Iframe"
          value={streamRef ? `<iframe src="${runtime.providers.get("cloudflare-stream").deliveryUrl(streamRef.ref)}">` : "—"}
        />
      </Section>

      <Section title="Master">
        <KV label="R2 master" value={masterRef?.ref} />
        <KV label="Master bytes" value={fmtBytes(masterRef?.bytes ?? asset.bytes)} />
        <KV label="Generated from" value={asset.provenance.derivedFrom} />
      </Section>

      <Section title="Metadata">
        <TextField label="Title" value={asset.title ?? ""} onCommit={(v) => edit({ title: v })} />
        <TextField label="Caption" value={asset.caption ?? ""} onCommit={(v) => edit({ caption: v })} />
        <div style={{ paddingTop: 6 }}>
          <Chips items={asset.tags} />
        </div>
      </Section>
    </div>
  );
}
