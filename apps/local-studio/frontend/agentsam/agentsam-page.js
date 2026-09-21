/**
 * AgentSam full-page chat — ChatGPT-style workspace with real attachments, tools, threads.
 */

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 6;

const IAM_LOGO_DEFAULT =
  "https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail";

const GITHUB_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>`;

const CHEVRON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const FALLBACK_MCP_SERVERS = [
  {
    slug: "inneranimalmedia-mcp-server",
    display_name: "Inner Animal MCP",
    status: "needs_bridge",
    connected: false,
  },
  {
    slug: "github",
    display_name: "GitHub",
    status: "needs_oauth",
    connected: false,
  },
];

/** @type {string|null} */
let conversationId = null;
/** @type {Array<any>} */
let pendingAttachments = [];
/** @type {object|null} */
let composeContext = null;
/** @type {string|null} */
let iamLogoUrl = IAM_LOGO_DEFAULT;
/** @type {object|null} */
let plusMenuConfig = null;
/** @type {"chat"|"work"} */
let interactionMode = "chat";
/** @type {object|null} */
let modalToolCall = null;
/** @type {Array<any>} */
let mcpServers = [];
/** @type {Set<string>} */
let activeConnections = new Set();
/** @type {object} */
let connectUrls = {};

function $(id) {
  return document.getElementById(id);
}

function autoResize(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
}

function formatBytes(n) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeTime(unix) {
  if (!unix) return "";
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unix);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function refreshComposerPlaceholder() {
  const input = $("agentsam-page-input");
  if (!input) return;
  if (composeContext?.mode === "image") {
    input.placeholder = "Describe the image you want…";
    return;
  }
  input.placeholder = interactionMode === "work" ? "Describe a task to work through" : "Ask anything";
}

function setInteractionMode(mode) {
  const next = mode === "work" ? "work" : "chat";
  interactionMode = next;
  const page = $("agentsam-page");
  if (page) page.dataset.agentView = next;
  document.querySelectorAll("[data-agent-view-option]").forEach((button) => {
    const active = button.dataset.agentViewOption === next;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  const heroTitle = $("agentsam-hero")?.querySelector("h1");
  if (heroTitle) heroTitle.textContent = next === "work" ? "What should we work on?" : "Where should we begin?";
  refreshComposerPlaceholder();
  closeToolMenu();
}

function showThread() {
  const thread = $("agentsam-thread");
  const hero = $("agentsam-hero");
  const stage = document.querySelector(".agentsam-page-stage");
  const page = $("agentsam-page");
  if (thread) thread.hidden = false;
  if (hero) hero.style.display = "none";
  if (stage) stage.classList.add("has-thread");
  if (page) page.classList.add("has-thread");
  closeToolMenu();
}

function clearThreadUi() {
  const thread = $("agentsam-thread");
  const hero = $("agentsam-hero");
  const stage = document.querySelector(".agentsam-page-stage");
  const page = $("agentsam-page");
  if (thread) {
    thread.innerHTML = "";
    thread.hidden = true;
  }
  if (hero) hero.style.display = "";
  if (stage) stage.classList.remove("has-thread");
  if (page) page.classList.remove("has-thread");
}

function renderComposeModes() {
  const box = $("agentsam-compose-modes");
  if (!box) return;
  box.innerHTML = "";
  if (!composeContext?.mode) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const chip = document.createElement("div");
  chip.className = "agentsam-page-mode-chip";
  chip.innerHTML = `${composeContext.label || "Creative Studio"} <button type="button" aria-label="Clear mode">&times;</button>`;
  chip.querySelector("button")?.addEventListener("click", () => {
    composeContext = null;
    renderComposeModes();
    refreshComposerPlaceholder();
  });
  box.appendChild(chip);
  refreshComposerPlaceholder();
}

function connectionComposerLabel(server) {
  if (server.slug === "inneranimalmedia-mcp-server") return "inneranimalmedia-mcp…";
  if (server.slug === "github") return "GitHub";
  const label = server.slug || server.display_name || "connection";
  return label.length > 22 ? `${label.slice(0, 20)}…` : label;
}

function connectionMenuLabel(server) {
  if (server.slug === "inneranimalmedia-mcp-server") return "Inner Animal MCP";
  if (server.slug === "github") return "GitHub";
  return server.display_name || server.slug || "Connection";
}

function connectionIconMarkup(server, { size = "md" } = {}) {
  const cls = size === "sm" ? "agentsam-conn-icon agentsam-conn-icon--sm" : "agentsam-conn-icon";
  const name = `${server.display_name || ""} ${server.slug || ""}`;
  if (/inner animal|iam|inneranimalmedia/i.test(name)) {
    const src = iamLogoUrl || IAM_LOGO_DEFAULT;
    return `<img class="${cls}" src="${src}" alt="" loading="lazy">`;
  }
  if (/github/i.test(name)) {
    return `<span class="${cls} agentsam-conn-icon--svg">${GITHUB_SVG}</span>`;
  }
  return `<span class="${cls} agentsam-conn-icon--text">C</span>`;
}

function connectionStatusLabel(server) {
  if (server.connected || server.status === "ready") return "Ready";
  if (server.status === "needs_oauth") return "Connect";
  if (server.status === "needs_bridge") return "Needs bridge";
  if (server.status === "planned" || server.status === "disabled") return "Off";
  return server.status || "—";
}

function getServerBySlug(slug) {
  return mcpServers.find((s) => s.slug === slug);
}

function disconnectConnection(slug, e) {
  e?.preventDefault();
  e?.stopPropagation();
  activeConnections.delete(slug);
  renderConnectionPills();
  renderMcpList(mcpServers);
}

function toggleConnection(slug) {
  if (activeConnections.has(slug)) {
    activeConnections.delete(slug);
  } else {
    activeConnections.add(slug);
  }
  renderConnectionPills();
  renderMcpList(mcpServers);
}

function initActiveConnections(servers) {
  activeConnections = new Set((servers || []).map((s) => s.slug).filter(Boolean));
}

function renderConnectionPills() {
  const box = $("agentsam-connection-pills");
  if (!box) return;
  box.innerHTML = "";
  const plus = $("agentsam-plus");
  const active = mcpServers.filter((s) => activeConnections.has(s.slug));

  if (!active.length) {
    box.hidden = true;
    if (plus) plus.classList.remove("has-connections");
    return;
  }

  box.hidden = false;
  if (plus) plus.classList.add("has-connections");

  active.forEach((server) => {
    const pill = document.createElement("div");
    pill.className = "agentsam-conn-pill";
    pill.title = connectionMenuLabel(server);
    pill.innerHTML = `
      ${connectionIconMarkup(server, { size: "sm" })}
      <span class="agentsam-conn-pill-label">${escapeHtml(connectionComposerLabel(server))}</span>
      <button type="button" class="agentsam-conn-pill-x" aria-label="Disconnect ${escapeHtml(connectionMenuLabel(server))}">×</button>
    `;
    pill.querySelector(".agentsam-conn-pill-x")?.addEventListener("click", (e) => {
      disconnectConnection(server.slug, e);
    });
    box.appendChild(pill);
  });
}

function formatPreviewBlock(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

function renderToolCallCrumb(toolCall, { running = false } = {}) {
  const details = document.createElement("details");
  details.className = `agentsam-tool-crumb${running ? " is-running" : ""}`;
  if (!running) details.open = false;

  const summary = document.createElement("summary");
  summary.className = "agentsam-tool-crumb-summary";
  summary.innerHTML = `
    <span class="agentsam-tool-crumb-brace">{ }</span>
    <span class="agentsam-tool-crumb-label">${running ? "Calling tool" : "Called tool"}</span>
    <span class="agentsam-tool-crumb-chevron">${CHEVRON_SVG}</span>
  `;
  details.appendChild(summary);

  if (running) return details;

  const panel = document.createElement("div");
  panel.className = "agentsam-tool-crumb-panel";

  const head = document.createElement("div");
  head.className = "agentsam-tool-crumb-head";
  head.appendChild(toolIconEl(toolCall.icon));
  const headText = document.createElement("div");
  headText.className = "agentsam-tool-crumb-head-text";
  headText.innerHTML = `<strong>${escapeHtml(toolCall.display_name || "Called tool")}</strong><span>${escapeHtml(toolCall.subtitle || toolCall.server || toolCall.provider || "")}</span>`;
  head.appendChild(headText);
  panel.appendChild(head);

  if (toolCall.input_preview) {
    const section = document.createElement("div");
    section.className = "agentsam-tool-crumb-section";
    const formatted = formatPreviewBlock(toolCall.input_preview);
    section.innerHTML = `<div class="agentsam-tool-crumb-section-head"><span>Request</span><button type="button" class="agentsam-tool-crumb-copy">Copy</button></div>`;
    const pre = document.createElement("pre");
    pre.textContent = formatted;
    section.appendChild(pre);
    section.querySelector(".agentsam-tool-crumb-copy")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      copyText(formatted);
    });
    panel.appendChild(section);
  }

  if (toolCall.output_preview || toolCall.error) {
    const section = document.createElement("div");
    section.className = "agentsam-tool-crumb-section";
    const body = toolCall.error || toolCall.output_preview;
    const formatted = formatPreviewBlock(body);
    section.innerHTML = `<div class="agentsam-tool-crumb-section-head"><span>${toolCall.error ? "Error" : "Response"}</span><button type="button" class="agentsam-tool-crumb-copy">Copy</button></div>`;
    const pre = document.createElement("pre");
    pre.textContent = formatted;
    section.appendChild(pre);
    section.querySelector(".agentsam-tool-crumb-copy")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      copyText(formatted);
    });
    panel.appendChild(section);
  }

  details.appendChild(panel);
  return details;
}

function toolIconEl(icon) {
  const wrap = document.createElement("div");
  wrap.className = "agentsam-page-tool-call-icon";
  if (!icon) {
    wrap.textContent = "T";
    return wrap;
  }
  if (icon.type === "image" && icon.url) {
    const img = document.createElement("img");
    img.src = icon.url;
    img.alt = "";
    wrap.appendChild(img);
    return wrap;
  }
  if (icon.type === "svg" && icon.markup) {
    wrap.innerHTML = icon.markup;
    return wrap;
  }
  wrap.textContent = icon.label || "T";
  return wrap;
}

async function openToolCallModal(id, fallback = null) {
  const modal = $("agentsam-tool-modal");
  const body = $("agentsam-tool-modal-body");
  const title = $("agentsam-tool-modal-title");
  if (!modal || !body) return;

  let call = fallback;
  if (id) {
    try {
      const res = await fetch(`/api/admin/agentsam/tool-calls/${encodeURIComponent(id)}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        call = data.tool_call || call;
      }
    } catch {
      /* use fallback */
    }
  }
  if (!call) return;

  modalToolCall = call;
  if (title) title.textContent = call.display_name || "Tool call";
  body.innerHTML = `
    <dl class="agentsam-tool-modal-kv">
      <dt>Tool</dt><dd>${call.display_name || call.tool_key || "—"}</dd>
      <dt>Provider</dt><dd>${call.server || call.provider || "—"}</dd>
      <dt>Status</dt><dd>${call.status || "—"}</dd>
      <dt>Duration</dt><dd>${call.duration_ms != null ? `${call.duration_ms} ms` : "—"}</dd>
    </dl>
    ${call.input_preview ? `<div><strong>Request</strong><pre class="agentsam-tool-modal-pre">${escapeHtml(call.input_preview)}</pre></div>` : ""}
    ${call.output_preview ? `<div><strong>Response</strong><pre class="agentsam-tool-modal-pre">${escapeHtml(call.output_preview)}</pre></div>` : ""}
    ${call.error ? `<div><strong>Error</strong><pre class="agentsam-tool-modal-pre">${escapeHtml(call.error)}</pre></div>` : ""}
  `;
  modal.hidden = false;
}

