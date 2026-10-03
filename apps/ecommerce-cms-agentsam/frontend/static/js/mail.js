const MAIL_ICONS = {
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"></path></svg>',
};

const FOLDER_LABELS = {
  inbox: "Inbox",
  sent: "Sent",
  starred: "Starred",
  needs: "Needs reply",
  drafts: "Drafts",
  archived: "Archived",
};

let messages = [];
let messageSource = "d1";
let selectedId = null;
let activeFilter = "all";
let activeFolder = "inbox";
let activeMailbox = "";
let selectedContextId = null;
let toastTimer;
let adminEmail = "";
let composeSettings = { resendFrom: "hello@fuelnfreetime.com" };
let primaryMailbox = "";
let composeMailboxes = [];

function getActiveFolder() {
  return new URLSearchParams(window.location.search).get("folder") || "inbox";
}

function getActiveMailbox() {
  return new URLSearchParams(window.location.search).get("mailbox") || "";
}

function mailMessagesUrl() {
  const params = new URLSearchParams();
  const mb = getActiveMailbox();
  const folder = getActiveFolder();
  if (mb) params.set("mailbox", mb);
  if (folder && folder !== "inbox") params.set("folder", folder);
  const qs = params.toString();
  return `/api/admin/mail/messages${qs ? `?${qs}` : ""}`;
}

async function loadMailPartialHtml() {
  const tpl = document.getElementById("mail-app-template");
  if (tpl?.innerHTML?.includes('id="mailApp"')) {
    return tpl.innerHTML.trim();
  }

  const res = await fetch("/api/admin/mail/partial", {
    credentials: "same-origin",
    headers: { Accept: "text/html" },
  });
  const html = await res.text();
  if (res.ok && html.includes('id="mailApp"')) return html;

  const fallback = await fetch("/admin/partials/mail-app.html", {
    credentials: "same-origin",
    headers: { Accept: "text/html" },
  });
  const fallbackHtml = await fallback.text();
  if (fallback.ok && fallbackHtml.includes('id="mailApp"')) return fallbackHtml;

  throw new Error(
    res.status === 401
      ? "Session expired — refresh and sign in again"
      : `Could not load mail UI (HTTP ${res.status})`
  );
}

async function bootMailApp() {
  const root = document.getElementById("mail-root");
  if (!root) return;

  if (document.getElementById("mailApp")) {
    await initMailApp();
    return;
  }

  root.innerHTML = '<div class="mail-boot-loading"><p>Loading inbox…</p></div>';

  try {
    root.innerHTML = await loadMailPartialHtml();
    await initMailApp();
  } catch (err) {
    root.innerHTML = `<div class="mail-boot-error">
      <h2>Email workspace could not load</h2>
      <p>${err.message || "Unknown error"}</p>
      <button type="button" class="primary-button" onclick="location.reload()">Reload page</button>
      <a href="/admin/login" class="ghost-button" style="display:inline-flex;margin-top:12px;text-decoration:none">Sign in again</a>
    </div>`;
  }
}

async function initMailApp() {
  activeFolder = getActiveFolder();
  activeMailbox = getActiveMailbox();
  try {
    bindMailEvents();
  } catch (err) {
    console.error("Mail bind failed:", err);
  }

  try {
    const me = await adminFetch("/api/admin/me");
    adminEmail = me.email || "";
    primaryMailbox = me.primary_mailbox || "";
    const allowed = (me.mailboxes || []).map((m) => m.slug);

    if (!activeMailbox && primaryMailbox) {
      const params = new URLSearchParams(window.location.search);
      params.set("mailbox", primaryMailbox);
      window.location.replace(`/admin/email?${params.toString()}`);
      return;
    }
    if (activeMailbox && allowed.length && !allowed.includes(activeMailbox)) {
      const params = new URLSearchParams(window.location.search);
      params.set("mailbox", primaryMailbox || allowed[0]);
      window.location.replace(`/admin/email?${params.toString()}`);
      return;
    }
  } catch {
    /* shell handles redirect */
  }

  try {
    const data = await adminFetch(mailMessagesUrl());
    messages = data.messages || [];
    messageSource = data.source || "d1";
  } catch {
    messages = [];
    messageSource = "d1";
  }

  selectedId = messages[0]?.id ?? null;
  selectedContextId = selectedId;

  await loadComposeSettings();
  syncFolderChrome();
  updateBadges();
  renderRows();
  void renderReader();

  if (new URLSearchParams(window.location.search).get("compose") === "1") {
    openCompose("New message");
  }
}

