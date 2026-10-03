import type { AgentMessage as ChatMessage } from "@inneranimalmedia/agentsam-contracts";
import type { RawRuntimeEvent } from "@inneranimalmedia/agentsam-loading-scene";
import { identitySessionExists, invokeLocalProvider, invokeStudioService, isPackagedDesktop } from "@/lib/desktop/tauri";

export async function streamChat(opts: {
  messages: Pick<ChatMessage, "role" | "content">[];
  mode: "trail" | "side";
  provider?: string;
  model_id?: string;
  parentTitle?: string | null;
  parentExcerpt?: string | null;
  workspace?: { path: string; content: string }[];
  signal: AbortSignal;
  operationId?: string;
  onActivity?: (event: RawRuntimeEvent) => void;
  onDelta: (chunk: string) => void;
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
    mode: opts.mode,
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
        opts.mode === "side" ? "Co-worker calling local model" : "Calling local model",
        opts.model_id,
      );
      const local = await invokeLocalProvider<{ ok?: boolean; error?: string; text?: string }>({
        operation: "chat",
        provider: opts.provider,
        model_id: opts.model_id,
        messages: requestBody.messages,
      });
      if (local.ok === true) {
        if (opts.signal.aborted) throw new DOMException("Aborted", "AbortError");
        emitActivity(
          "model.response.local",
          opts.mode === "side" ? "Co-worker received model response" : "Model response received",
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
        opts.mode === "side" ? "Co-worker using account model service" : "Using account model service",
        opts.model_id,
      );
      const bridged = await invokeStudioService({
        operation: "chat",
        body: requestBody,
      });
      if (bridged.ok) {
        emitActivity(
          "model.response.account",
          opts.mode === "side" ? "Co-worker received model response" : "Model response received",
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
    opts.mode === "side" ? "Co-worker calling model service" : "Calling model service",
    opts.model_id,
  );
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
        opts.mode === "side" ? "Co-worker receiving model output" : "Receiving model output",
        opts.model_id,
      );
    }
    full += chunk;
    opts.onDelta(chunk);
  }
  return full;
}