function closeToolModal() {
  const modal = $("agentsam-tool-modal");
  if (modal) modal.hidden = true;
  modalToolCall = null;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function appendRouteChips(wrap, chips) {
  if (!chips?.length) return;
  const route = document.createElement("div");
  route.className = "agentsam-page-route";
  chips.forEach((chip) => {
    const el = document.createElement("span");
    if (chip.kind === "tool") el.classList.add("is-mcp");
    el.textContent = chip.label;
    route.appendChild(el);
  });
  wrap.appendChild(route);
}

function appendBubble(role, text, { routeChips = [], attachments = [], toolCalls = [] } = {}) {
  showThread();
  const thread = $("agentsam-thread");
  if (!thread) return null;

  const wrap = document.createElement("div");
  wrap.className = `agentsam-page-bubble agentsam-page-bubble--${role}`;

  if (role === "assistant" && !toolCalls.length) appendRouteChips(wrap, routeChips);

  if (attachments.length) {
    const media = document.createElement("div");
    media.className = "agentsam-page-bubble-attachments";
    attachments.forEach((attachment) => {
      if (attachment.preview_url && attachment.kind === "image") {
        const img = document.createElement("img");
        img.src = attachment.preview_url;
        img.alt = attachment.name || attachment.file_name || "attachment";
        media.appendChild(img);
      } else {
        const file = document.createElement("div");
        file.className = "agentsam-page-bubble-file";
        file.textContent = `${attachment.name || attachment.file_name} · ${formatBytes(attachment.size_bytes || attachment.file_size_bytes)}`;
        media.appendChild(file);
      }
    });
    wrap.appendChild(media);
  }

  if (toolCalls.length) {
    const toolsWrap = document.createElement("div");
    toolsWrap.className = "agentsam-page-tool-crumbs";
    toolCalls.forEach((tc) => toolsWrap.appendChild(renderToolCallCrumb(tc)));
    wrap.appendChild(toolsWrap);
  }

  const body = document.createElement("div");
  body.textContent = text;
  wrap.appendChild(body);
  thread.appendChild(wrap);
  const stage = document.querySelector(".agentsam-page-stage");
  if (stage) stage.scrollTop = stage.scrollHeight;
  return wrap;
}

function setBusy(busy) {
  $("agentsam-page-send") && ($("agentsam-page-send").disabled = busy);
  $("agentsam-page-input") && ($("agentsam-page-input").disabled = busy);
  $("agentsam-file-input") && ($("agentsam-file-input").disabled = busy);
}

async function uploadFile(file) {
  const form = new FormData();
  form.append("file", file, file.name);
  if (conversationId) form.append("conversation_id", conversationId);

  const res = await fetch("/api/admin/agentsam/files/upload", {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || "Upload failed");
  return data;
}

async function handleFilesSelected(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  const remaining = MAX_ATTACHMENTS - pendingAttachments.length;
  if (remaining <= 0) return;

  for (const file of files.slice(0, remaining)) {
    if (file.size > MAX_FILE_BYTES) continue;
    try {
      const uploaded = await uploadFile(file);
      const previewUrl =
        uploaded.kind === "image" ? uploaded.preview_url : null;
      pendingAttachments.push({
        id: uploaded.attachment_id,
        attachment_id: uploaded.attachment_id,
        name: uploaded.file_name,
        mime_type: uploaded.mime_type,
        kind: uploaded.kind,
        size_bytes: uploaded.file_size_bytes,
        preview_url: previewUrl,
        url: uploaded.preview_url,
      });
    } catch (err) {
      appendBubble("assistant", err.message || "Upload failed.");
    }
  }
  renderAttachmentTray();
  $("agentsam-page-input")?.focus();
}

function renderAttachmentTray() {
  const tray = $("agentsam-attachments");
  if (!tray) return;
  tray.innerHTML = "";
  if (!pendingAttachments.length) {
    tray.hidden = true;
    return;
  }
  tray.hidden = false;
  pendingAttachments.forEach((attachment) => {
    const chip = document.createElement("div");
    chip.className = "agentsam-page-attachment";

    if (attachment.preview_url) {
      const img = document.createElement("img");
      img.className = "agentsam-page-attachment-thumb";
      img.src = attachment.preview_url;
      img.alt = attachment.name;
      chip.appendChild(img);
    } else {
      const icon = document.createElement("div");
      icon.className = "agentsam-page-attachment-icon";
      icon.textContent = "FILE";
      chip.appendChild(icon);
    }

    const meta = document.createElement("div");
    meta.className = "agentsam-page-attachment-meta";
    meta.innerHTML = `<strong>${attachment.name}</strong><span>${formatBytes(attachment.size_bytes)}</span>`;
    chip.appendChild(meta);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "agentsam-page-attachment-remove";
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      pendingAttachments = pendingAttachments.filter((a) => a.id !== attachment.id);
      renderAttachmentTray();
    });
    chip.appendChild(remove);
    tray.appendChild(chip);
  });
}