window.bootMailApp = bootMailApp;

function $(id) {
  return document.getElementById(id);
}

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("open");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("open"), 2200);
}

async function loadComposeSettings() {
  try {
    const [settingsRes, boxesRes] = await Promise.all([
      adminFetch("/api/admin/mail/settings"),
      adminFetch("/api/admin/mail/mailboxes").catch(() => ({ mailboxes: [] })),
    ]);
    composeSettings = settingsRes.settings || composeSettings;
    composeMailboxes = boxesRes.mailboxes || [];
  } catch {
    /* defaults */
  }
  updateComposeFromOptions();
}

function syncFolderChrome() {
  const mailbox = composeMailboxes.find(
    (b) => b.id === `mb_${activeMailbox}` || b.address.split("@")[0] === activeMailbox
  );
  const folderLabel = FOLDER_LABELS[activeFolder] || "Inbox";
  const title = mailbox ? `${mailbox.label} · ${folderLabel}` : folderLabel;
  if ($("folderTitle")) $("folderTitle").textContent = title;
}

function updateComposeFromOptions() {
  const select = $("composeFrom");
  if (!select) return;
  const settings = composeSettings;
  const options = [];
  for (const box of composeMailboxes) {
    options.push(
      `<option value="mailbox:${box.id.replace(/^mb_/, "")}">${box.resend_from_name || box.label} &lt;${box.address}&gt;</option>`
    );
  }
  if (settings.resendFrom && !composeMailboxes.some((b) => b.address === settings.resendFrom)) {
    options.push(`<option value="resend">${settings.resendFrom} via Resend</option>`);
  }
  if (!options.length) {
    options.push(`<option value="resend">hello@fuelnfreetime.com via Resend</option>`);
  }
  select.innerHTML = options.join("");
}

function updateBadges() {
  const unread = messages.filter((m) => m.unread).length;
  const sub = $("folderSubhead");
  if (sub) {
    const sourceLabel = messageSource === "demo" ? "demo inbox" : "live inbox";
    sub.textContent =
      activeFolder === "inbox"
        ? `${unread} unread · ${sourceLabel}`
        : `${messages.length} total · ${FOLDER_LABELS[activeFolder] || activeFolder}`;
  }
}

function labelsHTML(labels) {
  return (labels || [])
    .map((label) => {
      const cls =
        label === "primary" ? "primary" : label === "action" ? "action" : label === "client" ? "client" : "";
      return `<span class="label ${cls}">${label}</span>`;
    })
    .join("");
}

function matchesFolder(message) {
  if (activeFolder === "sent") return message.direction === "outbound";
  if (activeFolder === "inbox") return message.direction !== "outbound";
  if (activeFolder === "starred") return message.starred;
  if (activeFolder === "needs") return message.needs;
  if (activeFolder === "drafts") return message.status === "draft";
  if (activeFolder === "archived") return message.status === "archived";
  return true;
}

