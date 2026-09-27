import type { ContentAsset } from "@inneranimalmedia/agentsam-content";
import { resolveVariant } from "@inneranimalmedia/agentsam-content";
import { useContentRuntime } from "../context.js";
import { fmtBytes, tokens } from "../theme.js";
import { KV, Section } from "./shared.js";

const BREAKPOINTS = [320, 640, 960, 1280, 1920];

/** How this asset actually reaches a browser: refs, variants, URLs per breakpoint. */
export function DeliveryInspector(props: { asset: ContentAsset }) {
  const runtime = useContentRuntime();
  const { asset } = props;

  return (
    <div>
      <Section title="Provider representations">
        {asset.providerRefs.length === 0 && <span style={{ color: tokens.textDim }}>none</span>}
        {asset.providerRefs.map((r) => (
          <KV key={`${r.provider}:${r.ref}`} label={`${r.provider} · ${r.role}`} value={r.ref} />
        ))}
      </Section>

      <Section title="Responsive delivery">
        {BREAKPOINTS.map((w) => {
          const variant = resolveVariant(asset.variants, w);
          const url = runtime.deliveryUrl(asset, { width: w });
          return (
            <KV
              key={w}
              label={`${w}w`}
              value={
                url
                  ? `${variant ? `${variant.name} · ` : ""}${url.length > 60 ? url.slice(0, 57) + "…" : url}`
                  : "—"
              }
            />
          );
        })}
      </Section>

      <Section title="Weight">
        <KV label="Source" value={fmtBytes(asset.bytes)} />
        {asset.variants.map((v) => (
          <KV key={v.name} label={v.name} value={`${fmtBytes(v.bytes)}${v.approved ? " ✓ approved" : ""}`} />
        ))}
      </Section>
    </div>
  );
}