function attachmentPayload() {
  return pendingAttachments.map((a) => ({
    attachment_id: a.attachment_id,
    name: a.name,
    mime_type: a.mime_type,
    kind: a.kind,
    size_bytes: a.size_bytes,
  }));
}

function buildSendContext() {
  const ctx = {
    page: "/admin/agentsam",
    conversation_id: conversationId,
    interaction_mode: interactionMode,
    has_image: pendingAttachments.some((a) => a.kind === "image"),
    active_mcp_connections: [...activeConnections],
  };
  if (composeContext) {
    ctx.workflow_key = composeContext.workflow_key;
    ctx.task_type = composeContext.task_type;
    ctx.lane = composeContext.lane;
    ctx.mode = composeContext.mode;
  }
  return ctx;
}

async function sendMessage(text, actionContext = null) {
  const message = (text || "").trim();
  const outgoing = attachmentPayload();
  const ctx = actionContext || composeContext;
  if (!message && !outgoing.length) return;

  const displayAttachments = pendingAttachments.slice();
  appendBubble("user", message || "Review attached file(s).", { attachments: displayAttachments });
  setBusy(true);

  const runningTools = [];
  // Shimmer skeleton — no lame "Thinking..." text
  showThread();
  const thread = $("agentsam-thread");
  const typing = document.createElement("div");
  typing.className = "agentsam-page-bubble agentsam-page-bubble--assistant agentsam-page-shimmer";
  typing.innerHTML = '<div class="agentsam-shimmer-line agentsam-shimmer-line--lg"></div><div class="agentsam-shimmer-line agentsam-shimmer-line--md"></div><div class="agentsam-shimmer-line agentsam-shimmer-line--sm"></div>';
  thread?.appendChild(typing);
  thread && (thread.scrollTop = thread.scrollHeight);

  try {
    const res = await fetch("/api/admin/agentsam/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        message,
        attachments: outgoing,
        conversation_id: conversationId,
        workflow_key: ctx?.workflow_key,
        task_type: ctx?.task_type,
        lane: ctx?.lane,
        context: buildSendContext(),
      }),
    });
    const data = await res.json();
    typing?.remove();

    if (!res.ok) throw new Error(data.error || "Request failed");

    if (data.conversation_id) conversationId = data.conversation_id;

    const assistantWrap = appendBubble("assistant", data.reply, {
      routeChips: data.route_chips || [],
      toolCalls: data.tool_calls || [],
    });

    if (data.ai?.image_base64) {
      const img = document.createElement("img");
      img.src = `data:${data.ai.mime_type || "image/png"};base64,${data.ai.image_base64}`;
      img.alt = "Generated image";
      img.style.maxWidth = "240px";
      img.style.borderRadius = "12px";
      img.style.marginTop = "10px";
      assistantWrap?.appendChild(img);
    }

    pendingAttachments = [];
    renderAttachmentTray();
    composeContext = null;
    renderComposeModes();
    refreshComposerPlaceholder();
    hydrateRecentActivity();
  } catch (err) {
    typing?.remove();
    appendBubble("assistant", err.message || "Something went wrong.");
  } finally {
    setBusy(false);
    const input = $("agentsam-page-input");
    if (input) {
      input.value = "";
      autoResize(input);
      input.focus();
    }
  }
}