function filteredMessages() {
  const query = ($("mailSearch")?.value || "").trim().toLowerCase();
  return messages.filter((m) => {
    if (!matchesFolder(m)) return false;
    if (activeFilter === "unread" && !m.unread) return false;
    if (activeFilter === "starred" && !m.starred) return false;
    if (activeFilter === "needs" && !m.needs) return false;
    if (query) {
      const haystack = `${m.sender} ${m.email} ${m.subject} ${m.preview} ${(m.labels || []).join(" ")}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function ensureMessageBody(message) {
  if (!message || message.body_html || message.body_text) return message;
  if (message.direction !== "inbound" || !message.provider_id) return message;
  try {
    const data = await adminFetch(
      `/api/admin/mail/messages/${encodeURIComponent(message.db_id || message.id)}/hydrate`,
      { method: "POST" }
    );
    message.body_html = data.body_html || "";
    message.body_text = data.body_text || "";
    if (data.preview) message.preview = data.preview;
  } catch (err) {
    console.warn("Mail hydrate failed:", err);
  }
  return message;
}

function mountEmailBody(message, mountEl) {
  if (!mountEl) return;
  mountEl.innerHTML = "";
  const html = message.body_html?.trim();
  const text = message.body_text?.trim();

  if (html) {
    const iframe = document.createElement("iframe");
    iframe.className = "email-html-frame";
    iframe.setAttribute(
      "sandbox",
      "allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
    );
    iframe.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank"><style>
      body { font-family: Inter, system-ui, sans-serif; margin: 16px 20px 24px; line-height: 1.55; color: #111; background: #fff; }
      img { max-width: 100%; height: auto; }
      a { color: #2563eb; }
      table { max-width: 100%; }
    </style></head><body>${html}</body></html>`;
    iframe.onload = () => {
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) iframe.style.height = `${Math.max(doc.body.scrollHeight + 8, 140)}px`;
      } catch {
        iframe.style.height = "420px";
      }
    };
    mountEl.appendChild(iframe);
    return;
  }

  const textWrap = document.createElement("div");
  textWrap.className = "email-body email-body-text";
  const bodyCopy = text || message.preview || message.subject || "No content";
  textWrap.innerHTML = `<p>${escapeHtml(bodyCopy).replace(/\n/g, "<br>")}</p>`;
  mountEl.appendChild(textWrap);
}

function renderRows() {
  const rows = $("rows");
  if (!rows) return;
  const data = filteredMessages();
  $("metaCount") && ($("metaCount").textContent = `${data.length} messages shown`);

  rows.innerHTML =
    data
      .map(
        (message) => `
    <article class="message-row ${message.unread ? "unread" : ""} ${message.id === selectedId ? "selected" : ""}" data-id="${message.id}" tabindex="0">
      <div class="avatar ${message.color}">${message.unread ? '<span class="unread-dot"></span>' : ""}${message.initials}</div>
      <div class="row-main">
        <div class="row-top"><div class="sender">${message.sender}</div><div class="date">${message.date}</div></div>
        <div class="subject">${message.subject}</div>
        <div class="preview">${message.preview}</div>
        <div class="label-row">${labelsHTML(message.labels)}</div>
      </div>
      <button class="star-button ${message.starred ? "active" : ""}" type="button" data-star="${message.id}" aria-label="Star message">${MAIL_ICONS.star}</button>
    </article>`
      )
      .join("") ||
    `<div class="empty-state"><div class="empty-card"><h2>No messages yet</h2><p>${activeFolder === "sent" ? "Sent mail from Resend will appear here." : "Inbound mail arrives via Resend on your @fuelnfreetime.com address."}</p><div class="empty-actions"><button class="small-pill primary" type="button" id="emptyCompose">Compose</button></div></div></div>`;

  $("emptyCompose")?.addEventListener("click", () => openCompose("New message"));
}

