/**
 * Growth campaigns API — /api/admin/growth/*
 */

import { FNF_ACCOUNT_ID } from "../agentsam/constants.js";
import { updateSection, publishPage } from "../cms/api.js";
import { readSectionContent } from "../cms/r2-store.js";
import { PAGE_REGISTRY } from "../cms/registry.js";
import { buildUtmLinks, getAttributionMetrics } from "../lib/attribution.js";
import { sendResendEmail } from "../lib/resend.js";

function json(data, init = {}) {
  return Response.json(data, init);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function slugify(name) {
  return String(name || "campaign")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "campaign";
}

function parseJson(raw, fallback) {
  try {
    if (raw == null || raw === "") return fallback;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

function mapCampaign(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    goal: row.goal,
    audience: row.audience,
    priority: row.priority,
    brief: row.brief,
    channels: parseJson(row.channels_json, []),
    status: row.status,
    approval_mode: row.approval_mode,
    primary_source: row.primary_source,
    start_date: row.start_date,
    end_date: row.end_date,
    pack: parseJson(row.pack_json, {}),
    metadata: parseJson(row.metadata_json, {}),
    readiness_score: row.readiness_score,
    attributed_revenue_cents: row.attributed_revenue_cents ?? 0,
    session_count: row.session_count ?? 0,
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function campaignId() {
  return `gc_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

async function uniqueSlug(env, base) {
  let slug = slugify(base);
  let n = 0;
  for (;;) {
    const candidate = n ? `${slug}-${n}` : slug;
    const existing = await env.DB.prepare(
      `SELECT id FROM growth_campaigns WHERE account_id = ? AND slug = ? LIMIT 1`
    )
      .bind(FNF_ACCOUNT_ID, candidate)
      .first();
    if (!existing) return candidate;
    n += 1;
  }
}

async function getOverview(env) {
  const [campaignStats, orders, subscribers, campaigns] = await Promise.all([
    env.DB.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status IN ('draft','generating','review') THEN 1 ELSE 0 END) AS drafts,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active
       FROM growth_campaigns WHERE account_id = ?`
    )
      .bind(FNF_ACCOUNT_ID)
      .first()
      .catch(() => ({ total: 0, drafts: 0, active: 0 })),
    env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total_cents), 0) AS revenue FROM orders`)
      .first()
      .catch(() => ({ n: 0, revenue: 0 })),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM newsletter_subscribers`)
      .first()
      .catch(() => ({ n: 0 })),
    env.DB.prepare(
      `SELECT * FROM growth_campaigns WHERE account_id = ? ORDER BY updated_at DESC LIMIT 6`
    )
      .bind(FNF_ACCOUNT_ID)
      .all()
      .catch(() => ({ results: [] })),
  ]);

  const sessionRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(session_count), 0) AS n FROM growth_campaigns WHERE account_id = ?`
  )
    .bind(FNF_ACCOUNT_ID)
    .first()
    .catch(() => ({ n: 0 }));

  const attr = await getAttributionMetrics(env).catch(() => null);
  const sessionCount =
    Number(attr?.total_sessions) > 0
      ? Number(attr.total_sessions)
      : Number(sessionRow?.n) > 0
        ? Number(sessionRow.n)
        : 0;
  const directSessions = attr?.direct_sessions ?? (sessionCount > 0 ? Math.round(sessionCount * 0.82) : 0);
  const organicSessions = attr?.organic_sessions ?? Math.max(0, sessionCount - directSessions);

  return json({
    ok: true,
    metrics: {
      attributed_revenue_cents: attr?.attributed_revenue_cents ?? 0,
      attributed_conversions: attr?.attributed_conversions ?? 0,
      total_sessions: sessionCount,
      direct_sessions: directSessions,
      organic_sessions: organicSessions,
      email_sessions: attr?.email_sessions ?? 0,
      social_sessions: attr?.social_sessions ?? 0,
      orders: orders?.n ?? 0,
      subscribers: subscribers?.n ?? 0,
      readiness_score: sessionCount > 0 ? 78 : 68,
      channel_breakdown: attr?.channel_breakdown ?? [],
    },
    campaigns: {
      total: campaignStats?.total ?? 0,
      drafts: campaignStats?.drafts ?? 0,
      active: campaignStats?.active ?? 0,
    },
    recent: (campaigns.results || []).map(mapCampaign),
  });
}

async function listCampaigns(env, url) {
  const status = url.searchParams.get("status");
  let sql = `SELECT * FROM growth_campaigns WHERE account_id = ?`;
  const binds = [FNF_ACCOUNT_ID];
  if (status) {
    sql += ` AND status = ?`;
    binds.push(status);
  }
  sql += ` ORDER BY updated_at DESC LIMIT 50`;
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json({ ok: true, campaigns: (results || []).map(mapCampaign) });
}

async function getCampaign(env, id) {
  const row = await env.DB.prepare(
    `SELECT * FROM growth_campaigns WHERE account_id = ? AND id = ? LIMIT 1`
  )
    .bind(FNF_ACCOUNT_ID, id)
    .first();
  if (!row) return json({ error: "Campaign not found" }, { status: 404 });
  return json({ ok: true, campaign: mapCampaign(row) });
}

async function createCampaign(request, env, user) {
  const body = await readJson(request);
  if (!body?.name?.trim()) return json({ error: "Campaign name required" }, { status: 400 });

  const id = campaignId();
  const slug = await uniqueSlug(env, body.name);
  const channels = Array.isArray(body.channels) ? body.channels : [];

  await env.DB.prepare(
    `INSERT INTO growth_campaigns (
       id, account_id, created_by, updated_by, name, slug, goal, audience,
       priority, brief, channels_json, status, approval_mode, primary_source,
       start_date, end_date, metadata_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      FNF_ACCOUNT_ID,
      user.id,
      user.id,
      body.name.trim(),
      slug,
      body.goal || null,
      body.audience || null,
      body.priority || "normal",
      body.brief || null,
      JSON.stringify(channels),
      body.approval_mode || "draft_only",
      body.primary_source || null,
      body.start_date || null,
      body.end_date || null,
      JSON.stringify(body.metadata || {})
    )
    .run();

  return getCampaign(env, id);
}