function openFilePicker() {
  const input = $("agentsam-file-input");
  if (!input) return;
  input.value = "";
  input.click();
}

function closeToolMenu() {
  const menu = $("agentsam-tool-menu");
  menu?.setAttribute("hidden", "");
  menu?.classList.remove("opens-up", "opens-down");
  $("agentsam-plus")?.setAttribute("aria-expanded", "false");
}

function positionToolMenu() {
  const menu = $("agentsam-tool-menu");
  const wrap = document.querySelector(".agentsam-page-composer-wrap");
  const page = $("agentsam-page");
  if (!menu || !wrap || menu.hasAttribute("hidden")) return;

  menu.classList.remove("opens-up", "opens-down");
  const rect = wrap.getBoundingClientRect();
  const roomBelow = window.innerHeight - rect.bottom;
  const estimatedHeight = Math.min(menu.scrollHeight || 320, 420);
  const preferDown = !page?.classList.contains("has-thread") && roomBelow >= Math.min(estimatedHeight + 16, 280);
  menu.classList.add(preferDown ? "opens-down" : "opens-up");
}

function toggleToolMenu() {
  const menu = $("agentsam-tool-menu");
  const plus = $("agentsam-plus");
  if (!menu || !plus) return;
  if (menu.hasAttribute("hidden")) {
    menu.removeAttribute("hidden");
    plus.setAttribute("aria-expanded", "true");
    requestAnimationFrame(positionToolMenu);
  } else {
    closeToolMenu();
  }
}

