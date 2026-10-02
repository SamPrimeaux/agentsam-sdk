const MAIL_DEFAULTS = {
  resendFrom: "hello@fuelnfreetime.com",
  resendPaymentsFrom: "payments@fuelnfreetime.com",
  resendDomain: "fuelnfreetime.com",
  resendReplyTo: "",
  resendApiKey: "",
  resendTransactional: true,
  resendCampaign: false,
  resendTracking: false,
  resendWebhooks: true,
  defaultInbox: "Resend inbound",
  defaultSender: "Resend only",
  syncCadence: "Live (webhooks)",
  agentMode: "Draft only",
  autoLabel: true,
  clientPriority: true,
  reviewBeforeSend: true,
};

let toastTimer;
let adminEmail = "";
let currentRole = "member";

function $(id) {
  return document.getElementById(id);
}

function showAccountToast(message) {
  const toast = $("accountToast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("open");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("open"), 2200);
}

function showFormNote(id, message, ok) {
  const note = $(id);
  if (!note) return;
  note.textContent = message;
  note.className = ok ? "admin-note success" : "admin-note error";
  note.style.display = "block";
}

function normalizeSettings(settings) {
  return { ...MAIL_DEFAULTS, ...(settings || {}) };
}

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function collectSettings() {
  const get = (id) => $(id);
  const checkbox = (id) => !!get(id)?.checked;
  return {
    resendFrom: get("resendFrom")?.value.trim() || "",
    resendPaymentsFrom: get("resendPaymentsFrom")?.value.trim() || "payments@fuelnfreetime.com",
    resendDomain: get("resendDomain")?.value.trim() || "",
    resendReplyTo: get("resendReplyTo")?.value.trim() || "",
    resendApiKey: get("resendApiKey")?.value.trim() || "",
    resendTransactional: checkbox("resendTransactional"),
    resendCampaign: checkbox("resendCampaign"),
    resendTracking: checkbox("resendTracking"),
    resendWebhooks: checkbox("resendWebhooks"),
    defaultInbox: get("defaultInbox")?.value || "Resend inbound",
    defaultSender: get("defaultSender")?.value || "Resend only",
    syncCadence: get("syncCadence")?.value || "Live (webhooks)",
    agentMode: get("agentMode")?.value || "Draft only",
    autoLabel: checkbox("autoLabel"),
    clientPriority: checkbox("clientPriority"),
    reviewBeforeSend: checkbox("reviewBeforeSend"),
  };
}

function hydrateSettings(settings) {
  const merged = normalizeSettings(settings);
  Object.entries(merged).forEach(([key, value]) => {
    const el = $(key);
    if (!el) return;
    if (el.type === "checkbox") el.checked = !!value;
    else el.value = value;
  });
  renderAccounts(merged);
}

function renderAccounts(settings = normalizeSettings(collectSettings())) {
  const list = $("accountsList");
  if (!list) return;
  list.innerHTML = `
    <div class="account-row">
      <div class="account-row-icon resend">RS</div>
      <div class="account-row-main"><strong>${settings.resendFrom || "Resend sender not set"}</strong><span>${settings.resendDomain || "fuelnfreetime.com"} — inbound &amp; outbound</span></div>
      <button class="account-pill ${settings.resendTransactional ? "connected" : "warning"}" type="button" data-mail-tab="resend">Resend</button>
    </div>`;
}

function switchMailPanel(tab) {
  document.querySelectorAll(".account-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mailTab === tab);
  });
  document.querySelectorAll(".account-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `mail-panel-${tab}`);
  });
  history.replaceState(null, "", tab === "accounts" ? "/admin/account#mail" : `/admin/account#mail-${tab}`);
}

function renderMailboxes(mailboxes = []) {
  const list = $("mailboxList");
  if (!list) return;
  if (!mailboxes.length) {
    list.innerHTML = `<p style="margin:0;color:#64748b;font-size:13px">No mailboxes yet. Create one below or run <code>npm run mail:provision</code>.</p>`;
    return;
  }
  list.innerHTML = mailboxes
    .map(
      (box) => `
    <div class="account-webhook-row">
      <div><strong>${box.label}</strong> <span>${box.kind}</span></div>
      <code>${box.address}</code>
      <span style="font-size:12px;color:#64748b">${box.owner_name || "Shared"}${box.owner_auth_email ? ` · ${box.owner_auth_email}` : ""}</span>
      <a href="/admin/email?mailbox=${box.address.split("@")[0]}" style="font-size:12px;font-weight:600">Open inbox →</a>
    </div>`
    )
    .join("");
}

