import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { ContentAsset, ContentRuntime, FileRecord } from "@inneranimalmedia/agentsam-content";
import { ContentRuntimeProvider, useAsset } from "./context.js";
import { ContentLibrary } from "./ContentLibrary.js";
import { AssetDetail } from "./AssetDetail.js";
import { AssistantRail } from "./AssistantRail.js";
import type { ModelViewportProps } from "./inspectors/ModelInspector.js";
import { tokens } from "./theme.js";

export interface ContentStudioProps {
  /** The whole host contract: <ContentStudio runtime={contentRuntime} />. */
  runtime: ContentRuntime;
  initialView?: string;
  showAssistant?: boolean;
  /** Sites → Media site/project scope. */
  projectId?: string;
  brandId?: string;
  renderModelViewport?: (vp: ModelViewportProps) => ReactNode;
  /** Optional post-import hook. Prefer runtime.importAsset for optimize. */
  onAssetCreated?: (asset: ContentAsset, file: File) => void | Promise<void>;
  /** Host-injected operations backed by the canonical agentsam-content file contract. */
  fileStorage?: {
    targets(): Array<{ id: string; label: string; state: string; capabilities: string[] }>;
    get(assetId: string): Promise<FileRecord>;
    export(assetId: string, targetId?: string): Promise<{ name: string; mime?: string; bytes: AsyncIterable<Uint8Array>; targetId: string }>;
    delete(assetId: string): Promise<FileRecord>;
    restore(assetId: string): Promise<FileRecord>;
  };
  /** Sharing stays host-owned because providers expose different share semantics. */
  share?: { available(asset: ContentAsset): boolean; run(asset: ContentAsset): Promise<void> };
}

