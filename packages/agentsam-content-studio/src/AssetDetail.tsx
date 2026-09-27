import { useState } from "react";
import type { ReactNode } from "react";
import type { ContentAsset, ContentState } from "@inneranimalmedia/agentsam-content";
import { CONTENT_STATE_TRANSITIONS } from "@inneranimalmedia/agentsam-content";
import { useContentRuntime } from "./context.js";
import { stateColor, styles, tokens } from "./theme.js";
import { ImageInspector } from "./inspectors/ImageInspector.js";
import { VideoInspector } from "./inspectors/VideoInspector.js";
import { ModelInspector, type ModelViewportProps } from "./inspectors/ModelInspector.js";
import { DeliveryInspector } from "./inspectors/DeliveryInspector.js";
import { UsageInspector } from "./inspectors/UsageInspector.js";
import { Section, KV, Chips } from "./inspectors/shared.js";

export interface AssetDetailProps {
  asset: ContentAsset;
  onClose?: () => void;
  onTabChange?: (tab: string) => void;
  renderModelViewport?: (vp: ModelViewportProps) => ReactNode;
}

export function AssetDetail(props: AssetDetailProps) {
  const runtime = useContentRuntime();
  const { asset } = props;
  const [tab, setTab] = useState<string>("inspect");
  const [error, setError] = useState<string | null>(null);

  const tabs = ["inspect", "delivery", "usage", "provenance"];
  const nextStates = CONTENT_STATE_TRANSITIONS[asset.state] ?? [];

  const transition = async (to: ContentState) => {
    setError(null);
    try {
      await runtime.transition(asset.id, to);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const rate = (r: -1 | 1) => void runtime.rate(asset.id, r);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
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

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {tab === "inspect" && asset.kind === "image" && <ImageInspector asset={asset} />}
        {tab === "inspect" && asset.kind === "video" && <VideoInspector asset={asset} />}
        {tab === "inspect" && asset.kind === "model" && (
          <ModelInspector asset={asset} renderViewport={props.renderModelViewport} />
        )}
        {tab === "inspect" && !["image", "video", "model"].includes(asset.kind) && (
          <ImageInspector asset={asset} />
        )}
        {tab === "delivery" && <DeliveryInspector asset={asset} />}
        {tab === "usage" && <UsageInspector asset={asset} />}
        {tab === "provenance" && <ProvenancePanel asset={asset} />}
      </div>
    </div>
  );
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