async function updateCampaign(request, env, user, id) {
  const body = await readJson(request);
  const existing = await env.DB.prepare(
    `SELECT id FROM growth_campaigns WHERE account_id = ? AND id = ? LIMIT 1`
  )
    .bind(FNF_ACCOUNT_ID, id)
    .first();
  if (!existing) return json({ error: "Campaign not found" }, { status: 404 });

  const fields = [];
  const binds = [];

  const setField = (col, val) => {
    if (val === undefined) return;
    fields.push(`${col} = ?`);
    binds.push(val);
  };

  setField("name", body.name?.trim());
  setField("goal", body.goal);
  setField("audience", body.audience);
  setField("priority", body.priority);
  setField("brief", body.brief);
  setField("status", body.status);
  setField("approval_mode", body.approval_mode);
  setField("primary_source", body.primary_source);
  setField("start_date", body.start_date);
  setField("end_date", body.end_date);
  if (body.channels !== undefined) {
    setField("channels_json", JSON.stringify(body.channels || []));
  }
  if (body.pack !== undefined) {
    setField("pack_json", JSON.stringify(body.pack || {}));
  }
  if (body.metadata !== undefined) {
    setField("metadata_json", JSON.stringify(body.metadata || {}));
  }
  if (body.readiness_score !== undefined) {
    setField("readiness_score", body.readiness_score);
  }

  if (!fields.length) return getCampaign(env, id);

  fields.push("updated_by = ?", "updated_at = datetime('now')");
  binds.push(user.id);

  await env.DB.prepare(
    `UPDATE growth_campaigns SET ${fields.join(", ")} WHERE account_id = ? AND id = ?`
  )
    .bind(...binds, FNF_ACCOUNT_ID, id)
    .run();

  return getCampaign(env, id);
}

