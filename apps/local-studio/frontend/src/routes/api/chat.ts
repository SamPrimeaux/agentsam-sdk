import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  assertModelAvailable,
  buildStudioInventory,
  platformCredentials,
  WORKERS_AI_CURATED,
} from "@inneranimalmedia/agentsam-local-shared/studio-inventory";
import {
  mergeStudioCredentials,
  resolveStudioUserId,
  shouldUseWorkersAI,
  studioServerBindings,
  vaultCredentialsForUser,
} from "@inneranimalmedia/agentsam-local-shared/studio-vault";

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

type ChatMessage = { role: string; content: string };

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

/**
 * Run a Cloudflare chat turn through the Workers AI binding (request/response,
 * not SSE). The binding object is opaque on purpose — only `.run()` is used.
 */
async function runWorkersAIText(
  binding: unknown,
  modelId: string,
  messages: ChatMessage[],
): Promise<string> {
  const run = (binding as { run?: unknown }).run;
  if (typeof run !== "function") throw new Error("workers_ai_binding_unavailable");
  const out = await (run as (model: string, input: unknown) => Promise<unknown>).call(
    binding,
    modelId,
    { messages },
  );
  if (typeof out === "string" && out) return out;
  const text = (out as { response?: unknown } | null)?.response;
  if (typeof text === "string" && text) return text;
  throw new Error("workers_ai_unexpected_response");
}

/**
 * Token fallback for Cloudflare when no Workers AI binding is exposed
 * (local dev): plain REST `ai/run`, returned as a single text payload.
 */
async function runCloudflareRestText(
  apiKey: string,
  accountId: string,
  modelId: string,
  messages: ChatMessage[],
): Promise<string> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${encodeURIComponent(modelId)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ messages }),
    },
  );
  const body = (await res.json().catch(() => null)) as {
    success?: boolean;
    result?: { response?: unknown };
    errors?: Array<{ message?: string }>;
  } | null;
  if (!res.ok || body?.success === false) {
    throw new Error(body?.errors?.[0]?.message || `cloudflare_rest_${res.status}`);
  }
  const text = body?.result?.response;
  if (typeof text !== "string" || !text) throw new Error("cloudflare_rest_empty_response");
  return text;
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const request = (ctx as { request: Request }).request;
        let parsed: z.infer<typeof Body>;
        try {
          parsed = Body.parse(await request.json());
        } catch {
          return Response.json({ error: "Invalid request." }, { status: 400 });
        }

        const provider = parsed.provider.trim().toLowerCase();
        const providerId = provider === "xai" ? "grok" : provider;
        const modelId = parsed.model_id.trim();

        // Session -> user_id -> vault BYOK -> platform fallback. In production
        // the Worker edge binds X-User-Id to the validated session before
        // Nitro runs; vault rows are unwrapped server-side (AES-256-GCM, same
        // contract as backend/worker/index.js) and never leave the server.
        const bindings = studioServerBindings(ctx);
        const userId = resolveStudioUserId(request);
        const vault = userId ? await vaultCredentialsForUser(bindings, userId) : new Map();
        const credentials = mergeStudioCredentials(vault, platformCredentials(bindings.env));

        const viaWorkersAI = shouldUseWorkersAI(providerId, bindings.workersAI);
        const credential = viaWorkersAI ? null : credentials.get(providerId);
        const apiKey = credential?.value || "";
        if (!viaWorkersAI && !apiKey) {
          return Response.json(
            {
              error: `provider_credential_unavailable:${providerId}`,
              detail: "No Studio credential for the selected provider. Connect that provider — do not expect another key to substitute.",
            },
            { status: 503 },
          );
        }

        try {
          if (viaWorkersAI) {
            // Binding-only lane has no token for live discovery: validate
            // against the curated Workers AI allowlist instead.
            if (!(WORKERS_AI_CURATED as readonly string[]).includes(modelId)) {
              throw new Error(`selected_model_not_available_for_credential:${providerId}:${modelId}`);
            }
          } else {
            const inventory = await buildStudioInventory(credentials);
            assertModelAvailable(inventory, providerId, modelId);
          }
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

        const plainHeaders = {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Content-Type-Options": "nosniff",
          "X-AgentSam-Provider": providerId,
          "X-AgentSam-Model": modelId,
        };

        // Cloudflare lane: Workers AI binding first, token REST fallback.
        // Both are request/response (no SSE), so the turn returns as one text
        // payload on the same plain-text contract as the streamed lanes.
        if (providerId === "cloudflare") {
          try {
            const accountId =
              credential?.account_id ||
              bindings.env.CLOUDFLARE_ACCOUNT_ID ||
              bindings.env.ACCOUNT_ID ||
              "";
            const text = viaWorkersAI
              ? await runWorkersAIText(bindings.workersAI, modelId, messages)
              : await runCloudflareRestText(apiKey, accountId, modelId, messages);
            return new Response(text, { headers: plainHeaders });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return Response.json(
              { error: `Studio model error cloudflare: ${message.slice(0, 180)}` },
              { status: 502 },
            );
          }
        }

        const upstream = await upstreamFor(providerId, modelId, apiKey, chatBody);
        if (!upstream) {
          return Response.json(
            { error: `unsupported_studio_provider:${providerId}` },
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
            ...plainHeaders,
          },
        });
      },
    },
  },
});
