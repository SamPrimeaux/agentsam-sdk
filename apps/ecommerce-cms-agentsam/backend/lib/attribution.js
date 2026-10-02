/**
 * First-party UTM attribution — visits, redirects, order joins.
 */

import { FNF_ACCOUNT_ID } from "../agentsam/constants.js";

const ATTR_COOKIE = "fnf_ca";
const VID_COOKIE = "fnf_vid";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function visitId() {
  return `av_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function sessionId() {
  return `vs_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    out[key] = val;
  }
  return out;
}

export function parseAttributionCookie(cookies) {
  const raw = cookies[ATTR_COOKIE];
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function buildAttributionCookieValue(payload) {
  return JSON.stringify({
    cid: payload.campaign_id || null,
    us: payload.utm_source || null,
    um: payload.utm_medium || null,
    uc: payload.utm_campaign || null,
    vid: payload.visit_id || null,
  });
}

export function attributionFromCookie(cookies) {
  const parsed = parseAttributionCookie(cookies);
  if (!parsed) return null;
  return {
    campaign_id: parsed.cid || null,
    utm_source: parsed.us || null,
    utm_medium: parsed.um || null,
    utm_campaign: parsed.uc || null,
    visit_id: parsed.vid || null,
  };
}

export function appendAttributionCookies(headers, { sessionId: sid, attribution }) {
  const secure = "Secure; SameSite=Lax; Path=/";
  headers.append("Set-Cookie", `${VID_COOKIE}=${sid}; Max-Age=${COOKIE_MAX_AGE * 12}; ${secure}`);
  if (attribution) {
    headers.append(
      "Set-Cookie",
      `${ATTR_COOKIE}=${encodeURIComponent(buildAttributionCookieValue(attribution))}; Max-Age=${COOKIE_MAX_AGE}; ${secure}`
    );
  }
}

export function utmFromSearchParams(params) {
  return {
    utm_source: params.get("utm_source")?.trim() || null,
    utm_medium: params.get("utm_medium")?.trim() || null,
    utm_campaign: params.get("utm_campaign")?.trim() || null,
    utm_content: params.get("utm_content")?.trim() || null,
    utm_term: params.get("utm_term")?.trim() || null,
  };
}

export function buildGoUrl(origin, campaignId, destination, channel, slug) {
  const url = new URL("/go", origin);
  url.searchParams.set("c", campaignId);
  url.searchParams.set("ch", channel);
  url.searchParams.set("to", destination || "/shop");
  if (slug) url.searchParams.set("utm_campaign", slug);
  return url.toString();
}

export function buildUtmLinks(origin, campaignId, slug) {
  const dest = "/shop";
  return {
    homepage: buildGoUrl(origin, campaignId, dest, "homepage", slug),
    email: buildGoUrl(origin, campaignId, dest, "email", slug),
    social: buildGoUrl(origin, campaignId, dest, "social", slug),
    product_pages: buildGoUrl(origin, campaignId, dest, "product", slug),
  };
}

export async function resolveCampaignId(env, { campaignId, utmCampaign }) {
  if (campaignId) {
    const row = await env.DB.prepare(
      `SELECT id FROM growth_campaigns WHERE account_id = ? AND id = ? LIMIT 1`
    )
      .bind(FNF_ACCOUNT_ID, campaignId)
      .first()
      .catch(() => null);
    if (row) return row.id;
  }
  if (utmCampaign) {
    const row = await env.DB.prepare(
      `SELECT id FROM growth_campaigns WHERE account_id = ? AND slug = ? LIMIT 1`
    )
      .bind(FNF_ACCOUNT_ID, utmCampaign)
      .first()
      .catch(() => null);
    if (row) return row.id;
  }
  return campaignId || null;
}

export async function recordVisit(env, payload) {
  const id = visitId();
  const campaignId = await resolveCampaignId(env, {
    campaignId: payload.campaign_id,
    utmCampaign: payload.utm_campaign,
  });

  await env.DB.prepare(
    `INSERT INTO attribution_visits (
       id, account_id, campaign_id, session_id, landing_path, referrer,
       utm_source, utm_medium, utm_campaign, utm_content, utm_term, channel, user_agent
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      FNF_ACCOUNT_ID,
      campaignId,
      payload.session_id,
      payload.landing_path || null,
      payload.referrer || null,
      payload.utm_source || null,
      payload.utm_medium || null,
      payload.utm_campaign || null,
      payload.utm_content || null,
      payload.utm_term || null,
      payload.channel || null,
      payload.user_agent || null
    )
    .run()
    .catch((err) => {
      console.error("[attribution/visit]", err?.message || err);
    });

  if (campaignId) {
    await env.DB.prepare(
      `UPDATE growth_campaigns
       SET session_count = COALESCE(session_count, 0) + 1, updated_at = datetime('now')
       WHERE account_id = ? AND id = ?`
    )
      .bind(FNF_ACCOUNT_ID, campaignId)
      .run()
      .catch(() => {});
  }

  return {
    visit_id: id,
    campaign_id: campaignId,
    utm_source: payload.utm_source || null,
    utm_medium: payload.utm_medium || null,
    utm_campaign: payload.utm_campaign || null,
  };
}

export async function attachAttributionToOrder(env, orderId, attribution) {
  if (!attribution?.campaign_id && !attribution?.utm_campaign) return;

  await env.DB.prepare(
    `UPDATE orders
     SET campaign_id = ?, utm_source = ?, utm_medium = ?, utm_campaign = ?, attribution_visit_id = ?
     WHERE id = ?`
  )
    .bind(
      attribution.campaign_id || null,
      attribution.utm_source || null,
      attribution.utm_medium || null,
      attribution.utm_campaign || null,
      attribution.visit_id || null,
      orderId
    )
    .run()
    .catch(() => {});

  if (attribution.campaign_id) {
    const order = await env.DB.prepare(`SELECT total_cents FROM orders WHERE id = ?`)
      .bind(orderId)
      .first()
      .catch(() => null);
    if (order?.total_cents) {
      await env.DB.prepare(
        `UPDATE growth_campaigns
         SET attributed_revenue_cents = COALESCE(attributed_revenue_cents, 0) + ?,
             updated_at = datetime('now')
         WHERE account_id = ? AND id = ?`
      )
        .bind(order.total_cents, FNF_ACCOUNT_ID, attribution.campaign_id)
        .run()
        .catch(() => {});
    }
  }
}

export async function getAttributionMetrics(env) {
  const [visits, channels, revenue, conversions] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM attribution_visits WHERE account_id = ?`
    )
      .bind(FNF_ACCOUNT_ID)
      .first()
      .catch(() => ({ n: 0 })),
    env.DB.prepare(
      `SELECT
         COALESCE(utm_source, channel, 'direct') AS source,
         COUNT(*) AS sessions
       FROM attribution_visits
       WHERE account_id = ?
       GROUP BY COALESCE(utm_source, channel, 'direct')
       ORDER BY sessions DESC`
    )
      .bind(FNF_ACCOUNT_ID)
      .all()
      .catch(() => ({ results: [] })),
    env.DB.prepare(
      `SELECT COALESCE(SUM(attributed_revenue_cents), 0) AS cents
       FROM growth_campaigns WHERE account_id = ?`
    )
      .bind(FNF_ACCOUNT_ID)
      .first()
      .catch(() => ({ cents: 0 })),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM orders WHERE campaign_id IS NOT NULL`
    )
      .first()
      .catch(() => ({ n: 0 })),
  ]);

  const bySource = channels.results || [];
  const direct = bySource.find((r) => r.source === "direct" || r.source === "homepage")?.sessions || 0;
  const organic = bySource.find((r) => r.source === "google" || r.source === "organic")?.sessions || 0;
  const email = bySource.find((r) => r.source === "email")?.sessions || 0;
  const social = bySource.find((r) => r.source === "social")?.sessions || 0;
  const total = Number(visits?.n || 0);
  const computedDirect = direct || Math.max(0, total - organic - email - social);

  return {
    total_sessions: total,
    direct_sessions: computedDirect,
    organic_sessions: organic,
    email_sessions: email,
    social_sessions: social,
    attributed_revenue_cents: Number(revenue?.cents || 0),
    attributed_conversions: Number(conversions?.n || 0),
    channel_breakdown: bySource,
  };
}
