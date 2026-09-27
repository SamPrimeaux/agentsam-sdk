import { useEffect, useState } from "react";
import type {
  ContentAsset,
  ContentAssistantContext,
} from "@inneranimalmedia/agentsam-content";
import { actionsFor } from "@inneranimalmedia/agentsam-content";
import { useContentRuntime } from "./context.js";
import { styles, tokens } from "./theme.js";

/**
 * AgentSam rail. Not an "AI button in a gallery": it renders the
 * normalized ContentAssistantContext (machine facts, delete safety,
 * SEO, recommendations) and dispatches actions to the host's
 * AssistantHandler when one is configured.
 */
export function AssistantRail(props: { asset: ContentAsset | null; currentInspector?: string }) {
  const runtime = useContentRuntime();
  const [context, setContext] = useState<ContentAssistantContext | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setOutput(null);
    if (!props.asset) {
      setContext(null);
      return;
    }
    runtime
      .assistantContext(props.asset.id, { currentInspector: props.currentInspector })
      .then((c) => alive && setContext(c));
    return () => {
      alive = false;
    };
  }, [runtime, props.asset, props.currentInspector]);

  if (!props.asset || !context) {
    return (
      <div style={{ padding: 16, color: tokens.textDim, fontSize: 13 }}>
        Select an asset — AgentSam sees its machine facts, usage graph and lifecycle here.
      </div>
    );
  }

  const run = async (action: string) => {
    setBusy(action);
    setOutput(null);
    try {
      const result = await runtime.runAssistant(props.asset!.id, action, {
        currentInspector: props.currentInspector,
      });
      setOutput(typeof result === "string" ? result : JSON.stringify(result, null, 2));
    } catch (err) {
      setOutput(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ padding: 16, overflowY: "auto" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>AgentSam</div>
      <div style={{ fontSize: 12, color: tokens.textDim, marginBottom: 12 }}>
        Context: {context.asset.kind} · {context.asset.state} · {context.providerNames.join(", ")}
      </div>

      <div style={styles.sectionTitle}>Recommendations</div>
      {context.recommendations.length === 0 && (
        <div style={{ fontSize: 13, color: tokens.good }}>Nothing outstanding.</div>
      )}
      {context.recommendations.map((r) => (
        <div
          key={r.id}
          style={{
            fontSize: 12,
            padding: "6px 8px",
            marginBottom: 6,
            borderRadius: 8,
            background: tokens.panelAlt,
            borderLeft: `3px solid ${r.severity === "action" ? tokens.bad : r.severity === "warn" ? tokens.warn : tokens.border}`,
          }}
        >
          {r.message}
        </div>
      ))}

      <div style={styles.sectionTitle}>Delete safety</div>
      <div style={{ fontSize: 12, color: context.deleteSafety.safe ? tokens.good : tokens.bad }}>
        {context.deleteSafety.reason}
      </div>

      <div style={styles.sectionTitle}>Ask AgentSam</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {actionsFor(context.asset).map((a) => (
          <button
            key={a.id}
            style={{ ...styles.button, textAlign: "left", opacity: busy && busy !== a.id ? 0.5 : 1 }}
            disabled={!!busy}
            onClick={() => run(a.id)}
          >
            {busy === a.id ? "…" : a.label}
          </button>
        ))}
      </div>

      {output && (
        <pre
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 8,
            background: tokens.panelAlt,
            border: `1px solid ${tokens.border}`,
            fontSize: 12,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {output}
        </pre>
      )}
    </div>
  );
}
