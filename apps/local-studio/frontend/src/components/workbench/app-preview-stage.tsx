import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Layers,
  RotateCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SideTab } from "@inneranimalmedia/agentsam-local-shared";
import {
  AGENTSAM_PREVIEW_BRIDGE_CHANNEL,
  AGENTSAM_PREVIEW_BRIDGE_VERSION
} from "@/lib/preview-host-bridge";
import { installCadHostBridge } from "@/lib/cad-host-bridge";
import { canonicalCadPreviewUrl } from "@/lib/cad/cad-embed-url";
import { runCadAssistantTurn } from "@/lib/cad/assistantTurn";
import { approveCadProposal, isLocalCadExecutionHost } from "@/lib/cad/approval";
import type { CadHostHandlers, CadSelectionContext } from "@/lib/cad-host-bridge";

interface AppPreviewStageProps {
  tab?: SideTab;
  initialUrl?: string;
  appId?: string;
}

function defaultCadUrl() {
  return canonicalCadPreviewUrl();
}

export function AppPreviewStage({
  tab,
  initialUrl,
  appId = "cad-creator"
}: AppPreviewStageProps) {
  const resolvedInitialUrl = initialUrl || defaultCadUrl();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [url, setUrl] = useState(canonicalCadPreviewUrl(tab?.url || resolvedInitialUrl));
  const [reloadKey, setReloadKey] = useState(0);
  const [isReady, setIsReady] = useState(false);

  // Send message to framed guest app
  const postToGuest = (message: { type: string; [key: string]: unknown }) => {
    if (!iframeRef.current?.contentWindow) return;
    try {
      iframeRef.current.contentWindow.postMessage(
        {
          ...message,
          channel: AGENTSAM_PREVIEW_BRIDGE_CHANNEL,
          version: AGENTSAM_PREVIEW_BRIDGE_VERSION,
        },
        window.location.origin
      );
    } catch {
      // ignore cross-origin postMessage errors
    }
  };

  const [cadSelection, setCadSelection] = useState<CadSelectionContext | null>(null);
  const [pendingProposal, setPendingProposal] = useState<Parameters<NonNullable<CadHostHandlers["onProposal"]>>[0] | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState("");
  // Validated host bridge: origin/source checked; proposals surface for approval, never auto-apply.
  useEffect(() => {
    const dispose = installCadHostBridge(() => iframeRef.current, {
      onReady: () => setIsReady(true),
      onSelection: (sel) => setCadSelection(sel),
      onAssistantRequest: ({ request_id, prompt, selection }) => {
        void runCadAssistantTurn({ request_id, prompt, selection }, (text) => {
          postToGuest({ type: "assistant.response", request_id, text });
        }).catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : "cad_assistant_unavailable";
          postToGuest({ type: "assistant.response", request_id, text: `AgentSam request failed: ${reason}` });
        });
      },
      onProposal: (proposal) => setPendingProposal(proposal),
    });
    return dispose;
  }, []);

  const canApprove = typeof window !== "undefined" && isLocalCadExecutionHost(window.location.hostname);
  const handleApprove = async () => {
    if (!pendingProposal || approvalBusy) return;
    setApprovalBusy(true);
    setApprovalStatus("");
    try {
      await approveCadProposal(pendingProposal, cadSelection, window.location.hostname);
      setPendingProposal(null);
      setApprovalStatus("Approved CAD revision applied.");
    } catch (error) {
      setApprovalStatus(error instanceof Error ? error.message : "cad_revision_write_failed");
    } finally {
      setApprovalBusy(false);
    }
  };

  const handleReload = () => {
    setIsReady(false);
    setReloadKey((k) => k + 1);
  };

  const handleOpenExternal = () => {
    const cleanUrl = url.replace(/[?&]presentation=embedded/, "");
    window.open(cleanUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background font-sans">
      {/* Top Preview Host Bar */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3 text-xs">
        {/* Left: App Identity & Status */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <span
              className={`size-2 rounded-full ${
                isReady ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
              }`}
            />
            <Layers className="size-3.5 text-indigo-500" />
            <span>CAD Creator</span>
          </div>
        </div>

        {/* CAD owns its own three-view navigation; the host never duplicates
            workspace controls or sends independent navigation state. */}
        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Reload preview"
            onClick={handleReload}
          >
            <RotateCw className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Open external"
            onClick={handleOpenExternal}
          >
            <ExternalLink className="size-3.5" />
          </Button>
        </div>
      </div>

      {(pendingProposal || approvalStatus) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
          {pendingProposal && <span>CAD proposal: {pendingProposal.summary}</span>}
          {pendingProposal && <button type="button" onClick={() => void handleApprove()}
            disabled={!canApprove || approvalBusy} className="rounded border px-2 py-1 disabled:opacity-40">Approve & apply</button>}
          {pendingProposal && !canApprove && <span>Local CAD host required</span>}
          {approvalStatus && <span role="status">{approvalStatus}</span>}
        </div>
      )}
      {/* Embedded Iframe Stage */}
      <div className="relative min-h-0 flex-1 bg-black">
        <iframe
          key={reloadKey}
          ref={iframeRef}
          src={url}
          title="AgentSam CAD Creator Preview"
          className="size-full border-0"
          allow="accelerometer; camera; gyroscope; microphone; cross-origin-isolated"
          onLoad={() => {
            postToGuest({ type: "hello" });
          }}
        />
      </div>
    </div>
  );
}
