/**
 * Growth admin — live API wiring for /admin/growth
 */

const growthState = {
  overview: null,
  activeCampaignId: null,
};

const CHANNEL_LABELS = {
  homepage_banner: "Homepage banner",
  email: "Email draft",
  product_pages: "Product pages",
  social: "Social captions",
  subscriber_offer: "Subscriber offer",
  retargeting: "Retargeting notes",
};

const PRIORITY_MAP = {
  "Normal campaign": "normal",
  "High priority launch": "high",
  "Low stock urgency": "urgent",
  "Evergreen promotion": "evergreen",
};

const APPROVAL_MAP = {
  "Draft only, require approval": "draft_only",
  "Generate and schedule for review": "schedule_review",
  "Generate assets only": "assets_only",
};

const SOURCE_MAP = {
  "Website and email": "website_email",
  "Website only": "website",
  "Email only": "email",
  "Social only": "social",
};

function fmtCents(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function fmtStatus(status) {
  const labels = {
    draft: "Draft",
    generating: "Generating…",
    review: "Needs review",
    active: "Active",
    paused: "Paused",
    completed: "Completed",
    archived: "Archived",
  };
  return labels[status] || status || "Draft";
}

function campaignTag(campaign) {
  const goal = (campaign.goal || "").toLowerCase();
  if (goal.includes("subscriber")) return "Audience";
  if (goal.includes("stock") || campaign.priority === "urgent") return "Inventory";
  return "Campaign";
}

async function growthFetch(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (res.status === 401) throw new Error("Sign in to manage campaigns.");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function setGrowthMetric(app, key, value) {
  app.querySelectorAll(`[data-growth="${key}"]`).forEach((el) => {
    el.textContent = value;
  });
}

function paintMetrics(app, metrics) {
  if (!metrics) return;

  const total = metrics.total_sessions;
  const direct = metrics.direct_sessions;
  const organic = metrics.organic_sessions;
  const revenue = metrics.attributed_revenue_cents == null ? "—" : fmtCents(metrics.attributed_revenue_cents);
  const conversions = metrics.attributed_conversions;
  const readiness = metrics.readiness_score;
  const display = (value) => value == null ? "—" : String(value);

  setGrowthMetric(app, "attributed-revenue", revenue);
  setGrowthMetric(app, "conversions", conversions == null ? "Unavailable" : `${conversions} conversion${conversions === 1 ? "" : "s"}`);
  setGrowthMetric(app, "total-sessions", display(total));
  setGrowthMetric(app, "direct-sessions", display(direct));
  setGrowthMetric(app, "organic-sessions", display(organic));
  setGrowthMetric(app, "kpi-sessions", display(total));
  setGrowthMetric(app, "kpi-top-channel", metrics.channel_breakdown?.[0]?.source || "—");
  setGrowthMetric(app, "kpi-direct-sessions", display(direct));
  setGrowthMetric(app, "kpi-organic", display(organic));
  setGrowthMetric(app, "kpi-revenue", revenue);
  setGrowthMetric(app, "readiness-score", readiness == null ? "Not assessed" : `${readiness}%`);

  const bar = app.querySelector(".fnf-traffic-bar");
  if (bar && total > 0 && direct != null && organic != null) {
    const spans = bar.querySelectorAll("span");
    if (spans[0]) spans[0].style.flex = String(direct);
    if (spans[1]) spans[1].style.flex = String(organic);
  }

  const channels = Array.isArray(metrics.channel_breakdown) ? metrics.channel_breakdown : [];
  const cards = app.querySelectorAll('[data-page="overview"] .fnf-source');
  cards.forEach((card, index) => {
    const source = channels[index];
    card.hidden = !source;
    if (!source) return;
    const label = card.querySelector("[data-source-name]");
    const icon = card.querySelector(".fnf-source-icon");
    const sessionEl = card.querySelector(".fnf-source-top div:last-child");
    const valueEl = card.querySelector(".fnf-source-value");
    const captionEl = card.querySelector(".fnf-source-caption");
    const count = Number.isFinite(Number(source.sessions)) ? String(Number(source.sessions)) : "—";
    if (label) label.textContent = source.source || "Unknown";
    if (icon) icon.textContent = (source.source || "?").charAt(0).toUpperCase();
    if (sessionEl) sessionEl.textContent = `${count} sessions`;
    if (valueEl) valueEl.textContent = count;
    if (captionEl) captionEl.textContent = "Recorded sessions";
  });

}

function paintChannelBreakdown(app, channels) {
  const body = app.querySelector("#growthChannelBreakdown");
  if (!body) return;
  body.replaceChildren();
  if (!Array.isArray(channels) || !channels.length) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 5;
    cell.textContent = "No attributed channels have been recorded.";
    return;
  }
  for (const channel of channels) {
    const row = body.insertRow();
    const source = row.insertCell();
    const sessions = row.insertCell();
    const revenue = row.insertCell();
    const status = row.insertCell();
    const next = row.insertCell();
    source.textContent = channel.source || "Unknown";
    sessions.textContent = Number.isFinite(Number(channel.sessions)) ? String(Number(channel.sessions)) : "—";
    revenue.textContent = channel.revenue_cents == null ? "Not reported" : fmtCents(channel.revenue_cents);
    status.textContent = "Recorded";
    next.textContent = "Review campaign attribution and linked content.";
  }
}

function renderCampaignGrid(app, campaigns) {
  const grid = app.querySelector("#growthCampaignGrid");
  if (!grid) return;

  const items = campaigns?.length ? campaigns : [];

  if (!items.length) {
    grid.innerHTML = `
      <article class="fnf-campaign-card" data-go="create">
        <div class="fnf-tag">Starter</div>
        <h3>Create your first campaign</h3>
        <p>Turn store signals into a draft homepage banner, email pack, and UTM-ready links.</p>
        <div class="fnf-campaign-foot">
          <span>0 channels</span>
          <span>Draft</span>
        </div>
      </article>`;
    grid.querySelector("[data-go]")?.addEventListener("click", () => openCreateView(app));
    return;
  }

  grid.innerHTML = items
    .slice(0, 6)
    .map(
      (c) => `
      <article class="fnf-campaign-card" data-campaign-id="${c.id}" tabindex="0">
        <div class="fnf-tag">${campaignTag(c)}</div>
        <h3>${escapeHtml(c.name)}</h3>
        <p>${escapeHtml(c.brief || c.goal || "Campaign draft")}</p>
        <div class="fnf-campaign-foot">
          <span>${(c.channels || []).length} channel${(c.channels || []).length === 1 ? "" : "s"}</span>
          <span>${fmtStatus(c.status)}</span>
        </div>
      </article>`
    )
    .join("");

  grid.querySelectorAll("[data-campaign-id]").forEach((card) => {
    const open = () => openCampaign(app, card.dataset.campaignId);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readCreateForm(app) {
  const goal = app.querySelector("#fnfCampaignGoal")?.value || "";
  const audience = app.querySelector("#fnfAudience")?.value || "";
  const priorityLabel = app.querySelector("#fnfPriority")?.value || "Normal campaign";
  const approvalLabel = app.querySelector("#fnfApproval")?.value || "Draft only, require approval";
  const sourceLabel = app.querySelector("#fnfSource")?.value || "Website and email";

  const channels = [];
  app.querySelectorAll('#fnfChannelChoices input[name="channel"]:checked').forEach((input) => {
    channels.push(input.value);
  });

  return {
    name: app.querySelector("#fnfCampaignName")?.value?.trim() || "",
    goal,
    audience,
    priority: PRIORITY_MAP[priorityLabel] || "normal",
    brief: app.querySelector("#fnfBrief")?.value?.trim() || "",
    channels,
    start_date: app.querySelector("#fnfStart")?.value || null,
    end_date: app.querySelector("#fnfEnd")?.value || null,
    primary_source: SOURCE_MAP[sourceLabel] || "website_email",
    approval_mode: APPROVAL_MAP[approvalLabel] || "draft_only",
  };
}

function fillCreateForm(app, campaign) {
  if (!campaign) return;

  const setVal = (id, val) => {
    const el = app.querySelector(`#${id}`);
    if (el && val != null) el.value = val;
  };

  setVal("fnfCampaignName", campaign.name);
  setVal("fnfCampaignGoal", campaign.goal || "");
  setVal("fnfAudience", campaign.audience || "All visitors");
  setVal("fnfBrief", campaign.brief || "");
  setVal("fnfStart", campaign.start_date || "");
  setVal("fnfEnd", campaign.end_date || "");

  const priorityReverse = Object.fromEntries(Object.entries(PRIORITY_MAP).map(([k, v]) => [v, k]));
  setVal("fnfPriority", priorityReverse[campaign.priority] || "Normal campaign");

  const approvalReverse = Object.fromEntries(Object.entries(APPROVAL_MAP).map(([k, v]) => [v, k]));
  setVal("fnfApproval", approvalReverse[campaign.approval_mode] || "Draft only, require approval");

  const sourceReverse = Object.fromEntries(Object.entries(SOURCE_MAP).map(([k, v]) => [v, k]));
  setVal("fnfSource", sourceReverse[campaign.primary_source] || "Website and email");

  const selected = new Set(campaign.channels || []);
  app.querySelectorAll('#fnfChannelChoices input[name="channel"]').forEach((input) => {
    input.checked = selected.has(input.value);
  });

  renderPackPreview(app, campaign);
  syncAgentsamContext(campaign);
}

function renderPackPreview(app, campaign) {
  const pack = campaign?.pack || {};
  const banner = app.querySelector("#fnfPreviewBanner");
  const subject = app.querySelector("#fnfPreviewSubject");
  const preview = app.querySelector("#fnfPreviewEmailPreview");
  const body = app.querySelector("#fnfPreviewEmailBody");
  const status = app.querySelector("#fnfPackStatus");

  if (banner) banner.textContent = pack.homepage_banner || "Homepage copy appears after generating a draft.";
  if (subject) subject.textContent = pack.email_subject || "No email draft yet";
  if (preview) preview.textContent = pack.email_preview || "Generate a campaign pack to preview the email.";
  if (body) body.textContent = pack.email_body_text || "The email body will appear here for review.";

  if (status) {
    if (campaign?.status === "generating") {
      status.hidden = false;
      status.textContent = "Generating campaign pack with AgentSam…";
    } else if (pack.generated_at) {
      status.hidden = false;
      status.textContent = `Pack generated ${new Date(pack.generated_at).toLocaleString()} (${pack.generator || "ai"})`;
    } else {
      status.hidden = true;
      status.textContent = "";
    }
  }

  const checklist = app.querySelector(".fnf-checklist");
  if (checklist) {
    const channels = campaign?.channels || [];
    const hasUtm = Boolean(pack.utm_links?.homepage || pack.utm_campaign);
    const isActive = campaign?.status === "active";
    checklist.innerHTML = `
      <div class="fnf-check"><span>Homepage banner</span><strong>${isActive && channels.includes("homepage_banner") ? "Live" : pack.homepage_banner ? "Ready" : channels.includes("homepage_banner") ? "Pending" : "Off"}</strong></div>
      <div class="fnf-check"><span>Email draft</span><strong>${isActive && channels.includes("email") ? "Published" : pack.email_subject ? "Ready" : channels.includes("email") ? "Pending" : "Off"}</strong></div>
      <div class="fnf-check"><span>UTM links</span><strong>${hasUtm ? "Ready" : "Needed"}</strong></div>
      <div class="fnf-check"><span>Status</span><strong>${fmtStatus(campaign?.status)}</strong></div>`;
  }

  renderUtmLinks(app, pack);
  updatePublishButtons(app, campaign);
}

function renderUtmLinks(app, pack) {
  const box = app.querySelector("#fnfUtmLinks");
  if (!box) return;
  const links = pack?.utm_links || {};
  const entries = Object.entries(links);
  if (!entries.length) {
    box.innerHTML = '<p class="fnf-muted">Generate a pack to create tracked links.</p>';
    return;
  }
  box.innerHTML = entries
    .map(
      ([channel, href]) =>
        `<div class="fnf-link-row"><span>${channel}</span><a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(href)}</a></div>`
    )
    .join("");
}

function updatePublishButtons(app, campaign) {
  const canPublish = Boolean(campaign?.pack?.generated_at || campaign?.pack?.homepage_banner);
  const isReview = campaign?.status === "review" || campaign?.status === "active";
  app.querySelectorAll("[data-publish], [data-publish-test]").forEach((btn) => {
    btn.hidden = !canPublish;
    btn.disabled = campaign?.status === "generating";
    if (btn.hasAttribute("data-publish") && campaign?.status === "active") {
      btn.textContent = "Re-publish campaign";
    }
  });
  if (!isReview && campaign?.status === "draft") {
    app.querySelectorAll("[data-publish]").forEach((btn) => {
      btn.title = "Generate a pack and move to review before publishing";
    });
  }
}

function syncAgentsamContext(campaign) {
  if (!campaign) {
    window.setAgentsamPageContext?.({ page: "/admin/growth", view: growthState.activeCampaignId ? "create" : "overview" });
    return;
  }
  window.setAgentsamPageContext?.({
    page: "/admin/growth",
    campaign_id: campaign.id,
    campaign_name: campaign.name,
    campaign_status: campaign.status,
    channels: campaign.channels,
  });
  window.__agentsamSuggestedPrompts = [
    `Improve the homepage banner for "${campaign.name}"`,
    `Draft a stronger email subject for "${campaign.name}"`,
    `Suggest UTM links and channel rollout for this campaign`,
  ];
  const prompts = document.getElementById("agentsam-prompts");
  if (prompts) {
    prompts.innerHTML = "";
    window.__agentsamSuggestedPrompts.forEach((label) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "agentsam-chip";
      btn.textContent = label;
      btn.addEventListener("click", () => window.sendAgentsamMessage?.(label));
      prompts.appendChild(btn);
    });
  }
}

function setView(app, view) {
  app.dataset.view = view;
  app.scrollIntoView({ block: "start" });
  if (view !== "create") growthState.activeCampaignId = null;
  syncAgentsamContext(null);
}

function openCreateView(app) {
  growthState.activeCampaignId = null;
  fillCreateForm(app, {
    name: "",
    goal: "",
    audience: "",
    priority: "normal",
    brief: "",
    channels: [],
    approval_mode: "draft_only",
    primary_source: "website_email",
    pack: {},
    status: "draft",
  });
  setView(app, "create");
}

async function openCampaign(app, id) {
  growthState.activeCampaignId = id;
  setView(app, "create");
  try {
    const data = await growthFetch(`/api/admin/growth/campaigns/${id}`);
    fillCreateForm(app, data.campaign);
  } catch (err) {
    console.error("[growth/campaign]", err);
    alert(err.message || "Could not load campaign");
  }
}

async function refreshOverview(app) {
  const status = app.querySelector("[data-growth-api-status]");
  try {
    const data = await growthFetch("/api/admin/growth/overview");
    if (!data?.ok || !data.metrics || !Array.isArray(data.recent)) {
      throw new Error("The campaign service returned an incomplete response.");
    }
    growthState.overview = data;
    if (status) status.hidden = true;
    app.querySelectorAll("[data-save-draft], [data-generate], [data-publish], [data-publish-test]").forEach((el) => { el.disabled = false; });
    paintMetrics(app, data.metrics);
    paintChannelBreakdown(app, data.metrics.channel_breakdown);
    renderCampaignGrid(app, data.recent);
  } catch (err) {
    console.error("[growth/overview]", err);
    growthState.overview = null;
    if (status) {
      status.hidden = false;
      status.textContent = `Campaign data unavailable: ${err.message}. Select an authorized installation with a configured Growth service.`;
    }
    app.querySelectorAll("[data-save-draft], [data-generate], [data-publish], [data-publish-test]").forEach((el) => { el.disabled = true; });
    const grid = app.querySelector("#growthCampaignGrid");
    if (grid) grid.textContent = "Campaign records are not available for this installation.";
  }
}

async function publishCampaign(app, { emailMode = "draft" } = {}) {
  let id = growthState.activeCampaignId;
  if (!id) {
    await saveCampaign(app, { generate: false });
    id = growthState.activeCampaignId;
  }
  if (!id) return;

  const buttons = app.querySelectorAll("[data-publish], [data-publish-test]");
  buttons.forEach((b) => {
    b.disabled = true;
  });

  try {
    if (emailMode !== "draft") {
      await growthFetch(`/api/admin/growth/campaigns/${id}`, {
        method: "PATCH",
        body: JSON.stringify(readCreateForm(app)),
      });
    }

    const data = await growthFetch(`/api/admin/growth/campaigns/${id}/publish`, {
      method: "POST",
      body: JSON.stringify({ email_mode: emailMode }),
    });

    fillCreateForm(app, data.campaign);
    await refreshOverview(app);

    const pub = data.publish || {};
    let message = "Campaign published.";
    if (pub.homepage?.ok) message += " Homepage hero is live.";
    if (pub.email?.mode === "draft") message += " Email saved as draft in mail.";
    if (pub.email?.sent) message += ` Email sent to ${pub.email.sent} recipient(s).`;
    if (pub.email?.error) message += ` Email note: ${pub.email.error}`;

    alert(message);
    window.openAgentsamDrawer?.();
    window.sendAgentsamMessage?.(
      `Campaign "${data.campaign.name}" was published. Summarize what went live and what to monitor in attribution.`
    );
  } catch (err) {
    console.error("[growth/publish]", err);
    alert(err.message || "Publish failed");
  } finally {
    buttons.forEach((b) => {
      b.disabled = false;
    });
  }
}

async function saveCampaign(app, { generate = false } = {}) {
  const body = readCreateForm(app);
  if (!body.name) {
    alert("Campaign name is required.");
    return;
  }

  const buttons = app.querySelectorAll("[data-generate], [data-save-draft]");
  buttons.forEach((b) => {
    b.disabled = true;
  });

  try {
    let id = growthState.activeCampaignId;
    if (!id) {
      const created = await growthFetch("/api/admin/growth/campaigns", {
        method: "POST",
        body: JSON.stringify(body),
      });
      id = created.campaign?.id;
      growthState.activeCampaignId = id;
    } else {
      await growthFetch(`/api/admin/growth/campaigns/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    }

    if (generate && id) {
      renderPackPreview(app, { ...body, id, status: "generating", channels: body.channels, pack: {} });
      const generated = await growthFetch(`/api/admin/growth/campaigns/${id}/generate`, { method: "POST" });
      fillCreateForm(app, generated.campaign);
      window.openAgentsamDrawer?.();
      window.sendAgentsamMessage?.(
        `Campaign "${generated.campaign.name}" pack is ready for review. Summarize the draft and suggest next publish steps.`
      );
    } else if (id) {
      const updated = await growthFetch(`/api/admin/growth/campaigns/${id}`);
      fillCreateForm(app, updated.campaign);
    }

    await refreshOverview(app);
  } catch (err) {
    console.error("[growth/save]", err);
    alert(err.message || "Could not save campaign");
  } finally {
    buttons.forEach((b) => {
      b.disabled = false;
    });
  }
}

function bindGrowthApp(app) {
  if (!app || app.dataset.bound) return;
  app.dataset.bound = "1";

  app.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.go;
      if (target === "create") openCreateView(app);
      else {
        setView(app, target);
        if (target === "overview") refreshOverview(app);
      }
    });
  });

  app.querySelectorAll("[data-dismiss]").forEach((button) => {
    button.addEventListener("click", () => button.closest(".fnf-notice")?.remove());
  });

  app.querySelectorAll("[data-generate]").forEach((button) => {
    button.addEventListener("click", () => saveCampaign(app, { generate: true }));
  });

  app.querySelectorAll("[data-save-draft]").forEach((button) => {
    button.addEventListener("click", () => saveCampaign(app, { generate: false }));
  });

  app.querySelectorAll("[data-publish]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!confirm("Publish this campaign to the live homepage (and save email draft)?")) return;
      publishCampaign(app, { emailMode: "draft" });
    });
  });

  app.querySelectorAll("[data-publish-test]").forEach((button) => {
    button.addEventListener("click", () => publishCampaign(app, { emailMode: "test" }));
  });
}

async function initGrowthPage() {
  const mount = document.getElementById("growthMount");
  if (!mount) return;

  try {
    const res = await fetch("/admin/partials/growth-app.html", { credentials: "same-origin" });
    if (!res.ok) throw new Error(`Growth partial HTTP ${res.status}`);
    mount.innerHTML = await res.text();
    const app = document.getElementById("fnfGrowthApp");
    if (!app) throw new Error("Growth markup was not included in the packaged assets");
    bindGrowthApp(app);
    await refreshOverview(app);
    syncAgentsamContext(null);
  } catch (err) {
    console.error("[growth]", err);
    mount.innerHTML =
      '<div class="console-scaffold"><h1>Growth failed to load</h1><p>Refresh the page or check the network tab.</p></div>';
  }
}

window.initGrowthPage = initGrowthPage;
