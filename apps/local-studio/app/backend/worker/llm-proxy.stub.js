// Drop into agentsam-grok-workmode (UI Worker) — PROXY ONLY.
// Ollama stays on the iMac behind the tunnel. No GGUF on the edge.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/llm/health" && request.method === "GET") {
      try {
        const r = await fetch(`${env.OLLAMA_BASE_URL}/api/tags`, {
          headers: auth(env),
        });
        return json({ ok: r.ok, status: r.status, model: env.OLLAMA_MODEL });
      } catch (err) {
        return json({ ok: false, error: "Local model offline", detail: String(err) }, 503);
      }
    }

    if (url.pathname === "/api/llm/chat" && request.method === "POST") {
      const body = await request.json();
      const packet = body.packet || body.prompt || "";
      const r = await fetch(`${env.OLLAMA_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { ...auth(env), "content-type": "application/json" },
        body: JSON.stringify({
          model: env.OLLAMA_MODEL || "qwen2.5-coder",
          stream: false,
          messages: [
            { role: "system", content: env.WORKMODE_SYSTEM || "JSON only. Packet in." },
            { role: "user", content: packet },
          ],
        }),
      });
      return new Response(await r.text(), {
        status: r.status,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.pathname === "/api/llm/embed" && request.method === "POST") {
      const body = await request.json();
      const r = await fetch(`${env.OLLAMA_BASE_URL}/api/embeddings`, {
        method: "POST",
        headers: { ...auth(env), "content-type": "application/json" },
        body: JSON.stringify({
          model: env.OLLAMA_EMBED_MODEL || "mxbai-embed-large",
          prompt: body.prompt || "",
        }),
      });
      return new Response(await r.text(), {
        status: r.status,
        headers: { "content-type": "application/json" },
      });
    }

    return json({ error: "not found" }, 404);
  },
};

function auth(env) {
  const h = {};
  if (env.OLLAMA_TOKEN) h.Authorization = `Bearer ${env.OLLAMA_TOKEN}`;
  return h;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
