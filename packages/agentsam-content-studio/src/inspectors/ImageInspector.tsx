import type { ContentAsset } from "@inneranimalmedia/agentsam-content";
import { seoReport, bestDeliveryVariant } from "@inneranimalmedia/agentsam-content";
import { useContentRuntime } from "../context.js";
import { fmtBytes, tokens } from "../theme.js";
import { Chips, KV, Section, TextField } from "./shared.js";

/**
 * SOURCE / DELIVERY / SEMANTICS / SEO / VARIANTS sections for images.
 */
export function ImageInspector(props: { asset: ContentAsset }) {
  const runtime = useContentRuntime();
  const { asset } = props;
  const machine = asset.intelligence?.machine;
  const semantic = asset.intelligence?.semantic;
  const seo = seoReport(asset);
  const best = bestDeliveryVariant(asset.variants);
  const edit = (fields: Parameters<typeof runtime.editAsset>[1]) =>
    void runtime.editAsset(asset.id, fields);

  return (
    <div>
      <Section title="Source">
        <KV label="Provider" value={asset.providerRefs.map((r) => `${r.provider} (${r.role})`).join(", ") || "—"} />
        <KV label="Dimensions" value={asset.width && asset.height ? `${asset.width} × ${asset.height}` : "—"} />
        <KV label="Bytes" value={fmtBytes(asset.bytes)} />
        <KV label="MIME" value={asset.mime} />
        <KV label="Alpha" value={machine?.hasAlpha === undefined ? "—" : machine.hasAlpha ? "yes" : "no"} />
        <KV label="Hash" value={machine?.hash ? machine.hash.slice(0, 16) + "…" : "—"} />
        {machine?.duplicateOf && (
          <KV label="Duplicate of" value={<span style={{ color: tokens.warn }}>{machine.duplicateOf}</span>} />
        )}
      </Section>

      <Section title="Delivery">
        <KV label="Current format" value={best?.format ?? asset.mime?.split("/")[1]} />
        <KV label="Delivered bytes" value={best ? fmtBytes(best.bytes) : fmtBytes(asset.bytes)} />
        <KV
          label="Savings"
          value={
            best && asset.bytes
              ? `${Math.round((1 - (best.bytes ?? 0) / asset.bytes) * 100)}% lighter`
              : "no approved derivative"
          }
        />
        <KV label="Delivery URL" value={runtime.deliveryUrl(asset, { width: 1280 }) ?? "—"} />
      </Section>

      <Section title="Semantics">
        <TextField label="Title" value={asset.title ?? ""} onCommit={(v) => edit({ title: v })} />
        <TextField label="Role" value={asset.role ?? ""} placeholder="hero / logo / product…" onCommit={(v) => edit({ role: v })} />
        <KV label="Subject (AI)" value={semantic?.subject} />
        <KV label="Brand" value={asset.brandId} />
        <KV label="Project" value={asset.projectId} />
        <div style={{ paddingTop: 6 }}>
          <Chips items={asset.tags} />
        </div>
      </Section>

      <Section title="SEO">
        <KV label="Score" value={<b style={{ color: seo.score >= 75 ? tokens.good : seo.score >= 50 ? tokens.warn : tokens.bad }}>{seo.score}</b>} />
        <TextField
          label="Semantic alias"
          value={asset.semanticAlias ?? ""}
          placeholder={asset.filename ?? ""}
          onCommit={(v) => edit({ semanticAlias: v, deliveryAlias: v })}
        />
        <TextField label="Alt" value={asset.alt ?? ""} onCommit={(v) => edit({ alt: v })} />
        <TextField label="Caption" value={asset.caption ?? ""} onCommit={(v) => edit({ caption: v })} />
        {seo.checks.map((c) => (
          <div key={c.id} style={{ fontSize: 12, color: c.ok ? tokens.good : tokens.warn, padding: "2px 0" }}>
            {c.ok ? "✓" : "•"} {c.detail}
          </div>
        ))}
      </Section>

      <Section title="Variants">
        {asset.variants.length === 0 && <span style={{ color: tokens.textDim }}>none</span>}
        {asset.variants.map((v) => (
          <KV
            key={v.name}
            label={`${v.name}${v.approved ? " ✓" : ""}`}
            value={`${v.width ?? "?"}w · ${v.format ?? "?"} · ${fmtBytes(v.bytes)}`}
          />
        ))}
      </Section>
    </div>
  );
}
