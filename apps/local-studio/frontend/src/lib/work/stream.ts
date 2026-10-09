import type { AgentMessage as ChatMessage, AgentRunMode } from "@inneranimalmedia/agentsam-contracts";
import type { RawRuntimeEvent } from "@inneranimalmedia/agentsam-loading-scene";
import { buildStudioSystemMessages, type StudioChatSurface } from "@inneranimalmedia/agentsam-local-shared/studio-chat-policy";
import { identitySessionExists, invokeLocalProvider, invokeStudioService, isPackagedDesktop } from "@/lib/desktop/tauri";

export async function streamChat(opts: {
  messages: Pick<ChatMessage, "role" | "content">[];
  surface: StudioChatSurface;
  runMode: AgentRunMode;
  provider?: string;
  model_id?: string;
  parentTitle?: string | null;
  parentExcerpt?: string | null;
  workspace?: { path: string; content: string }[];
  signal: AbortSignal;
  operationId?: string;
  onActivity?: (event: RawRuntimeEvent) => void;
  onDelta: (chunk: string) => void;
  /** Opt-in turn-one audit hook, not a default log. Contains full model context. */
  onPreparedTurn?: (payload: {
    source: string; stage: string; provider: string; model: string;
    instructions: null; messages: Array<{role:string;content:string}>;
    tools: unknown[]; workspace?: Array<{path:string;content:string}>;
  }) => void;
}): Promise<string> {
  if (!opts.provider || !opts.model_id) {
    throw new Error("Select a provider and model before chatting.");
  }

  const emitActivity = (type: string, label: string, detail?: string) => {
    opts.onActivity?.({
      type,
      operationId: opts.operationId,
      label,
      detail,
      timestamp: Date.now(),
    });
  };

  const requestBody = {
    messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    surface: opts.surface,
    run_mode: opts.runMode,
    provider: opts.provider,
    model_id: opts.model_id,
    parentTitle: opts.parentTitle ?? undefined,
    parentExcerpt: opts.parentExcerpt ?? undefined,
    workspace: opts.workspace,
  };

  if (isPackagedDesktop()) {
    if (opts.signal.aborted) throw new DOMException("Aborted", "AbortError");

    // Desktop is local-capable even while signed in. Try the same machine provider
    // authority used by the model picker/CLI first; the account service is an
    // additive fallback for credentials or models that only exist remotely.
    let localError = "";
    try {
      emitActivity(
        "provider.pending.local",
        opts.surface === "side" ? "Co-worker calling local model" : "Calling local model",
        opts.model_id,
      );
      const localMessages = [
        ...buildStudioSystemMessages({
          surface: opts.surface,
          runMode: opts.runMode,
          parentTitle: opts.parentTitle,
          parentExcerpt: opts.parentExcerpt,
          workspace: opts.workspace,
        }),
        ...requestBody.messages.filter((message) => message.role !== "system"),
      ];
      if (!opts.messages.some((m) => m.role === 'assistant')) opts.onPreparedTurn?.({
        source: 'local-studio', stage: 'desktop-provider-bridge', provider: opts.provider,
        model: opts.model_id, instructions: null,
        messages: localMessages, tools: [], workspace: opts.workspace,
      });
      const local = await invokeLocalProvider<{ ok?: boolean; error?: string; text?: string }>({
        operation: "chat",
        provider: opts.provider,
        model_id: opts.model_id,
        messages: localMessages,
      });
      if (local.ok === true) {
        if (opts.signal.aborted) throw new DOMException("Aborted", "AbortError");
        emitActivity(
          "model.response.local",
          opts.surface === "side" ? "Co-worker received model response" : "Model response received",
          opts.model_id,
        );
        const text = String(local.text || "");
        if (text) opts.onDelta(text);
        return text;
      }
      localError = local.error || "Local provider chat failed";
    } catch (error) {
      localError = error instanceof Error ? error.message : "Local provider chat failed";
    }

    if (await identitySessionExists().catch(() => false)) {
      emitActivity(
        "provider.pending.account",
        opts.surface === "side" ? "Co-worker using account model service" : "Using account model service",
        opts.model_id,
      );
      const bridged = await invokeStudioService({
        operation: "chat",
        body: requestBody,
      });
      if (bridged.ok) {
        emitActivity(
          "model.response.account",
          opts.surface === "side" ? "Co-worker received model response" : "Model response received",
          opts.model_id,
        );
        if (bridged.body) opts.onDelta(bridged.body);
        return bridged.body;
      }
      let message = "Studio model error " + bridged.status;
      try {
        const body = JSON.parse(bridged.body) as { error?: string; detail?: string };
        message = body.detail || body.error || message;
      } catch {
        /* preserve bounded fallback */
      }
      throw new Error(message);
    }

    throw new Error(localError || "Local provider chat failed");
  }

  emitActivity(
    "provider.pending.web",
    opts.surface === "side" ? "Co-worker calling model service" : "Calling model service",
    opts.model_id,
  );
  if (!opts.messages.some((m) => m.role === 'assistant')) opts.onPreparedTurn?.({
    source: 'local-studio', stage: 'hosted-chat-api',
    provider: opts.provider, model: opts.model_id,
    instructions: null, messages: requestBody.messages, tools: [], workspace: opts.workspace,
  });
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(requestBody),
    signal: opts.signal,
  });

  if (!res.ok) {
    let message = `Studio model error ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  if (!res.body) {
    const text = await res.text();
    if (text) opts.onDelta(text);
    return text;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let reportedResponse = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (!chunk) continue;
    if (!reportedResponse) {
      reportedResponse = true;
      emitActivity(
        "model.response.web",
        opts.surface === "side" ? "Co-worker receiving model output" : "Receiving model output",
        opts.model_id,
      );
    }
    full += chunk;
    opts.onDelta(chunk);
  }
  return full;
}