async function renderReader() {
  const readerBody = $("readerBody");
  if (!readerBody) return;
  let message = messages.find((item) => item.id === selectedId);
  const inboxTo = message?.to_email || adminEmail || "admin@fuelnfreetime.com";

  if (!message) {
    readerBody.innerHTML = `<div class="empty-state"><div class="empty-card"><h2>Select a message</h2><p>Choose an email from the list, or compose a new message.</p><div class="empty-actions"><button class="small-pill primary" type="button" id="openComposeEmpty">Compose</button></div></div></div>`;
    $("openComposeEmpty")?.addEventListener("click", () => openCompose("New message"));
    return;
  }

  message = await ensureMessageBody(message);

  const sourceLabel =
    message.direction === "inbound"
      ? "Resend inbound"
      : message.direction === "outbound"
        ? "Resend outbound"
        : "Mail";

  readerBody.innerHTML = `
    <div class="message-header-card">
      <div class="message-header-main">
        <div class="big-avatar avatar ${message.color}">${message.initials}</div>
        <div class="subject-stack">
          <h2>${escapeHtml(message.subject)}</h2>
          <p>${escapeHtml(message.sender)} &lt;${escapeHtml(message.email)}&gt;</p>
        </div>
        <div class="header-date">${escapeHtml(message.fullDate)}</div>
      </div>
      <div class="meta-grid">
        <div class="meta-item"><b>To</b><span>${escapeHtml(inboxTo)}</span></div>
        <div class="meta-item"><b>Source</b><span>${sourceLabel}</span></div>
        <div class="meta-item"><b>Labels</b><span>${escapeHtml((message.labels || []).join(", ") || "—")}</span></div>
        <div class="meta-item"><b>Status</b><span>${escapeHtml(message.status || (message.needs ? "Needs review" : "Delivered"))}</span></div>
      </div>
      <div class="sam-strip">
        <div class="sam-copy"><strong>Inbox assistant</strong><span>${escapeHtml(message.type || "No summary yet.")}</span></div>
        <div class="sam-actions">
          <button class="small-pill primary" type="button" data-action="summarize">Summarize</button>
          <button class="small-pill" type="button" data-action="draft">Draft reply</button>
        </div>
      </div>
    </div>
    <div class="email-frame">
      <article class="email-canvas">
        <div id="emailBodyMount" class="email-body-mount"></div>
      </article>
    </div>`;

  mountEmailBody(message, document.getElementById("emailBodyMount"));
}

function selectMessage(id) {
  selectedId = id;
  selectedContextId = id;
  const message = messages.find((item) => String(item.id) === String(id));
  if (message) message.unread = false;
  updateBadges();
  renderRows();
  void renderReader();
  setMobilePanel("reader");
}

function openCompose(mode) {
  const message = messages.find((item) => item.id === selectedId) || messages[0];
  $("composeTitle").textContent = mode;
  $("composeTo").value = mode === "New message" ? "" : message?.email || "";
  $("composeSubject").value = mode === "New message" ? "" : `Re: ${message?.subject || ""}`;
  $("composeText").value =
    mode === "New message"
      ? ""
      : `Hi ${(message?.sender || "there").split(" ")[0]},\n\nThanks for reaching out. I'm reviewing this now and will follow up shortly.\n\n— Fuel & Free Time`;
  $("composeSheet")?.classList.add("open");
}

async function sendCompose() {
  const to = $("composeTo")?.value.trim();
  const subject = $("composeSubject")?.value.trim();
  const body = $("composeText")?.value.trim();
  const fromValue = $("composeFrom")?.value || "resend";
  let fromProvider = "resend";
  let fromMailbox = null;
  if (fromValue.startsWith("mailbox:")) fromMailbox = fromValue.slice("mailbox:".length);

  if (!to || !subject) {
    showToast("To and subject required");
    return;
  }

  try {
    const data = await adminFetch("/api/admin/mail/send", {
      method: "POST",
      body: JSON.stringify({ to, subject, body, fromProvider, fromMailbox }),
    });
    $("composeSheet")?.classList.remove("open");
    showToast(data.sent ? data.message || "Sent" : data.message || data.error || "Preview only");
    if (data.sent) {
      const refreshed = await adminFetch(mailMessagesUrl());
      messages = refreshed.messages || messages;
      messageSource = refreshed.source || messageSource;
      selectedId = messages[0]?.id ?? selectedId;
      updateBadges();
      renderRows();
      void renderReader();
    }
  } catch (err) {
    showToast(err.message || "Send failed");
  }
}

function closeMenus() {
  $("contextMenu")?.classList.remove("open");
  $("moreMenu")?.classList.remove("open");
}

function menuAction(action) {
  closeMenus();
  if (action === "open") selectMessage(selectedContextId);
  if (action === "reply") openCompose("Reply");
  if (action === "replyAll") openCompose("Reply all");
  if (action === "forward") openCompose("Forward");
  if (action === "unread") {
    const m = messages.find((x) => x.id === selectedContextId);
    if (m) m.unread = true;
    updateBadges();
    renderRows();
    showToast("Marked unread");
  }
  if (action === "archive") showToast("Archived (preview)");
  if (action === "delete") showToast("Deleted (preview)");
  if (action === "settings") window.location.href = "/admin/account#mail";
  if (action === "summarize") showToast("Summary ready (preview)");
  if (action === "task") showToast("Task created (preview)");
}

