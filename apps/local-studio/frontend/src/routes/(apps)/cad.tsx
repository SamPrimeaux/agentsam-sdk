import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { installCadHostBridge, postToCadGuest } from "@/lib/cad-host-bridge";
import { publishCadAssistantContext } from "@/lib/cad/assistantContext";

interface CadSearchParams { url?: string; workspace?: string }
export const Route = createFileRoute("/(apps)/cad")({
  validateSearch: (search: Record<string, unknown>): CadSearchParams => ({
    url: typeof search.url === "string" ? search.url : undefined,
    workspace: typeof search.workspace === "string" ? search.workspace : undefined,
  }),
  component: CadStudioPage,
});

function CadStudioPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [selection, setSelection] = useState<any>(null);
  const [proposal, setProposal] = useState<any>(null);
  useEffect(() => installCadHostBridge(() => iframeRef.current, {
    onSelection: (sel) => setSelection(sel),
    onAssistantRequest: ({ request_id, prompt, selection: sel }) => {
      publishCadAssistantContext({ request_id, prompt, selection: sel });
      postToCadGuest(iframeRef.current, { type: "assistant.response", request_id, text: "Received by the Local Studio AgentSam conversation with your CAD selection context. Continue there for the full response and tool approvals." });
    },
    onProposal: (p) => setProposal(p),
  }), []);
  return (
    <div className="flex size-full flex-col overflow-hidden bg-background">
      {(selection || proposal) && (
        <div className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-[11px]">
          {selection && <span>Selected: {selection.object?.label} · {selection.object?.id} · rev {selection.revision}</span>}
          {proposal && <span className="text-amber-500">Proposal awaiting host approval: {proposal.summary} (never auto-applied)</span>}
        </div>
      )}
      <iframe ref={iframeRef} title="CAD Creator" src="/cad-creator/index.html?presentation=embedded" className="min-h-0 flex-1 border-0" allow="fullscreen" />
    </div>
  );
}