function renderTeamMembers(members = []) {
  const list = $("teamList");
  if (!list) return;
  if (!members.length) {
    list.innerHTML = `<p style="margin:0;color:#64748b;font-size:13px">No team members loaded.</p>`;
    return;
  }
  list.innerHTML = members
    .map(
      (m) => `
    <div class="account-webhook-row">
      <div><strong>${m.display_name || m.name || m.email}</strong> <span>${m.role}</span></div>
      <code>${m.email}</code>
      <span style="font-size:12px;color:#64748b">${(m.mailboxes || []).join(", ") || "No mailbox linked"}</span>
    </div>`
    )
    .join("");
}

async function loadMailSettings() {
  try {
    const [settingsRes, statusRes, boxesRes] = await Promise.all([
      adminFetch("/api/admin/mail/settings"),
      adminFetch("/api/admin/mail/resend/status").catch(() => null),
      adminFetch("/api/admin/mail/mailboxes").catch(() => ({ mailboxes: [] })),
    ]);
    hydrateSettings(settingsRes.settings || {});
    renderMailboxes(boxesRes.mailboxes || []);

    const pill = $("accountStatusPill");
    if (pill && settingsRes.providers) {
      const ready = settingsRes.providers.resend === "configured";
      pill.textContent = ready ? "Resend active" : "Resend pending";
      pill.classList.toggle("connected", ready);
    }

    $("resendStatus")?.classList.toggle("connected", settingsRes.providers?.resend === "configured");
    if ($("resendStatus")) {
      $("resendStatus").textContent =
        settingsRes.providers?.resend === "configured" ? "Configured" : "Pending DNS / API key";
    }

    const wh = statusRes?.webhooks;
    if ($("webhookOutboundUrl") && wh?.outbound_url) $("webhookOutboundUrl").textContent = wh.outbound_url;
    if ($("webhookInboundUrl") && wh?.inbound_url) $("webhookInboundUrl").textContent = wh.inbound_url;
    if ($("webhookOutboundStatus")) {
      $("webhookOutboundStatus").textContent = settingsRes.providers?.webhooks?.outbound
        ? "Secret set on Worker"
        : "Add RESEND_WEBHOOK_SECRET_OUTBOUND";
    }
    if ($("webhookInboundStatus")) {
      $("webhookInboundStatus").textContent = settingsRes.providers?.webhooks?.inbound
        ? "Secret set on Worker"
        : "Add RESEND_WEBHOOK_SECRET_INBOUND";
    }
  } catch (err) {
    console.warn("Mail settings:", err);
    hydrateSettings(MAIL_DEFAULTS);
  }
}

async function loadTeamSection() {
  if (!["owner", "admin"].includes(currentRole)) {
    $("team")?.setAttribute("hidden", "");
    return;
  }
  $("team")?.removeAttribute("hidden");
  try {
    const data = await adminFetch("/api/admin/team/members");
    renderTeamMembers(data.members || []);
  } catch (err) {
    renderTeamMembers([]);
    console.warn("Team:", err);
  }
}

async function persistSettings(section) {
  const settings = collectSettings();
  if (settings.resendFrom && !validateEmail(settings.resendFrom)) {
    showAccountToast("Enter a valid Resend from email");
    return;
  }
  if (settings.resendReplyTo && !validateEmail(settings.resendReplyTo)) {
    showAccountToast("Enter a valid reply-to email");
    return;
  }

  try {
    await adminFetch("/api/admin/mail/settings", {
      method: "POST",
      body: JSON.stringify({ section, settings }),
    });
    showAccountToast("Settings saved");
    await loadMailSettings();
  } catch (err) {
    showAccountToast(err.message || "Could not save settings");
  }
}

async function saveProfile(event) {
  event.preventDefault();
  const displayName = $("profileDisplayName")?.value.trim() || "";
  const avatarUrl = $("profileAvatarUrl")?.value.trim() || "";
  try {
    await adminFetch("/api/admin/account/profile", {
      method: "POST",
      body: JSON.stringify({ display_name: displayName, avatar_url: avatarUrl }),
    });
    showFormNote("profile-note", "Profile updated.", true);
    if (window.__shellUser) {
      window.__shellUser.display_name = displayName;
      window.__shellUser.avatar_url = avatarUrl || null;
      hydrateShellProfile?.(window.__shellUser);
    }
  } catch (err) {
    showFormNote("profile-note", err.message || "Could not save profile", false);
  }
}