/**
 * The canonical studio shell. It does not know host application names —
 * IAM, Ember Supply and Local Studio all mount this same component
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

  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  return (
    <div className="acs-shell">
      <style>{CONTENT_STUDIO_CSS}</style>
      <ContentLibrary
        initialView={props.initialView}
        selectedId={selectedId}
        onSelect={(a: ContentAsset) => setSelectedId(a.id)}
        projectId={props.projectId}
        brandId={props.brandId}
        onAssetCreated={props.onAssetCreated}
      />

      {selected && (
        <aside className="acs-inspector" aria-label="Content inspector">
          <AssetDetail
            asset={selected}
            onClose={() => setSelectedId(null)}
            onTabChange={setCurrentTab}
            renderModelViewport={props.renderModelViewport}
            fileStorage={props.fileStorage}
            share={props.share}
          />
        </aside>
      )}

      {showAssistant && !selected && (
        <aside className="acs-assistant" aria-label="Content assistant">
          <AssistantRail asset={selected} currentInspector={currentTab} />
        </aside>
      )}
    </div>
  );
}

const CONTENT_STUDIO_CSS = `
.acs-shell{position:relative;display:flex;height:100%;min-width:0;min-height:0;overflow:hidden;background:${tokens.bg};color:${tokens.text};font-family:${tokens.font};font-size:14px}
.acs-detail{display:flex;min-width:0;min-height:0;height:100%;flex-direction:column}
.acs-library{display:flex;flex:1;min-width:0;min-height:0;flex-direction:column}
.acs-library__toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid ${tokens.border}}
.acs-collection-tabs,.acs-layout-toggle{display:flex;gap:4px;flex-wrap:wrap}
.acs-collection-tabs button,.acs-layout-toggle button,.acs-detail__actions button,.acs-load-more button{border:1px solid ${tokens.border};border-radius:8px;background:${tokens.panelAlt};color:${tokens.text};padding:7px 10px;cursor:pointer;font:inherit;font-size:12px}
.acs-collection-tabs button[aria-pressed=true],.acs-layout-toggle button[aria-pressed=true]{background:${tokens.accent};color:white;border-color:${tokens.accent}}
.acs-search input,.acs-filter select,.acs-export-target select{min-height:34px;border:1px solid ${tokens.border};border-radius:8px;background:${tokens.panelAlt};color:${tokens.text};padding:6px 9px;font:inherit}
.acs-search{margin-left:auto}.acs-count{white-space:nowrap;color:${tokens.textDim};font-size:12px}
.acs-capabilities{display:flex;gap:7px;flex-wrap:wrap;padding:7px 16px;border-bottom:1px solid ${tokens.border};color:${tokens.textDim};font-size:11px}
.acs-capabilities span{border:1px solid ${tokens.border};border-radius:99px;padding:3px 8px}
.acs-library__body{flex:1;min-height:0;overflow:auto;padding:16px}
.acs-assets--grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
.acs-card{position:relative;display:flex;min-width:0;overflow:hidden;border:1px solid ${tokens.border};border-radius:12px;background:${tokens.panel}}
.acs-card.is-selected{outline:2px solid ${tokens.accent};outline-offset:1px}
.acs-card__open{display:flex;min-width:0;flex:1;flex-direction:column;text-align:left;border:0;background:transparent;color:${tokens.text};padding:0;cursor:pointer}
.acs-card__thumb{position:relative;display:grid;place-items:center;aspect-ratio:4/3;background:${tokens.panelAlt};color:${tokens.textDim};font-size:13px;overflow:hidden}
.acs-card__thumb img{width:100%;height:100%;object-fit:contain}.acs-card__thumb small{position:absolute;right:7px;bottom:7px;padding:2px 6px;border-radius:6px;background:#000b;color:white}
.acs-card__copy{display:grid;gap:6px;min-width:0;padding:10px}.acs-card__copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.acs-card__meta{display:flex;gap:5px;flex-wrap:wrap;color:${tokens.textDim};font-size:10px;font-style:normal}.acs-card__meta i{font-style:normal}.acs-card__state[data-state=live]{color:${tokens.good}}.acs-card__state[data-state=approved]{color:${tokens.accent}}.acs-card__state[data-state=review]{color:${tokens.warn}}.acs-card__state[data-state=rejected],.acs-card__state[data-state=superseded]{color:${tokens.bad}}.acs-card__usage{color:${tokens.good};font-size:10px}
.acs-card__action{position:absolute;top:5px;right:5px;width:34px;height:34px;border:1px solid ${tokens.border};border-radius:8px;background:${tokens.panel};color:${tokens.text};cursor:pointer}
.acs-assets--list{display:grid;gap:6px}.acs-assets--list .acs-card{align-items:center}.acs-assets--list .acs-card__open{flex-direction:row;align-items:center}.acs-assets--list .acs-card__thumb{width:76px;flex:0 0 76px;aspect-ratio:1}.acs-assets--list .acs-card__copy{flex:1}.acs-assets--list .acs-card__action{position:static;margin:8px}
.acs-state{display:grid;gap:7px;justify-items:center;padding:52px 18px;text-align:center;color:${tokens.textDim}}.acs-state strong{color:${tokens.text};font-size:16px}.acs-state--error,.acs-inline-error{color:${tokens.bad}}.acs-inline-error{padding:8px}.acs-load-more{display:flex;justify-content:center;padding:18px}
.acs-inspector{display:flex;flex:0 0 min(420px,42vw);min-width:320px;min-height:0;border-left:1px solid ${tokens.border};background:${tokens.panel}}
.acs-assistant{display:flex;flex:0 0 min(320px,30vw);min-height:0;overflow:auto;border-left:1px solid ${tokens.border};background:${tokens.bg}}
.acs-detail__actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.acs-detail__actions .acs-danger{border-color:${tokens.bad};color:${tokens.bad}}.acs-export-target{display:flex;align-items:center;gap:5px;color:${tokens.textDim};font-size:11px}
.acs-detail__scroll{flex:1;overflow-y:auto;padding:16px;overscroll-behavior:contain}.acs-number-field{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 0}.acs-text-field{display:block;padding:4px 0}.acs-field-input{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid ${tokens.border};border-radius:6px;background:${tokens.panelAlt};color:${tokens.text};font:inherit}.acs-field-input--number{width:90px;padding:4px 6px}.acs-preview{display:grid;place-items:center;min-height:180px;max-height:46vh;overflow:hidden;margin-bottom:12px;border:1px solid ${tokens.border};border-radius:10px;background:${tokens.panelAlt}}.acs-preview img,.acs-preview video,.acs-preview iframe{display:block;width:100%;height:100%;max-height:46vh;object-fit:contain;border:0}.acs-preview audio{width:calc(100% - 24px)}.acs-preview__fallback{padding:25px;color:${tokens.textDim};text-align:center}.acs-sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
@media(max-width:900px){.acs-shell{overflow:auto}.acs-assistant{display:none}.acs-inspector{position:absolute;inset:0;z-index:2;min-width:0;width:100%;flex:auto;border:0}.acs-collection-tabs{width:100%;flex-wrap:nowrap;overflow-x:auto}.acs-search{margin-left:0;flex:1}.acs-search input{width:100%}.acs-library__toolbar{align-items:stretch}.acs-count{margin-left:auto}}
@media(max-width:560px){.acs-library__toolbar{gap:6px;padding:9px}.acs-filter{flex:1}.acs-filter select{width:100%}.acs-layout-toggle{width:100%}.acs-layout-toggle button{flex:1}.acs-library__body{padding:9px}.acs-assets--grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.acs-card__meta i:nth-child(2){display:none}.acs-detail__actions button{min-height:40px}.acs-export-target{flex-wrap:wrap}.acs-inspector{height:100%;max-height:100%}}
`;