function renderMcpList(servers) {
  const list = $("agentsam-mcp-list");
  if (!list) return;
  list.innerHTML = "";

  (servers || []).forEach((s) => {
    const btn = document.createElement("button");
    const isActive = activeConnections.has(s.slug);
    btn.type = "button";
    btn.className = `agentsam-page-mcp${isActive ? " is-active" : ""}`;
    btn.setAttribute("role", "menuitem");

    let trailing = "";
    if (isActive) {
      trailing = `<span class="agentsam-page-mcp-check" aria-hidden="true">✓</span>`;
    } else if (s.slug === "github" && !s.connected && connectUrls.fnf_github_oauth) {
      trailing = `<span class="agentsam-page-mcp-link">Connect</span>`;
    } else if (!s.connected && s.status === "needs_bridge") {
      trailing = `<span class="agentsam-page-mcp-hint">Setup</span>`;
    }

    btn.innerHTML = `
      <span class="agentsam-page-mcp-main">
        ${connectionIconMarkup(s)}
        <span class="agentsam-page-mcp-label">${escapeHtml(connectionMenuLabel(s))}</span>
      </span>
      ${trailing}
    `;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (s.slug === "github" && !s.connected && connectUrls.fnf_github_oauth && !isActive) {
        window.location.href = connectUrls.fnf_github_oauth;
        closeToolMenu();
        return;
      }
      toggleConnection(s.slug);
      closeToolMenu();
    });
    list.appendChild(btn);
  });
}

