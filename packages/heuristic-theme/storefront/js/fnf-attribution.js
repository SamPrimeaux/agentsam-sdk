/**
 * First-party UTM capture for Fuel & Free Time storefront.
 */
(function () {
  if (window.__fnfAttributionInit) return;
  window.__fnfAttributionInit = true;

  function readCookie(name) {
    const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : "";
  }

  function parseAttributionCookie() {
    try {
      return JSON.parse(readCookie("fnf_ca") || "null");
    } catch {
      return null;
    }
  }

  function utmFromLocation() {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
      utm_content: params.get("utm_content"),
      utm_term: params.get("utm_term"),
      campaign_id: params.get("fnf_c"),
    };
  }

  function hasUtm(utm) {
    return Boolean(
      utm.campaign_id ||
        utm.utm_source ||
        utm.utm_medium ||
        utm.utm_campaign ||
        utm.utm_content ||
        utm.utm_term
    );
  }

  function sendVisit(force) {
    const utm = utmFromLocation();
    const existing = parseAttributionCookie();
    if (!force && !hasUtm(utm) && existing) return;

    const payload = {
      session_id: readCookie("fnf_vid") || undefined,
      landing_path: window.location.pathname + window.location.search,
      referrer: document.referrer || null,
      previous_path: sessionStorage.getItem("fnf_prev_path") || null,
      channel: utm.utm_source || null,
      campaign_id: utm.campaign_id || existing?.cid || null,
      utm_source: utm.utm_source || existing?.us || null,
      utm_medium: utm.utm_medium || existing?.um || null,
      utm_campaign: utm.utm_campaign || existing?.uc || null,
      utm_content: utm.utm_content || null,
      utm_term: utm.utm_term || null,
    };

    fetch("/api/attribution/visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      keepalive: true,
      body: JSON.stringify(payload),
    }).catch(function () {});

    sessionStorage.setItem("fnf_prev_path", window.location.pathname);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      sendVisit(false);
    });
  } else {
    sendVisit(false);
  }

  window.fnfAttribution = {
    getAttribution: function () {
      const utm = utmFromLocation();
      const cookie = parseAttributionCookie() || {};
      return {
        campaign_id: utm.campaign_id || cookie.cid || null,
        utm_source: utm.utm_source || cookie.us || null,
        utm_medium: utm.utm_medium || cookie.um || null,
        utm_campaign: utm.utm_campaign || cookie.uc || null,
        visit_id: cookie.vid || null,
      };
    },
    track: function () {
      sendVisit(true);
    },
  };
})();
