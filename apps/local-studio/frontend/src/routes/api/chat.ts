import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  assertModelAvailable,
  buildStudioInventory,
  platformCredentials,
} from "@inneranimalmedia/agentsam-local-shared/studio-inventory";

const Body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().max(12000),
      }),
    )
    .min(1)
    .max(24),
  mode: z.enum(["trail", "side"]).optional(),
  provider: z.string().min(1).max(40),
  model_id: z.string().min(1).max(160),
  parentTitle: z.string().max(200).optional(),
  parentExcerpt: z.string().max(8000).optional(),
  workspace: z
    .array(z.object({ path: z.string().max(240), content: z.string().max(8000) }))
    .max(24)
    .optional(),
});

const TRAIL_SYSTEM = `You are AgentSam, the lead studio operator for InnerAnimalMedia.
Calm, precise, no fluff. Help with software, writing, research, and shipping work.
This workbench has a virtual git workspace, Monaco, an in-app browser, an xterm CLI with live Cloudflare Pages deploy feeds, and GitHub / Cloudflare ship methods.

Co-worker side chats can help you in parallel — they report brief handoffs back into this lead chat when they finish a reply.

When you create or edit files, use fenced code blocks tagged with a path:
\`\`\`html index.html
\`\`\`
Prefer short structured answers. Do not use emoji unless asked.
For deploys, tell the user they can run \`wrangler pages deploy\` or \`git push\` in the CLI after adding tokens in Ship — the CLI streams real Cloudflare API progress.`;

const SIDE_SYSTEM = `You are an AgentSam co-worker: a focused specialist helping the lead agent in the main project chat.
Be concise and actionable. You share the same project workspace. Advance the lead's work — research, draft files, review, or unblock — without restating the whole thread.
When you create files, fence them with a path. No emoji unless asked.
Assume a short summary of your reply will be handed back to the lead chat.`;

const BUILD_EXTRA = `You are in vibecode mode. Write complete, runnable files. Prefer small static sites, wrangler.toml, and GitHub Actions that deploy to Cloudflare Pages.`;

function platformCredential(provider: string, env: NodeJS.ProcessEnv) {
  const id = provider.toLowerCase();
  if (id === "openai") return env.OPENAI_API_KEY || "";
  if (id === "anthropic") return env.ANTHROPIC_API_KEY || "";
  if (id === "gemini") return env.GEMINI_API_KEY || "";
  if (id === "grok" || id === "xai") return env.XAI_API_KEY || "";
  if (id === "cursor") return env.CURSOR_API_KEY || "";
  if (id === "cloudflare") return env.CLOUDFLARE_API_TOKEN || "";
  return "";
}

function upstreamFor(provider: string, modelId: string, apiKey: string, body: unknown) {
  const id = provider.toLowerCase();
  if (id === "openai") {
    return fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  }
  if (id === "grok" || id === "xai") {
    return fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  }
  if (id === "anthropic") {
    const parsed = body as {
      messages: Array<{ role: string; content: string }>;
      max_tokens: number;
      stream: boolean;
      temperature: number;
    };
    const system = parsed.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const messages = parsed.messages.filter((m) => m.role !== "system");
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: parsed.max_tokens,
        stream: true,
        system: system || undefined,
        messages,
      }),
    });
  }
  if (id === "gemini") {
    return fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: (body as { messages: Array<{ role: string; content: string }> }).messages
            .filter((m) => m.role !== "system")
            .map((m) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }],
            })),
        }),
      },
    );
  }
  return null;
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed: z.infer<typeof Body>;
        try {
          parsed = Body.parse(await request.json());
        } catch {
          return Response.json({ error: "Invalid request." }, { status: 400 });
        }

        const provider = parsed.provider.trim().toLowerCase();
        const modelId = parsed.model_id.trim();
        const apiKey = platformCredential(provider, process.env);
        if (!apiKey) {
          return Response.json(
            {
              error: `provider_credential_unavailable:${provider}`,
              detail: "No Studio credential for the selected provider. Connect that provider — do not expect another key to substitute.",
            },
            { status: 503 },
          );
        }

        try {
          const inventory = await buildStudioInventory(platformCredentials(process.env));
          assertModelAvailable(inventory, provider === "xai" ? "grok" : provider, modelId);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return Response.json({ error: message }, { status: 409 });
        }

        const mode = parsed.mode ?? "trail";
        const system = mode === "side" ? SIDE_SYSTEM : TRAIL_SYSTEM;
        const messages: { role: string; content: string }[] = [{ role: "system", content: system }];

        if (/build/i.test(modelId)) {
          messages.push({ role: "system", content: BUILD_EXTRA });
        }

        if (mode === "side" && parsed.parentTitle) {
          messages.push({
            role: "system",
            content: `You are assisting the lead chat “${parsed.parentTitle}”. Treat this as living context from the lead agent — help them finish the job:\n\n${parsed.parentExcerpt ?? "(lead chat is empty)"}`,
          });
        }

        if (parsed.workspace?.length) {
          const listing = parsed.workspace
            .map((f) => `## ${f.path}\n${f.content}`)
            .join("\n\n")
            .slice(0, 40000);
          messages.push({
            role: "system",
            content: `Current project workspace (virtual). Edit by rewriting fenced files with paths.\n\n${listing}`,
          });
        }

        for (const message of parsed.messages) {
          if (message.role === "system") continue;
          messages.push({ role: message.role, content: message.content });
        }

        const maxTokens = mode === "side" ? 2200 : 4200;
        const chatBody = {
          model: modelId,
          stream: true,
          temperature: 0.6,
          max_tokens: maxTokens,
          messages,
        };

        const upstream = await upstreamFor(provider, modelId, apiKey, chatBody);
        if (!upstream) {
          return Response.json(
            { error: `unsupported_studio_provider:${provider}` },
            { status: 400 },
          );
        }

        if (!upstream.ok || !upstream.body) {
          const detail = await upstream.text().catch(() => "");
          return Response.json(
            { error: `Studio model error ${upstream.status}${detail ? `: ${detail.slice(0, 180)}` : ""}` },
            { status: 502 },
          );
        }

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            let buffer = "";
            try {
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed.startsWith("data:")) continue;
                  const data = trimmed.slice(5).trim();
                  if (!data || data === "[DONE]") continue;
                  try {
                    const json = JSON.parse(data) as {
                      choices?: { delta?: { content?: string } }[];
                      type?: string;
                      delta?: { text?: string };
                      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
                    };
                    const openAiDelta = json.choices?.[0]?.delta?.content;
                    const anthropicDelta =
                      json.type === "content_block_delta" ? json.delta?.text : undefined;
                    const geminiDelta = json.candidates?.[0]?.content?.parts?.[0]?.text;
                    const delta = openAiDelta || anthropicDelta || geminiDelta;
                    if (delta) controller.enqueue(encoder.encode(delta));
                  } catch {
                    /* ignore malformed chunks */
                  }
                }
              }
            } catch (err) {
              controller.error(err);
              return;
            }
            controller.close();
          },
          cancel() {
            reader.cancel().catch(() => undefined);
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Content-Type-Options": "nosniff",
            "X-AgentSam-Provider": provider,
            "X-AgentSam-Model": modelId,
          },
        });
      },
    },
  },
});