function applyPlatformData(data) {
  if (!data) return;
  iamLogoUrl = data.iam_logo_url || IAM_LOGO_DEFAULT;
  connectUrls = data.connect_urls || connectUrls || {};

  const incoming = data.mcp_servers && data.mcp_servers.length ? data.mcp_servers : FALLBACK_MCP_SERVERS;
  const bySlug = new Map(incoming.map((s) => [s.slug, s]));
  mcpServers = ["inneranimalmedia-mcp-server", "github"]
    .map((slug) => bySlug.get(slug))
    .filter(Boolean);

  if (!mcpServers.length) mcpServers = [...FALLBACK_MCP_SERVERS];

  if (!activeConnections.size) initActiveConnections(mcpServers);
  renderMcpList(mcpServers);
  renderConnectionPills();
  renderChips(data.quick_actions);
  applyPlusMenuConfig(data.plus_menu);
}

function renderChips(actions) {
  const box = $("agentsam-page-chips");
  if (!box) return;
  box.innerHTML = "";
  (actions || []).forEach((action) => {
    if (action.enabled === false) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = action.label;
    btn.addEventListener("click", () => {
      if (action.mode === "image") {
        composeContext = {
          mode: "image",
          label: "Creative Studio",
          workflow_key: action.workflow_key,
          task_type: action.task_type,
          lane: action.lane,
        };
        renderComposeModes();
        $("agentsam-page-input")?.focus();
        return;
      }
      sendMessage(action.prompt || "", action);
    });
    box.appendChild(btn);
  });
}

