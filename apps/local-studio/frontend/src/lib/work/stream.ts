import type { AgentMessage as ChatMessage } from "@inneranimalmedia/agentsam-contracts";

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

  const userId =
    (typeof window !== "undefined" && window.localStorage.getItem("agentsam-user-id")) ||
    "studio-local";

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": userId,
    },
    body: JSON.stringify({
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      mode: opts.mode,
      provider: opts.provider,
      model_id: opts.model_id,
      parentTitle: opts.parentTitle ?? undefined,
      parentExcerpt: opts.parentExcerpt ?? undefined,
      workspace: opts.workspace,
    }),
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
