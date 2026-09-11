import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { DEFAULT_MODEL_ID, MODEL_IDS, getModel } from "@/lib/work/models";

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
  model: z.string().max(80).optional(),
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

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.XAI_API_KEY;
        if (!apiKey) {
          return Response.json({ error: "AI is not available in this environment." }, { status: 503 });
        }

        let parsed: z.infer<typeof Body>;
        try {
          parsed = Body.parse(await request.json());
        } catch {
          return Response.json({ error: "Invalid request." }, { status: 400 });
        }

        const mode = parsed.mode ?? "trail";
        const modelId = parsed.model && MODEL_IDS.has(parsed.model) ? parsed.model : DEFAULT_MODEL_ID;
        const model = getModel(modelId);
        const system = mode === "side" ? SIDE_SYSTEM : TRAIL_SYSTEM;
        const messages: { role: string; content: string }[] = [{ role: "system", content: system }];

        if (modelId === "grok-build-0.1") {
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

        const maxTokens = mode === "side" ? Math.min(2200, model.maxTokens) : model.maxTokens;

        const upstream = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model.id,
            stream: true,
            temperature: model.id === "grok-build-0.1" ? 0.4 : 0.6,
            max_tokens: maxTokens,
            messages,
          }),
        });

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
                    };
                    const delta = json.choices?.[0]?.delta?.content;
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
          },
        });
      },
    },
  },
});
