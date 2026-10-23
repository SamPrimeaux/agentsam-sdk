import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { installCadHostBridge, postToCadGuest } from "@/lib/cad-host-bridge";
import { runCadAssistantTurn } from "@/lib/cad/assistantTurn";
import { approveCadProposal, isLocalCadExecutionHost } from "@/lib/cad/approval";
import type { CadHostHandlers, CadSelectionContext } from "@/lib/cad-host-bridge";
import { Nav, useNav } from "@inneranimalmedia/agentsam-nav";
import { CadConversationPane } from "@/components/workbench/CadConversationPane";

interface CadSearchParams { url?: string; workspace?: string }
export const Route = createFileRoute("/(apps)/cad")({
  validateSearch: (search: Record<string, unknown>): CadSearchParams => ({
    url: typeof search.url === "string" ? search.url : undefined,
    workspace: typeof search.workspace === "string" ? search.workspace : undefined,
  }),
  component: CadStudioPage,
});

function CadStudioPage() {
  const { data } = useNav();
  const chatOpen = data.mode === "chat";
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [selection, setSelection] = useState<CadSelectionContext | null>(null);
  const [proposal, setProposal] = useState<Parameters<NonNullable<CadHostHandlers["onProposal"]>>[0] | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState("");
  useEffect(() => installCadHostBridge(() => iframeRef.current, {
    onSelection: (sel) => setSelection(sel),
    onAssistantRequest: ({ request_id, prompt, selection: sel }) => {
      void runCadAssistantTurn({ request_id, prompt, selection: sel }, (text) => {
        postToCadGuest(iframeRef.current, { type: "assistant.response", request_id, text });
      }).catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : "cad_assistant_unavailable";
        postToCadGuest(iframeRef.current, { type: "assistant.response", request_id, text: `AgentSam request failed: ${reason}` });
      });
    },
    onProposal: (p) => { setProposal(p); setApprovalStatus(""); },
  }), []);
  const canExecute = typeof window !== "undefined" && isLocalCadExecutionHost(window.location.hostname);
  const approve = async () => {
    if (!proposal || approvalBusy) return;
    setApprovalBusy(true);
    setApprovalStatus("");
    try {
      const receipt = await approveCadProposal(proposal, selection, window.location.hostname);
      setProposal(null);
      setApprovalStatus("Approved CAD revision applied through local project authority.");
      void receipt;
    } catch (error) {
      setApprovalStatus(error instanceof Error ? error.message : "cad_revision_write_failed");
    } finally {
      setApprovalBusy(false);
    }
  };
  return (
    <div className="flex size-full flex-col overflow-hidden bg-background">
      {!data.brand && <Nav.Topbar startup showNavigationTrigger={false} />}
      {(selection || proposal || approvalStatus) && (
        <div className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-[11px]">
          {selection && <span>Selected: {selection.object?.label} · {selection.object?.id} · rev {selection.revision}</span>}
          {proposal && <span className="text-amber-500">Proposal awaiting approval: {proposal.summary}</span>}
          {proposal && <button type="button" disabled={!canExecute || approvalBusy} onClick={() => void approve()}
            className="rounded border border-border px-2 py-1 disabled:opacity-40">Approve & apply</button>}
          {proposal && !canExecute && <span>Local CAD host required</span>}
          {approvalStatus && <span role="status">{approvalStatus}</span>}
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {chatOpen && <CadConversationPane selected={selection?.object.label} />}
        <iframe ref={iframeRef} title="CAD Creator" src="/cad-creator/index.html?presentation=embedded&access=owner"
          className={"min-h-0 min-w-0 flex-1 border-0 "+(chatOpen ? "hidden md:block" : "block")} allow="fullscreen" />
      </div>
    </div>
  );
}
