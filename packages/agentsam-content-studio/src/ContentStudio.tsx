import { useState } from "react";
import type { ReactNode } from "react";
import type { ContentAsset, ContentRuntime } from "@inneranimalmedia/agentsam-content";
import { ContentRuntimeProvider, useAsset } from "./context.js";
import { ContentLibrary } from "./ContentLibrary.js";
import { AssetDetail } from "./AssetDetail.js";
import { AssistantRail } from "./AssistantRail.js";
import type { ModelViewportProps } from "./inspectors/ModelInspector.js";
import { styles, tokens } from "./theme.js";

export interface ContentStudioProps {
  /** The whole host contract: <ContentStudio runtime={contentRuntime} />. */
  runtime: ContentRuntime;
  initialView?: string;
  showAssistant?: boolean;
  renderModelViewport?: (vp: ModelViewportProps) => ReactNode;
}

/**
 * The canonical studio shell. It does not know host application names —
 * IAM, Fuel & Free Time and Local Studio all mount this same component
 * with different runtimes.
 */
export function ContentStudio(props: ContentStudioProps) {
  return (
    <ContentRuntimeProvider runtime={props.runtime}>
      <StudioShell {...props} />
    </ContentRuntimeProvider>
  );
}

function StudioShell(props: ContentStudioProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState("inspect");
  const selected = useAsset(selectedId);
  const showAssistant = props.showAssistant ?? true;

  return (
    <div style={{ ...styles.shell, height: "100%" }}>
      <ContentLibrary
        initialView={props.initialView}
        selectedId={selectedId}
        onSelect={(a: ContentAsset) => setSelectedId(a.id)}
      />

      {selected && (
        <div style={{ width: 380, borderLeft: `1px solid ${tokens.border}`, background: tokens.panel, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <AssetDetail
            asset={selected}
            onClose={() => setSelectedId(null)}
            onTabChange={setCurrentTab}
            renderModelViewport={props.renderModelViewport}
          />
        </div>
      )}

      {showAssistant && (
        <div style={{ width: 300, borderLeft: `1px solid ${tokens.border}`, background: tokens.bg, overflowY: "auto" }}>
          <AssistantRail asset={selected} currentInspector={currentTab} />
        </div>
      )}
    </div>
  );
}