async function inviteMember(event) {
  event.preventDefault();
  try {
    const data = await adminFetch("/api/admin/team/invite", {
      method: "POST",
      body: JSON.stringify({
        email: $("inviteEmail")?.value.trim(),
        display_name: $("inviteName")?.value.trim(),
        role: $("inviteRole")?.value,
        mailbox_local: $("inviteMailbox")?.value.trim(),
        password: $("invitePassword")?.value,
      }),
    });
    showFormNote("invite-note", data.message || "Member invited.", true);
    $("invite-form")?.reset();
    await loadTeamSection();
    await loadMailSettings();
  } catch (err) {
    showFormNote("invite-note", err.message || "Invite failed", false);
  }
}

async function createMailbox(event) {
  event.preventDefault();
  const localPart = $("mailboxLocal")?.value.trim();
  const label = $("mailboxLabel")?.value.trim();
  const kind = $("mailboxKind")?.value || "shared";
  try {
    const data = await adminFetch("/api/admin/mail/mailboxes", {
      method: "POST",
      body: JSON.stringify({ local_part: localPart, label, kind }),
    });
    showFormNote("mailbox-note", `Created ${data.mailbox?.address || localPart + "@fuelnfreetime.com"}`, true);
    $("mailbox-form")?.reset();
    await loadMailSettings();
    await loadTeamSection();
  } catch (err) {
    showFormNote("mailbox-note", err.message || "Could not create mailbox", false);
  }
}

async function sendResendTest() {
  const settings = normalizeSettings(collectSettings());
  const to = adminEmail || settings.resendReplyTo || settings.resendFrom;
  if (!to) {
    showAccountToast("Set a reply-to or from address first");
    return;
  }
  try {
    const data = await adminFetch("/api/admin/mail/send", {
      method: "POST",
      body: JSON.stringify({
        to,
        subject: "Fuel & Free Time — Resend E2E test",
        body: "If you received this, Resend outbound mail is working for fuelnfreetime.com.",
        fromProvider: "resend",
        test: true,
      }),
    });
    showAccountToast(data.sent ? data.message || "Test sent" : data.message || data.error || "Send failed");
  } catch (err) {
    showAccountToast(err.message || "Test failed");
  }
}

function bindAccountPage() {
  document.querySelectorAll(".account-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchMailPanel(btn.dataset.mailTab));
  });
  document.querySelector(".account-page")?.addEventListener("click", (event) => {
    const tabBtn = event.target.closest("[data-mail-tab]");
    if (tabBtn && !tabBtn.classList.contains("account-tab")) {
      switchMailPanel(tabBtn.dataset.mailTab);
    }
  });
  $("accountsList")?.addEventListener("click", (event) => {
    const tabBtn = event.target.closest("[data-mail-tab]");
    if (tabBtn) switchMailPanel(tabBtn.dataset.mailTab);
  });

  $("saveAllSettings")?.addEventListener("click", () => persistSettings("all"));
  $("saveResend")?.addEventListener("click", () => persistSettings("resend"));
  $("saveRouting")?.addEventListener("click", () => persistSettings("routing"));
  $("testResend")?.addEventListener("click", sendResendTest);
  $("profile-form")?.addEventListener("submit", saveProfile);
  $("invite-form")?.addEventListener("submit", inviteMember);
  $("mailbox-form")?.addEventListener("submit", createMailbox);

  const hash = location.hash.replace(/^#/, "");
  if (hash.startsWith("mail-")) switchMailPanel(hash.slice(5));
  else if (hash === "mail") switchMailPanel("accounts");

  loadMailSettings();
  loadTeamSection();
}

window.initAccountPage = async function initAccountPage() {
  try {
    const me = await adminFetch("/api/admin/me");
    adminEmail = me.email || "";
    currentRole = me.role || "member";
    if ($("accountEmail")) $("accountEmail").value = adminEmail || "—";
    if ($("accountRole")) $("accountRole").textContent = currentRole;
    if ($("accountRoleLabel")) {
      $("accountRoleLabel").textContent = `${currentRole.charAt(0).toUpperCase()}${currentRole.slice(1)} access`;
    }
    if ($("profileDisplayName")) $("profileDisplayName").value = me.display_name || "";
    if ($("profileAvatarUrl")) $("profileAvatarUrl").value = me.avatar_url || "";
  } catch {
    /* redirect handled by shell */
  }
  bindAccountPage();
};
