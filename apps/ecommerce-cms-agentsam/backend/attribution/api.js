/**
 * Public attribution API — visit beacon + tracked redirects.
 */

import {
  appendAttributionCookies,
  attributionFromCookie,
  parseCookies,
  recordVisit,
  sessionId,
  utmFromSearchParams,
} from "../lib/attribution.js";

function json(data, init = {}) {
  return Response.json(data, init);
}

export async function handleAttributionVisit(request, env) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const cookies = parseCookies(request.headers.get("Cookie"));
  const sid = cookies.fnf_vid || body.session_id || sessionId();
  const utm = {
    utm_source: body.utm_source || null,
    utm_medium: body.utm_medium || null,
    utm_campaign: body.utm_campaign || null,
    utm_content: body.utm_content || null,
    utm_term: body.utm_term || null,
  };

  const hasUtm = Object.values(utm).some(Boolean);
  const existing = attributionFromCookie(cookies);
  const shouldRecord =
    hasUtm ||
    body.campaign_id ||
    !existing ||
    (body.landing_path && body.landing_path !== body.previous_path);

  if (!shouldRecord) {
    return json({ ok: true, recorded: false, session_id: sid });
  }

  const recorded = await recordVisit(env, {
    session_id: sid,
    campaign_id: body.campaign_id || existing?.campaign_id || null,
    landing_path: body.landing_path || null,
    referrer: body.referrer || request.headers.get("Referer") || null,
    channel: body.channel || utm.utm_source || null,
    user_agent: request.headers.get("User-Agent") || null,
    ...utm,
  });

  const headers = new Headers({ "content-type": "application/json" });
  appendAttributionCookies(headers, {
    sessionId: sid,
    attribution: {
      campaign_id: recorded.campaign_id,
      visit_id: recorded.visit_id,
      utm_source: recorded.utm_source || utm.utm_source,
      utm_medium: recorded.utm_medium || utm.utm_medium,
      utm_campaign: recorded.utm_campaign || utm.utm_campaign,
    },
  });

  return json(
    {
      ok: true,
      recorded: true,
      session_id: sid,
      visit_id: recorded.visit_id,
      campaign_id: recorded.campaign_id,
    },
    { headers }
  );
}

export async function handleAttributionRedirect(request, env, url) {
  const campaignId = url.searchParams.get("c");
  const channel = url.searchParams.get("ch") || "campaign";
  const to = url.searchParams.get("to") || "/shop";
  const cookies = parseCookies(request.headers.get("Cookie"));
  const sid = cookies.fnf_vid || sessionId();

  const utm = utmFromSearchParams(url.searchParams);
  if (!utm.utm_source) utm.utm_source = channel;
  if (!utm.utm_medium) utm.utm_medium = "campaign";
  if (!utm.utm_campaign && url.searchParams.get("utm_campaign")) {
    utm.utm_campaign = url.searchParams.get("utm_campaign");
  }

  const recorded = await recordVisit(env, {
    session_id: sid,
    campaign_id: campaignId,
    landing_path: to.startsWith("/") ? to : `/${to}`,
    referrer: request.headers.get("Referer") || null,
    channel,
    user_agent: request.headers.get("User-Agent") || null,
    ...utm,
  });

  const dest = new URL(to.startsWith("http") ? to : to, request.url);
  if (utm.utm_source) dest.searchParams.set("utm_source", utm.utm_source);
  if (utm.utm_medium) dest.searchParams.set("utm_medium", utm.utm_medium);
  if (utm.utm_campaign) dest.searchParams.set("utm_campaign", utm.utm_campaign);
  if (campaignId) dest.searchParams.set("fnf_c", campaignId);

  const headers = new Headers({ Location: dest.toString() });
  appendAttributionCookies(headers, {
    sessionId: sid,
    attribution: {
      campaign_id: recorded.campaign_id || campaignId,
      visit_id: recorded.visit_id,
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
    },
  });

  return new Response(null, { status: 302, headers });
}

export async function handleAttributionApi(request, env, url) {
  const path = url.pathname;
  if (path === "/api/attribution/visit" && request.method === "POST") {
    return handleAttributionVisit(request, env);
  }
  if (path === "/go" && request.method === "GET") {
    return handleAttributionRedirect(request, env, url);
  }
  return json({ error: "Not found" }, { status: 404 });
}
