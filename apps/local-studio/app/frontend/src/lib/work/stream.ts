import type { ChatMessage } from "@/lib/work/types";

export async function streamChat(opts: {
  messages: Pick<ChatMessage, "role" | "content">[];
  mode: "trail" | "side";
  model?: string;
  parentTitle?: string | null;
  parentExcerpt?: string | null;
  workspace?: { path: string; content: string }[];
  signal: AbortSignal;
  onDelta: (chunk: string) => void;
}): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      mode: opts.mode,
      model: opts.model,
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
