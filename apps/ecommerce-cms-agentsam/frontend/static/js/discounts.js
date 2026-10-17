/**
 * Discounts admin — /admin/discounts
 */

const discState = {
  discounts: [],
  editingId: null,
  draftType: "product_percent",
};

const TYPE_PRESETS = {
  product_percent: { discount_type: "product", value_type: "percent", heading: "Amount off products" },
  buy_x_get_y: { discount_type: "buy_x_get_y", value_type: "percent", heading: "Buy X get Y" },
  order_percent: { discount_type: "order", value_type: "percent", heading: "Amount off order" },
  free_shipping: { discount_type: "shipping", value_type: "percent", heading: "Free shipping", value: 0 },
};

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(String(value).replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtStatus(status) {
  const labels = {
    draft: "Draft",
    active: "Active",
    scheduled: "Scheduled",
    expired: "Expired",
    disabled: "Disabled",
  };
  return labels[status] || status || "Draft";
}

function typeLabel(d) {
  if (d.discount_type === "shipping") return "Free shipping";
  if (d.discount_type === "buy_x_get_y") return "Buy X get Y";
  if (d.discount_type === "order") {
    return d.value_type === "percent" ? "Amount off order" : "Fixed amount off order";
  }
  return d.value_type === "percent" ? "Amount off products" : "Fixed amount off products";
}

async function discFetch(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body != null && !headers["content-type"] && !headers["Content-Type"]) {
    headers["content-type"] = "application/json";
  }

  const res = await fetch(path, {
    credentials: "include",
    ...opts,
    headers,
  });
  if (res.status === 401) {
    window.location.href = "/admin/login";
    throw new Error("Unauthorized");
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/csv")) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function $(sel, root) {
  if (!sel) return null;
  const scope = root && typeof root.querySelector === "function" ? root : document;
  return scope.querySelector(sel);
}

function setView(app, view) {
  if (!app) return;
  app.dataset.view = view;
  app.querySelectorAll(".fnf-discounts-page").forEach((page) => {
    page.hidden = page.dataset.page !== view;
  });
  if (view === "editor") {
    app.querySelector('.fnf-discounts-page[data-page="editor"]')?.scrollIntoView({ block: "start" });
  }
}

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(String(iso).replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function updateSummary(app) {
  const code = $("#discCode", app)?.value?.trim();
  const method = app.querySelector('.fnf-disc-segment button.active')?.dataset.method || "code";
  const minReq = app.querySelector('input[name="minReq"]:checked')?.value || "none";
  const minVal = Number($("#discMinValue", app)?.value || 0);
  const limitTotal = $("#discLimitTotal", app)?.checked;
  const limitCustomer = $("#discLimitCustomer", app)?.checked;

  $("#discSummaryCode", app).textContent =
    method === "automatic" ? "Automatic discount" : code || "No discount code yet";

  const items = ["All customers", "For Online Store"];
  if (minReq === "amount" && minVal > 0) items.push(`Minimum purchase $${(minVal / 100).toFixed(2)}`);
  else if (minReq === "quantity" && minVal > 0) items.push(`Minimum ${minVal} items`);
  else items.push("No minimum purchase requirement");

  if (limitTotal) items.push("Limited total uses");
  else if (limitCustomer) items.push("One use per customer");
  else items.push("No usage limits");

  items.push("Active from today");
  $("#discSummaryList", app).innerHTML = items.map((li) => `<li>${escapeHtml(li)}</li>`).join("");
}

function applyTypePreset(app, typeKey) {
  const preset = TYPE_PRESETS[typeKey] || TYPE_PRESETS.product_percent;
  discState.draftType = typeKey;
  $("#discTypeHeading", app).textContent = preset.heading;
  $("#discValueType", app).value = preset.value_type;
  if (preset.value != null) $("#discValue", app).value = String(preset.value);

  const appliesPanel = $("#discAppliesPanel", app);
  const valuePanel = $("#discValue", app)?.closest(".fnf-disc-panel");
  const isShipping = preset.discount_type === "shipping";
  const isBuyX = preset.discount_type === "buy_x_get_y";

  if (appliesPanel) appliesPanel.hidden = preset.discount_type === "order" || isShipping || isBuyX;
  if (valuePanel) valuePanel.hidden = isShipping;

  if (isBuyX) {
    $("#discValue", app).value = "100";
    $("#discValueType", app).value = "percent";
  }

  updateValueSuffix(app);
  updateSummary(app);
}

function updateValueSuffix(app) {
  const type = $("#discValueType", app)?.value;
  const suffix = $("#discValueSuffix", app);
  if (!suffix) return;
  suffix.textContent = type === "fixed" ? "$" : "%";
}

function resetEditor(app) {
  discState.editingId = null;
  $("#discEditorTitle", app).textContent = "Create discount";
  $("#discTitle", app).value = "";
  $("#discCode", app).value = randomCode();
  $("#discValue", app).value = "10";
  $("#discValueType", app).value = "percent";
  $("#discAppliesTo", app).value = "all";
  $("#discStatus", app).value = "active";
  $("#discStarts", app).value = toLocalInput(new Date().toISOString());
  $("#discEnds", app).value = "";
  $("#discMinValue", app).hidden = true;
  $("#discMinValue", app).value = "";
  $("#discMaxTotal", app).hidden = true;
  $("#discMaxTotal", app).value = "";
  $("#discLimitTotal", app).checked = false;
  $("#discLimitCustomer", app).checked = false;
  $("#discEditorError", app).hidden = true;
  app.querySelector('input[name="minReq"][value="none"]')?.click();
  const codeBtn = app.querySelector('.fnf-disc-segment button[data-method="code"]');
  const autoBtn = app.querySelector('.fnf-disc-segment button[data-method="automatic"]');
  codeBtn?.classList.add("active");
  autoBtn?.classList.remove("active");
  $("#discCodeField", app).hidden = false;
  applyTypePreset(app, discState.draftType || "product_percent");
}

function readEditor(app) {
  const preset = TYPE_PRESETS[discState.draftType] || TYPE_PRESETS.product_percent;
  const method = app.querySelector('.fnf-disc-segment button.active')?.dataset.method || "code";
  const minReq = app.querySelector('input[name="minReq"]:checked')?.value || "none";
  const minRaw = Number($("#discMinValue", app)?.value || 0);
  const valueType = $("#discValueType", app)?.value || "percent";
  let value = Math.max(0, Math.round(Number($("#discValue", app)?.value || 0)));

  if (valueType === "fixed") value = Math.round(value * 100);

  const body = {
    title: $("#discTitle", app)?.value?.trim() || $("#discTypeHeading", app)?.textContent || "Discount",
    method,
    code: method === "code" ? $("#discCode", app)?.value?.trim() : null,
    discount_type: preset.discount_type,
    value_type: preset.discount_type === "shipping" ? "percent" : valueType,
    value: preset.discount_type === "shipping" ? 0 : value,
    applies_to: $("#discAppliesTo", app)?.value || "all",
    applies_to_ids: [],
    min_requirement_type: minReq,
    min_requirement_value: minReq === "amount" ? Math.round(minRaw * 100) : minRaw,
    max_uses_total: $("#discLimitTotal", app)?.checked ? Math.max(1, Number($("#discMaxTotal", app)?.value || 1)) : null,
    max_uses_per_customer: $("#discLimitCustomer", app)?.checked ? 1 : 0,
    starts_at: fromLocalInput($("#discStarts", app)?.value),
    ends_at: fromLocalInput($("#discEnds", app)?.value),
    status: $("#discStatus", app)?.value || "active",
    metadata:
      preset.discount_type === "buy_x_get_y"
        ? { buy_quantity: 2, get_percent: 100 }
        : {},
  };

  return body;
}

function fillEditor(app, discount) {
  discState.editingId = discount.id;
  $("#discEditorTitle", app).textContent = discount.title;

  let typeKey = "product_percent";
  if (discount.discount_type === "shipping") typeKey = "free_shipping";
  else if (discount.discount_type === "buy_x_get_y") typeKey = "buy_x_get_y";
  else if (discount.discount_type === "order") typeKey = "order_percent";
  else if (discount.discount_type === "product" && discount.value_type === "fixed") typeKey = "product_percent";

  discState.draftType = typeKey;
  applyTypePreset(app, typeKey);

  $("#discTitle", app).value = discount.title || "";
  $("#discCode", app).value = discount.code || "";
  $("#discValueType", app).value = discount.value_type || "percent";
  $("#discValue", app).value =
    discount.value_type === "fixed" ? String((discount.value || 0) / 100) : String(discount.value || 0);
  $("#discAppliesTo", app).value = discount.applies_to || "all";
  $("#discStatus", app).value = discount.status || "active";
  $("#discStarts", app).value = toLocalInput(discount.starts_at);
  $("#discEnds", app).value = toLocalInput(discount.ends_at);

  const minType = discount.min_requirement_type || "none";
  app.querySelector(`input[name="minReq"][value="${minType}"]`).checked = true;
  $("#discMinValue", app).hidden = minType === "none";
  if (minType === "amount") $("#discMinValue", app).value = String((discount.min_requirement_value || 0) / 100);
  else if (minType === "quantity") $("#discMinValue", app).value = String(discount.min_requirement_value || 0);

  $("#discLimitTotal", app).checked = discount.max_uses_total != null;
  $("#discMaxTotal", app).hidden = discount.max_uses_total == null;
  if (discount.max_uses_total != null) $("#discMaxTotal", app).value = String(discount.max_uses_total);
  $("#discLimitCustomer", app).checked = (discount.max_uses_per_customer || 0) > 0;

  const method = discount.method || "code";
  app.querySelectorAll(".fnf-disc-segment button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.method === method);
  });
  $("#discCodeField", app).hidden = method === "automatic";

  updateValueSuffix(app);
  updateSummary(app);
}

function renderList(app, { error = "" } = {}) {
  const empty = $("#discEmptyState", app);
  const tableWrap = $("#discTableWrap", app);
  const tbody = $("#discTableBody", app);
  const exportBtn = $("#discExportBtn", app);
  const loading = $("#discLoadingState", app);
  const list = discState.discounts;

  if (loading) loading.hidden = true;

  if (error) {
    if (empty) {
      empty.hidden = false;
      const msg = empty.querySelector("p");
      if (msg) msg.textContent = error;
    }
    if (tableWrap) tableWrap.hidden = true;
    if (exportBtn) exportBtn.disabled = true;
    return;
  }

  if (exportBtn) exportBtn.disabled = !list.length;
  if (empty) empty.hidden = !!list.length;
  if (tableWrap) tableWrap.hidden = !list.length;

  if (!list.length) {
    if (tbody) tbody.innerHTML = "";
    const msg = empty?.querySelector("p");
    if (msg) msg.textContent = "Add discount codes and automatic discounts that apply at checkout.";
    return;
  }

  tbody.innerHTML = list
    .map(
      (d) => `
    <tr data-disc-id="${escapeHtml(d.id)}" tabindex="0">
      <td><strong>${escapeHtml(d.title)}</strong></td>
      <td>${escapeHtml(d.code || "Automatic")}</td>
      <td>${escapeHtml(typeLabel(d))}</td>
      <td><span class="fnf-disc-status fnf-disc-status-${escapeHtml(d.status)}">${fmtStatus(d.status)}</span></td>
      <td>${d.uses_count ?? 0}</td>
      <td>${fmtDate(d.updated_at)}</td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll("tr[data-disc-id]").forEach((row) => {
    const open = () => openEditor(app, row.dataset.discId);
    row.addEventListener("click", open);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

async function refreshList(app) {
  const loading = $("#discLoadingState", app);
  if (loading) loading.hidden = false;

  try {
    const data = await discFetch("/api/admin/discounts");
    discState.discounts = data.discounts || [];
    renderList(app);
  } catch (err) {
    console.error("[discounts]", err);
    discState.discounts = [];
    renderList(app, { error: err.message || "Could not load discounts." });
  }
}

function mountTypeModal(app) {
  const modal = $("#discTypeModal", app);
  if (!modal || modal.dataset.mounted === "1") return;
  document.body.appendChild(modal);
  modal.dataset.mounted = "1";
}

function bindTypeModal(app) {
  const modal = document.getElementById("discTypeModal");
  if (!modal || modal.dataset.bound === "1") return;
  modal.dataset.bound = "1";

  modal.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      closeTypeModal(app);
    });
  });

  modal.querySelectorAll(".fnf-disc-type-item").forEach((btn) => {
    btn.addEventListener("click", () => openCreate(app, btn.dataset.type));
  });
}

function openTypeModal(app) {
  const modal = document.getElementById("discTypeModal");
  if (modal) modal.hidden = false;
}

function closeTypeModal(app) {
  const modal = document.getElementById("discTypeModal");
  if (modal) modal.hidden = true;
}

function openCreate(app, typeKey) {
  closeTypeModal(app);
  resetEditor(app);
  if (typeKey) applyTypePreset(app, typeKey);
  setView(app, "editor");
}

async function openEditor(app, id) {
  const data = await discFetch(`/api/admin/discounts/${encodeURIComponent(id)}`);
  fillEditor(app, data.discount);
  setView(app, "editor");
}

async function saveEditor(app) {
  const errEl = $("#discEditorError", app);
  errEl.hidden = true;
  const body = readEditor(app);
  const btn = $("#discSaveBtn", app);
  btn.disabled = true;

  try {
    if (discState.editingId) {
      await discFetch(`/api/admin/discounts/${encodeURIComponent(discState.editingId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    } else {
      await discFetch("/api/admin/discounts", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }
    await refreshList(app);
    setView(app, "list");
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

function bindDiscountsApp(app) {
  if (!app) return;
  mountTypeModal(app);
  bindTypeModal(app);

  $("#discCreateBtn", app)?.addEventListener("click", () => openTypeModal(app));
  app.querySelectorAll("[data-open-type-picker]").forEach((btn) => {
    btn.addEventListener("click", () => openTypeModal(app));
  });

  $("#discBackBtn", app)?.addEventListener("click", () => setView(app, "list"));
  $("#discDiscardBtn", app)?.addEventListener("click", () => setView(app, "list"));
  $("#discSaveBtn", app)?.addEventListener("click", () => saveEditor(app));
  $("#discGenCode", app)?.addEventListener("click", () => {
    $("#discCode", app).value = randomCode();
    updateSummary(app);
  });

  app.querySelectorAll(".fnf-disc-segment button").forEach((btn) => {
    btn.addEventListener("click", () => {
      app.querySelectorAll(".fnf-disc-segment button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      $("#discCodeField", app).hidden = btn.dataset.method === "automatic";
      updateSummary(app);
    });
  });

  app.querySelectorAll('input[name="minReq"]').forEach((input) => {
    input.addEventListener("change", () => {
      const show = input.value !== "none" && input.checked;
      $("#discMinValue", app).hidden = !show;
      updateSummary(app);
    });
  });

  $("#discLimitTotal", app)?.addEventListener("change", (e) => {
    $("#discMaxTotal", app).hidden = !e.target.checked;
    updateSummary(app);
  });
  $("#discLimitCustomer", app)?.addEventListener("change", () => updateSummary(app));
  $("#discCode", app)?.addEventListener("input", () => updateSummary(app));
  $("#discValueType", app)?.addEventListener("change", () => {
    updateValueSuffix(app);
    updateSummary(app);
  });

  $("#discExportBtn", app)?.addEventListener("click", async () => {
    const res = await discFetch("/api/admin/discounts/export");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "fnf-discounts.csv";
    a.click();
  });

  document.addEventListener("keydown", (e) => {
    const modal = document.getElementById("discTypeModal");
    if (e.key === "Escape" && modal && !modal.hidden) closeTypeModal(app);
  });
}

async function initDiscountsPage() {
  const mount = document.getElementById("discountsMount");
  if (!mount) return;

  try {
    const res = await fetch("/admin/partials/discounts-app.html", { credentials: "same-origin" });
    if (!res.ok) throw new Error(`Discounts UI failed to load (HTTP ${res.status})`);
    mount.innerHTML = await res.text();

    const app = document.getElementById("fnfDiscountsApp");
    if (!app) throw new Error("Discounts app markup missing");

    setView(app, "list");
    bindDiscountsApp(app);
    await refreshList(app);
  } catch (err) {
    console.error("[discounts/init]", err);
    mount.innerHTML = `
      <div class="fnf-discounts-app" style="padding:40px;">
        <h1 class="fnf-disc-title">Discounts</h1>
        <p style="color:#b42318;margin:12px 0 0;">${escapeHtml(err.message || "Failed to load discounts.")}</p>
        <button type="button" class="fnf-disc-btn primary" style="margin-top:16px;" onclick="location.reload()">Retry</button>
      </div>`;
  }
}

window.initDiscountsPage = initDiscountsPage;
