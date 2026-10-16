import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Layers,
  RotateCw,
  Box,
  LayoutGrid,
  Code2,
  Cpu,
  SunMedium
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SideTab } from "@inneranimalmedia/agentsam-local-shared";
import {
  AGENTSAM_PREVIEW_BRIDGE_CHANNEL,
  AGENTSAM_PREVIEW_BRIDGE_VERSION
} from "@/lib/preview-host-bridge";
import { installCadHostBridge } from "@/lib/cad-host-bridge";
import { publishCadAssistantContext } from "@/lib/cad/assistantContext";

interface AppPreviewStageProps {
  tab?: SideTab;
  initialUrl?: string;
  appId?: string;
}

const CAD_WORKSPACES = [
  { id: "plan", label: "Plan", icon: LayoutGrid },
  { id: "model", label: "Model", icon: Box },
  { id: "parametric", label: "Parametric", icon: Code2 },
  { id: "robotics", label: "Robotics", icon: Cpu },
  { id: "render", label: "Render", icon: SunMedium },
];

function defaultCadUrl() {
  return "/cad-creator/index.html?presentation=embedded";
}

export function AppPreviewStage({
  tab,
  initialUrl,
  appId = "cad-creator"
}: AppPreviewStageProps) {
  const resolvedInitialUrl = initialUrl || defaultCadUrl();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [url, setUrl] = useState(tab?.url || resolvedInitialUrl);
  const [activeWorkspace, setActiveWorkspace] = useState("plan");
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

  // Switch workspace and notify framed app
  const handleSelectWorkspace = (wsId: string) => {
    setActiveWorkspace(wsId);
    postToGuest({
      type: "set-workspace",
      workspace: wsId,
    });
  };

  const [cadSelection, setCadSelection] = useState<unknown>(null);
  const [pendingProposal, setPendingProposal] = useState<{ summary: string } | null>(null);
  // Validated host bridge: origin/source checked; proposals surface for approval, never auto-apply.
  useEffect(() => {
    const dispose = installCadHostBridge(() => iframeRef.current, {
      onReady: () => setIsReady(true),
      onSelection: (sel) => setCadSelection(sel),
      onAssistantRequest: ({ request_id, prompt, selection }) => {
        // Real transport: publish into the host-owned conversation context (buffered + event,
        // same pattern as Database assistant). Reply is a transport receipt, not a model answer.
        publishCadAssistantContext({ request_id, prompt, selection });
        postToGuest({ type: "assistant.response", request_id, text: "Received by the Local Studio AgentSam conversation with your CAD selection context. Continue there for the full response and tool approvals." });
      },
      onProposal: (proposal) => setPendingProposal(proposal),
    });
    return dispose;
  }, []);

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
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs">
        {/* Left: App Identity & Status */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <span
              className={`size-2 rounded-full ${
                isReady ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
              }`}
            />
            <Layers className="size-3.5 text-indigo-500" />
            <span>AgentSam CAD Creator</span>
            <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono text-muted-foreground">
              v0.1.0
            </span>
          </div>
        </div>

        {/* Center: Host Workspace Controls */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
          {CAD_WORKSPACES.map((ws) => {
            const Icon = ws.icon;
            const isActive = activeWorkspace === ws.id;
            return (
              <button
                key={ws.id}
                type="button"
                onClick={() => handleSelectWorkspace(ws.id)}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all ${
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-3" />
                <span>{ws.label}</span>
              </button>
            );
          })}
        </div>

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