function applyPlusMenuConfig(config) {
  plusMenuConfig = config || {};
  const imageBtn = $("agentsam-menu-image");
  if (!config) return;

  if (imageBtn && config.image) {
    const label = imageBtn.querySelector("[data-menu-label]");
    if (label) label.textContent = config.image.label || "Create image";
    imageBtn.disabled = !config.image.enabled;
    imageBtn.hidden = config.image.enabled === false;
  }
}

async function hydrateRecentActivity() {
  const foot = document.querySelector(".console-sidenav-foot");
  if (!foot) return;

  let conversations = [];
  try {
    const res = await fetch("/api/admin/agentsam/conversations", { credentials: "include" });
    const data = await res.json();
    if (data.ok) conversations = data.conversations || [];
  } catch {
    return;
  }

  const label = foot.querySelector(".console-recent-label");
  foot.innerHTML = "";
  if (label) {
    const lbl = document.createElement("div");
    lbl.className = "console-recent-label";
    lbl.textContent = "Recent activity";
    foot.appendChild(lbl);
  } else {
    foot.innerHTML = `<div class="console-recent-label">Recent activity</div>`;
  }

  if (!conversations.length) {
    const empty = document.createElement("div");
    empty.className = "console-recent-empty";
    empty.textContent = "No recent AgentSam threads yet.";
    foot.appendChild(empty);
  } else {
    conversations.slice(0, 8).forEach((conv) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "console-recent-item is-agentsam";
      item.innerHTML = `${escapeHtml(conv.title || "Untitled")}<small>${formatRelativeTime(conv.last_active_unix)}</small>`;
      item.addEventListener("click", () => loadConversation(conv.id));
      foot.appendChild(item);
    });
  }

  const divider = document.createElement("div");
  divider.className = "console-sidenav-divider";
  foot.appendChild(divider);

  const settings = document.createElement("a");
  settings.href = "/admin/account";
  settings.className = "console-nav-item";
  settings.textContent = "Settings";
  foot.appendChild(settings);
}