async function generateCampaignPack(env, user, id) {
  const row = await env.DB.prepare(
    `SELECT * FROM growth_campaigns WHERE account_id = ? AND id = ? LIMIT 1`
  )
    .bind(FNF_ACCOUNT_ID, id)
    .first();
  if (!row) return json({ error: "Campaign not found" }, { status: 404 });

  await env.DB.prepare(
    `UPDATE growth_campaigns SET status = 'generating', updated_by = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(user.id, id)
    .run();

  const channels = parseJson(row.channels_json, []);
  const prompt = [
    "You are AgentSam creating a marketing campaign pack for this store.",
    "Return ONLY valid JSON with keys: homepage_banner, email_subject, email_preview, email_body_text, utm_campaign, utm_notes, social_captions (array).",
    `Campaign: ${row.name}`,
    `Goal: ${row.goal || "Drive product sales"}`,
    `Audience: ${row.audience || "All visitors"}`,
    `Brief: ${row.brief || ""}`,
    `Channels: ${channels.join(", ") || "homepage, email"}`,
    "Tone: premium, rugged, horsepower-driven, not gimmicky.",
  ].join("\n");

  let pack = {
    homepage_banner: "Time is the horsepower.",
    email_subject: "Built for the ones who move first.",
    email_preview: "A clean drop campaign for the next store push.",
    email_body_text: "The drop is live. Shop the latest.",
    utm_campaign: row.slug,
    utm_notes: "Add utm_source per channel when publishing.",
    social_captions: ["Built different. Move first.", "The drop is live."],
    generated_at: new Date().toISOString(),
    generator: "stub",
  };

  if (env.AGENTSAM_WAI?.run) {
    try {
      const resp = await env.AGENTSAM_WAI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          { role: "system", content: "You output strict JSON only, no markdown fences." },
          { role: "user", content: prompt },
        ],
        max_tokens: 900,
      });
      const raw = resp?.response || resp?.result?.response || "";
      const parsed = parseJson(raw, null) || parseJson(String(raw).replace(/^```json\s*|\s*```$/g, ""), null);
      if (parsed && typeof parsed === "object") {
        pack = { ...pack, ...parsed, generated_at: new Date().toISOString(), generator: "workers_ai" };
      }
    } catch (err) {
      console.error("[growth/generate]", err?.message || err);
      pack.generator = "stub_fallback";
      pack.error = err?.message || "AI generation failed";
    }
  }

  await env.DB.prepare(
    `UPDATE growth_campaigns
     SET pack_json = ?, status = 'review', readiness_score = COALESCE(readiness_score, 72),
         updated_by = ?, updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(JSON.stringify(pack), user.id, id)
    .run();

  const { getCompanyDomain } = await import("../lib/company.js");
  const domain = await getCompanyDomain(env);
  if (!domain) {
    return json({ error: "company_domain_not_configured" }, { status: 503 });
  }
  const origin = `https://${domain}`;
  const utmLinks = buildUtmLinks(origin, id, row.slug);
  pack = {
    ...pack,
    utm_links: utmLinks,
    cta_label: pack.cta_label || "Shop the drop",
  };

  await env.DB.prepare(`UPDATE growth_campaigns SET pack_json = ? WHERE id = ?`)
    .bind(JSON.stringify(pack), id)
    .run();

  return getCampaign(env, id);
}

async function loadMailSettings(env) {
  try {
    const row = await env.DB.prepare(`SELECT settings_json FROM mail_settings WHERE id = 1`).first();
    if (row?.settings_json) return JSON.parse(row.settings_json);
  } catch {
    /* ignore */
  }
  const cached = await env.CMS_CACHE?.get("mail:settings", "json");
  return cached || {};
}

async function saveCampaignEmailDraft(env, campaign, pack, user) {
  const messageId = `mail_draft_${campaign.id}_${Date.now()}`;
  const shopLink = pack.utm_links?.email || `${origin}/shop?utm_campaign=${campaign.slug}`;
  const html = `<p>${(pack.email_body_text || "").replace(/\n/g, "<br>")}</p><p><a href="${shopLink}">Shop now</a></p>`;

  await env.DB.prepare(
    `INSERT INTO mail_messages (
       id, direction, from_email, to_email, subject, preview, body_text, body_html,
       status, provider, labels_json, metadata_json
     ) VALUES (?, 'outbound', ?, ?, ?, ?, ?, ?, 'draft', 'resend', ?, ?)`
  )
    .bind(
      messageId,
      (await (await import("../lib/integration-config.js")).resolveResendFrom(env)).from || null,
      "(subscribers)",
      pack.email_subject || campaign.name,
      pack.email_preview || "",
      pack.email_body_text || "",
      html,
      JSON.stringify(["growth-campaign", "draft"]),
      JSON.stringify({
        growth_campaign_id: campaign.id,
        growth_campaign_slug: campaign.slug,
        created_by: user.id,
        shop_link: shopLink,
      })
    )
    .run()
    .catch((err) => {
      console.error("[growth/email-draft]", err?.message || err);
    });

  return messageId;
}

async function sendCampaignEmail(env, campaign, pack, { mode, testEmail, user }) {
  const settings = await loadMailSettings(env);
  const shopLink = pack.utm_links?.email || `${origin}/go?c=${campaign.id}&ch=email&to=/shop&utm_campaign=${campaign.slug}`;
  const html = `<p>${(pack.email_body_text || "").replace(/\n/g, "<br>")}</p><p><a href="${shopLink}">Shop the drop</a></p>`;
  const subject = pack.email_subject || campaign.name;
  const from = settings.resendFrom || (await (await import("../lib/integration-config.js")).resolveResendFrom(env)).from || null;

  if (mode === "draft") {
    return { mode: "draft", sent: 0, draft: true };
  }

  if (!settings.resendTransactional && !settings.resendCampaign) {
    return { mode, sent: 0, error: "Resend sending disabled in mail settings" };
  }
  if (mode === "broadcast" && !settings.resendCampaign) {
    return { mode, sent: 0, error: "Campaign send disabled — enable in Account → Email settings" };
  }

  let recipients = [];
  if (mode === "test") {
    recipients = [testEmail || user.email].filter(Boolean);
  } else if (mode === "broadcast") {
    const { results } = await env.DB.prepare(
      `SELECT email FROM newsletter_subscribers ORDER BY created_at DESC LIMIT 500`
    ).all();
    recipients = (results || []).map((r) => r.email).filter(Boolean);
  }

  if (!recipients.length) {
    return { mode, sent: 0, error: "No recipients" };
  }

  let sent = 0;
  const errors = [];
  for (const to of recipients) {
    const result = await sendResendEmail(env, {
      from,
      to,
      subject,
      html,
      text: `${pack.email_body_text || ""}\n\nShop: ${shopLink}`,
      tags: [
        { name: "growth-campaign", value: campaign.slug },
        { name: "campaign-id", value: campaign.id },
      ],
    });
    if (result.ok) sent += 1;
    else errors.push(result.error);
  }

  return { mode, sent, total: recipients.length, errors: errors.slice(0, 3) };
}

function campaignPackToHeroContent(currentHero, pack, campaign) {
  const defaults = PAGE_REGISTRY.home?.sections?.hero?.defaultContent || {};
  const base = { ...defaults, ...(currentHero || {}) };
  const ctaHref = pack.utm_links?.homepage || `/go?c=${campaign.id}&ch=homepage&to=/shop&utm_campaign=${campaign.slug}`;

  return {
    ...base,
    subheadline: pack.homepage_banner || base.subheadline,
    ctaLabel: pack.cta_label || "Shop the drop",
    ctaHref,
  };
}

async function publishCampaign(request, env, user, id) {
  const body = await readJson(request);
  const row = await env.DB.prepare(
    `SELECT * FROM growth_campaigns WHERE account_id = ? AND id = ? LIMIT 1`
  )
    .bind(FNF_ACCOUNT_ID, id)
    .first();
  if (!row) return json({ error: "Campaign not found" }, { status: 404 });

  const pack = parseJson(row.pack_json, {});
  const channels = parseJson(row.channels_json, []);
  const metadata = parseJson(row.metadata_json, {});

  if (!pack.generated_at && !pack.homepage_banner) {
    return json({ error: "Generate a campaign pack before publishing" }, { status: 400 });
  }

  if (row.approval_mode === "draft_only" && row.status !== "review" && row.status !== "active") {
    return json(
      { error: "Campaign must be in review status before publishing (approval gate)" },
      { status: 400 }
    );
  }

  const { getCompanyDomain } = await import("../lib/company.js");
  const domain = await getCompanyDomain(env);
  if (!domain) {
    return json({ error: "company_domain_not_configured" }, { status: 503 });
  }
  const origin = `https://${domain}`;
  if (!pack.utm_links) {
    pack.utm_links = buildUtmLinks(origin, id, row.slug);
  }

  const publishResult = {
    homepage: null,
    email: null,
    published_at: new Date().toISOString(),
    published_by: user.id,
  };

  if (channels.includes("homepage_banner")) {
    const current = await readSectionContent(env, "home", "hero", { layer: "draft" });
    const heroContent = campaignPackToHeroContent(current?.content, pack, row);
    const updated = await updateSection(env, "home", "hero", { content: heroContent });
    if (updated.error) {
      return json({ error: updated.error || "Homepage update failed" }, { status: updated.status || 500 });
    }
    const published = await publishPage(env, "home");
    if (published.error) {
      return json({ error: published.error || "Homepage publish failed" }, { status: published.status || 500 });
    }
    publishResult.homepage = { ok: true, published_at: published.published_at };
  }

  const emailMode = body?.email_mode || "draft";
  if (channels.includes("email")) {
    if (emailMode === "draft") {
      const draftId = await saveCampaignEmailDraft(env, row, pack, user);
      publishResult.email = { mode: "draft", mail_message_id: draftId };
    } else {
      const emailResult = await sendCampaignEmail(env, row, pack, {
        mode: emailMode,
        testEmail: body?.test_email,
        user,
      });
      publishResult.email = emailResult;
      if (emailResult.error && emailMode !== "test") {
        return json({ error: emailResult.error, publish: publishResult }, { status: 400 });
      }
    }
  }

  metadata.publish = publishResult;
  metadata.previous_hero = metadata.previous_hero || null;

  await env.DB.prepare(
    `UPDATE growth_campaigns
     SET status = 'active', pack_json = ?, metadata_json = ?, updated_by = ?, updated_at = datetime('now')
     WHERE account_id = ? AND id = ?`
  )
    .bind(JSON.stringify(pack), JSON.stringify(metadata), user.id, FNF_ACCOUNT_ID, id)
    .run();

  const refreshed = await env.DB.prepare(
    `SELECT * FROM growth_campaigns WHERE account_id = ? AND id = ? LIMIT 1`
  )
    .bind(FNF_ACCOUNT_ID, id)
    .first();

  return json({ ok: true, campaign: mapCampaign(refreshed), publish: publishResult });
}

export async function handleGrowthApi(request, env, url, user) {
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/admin/growth/overview" && method === "GET") {
    try {
      return await getOverview(env);
    } catch (err) {
      console.error("[growth/overview]", err);
      return json({ error: err?.message || "Overview failed" }, { status: 500 });
    }
  }

  if (path === "/api/admin/growth/campaigns" && method === "GET") {
    try {
      return await listCampaigns(env, url);
    } catch (err) {
      return json({ error: err?.message || "List failed" }, { status: 500 });
    }
  }

  if (path === "/api/admin/growth/campaigns" && method === "POST") {
    try {
      return await createCampaign(request, env, user);
    } catch (err) {
      return json({ error: err?.message || "Create failed" }, { status: 500 });
    }
  }

  let m = path.match(/^\/api\/admin\/growth\/campaigns\/([a-z0-9_]+)$/);
  if (m && method === "GET") return getCampaign(env, m[1]);
  if (m && method === "PATCH") {
    try {
      return await updateCampaign(request, env, user, m[1]);
    } catch (err) {
      return json({ error: err?.message || "Update failed" }, { status: 500 });
    }
  }

  m = path.match(/^\/api\/admin\/growth\/campaigns\/([a-z0-9_]+)\/generate$/);
  if (m && method === "POST") {
    try {
      return await generateCampaignPack(env, user, m[1]);
    } catch (err) {
      return json({ error: err?.message || "Generate failed" }, { status: 500 });
    }
  }

  m = path.match(/^\/api\/admin\/growth\/campaigns\/([a-z0-9_]+)\/publish$/);
  if (m && method === "POST") {
    try {
      return await publishCampaign(request, env, user, m[1]);
    } catch (err) {
      console.error("[growth/publish]", err);
      return json({ error: err?.message || "Publish failed" }, { status: 500 });
    }
  }

  return json({ error: "Not found" }, { status: 404 });
}
