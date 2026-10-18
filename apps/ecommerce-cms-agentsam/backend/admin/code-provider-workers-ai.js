function parseJson(raw, fallback = {}) {
  try {
    if (raw == null || raw === "") return fallback;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

function extractAssistantText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (typeof payload?.result?.response === "string") return payload.result.response;
  if (typeof payload?.response === "string") return payload.response;
  return "";
}

function chunkText(text, size = 640) {
  const value = String(text || "");
  if (!value) return [];
  const chunks = [];
  let cursor = 0;
  while (cursor < value.length) {
    const next = Math.min(value.length, cursor + size);
    const boundary = value.lastIndexOf("\n", next);
    const end = boundary > cursor + Math.floor(size / 2) ? boundary + 1 : next;
    chunks.push(value.slice(cursor, end));
    cursor = end;
  }
  return chunks;
}

async function selectCodeModel(env, accountId, capability) {
  const sql = [
    "SELECT provider, model_id, display_name, request_defaults_json, priority",
    "FROM agentsam_ai",
    "WHERE account_id = ?",
    "AND task_type = 'code_generation'",
    "AND status IN ('active','experimental')",
    "AND EXISTS (",
    "  SELECT 1",
    "  FROM json_each(CASE WHEN json_valid(agentsam_ai.capabilities_json) THEN agentsam_ai.capabilities_json ELSE '[]' END)",
    "  WHERE value = ?",
    ")",
    "ORDER BY priority ASC",
    "LIMIT 1"
  ].join(" ");

  return await env.DB.prepare(sql).bind(accountId, capability).first();
}

function generationMessages(capability, input) {
  if (capability === "code.edit") {
    const canonical = input?.canonical || {};
    const instruction = String(input?.instruction || input?.prompt || "").trim();
    return [
      {
        role: "system",
        content: [
          "You edit an existing AgentSam CMS generated component.",
          "Return JSON only with shape {\"edits\":[{\"section\":\"html|css|js\",\"search\":\"exact existing text\",\"replace\":\"replacement text\"}]}.",
          "Use the smallest exact replacements needed. Do not rename selectors unless explicitly requested.",
          "Never emit eval, fetch, document.write, external script src, or window.parent."
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify({ instruction, canonical, context: input?.context || {} })
      }
    ];
  }

  const requestText = String(input?.request || input?.prompt || "").trim();
  const prefix = String(input?.promptPrefix || "").trim();
  return [
    {
      role: "system",
      content: [
        "You create a normalized AgentSam CMS section or block.",
        prefix,
        "The definition.type becomes the saved semantic CMS type, so use a specific reusable kebab-case name such as testimonial-carousel or pricing-comparison, never custom or generated-section.",
        "The definition.label is the merchant-facing editor name.",
        "Do not substitute the semantic type for __UID__; semantic identity and implementation namespace are separate."
      ].filter(Boolean).join(" ")
    },
    {
      role: "user",
      content: JSON.stringify({
        request: requestText,
        context: input?.context || {},
        output_contract: input?.output_contract || "cms.generated-definition.v1"
      })
    }
  ];
}

export async function handleWorkersAiCodeProvider(request, env, user) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const capability = body?.capability === "code.edit" ? "code.edit" : "code.generate";
  const accountId = user?.account_id;
  if (!accountId) {
    return Response.json({ ok: false, error: "account_context_required" }, { status: 400 });
  }

  const selected = await selectCodeModel(env, accountId, capability);
  if (!selected) {
    return Response.json(
      { ok: false, error: "no_code_model_for_capability", capability },
      { status: 503 }
    );
  }

  const account = String(env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const token = String(env.CLOUDFLARE_API_TOKEN || "").trim();
  if (!account || !token) {
    return Response.json(
      { ok: false, error: "workers_ai_rest_not_configured" },
      { status: 503 }
    );
  }

  const defaults = parseJson(selected.request_defaults_json, {});
  const payload = {
    model: selected.model_id,
    messages: generationMessages(capability, body?.input || {}),
    max_tokens: defaults.max_tokens || (capability === "code.edit" ? 1400 : 2600)
  };
  if (Number.isFinite(Number(defaults.temperature))) {
    payload.temperature = Number(defaults.temperature);
  }

  let response;
  try {
    response = await fetch(
      "https://api.cloudflare.com/client/v4/accounts/" + account + "/ai/v1/chat/completions",
      {
        method: "POST",
        signal: request.signal,
        headers: {
          authorization: "Bearer " + token,
          "content-type": "application/json",
          "cf-aig-gateway-id": "fuelnfreetime-agentsam"
        },
        body: JSON.stringify(payload)
      }
    );
  } catch (error) {
    if (request.signal?.aborted || error?.name === "AbortError") {
      return Response.json({ ok: false, aborted: true }, { status: 499 });
    }
    throw error;
  }

  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    return Response.json(
      {
        ok: false,
        error: "provider_http_" + response.status,
        provider_error: raw,
        model: selected.model_id
      },
      { status: response.status }
    );
  }

  const text = extractAssistantText(raw).trim();
  if (!text) {
    return Response.json(
      { ok: false, error: "provider_empty_response", model: selected.model_id },
      { status: 502 }
    );
  }

  if (capability === "code.edit") {
    let patch;
    try {
      patch = JSON.parse(text);
    } catch {
      return Response.json(
        { ok: false, error: "provider_invalid_patch_json", model: selected.model_id },
        { status: 502 }
      );
    }
    if (!Array.isArray(patch?.edits)) {
      return Response.json(
        { ok: false, error: "provider_invalid_patch_contract", model: selected.model_id },
        { status: 502 }
      );
    }
    return Response.json({
      ok: true,
      capability,
      provider: selected.provider,
      model: selected.model_id,
      patch
    });
  }

  return Response.json({
    ok: true,
    capability,
    provider: selected.provider,
    model: selected.model_id,
    chunks: chunkText(text)
  });
}