function setMobilePanel(panel) {
  if (!window.matchMedia("(max-width: 820px)").matches) return;
  const mailApp = $("mailApp");
  if (mailApp) mailApp.dataset.mobile = panel;
  document.querySelectorAll("#mobileTabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.panel === panel);
  });
}

function initDragHandles() {
  let activeHandle = null;
  let startX = 0;
  let startValue = 0;

  document.querySelectorAll(".mail-root .drag-handle").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      activeHandle = handle.dataset.handle;
      startX = event.clientX;
      const list = document.querySelector(".mail-root .message-list");
      startValue = list.getBoundingClientRect().width;
      handle.setPointerCapture(event.pointerId);
      document.body.style.userSelect = "none";
    });
  });

  window.addEventListener("pointermove", (event) => {
    if (!activeHandle) return;
    const delta = event.clientX - startX;
    const root = document.querySelector(".mail-root");
    const width = Math.max(340, Math.min(560, startValue + delta));
    root.style.setProperty("--list-w", `${width}px`);
  });
  window.addEventListener("pointerup", () => {
    activeHandle = null;
    document.body.style.userSelect = "";
  });
}

let mailEventsBound = false;

function bindMailEvents() {
  if (mailEventsBound) return;
  mailEventsBound = true;

  $("rows")?.addEventListener("click", (event) => {
    const star = event.target.closest("[data-star]");
    if (star) {
      event.stopPropagation();
      const message = messages.find((item) => String(item.id) === String(star.dataset.star));
      if (message) message.starred = !message.starred;
      renderRows();
      return;
    }
    const row = event.target.closest(".message-row");
    if (row) selectMessage(row.dataset.id);
  });

  $("filterTabs")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-filter]");
    if (!button) return;
    activeFilter = button.dataset.filter;
    document.querySelectorAll("#filterTabs button").forEach((btn) => {
      btn.classList.toggle("active", btn === button);
    });
    renderRows();
  });

  $("mailSearch")?.addEventListener("input", renderRows);
  $("composeButton")?.addEventListener("click", () => openCompose("New message"));
  $("closeCompose")?.addEventListener("click", () => $("composeSheet")?.classList.remove("open"));
  $("sendButton")?.addEventListener("click", sendCompose);
  $("draftButton")?.addEventListener("click", () => {
    $("composeSheet")?.classList.remove("open");
    showToast("Draft saved (preview)");
  });
  $("mobileBack")?.addEventListener("click", () => setMobilePanel("list"));
  $("mobileTabs")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-panel]");
    if (button) setMobilePanel(button.dataset.panel);
  });

  document.querySelector(".mail-root .reader-toolbar")?.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;
    const action = actionButton.dataset.action;
    if (action === "reply" || action === "replyAll" || action === "forward") {
      openCompose(action === "reply" ? "Reply" : action === "replyAll" ? "Reply all" : "Forward");
    } else if (action === "star") {
      const m = messages.find((x) => x.id === selectedId);
      if (m) m.starred = !m.starred;
      renderRows();
      showToast("Star updated");
    } else {
      showToast(`${action} ready (preview)`);
    }
  });

  $("contextMenu")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-menu-action]");
    if (button) menuAction(button.dataset.menuAction);
  });
  $("moreMenu")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-menu-action]");
    if (button) menuAction(button.dataset.menuAction);
  });
  $("moreButton")?.addEventListener("click", (event) => {
    closeMenus();
    const menu = $("moreMenu");
    menu?.classList.add("open");
    if (menu) {
      menu.style.left = `${Math.min(event.clientX - 200, window.innerWidth - 280)}px`;
      menu.style.top = `${event.clientY + 12}px`;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenus();
      $("composeSheet")?.classList.remove("open");
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      $("mailSearch")?.focus();
    }
  });

  initDragHandles();
}
