import { defineHandler } from "nitro/h3";
import { cloudflareEnv, ollamaViaExecOs, OLLAMA_DEFAULTS } from "../../../lib/cloudflare-runtime";

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event);
  const body = (await event.req.json().catch(() => ({}))) as { model?: string; prompt?: string };
  const prompt = String(body.prompt || "");
  if (!prompt) return Response.json({ ok: false, error: "prompt_required" }, { status: 400 });
  const result = await ollamaViaExecOs(env, "/api/embeddings", {
    model: body.model || env.OLLAMA_EMBED_MODEL || OLLAMA_DEFAULTS.embedModel,
    prompt,
  });
  if (!result.ok) return Response.json(result, { status: result.status });
  return new Response(result.body, { status: result.status, headers: { "content-type": "application/json" } });
});
