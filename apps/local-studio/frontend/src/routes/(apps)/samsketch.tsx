import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNav } from "@inneranimalmedia/agentsam-nav";
import { useWorkStore } from "@/lib/work/store";
import { SamSketchAssistantPane, SamSketchMiniComposer } from "@/components/workbench/SamSketchAssistantPane";

type SamSketchContext = {
  id?: string;
  documentId?: string | null;
  revisionHash?: string | null;
  label?: string;
  page?: string;
  surface?: string;
  brand?: string;
  chapter?: number;
  selectedItem?: { id?: string; name?: string; kind?: string; partId?: string | null; position?: number[]; rotation?: number[]; scale?: number[]; color?: string } | null;
};
type SamSketchMessage = {
  channel?: string;
  version?: number;
  type?: string;
  surface?: string;
  selection?: SamSketchContext;
  context?: SamSketchContext;
  prompt?: string;
  skill?: string;
};

export const Route = createFileRoute("/(apps)/samsketch")({ component: SamSketchPage });

function SamSketchPage() {
  const { data,theme,accentColor } = useNav();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [selection, setSelection] = useState<SamSketchContext | null>(null);
  const [ready, setReady] = useState(false);
  const [editorSurface, setEditorSurface] = useState<"gallery"|"studio">("gallery");
  const [assistantOpen, setAssistantOpen] = useState(false);
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
        if(message.surface==="studio"||message.surface==="gallery")setEditorSurface(message.surface);
        postToSamSketch({type:"set-theme",theme:theme==='light'?'light':'dark',accent:accentColor});
        postToSamSketch({ type: "host-mode", mode: data.mode });
      }
      if (message.type === "surface" && (message.surface==="studio"||message.surface==="gallery"))setEditorSurface(message.surface);
      if (message.type === "selection" && message.selection) setSelection(message.selection);
      if (message.type === "assistant.request") {
        const prompt = typeof message.prompt === "string" ? message.prompt.trim() : "";
        if (!prompt) return;
        const context = message.context ?? selection ?? {};
        const store = useWorkStore.getState();
        const chatId = store.activeChatId || store.startChat();
        store.setActiveChat(chatId);
        const scene = {
          app: "SamSketch",
          label: context.label ?? "Entire scene",
          brand: context.brand,
          chapter: context.chapter,
          documentId: context.documentId,
          revisionHash: context.revisionHash,
          selectedItem: context.selectedItem ?? null,
        };
        store.setDraft(chatId, prompt + "\n\nCurrent SamSketch scene context:\n" + JSON.stringify(scene, null, 2));
        setAssistantOpen(true);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [data.mode, postToSamSketch, selection,theme,accentColor]);

  useEffect(() => {
    postToSamSketch({ type: "host-mode", mode: data.mode });
  }, [data.mode, postToSamSketch]);

  useEffect(() => {postToSamSketch({type:'set-theme',theme:theme==='light'?'light':'dark',accent:accentColor});},[theme,accentColor,postToSamSketch]);
  useEffect(() => {
    if(ready)postToSamSketch({type:"assistant-visibility",open:assistantOpen});
  },[ready,assistantOpen,postToSamSketch]);
  return (
    <div className="flex size-full min-h-0 overflow-hidden bg-background">
      <div className={"relative min-h-0 min-w-0 flex-1 overflow-hidden " + (assistantOpen ? "hidden md:block" : "block")}>
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
        {!assistantOpen && ready && editorSurface==="studio" && <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center px-3">
          <SamSketchMiniComposer selected={selection?.label} context={selection} onExpand={() => setAssistantOpen(true)} />
        </div>}
      </div>
      {assistantOpen && (
        <div className="flex h-full min-h-0 w-full shrink-0 flex-col border-l border-[#e7e8ed] bg-white md:w-[min(365px,38vw)]">
          <SamSketchAssistantPane selected={selection?.label} onCollapse={() => setAssistantOpen(false)} />
        </div>
      )}
      {!ready && <span className="sr-only" role="status">Loading SamSketch workspace</span>}
    </div>
  );
}
