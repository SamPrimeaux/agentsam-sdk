import { defineHandler } from "nitro/h3";
import { cloudflareEnv, hasSdkBearer, ollamaViaExecOs, OLLAMA_DEFAULTS } from "../../../lib/cloudflare-runtime";

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event);
  if (!(await hasSdkBearer(event.req as unknown as Request, env))) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = (await event.req.json().catch(() => ({}))) as {
    model?: string;
    messages?: unknown[];
    options?: Record<string, unknown>;
  };
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ ok: false, error: "messages_required" }, { status: 400 });
  }
  const result = await ollamaViaExecOs(env, "/api/chat", {
    model: body.model || env.OLLAMA_MODEL || OLLAMA_DEFAULTS.model,
    messages: body.messages,
    options: body.options,
    stream: false,
  });
  if (!result.ok) return Response.json(result, { status: result.status });
  return new Response(result.body, { status: result.status, headers: { "content-type": "application/json" } });
});