async function loadConversation(id) {
  if (!id) return;
  conversationId = id;
  clearThreadUi();
  showThread();

  try {
    const res = await fetch(`/api/admin/agentsam/conversations/${encodeURIComponent(id)}`, {
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load thread");

    (data.messages || []).forEach((msg) => {
      appendBubble(msg.role === "user" ? "user" : "assistant", msg.content || "", {
        attachments: msg.attachments || [],
        routeChips: msg.routing
          ? [{ label: msg.routing.workflow_label || msg.routing.workflow_key, kind: "workflow" }]
          : [],
        toolCalls: msg.tool_calls || [],
      });
    });
  } catch (err) {
    appendBubble("assistant", err.message || "Could not load conversation.");
  }
}

function bindUi() {
  const form = $("agentsam-page-form");
  const input = $("agentsam-page-input");
  const plus = $("agentsam-plus");
  const menu = $("agentsam-tool-menu");
  const fileInput = $("agentsam-file-input");

  document.querySelectorAll("[data-agent-view-option]").forEach((button) => {
    button.addEventListener("click", () => setInteractionMode(button.dataset.agentViewOption));
  });

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage(input?.value || "");
  });

  input?.addEventListener("input", () => autoResize(input));
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form?.requestSubmit();
    }
  });

  plus?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleToolMenu();
  });

  fileInput?.addEventListener("change", () => handleFilesSelected(fileInput.files));

  menu?.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-tool");
      closeToolMenu();
      if (key === "attach") {
        openFilePicker();
        return;
      }
      if (key === "image" && plusMenuConfig?.image?.enabled) {
        composeContext = {
          mode: "image",
          label: "Creative Studio",
          workflow_key: plusMenuConfig.image.workflow_key || "fnf_creative_studio",
          task_type: "image_generation",
          lane: "image",
        };
        renderComposeModes();
        input?.focus();
        return;
      }
    });
  });

  document.addEventListener("click", (e) => {
    if (!menu?.contains(e.target) && e.target !== plus) closeToolMenu();
  });

  document.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", closeToolModal);
  });

  $("agentsam-tool-modal-copy")?.addEventListener("click", async () => {
    if (!modalToolCall) return;
    const text = [
      modalToolCall.display_name,
      modalToolCall.status,
      modalToolCall.input_preview,
      modalToolCall.output_preview,
      modalToolCall.error,
    ]
      .filter(Boolean)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  });

  // Paste images directly into textarea
  input?.addEventListener("paste", (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (!imageItems.length) return;
    e.preventDefault();
    const files = imageItems.map((item) => item.getAsFile()).filter(Boolean);
    if (files.length) handleFilesSelected(files);
  });

  // Drag-and-drop images onto composer
  const composerWrap = document.querySelector(".agentsam-page-composer-wrap");
  composerWrap?.addEventListener("dragover", (e) => { e.preventDefault(); composerWrap.classList.add("is-dragover"); });
  composerWrap?.addEventListener("dragleave", () => composerWrap.classList.remove("is-dragover"));
  composerWrap?.addEventListener("drop", (e) => {
    e.preventDefault();
    composerWrap.classList.remove("is-dragover");
    const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith("image/") || f.type.startsWith("text/"));
    if (files.length) handleFilesSelected(files);
  });

  const q = new URLSearchParams(location.search).get("q");
  if (q) {
    sendMessage(q);
    history.replaceState(null, "", "/admin/agentsam");
  } else {
    input?.focus();
  }
}

async function boot() {
  bindUi();
  try {
    const toolsRes = await fetch("/api/admin/agentsam/tools", { credentials: "include" });
    const data = await toolsRes.json();
    if (toolsRes.ok && data.ok) {
      applyPlatformData(data);
    } else {
      applyPlatformData({ mcp_servers: FALLBACK_MCP_SERVERS, quick_actions: [] });
    }
  } catch {
    applyPlatformData({ mcp_servers: FALLBACK_MCP_SERVERS, quick_actions: [] });
    renderChips([{ label: "Write or edit", prompt: "Draft shop hero copy.", enabled: true }]);
  }
  hydrateRecentActivity();
}

boot();
