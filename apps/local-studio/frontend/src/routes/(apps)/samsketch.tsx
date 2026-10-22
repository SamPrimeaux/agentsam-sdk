import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNav } from "@inneranimalmedia/agentsam-nav";
import { useWorkStore } from "@/lib/work/store";
import { WorkspaceConversationPane } from "@/components/workbench/CadConversationPane";

type SamSketchContext = {
  id?: string;
  label?: string;
  page?: string;
  surface?: string;
  brand?: string;
  chapter?: number;
  selectedItem?: { id?: string; name?: string; kind?: string; position?: number[]; rotation?: number[]; scale?: number[]; color?: string } | null;
};
type SamSketchMessage = {
  channel?: string;
  version?: number;
  type?: string;
  selection?: SamSketchContext;
  context?: SamSketchContext;
  prompt?: string;
  skill?: string;
};

export const Route = createFileRoute("/(apps)/samsketch")({ component: SamSketchPage });

function SamSketchPage() {
  const { data } = useNav();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [selection, setSelection] = useState<SamSketchContext | null>(null);
  const [ready, setReady] = useState(false);
  const chatOpen = data.mode === "chat";
  const postToSamSketch = useCallback((message: { type: string; [key: string]: unknown }) => {
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    target.postMessage({ ...message, channel: "agentsam.samsketch.v1", version: 1 }, window.location.origin);
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent<SamSketchMessage>) {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      const message = event.data;
      if (message?.channel !== "agentsam.samsketch.v1" || message.version !== 1) return;
      if (message.type === "ready") {
        setReady(true);
        postToSamSketch({ type: "host-mode", mode: data.mode });
      }
      if (message.type === "selection" && message.selection) setSelection(message.selection);
      if (message.type === "assistant.request") {
        const prompt = typeof message.prompt === "string" ? message.prompt.trim() : "";
        if (!prompt) return;
        const context = message.context ?? selection ?? {};
        const store = useWorkStore.getState();
        const trailId = store.activeTrailId || store.startTrail();
        store.setActiveTrail(trailId);
        const scene = {
          app: "SamSketch",
          label: context.label ?? "Entire scene",
          brand: context.brand,
          chapter: context.chapter,
          selectedItem: context.selectedItem ?? null,
        };
        store.setDraft(trailId, prompt + "\n\nCurrent SamSketch scene context:\n" + JSON.stringify(scene, null, 2));
        data.onModeChange?.("chat");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [data.mode, data.onModeChange, postToSamSketch, selection]);

  useEffect(() => {
    postToSamSketch({ type: "host-mode", mode: data.mode });
  }, [data.mode, postToSamSketch]);

  return (
    <div className="flex size-full min-h-0 overflow-hidden bg-background">
      <div className={"min-h-0 min-w-0 flex-1 overflow-hidden " + (chatOpen ? "hidden md:block" : "block")}>
        <iframe
          ref={iframeRef}
          title="SamSketch model and scene studio"
          src="/samsketch/index.html?presentation=embedded"
          className="size-full border-0"
          allow="fullscreen"
          onLoad={() => {
            setReady(false);
            postToSamSketch({ type: "host-mode", mode: data.mode });
          }}
        />
      </div>
      {chatOpen && (
        <div className="flex h-full min-h-0 w-full shrink-0 flex-col border-l border-border bg-background md:w-[min(420px,42vw)]">
          <WorkspaceConversationPane workspace="SamSketch" selected={selection?.label} />
        </div>
      )}
      {!ready && <span className="sr-only" role="status">Loading SamSketch workspace</span>}
    </div>
  );
}
