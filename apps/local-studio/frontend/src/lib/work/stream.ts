import type { AgentMessage as ChatMessage } from "@inneranimalmedia/agentsam-contracts";
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
  onDelta: (chunk: string) => void;
}): Promise<string> {
  if (!opts.provider || !opts.model_id) {
    throw new Error("Select a provider and model before chatting.");
  }

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
    if (await identitySessionExists()) {
      const bridged = await invokeStudioService({
        operation: "chat",
        body: requestBody,
      });
      if (!bridged.ok) {
        let message = "Studio model error " + bridged.status;
        try {
          const body = JSON.parse(bridged.body) as { error?: string; detail?: string };
          message = body.detail || body.error || message;
        } catch {
          /* preserve bounded fallback */
        }
        throw new Error(message);
      }
      if (bridged.body) opts.onDelta(bridged.body);
      return bridged.body;
    }

    const local = await invokeLocalProvider<{ ok?: boolean; error?: string; text?: string }>({
      operation: "chat",
      provider: opts.provider,
      model_id: opts.model_id,
      messages: requestBody.messages,
    });
    if (local.ok !== true) throw new Error(local.error || "Local provider chat failed");
    if (opts.signal.aborted) throw new DOMException("Aborted", "AbortError");
    const text = String(local.text || "");
    if (text) opts.onDelta(text);
    return text;
  }

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
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (!chunk) continue;
    full += chunk;
    opts.onDelta(chunk);
  }
  return full;
}
