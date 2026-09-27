import { useEffect, useState } from "react";
import type { ContentAsset, DeleteSafety } from "@inneranimalmedia/agentsam-content";
import { useContentRuntime } from "../context.js";
import { tokens } from "../theme.js";
import { KV, Section } from "./shared.js";

/** The usage graph view: who references this asset, and is deletion safe. */
export function UsageInspector(props: { asset: ContentAsset }) {
  const runtime = useContentRuntime();
  const { asset } = props;
  const [safety, setSafety] = useState<DeleteSafety | null>(null);

  useEffect(() => {
    let alive = true;
    runtime.deleteSafety(asset.id).then((s) => alive && setSafety(s));
    return () => {
      alive = false;
    };
  }, [runtime, asset.id, asset.usage]);

  const byApp = new Map<string, typeof asset.usage>();
  for (const u of asset.usage) {
    const list = byApp.get(u.app) ?? [];
    list.push(u);
    byApp.set(u.app, list);
  }

  return (
    <div>
      <Section title="Used by">
        {byApp.size === 0 && <span style={{ color: tokens.textDim }}>Not referenced anywhere.</span>}
        {[...byApp.entries()].map(([app, uses]) => (
          <div key={app} style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>{app}</div>
            {uses.map((u) => (
              <div key={u.surface} style={{ paddingLeft: 12, fontSize: 13, color: u.live && !u.detachedAt ? tokens.text : tokens.textDim }}>
                {u.live && !u.detachedAt ? "●" : "○"} {u.surface}
                {u.detachedAt && " (detached)"}
              </div>
            ))}
          </div>
        ))}
      </Section>

      <Section title="Can I delete this?">
        {safety && (
          <div style={{ color: safety.safe ? tokens.good : tokens.bad, fontWeight: 600 }}>
            {safety.reason}
          </div>
        )}
        <KV label="Total references" value={safety?.totalReferences} />
        <KV label="Last used" value={safety?.lastUsedAt ? new Date(safety.lastUsedAt).toLocaleDateString() : "—"} />
      </Section>
    </div>
  );
}
