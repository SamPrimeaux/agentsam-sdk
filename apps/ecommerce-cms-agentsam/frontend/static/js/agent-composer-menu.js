/* AgentSam capability menu: one implementation shared by home and the side/focus chat.
 * D1 plugin/skill authority stays on the server. Never pretend ChatGPT sessions
 * or unconnected integrations are installed in this app.
 */
(function () {
  "use strict";
  if (window.AgentSamComposerMenu) return;
  const draft = window.AgentSamDraft || (window.AgentSamDraft = { attachments: [], selected_resource: null });
  const controls = new Set();
  const MAX_FILES = 6;
  const pendingUploads = new Set();
  const fileHandles = new Map();
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const MAX_TEXT_BYTES = 512 * 1024;
  const labels = { files: "Files", target: "Target", mention: "Mention", skills: "Skills", apps: "Apps" };
  const glyphs = {
    files: "files", upload: "upload", target: "target", mention: "mention", skills: "skills",
    apps: "apps", arrow: "›", back: "back", connected: "connected",
  };
  const icons = {
    files: '<path d="M5 5h9l5 5v9H5z"/><path d="M14 5v5h5M8 14h8M8 17h6"/>',
    upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 17v3h16v-3"/>',
    target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
    mention: '<circle cx="12" cy="12" r="9"/><path d="M16 16c-2 1-3-1-3-2m0 0a4 4 0 1 0-3-1 3 3 0 0 0 3 1l1-5"/>',
    skills: '<path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2Z"/>',
    apps: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M17.5 13v8m-4-4h8"/>',
    connected: '<circle cx="12" cy="12" r="7"/><path d="m8 12 3 3 5-6"/>',
    back: '<path d="m14 5-7 7 7 7M7 12h14"/>'
  };
  function iconMarkup(name) {
    const paths = icons[name];
    return paths ? '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>' : '';
  }
  const targets = [
    ["This page", "current", "Current admin context"],
    ["Storefront", "storefront", "Published store"],
    ["Products", "products", "Catalog overview"],
    ["Orders", "orders", "Order overview"],
    ["Customers", "customers", "Customer overview"],
    ["Collections", "collections", "Collection overview"],
    ["Content", "content", "Media and CMS content"]
  ];
  const targetHref = {
    storefront: "/", products: "/admin/products", orders: "/admin/orders",
    customers: "/admin/customers", collections: "/admin/collections", content: "/admin/content"
  };
  function escapeText(s) { return String(s == null ? "" : s); }
  function notify() {
    for (const fn of controls) fn();
    document.dispatchEvent(new Event("agentsam:attachments-updated"));
  }
  function release(item) {
    if (item?.localPreviewUrl) URL.revokeObjectURL(item.localPreviewUrl);
    fileHandles.delete(item);
  }
  function removeAttachment(index) {
    const [item] = draft.attachments.splice(index, 1);
    release(item);
    notify();
  }
  function renderDrafts(root) {
    const holder = root.querySelector(".commerce-home-composer__attachments, .agentsam-attachment-list");
    if (!holder) return;
    holder.replaceChildren();
    const chips = [];
    if (draft.selected_resource) chips.push({ text: draft.selected_resource.label, context: true });
    draft.attachments.forEach((item, index) => chips.push({ text: item.name, index, item }));
    for (const entry of chips) {
      const chip = document.createElement("span");
      chip.className = "asm-attachment-chip";
      if (entry.item?.localPreviewUrl) {
        const image = document.createElement("img");
        image.src = entry.item.localPreviewUrl;
        image.alt = "";
        image.className = "asm-attachment-thumbnail";
        chip.append(image);
      }
      const caption = document.createElement("span");
      caption.textContent = entry.text + (entry.item?.uploading ? " · Uploading…" : entry.item?.error ? " · Upload failed" : "");
      chip.append(caption);
      if (entry.item?.error && fileHandles.has(entry.item)) {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = "Retry";
        retry.setAttribute("aria-label", "Retry upload of " + entry.text);
        retry.addEventListener("click", () => { void uploadOne(entry.item, fileHandles.get(entry.item), message => showNotice(root, message)); });
        chip.append(retry);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Remove " + entry.text);
      remove.addEventListener("click", () => {
        if (entry.context) draft.selected_resource = null;
        else removeAttachment(entry.index);
        notify();
      });
      chip.append(remove);
      holder.append(chip);
    }
  }
  function showNotice(root, message) {
    let feedback = root.querySelector(".asm-attachment-notice");
    if (!feedback) {
      feedback = document.createElement("div");
      feedback.className = "asm-attachment-notice";
      feedback.setAttribute("role", "status");
      root.append(feedback);
    }
    feedback.textContent = String(message);
  }
  function addMention(input, value) {
    const a = input.selectionStart ?? input.value.length;
    const b = input.selectionEnd ?? a;
    const lead = a && !/\s/.test(input.value[a - 1]) ? " " : "";
    input.setRangeText(lead + value + " ", a, b, "end");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }
  async function uploadOne(record, file, onNotice) {
    if (!file || record.uploading) return;
    record.uploading = true;
    record.error = null;
    notify();
    const work = (async () => {
      try {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/admin/agentsam/files/upload", {
          method: "POST", credentials: "include", body: form,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok || !payload.attachment_id) {
          throw new Error(payload.error || "Upload failed");
        }
        record.attachment_id = payload.attachment_id;
        record.preview_url = payload.preview_url;
        record.mime_type = payload.mime_type;
        record.size_bytes = payload.file_size_bytes;
        fileHandles.delete(record);
      } catch (error) {
        record.error = error?.message || "Upload failed";
        onNotice(record.name + ": " + record.error);
      } finally {
        record.uploading = false;
        notify();
      }
    })();
    pendingUploads.add(work);
    try { await work; } finally { pendingUploads.delete(work); }
  }
  async function collectFiles(files, onNotice) {
    const work = [];
    for (const file of Array.from(files || [])) {
      if (draft.attachments.length >= MAX_FILES) { onNotice("Up to 6 files per message."); break; }
      const image = /^image\/(png|jpeg|webp)$/.test(file.type);
      const text = /^(text\/(plain|csv|markdown)|application\/json)$/.test(file.type)
        || /\.(txt|md|json|csv)$/i.test(file.name);
      if (!image && !text) { onNotice("Use PNG, JPEG, WebP, TXT, MD, JSON or CSV files."); continue; }
      if (image && file.size > MAX_IMAGE_BYTES) { onNotice(file.name + " exceeds the 10 MB image limit."); continue; }
      if (text && file.size > MAX_TEXT_BYTES) { onNotice(file.name + " exceeds the 512 KB text limit."); continue; }
      const record = {
        name: file.name.slice(0, 255), size_bytes: file.size,
        mime_type: file.type || "text/plain", kind: image ? "image" : "text",
        localPreviewUrl: image ? URL.createObjectURL(file) : null,
        uploading: false, error: null, attachment_id: null,
      };
      fileHandles.set(record, file);
      draft.attachments.push(record);
      work.push(uploadOne(record, file, onNotice));
    }
    notify();
    await Promise.all(work);
  }
  async function readyAttachments() {
    await Promise.all([...pendingUploads]);
    const failed = draft.attachments.find(item => !item.attachment_id);
    if (failed) throw new Error(failed.name + ": " + (failed.error || "Upload is not ready. Retry or remove this file."));
    return draft.attachments.map(({ attachment_id, name, mime_type, size_bytes, kind, preview_url }) =>
      ({ attachment_id, name, mime_type, size_bytes, kind, preview_url }));
  }
  function context() { return draft.selected_resource ? { selected_resource: draft.selected_resource } : {}; }
  function clearFiles(sent = null) {
    const sentIds = Array.isArray(sent) ? new Set(sent.map(item => item.attachment_id)) : null;
    const keep = [];
    for (const item of draft.attachments) {
      if (sentIds && !sentIds.has(item.attachment_id)) keep.push(item);
      else release(item);
    }
    draft.attachments = keep;
    notify();
  }
  function attach(root, button, input) {
    if (!root || !button || !input || button.dataset.agentMenuWired) return;
    button.dataset.agentMenuInitializing = "1";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".txt,.md,.json,.csv,image/png,image/jpeg,image/webp";
    fileInput.multiple = true;
    fileInput.hidden = true;
    fileInput.setAttribute("aria-label", "Attach files to AgentSam");
    root.append(fileInput);
    const menu = document.createElement("div");
    menu.className = "asm-capability-popover";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "AgentSam capabilities");
    menu.hidden = true;
    document.body.append(menu);
    let page = "root";
    let status = null;
    let statusLoaded = false;
    let skills = null;
    let skillsError = false;
    let loading = false;
    let noticeTimeout = null;
    const update = () => renderDrafts(root);
    controls.add(update);
    update();
    function onNotice(message) {
      const toast = document.createElement("div");
      toast.className = "asm-capability-notice";
      toast.setAttribute("role", "status");
      toast.textContent = message;
      menu.append(toast);
      clearTimeout(noticeTimeout);
      noticeTimeout = setTimeout(() => toast.remove(), 3500);
    }
    fileInput.addEventListener("change", async () => {
      await collectFiles(fileInput.files, message => showNotice(root, message));
      fileInput.value = "";
    });
    input.addEventListener("paste", event => {
      const files = [...(event.clipboardData?.items || [])]
        .filter(item => item.kind === "file" && item.type.startsWith("image/"))
        .map(item => item.getAsFile()).filter(Boolean);
      if (!files.length) return; // Ordinary text paste remains untouched.
      event.preventDefault();
      void collectFiles(files.map((file, i) => new File([file], file.name || ("clipboard-" + (i + 1) + ".png"), { type: file.type })), message => showNotice(root, message));
    });
    root.addEventListener("dragover", event => {
      if (!event.dataTransfer?.types?.includes("Files")) return;
      event.preventDefault();
      root.classList.add("is-attachment-drop-target");
    });
    root.addEventListener("dragleave", event => {
      if (!root.contains(event.relatedTarget)) root.classList.remove("is-attachment-drop-target");
    });
    root.addEventListener("drop", event => {
      root.classList.remove("is-attachment-drop-target");
      if (!event.dataTransfer?.files?.length) return;
      event.preventDefault();
      void collectFiles(event.dataTransfer.files, message => showNotice(root, message));
    });
    function place() {
      if (menu.hidden) return;
      const rect = button.getBoundingClientRect();
      const width = 234;
      const left = Math.max(8, Math.min(innerWidth - width - 8, rect.right - width + 20));
      menu.style.left = left + "px";
      const menuHeight = menu.getBoundingClientRect().height || 250;
      const spaceBelow = innerHeight - rect.bottom - 12;
      menu.style.top = (spaceBelow >= menuHeight ? rect.bottom + 7 : Math.max(8, rect.top - menuHeight - 8)) + "px";
    }
    function close() {
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
      page = "root";
    }
    function row(label, icon, action, { hint = "", arrow = false, disabled = false } = {}) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "asm-menu-row";
      btn.setAttribute("role", "menuitem");
      btn.disabled = disabled;
      const mark = document.createElement("span");
      mark.className = "asm-menu-row__icon";
      mark.innerHTML = iconMarkup(icon);
      const content = document.createElement("span");
      content.className = "asm-menu-row__content";
      const title = document.createElement("span");
      title.textContent = label;
      content.append(title);
      if (hint) {
        const note = document.createElement("small");
        note.textContent = hint;
        content.append(note);
      }
      const end = document.createElement("span");
      end.className = "asm-menu-row__arrow";
      end.textContent = arrow ? glyphs.arrow : "";
      btn.append(mark, content, end);
      btn.addEventListener("click", action);
      return btn;
    }
    function header(title) {
      const back = row(title, glyphs.back, () => { page = "root"; render(); });
      back.classList.add("asm-menu-back");
      return back;
    }
    function divider() {
      const el = document.createElement("div");
      el.className = "asm-menu-divider";
      el.setAttribute("role", "separator");
      return el;
    }
    async function getStatus() {
      try {
        const res = await fetch("/api/admin/agentsam/status", { credentials: "include" });
        const obj = await res.json();
        if (res.ok && obj.ok) status = obj;
      } catch { /* disconnected is not evidence of no plugins */ }
      finally { statusLoaded = true; }
    }
    async function getSkills() {
      if (skills || loading) return;
      loading = true;
      try {
        const res = await fetch("/api/admin/agentsam/skills", { credentials: "include" });
        const obj = await res.json();
        if (!res.ok || !obj.ok || !Array.isArray(obj.skills)) throw new Error("Skill registry unavailable");
        skills = obj.skills;
        skillsError = false;
      } catch { skills = null; skillsError = true; }
      finally { loading = false; if (!menu.hidden && page === "skills") render(); }
    }
    function selectTarget(label, id) {
      const href = id === "current" ? location.pathname : targetHref[id];
      draft.selected_resource = {
        type: "admin_surface",
        surface: "fnf-admin",
        label,
        path: href
      };
      notify();
      close();
      input.focus();
    }
    function render() {
      menu.replaceChildren();
      if (page === "root") {
        menu.append(
          row("Files", glyphs.files, () => { page = "files"; render(); }, { arrow: true }),
          row("Upload from device", glyphs.upload, () => { close(); fileInput.click(); }),
          divider(),
          row("Target", glyphs.target, () => { page = "target"; render(); }, { arrow: true }),
          row("Mention", glyphs.mention, () => { page = "mention"; render(); }, { arrow: true }),
          row("Skills", glyphs.skills, () => { page = "skills"; render(); getSkills(); }, { arrow: true }),
          divider(),
          row("Apps", glyphs.apps, () => { page = "apps"; render(); getStatus().then(() => { if (page === "apps" && !menu.hidden) render(); }); }, { arrow: true })
        );
      } else if (page === "files") {
        menu.append(header("Files"), row("Upload from device", glyphs.upload, () => { close(); fileInput.click(); }, { hint: "Images and text documents" }));
        if (draft.attachments.length) menu.append(row("Remove attachments", "×", () => { clearFiles(); close(); }, { hint: draft.attachments.length + " attached" }));
      } else if (page === "target" || page === "mention") {
        menu.append(header(page === "target" ? "Search resources" : "Mention"));
        const search = document.createElement("input");
        search.type = "search";
        search.className = "asm-menu-search";
        search.placeholder = "Search resources";
        search.setAttribute("aria-label", "Filter resource categories");
        menu.append(search);
        const targetRows = [];
        for (const [label, id, hint] of targets) {
          const item = row(label, page === "target" ? glyphs.target : glyphs.mention, () => {
            if (page === "target") selectTarget(label, id);
            else { addMention(input, "@" + (id === "current" ? "page" : id)); close(); }
          }, { hint, arrow: page === "target" });
          targetRows.push({ item, label });
          menu.append(item);
        }
        search.addEventListener("input", () => {
          const filter = search.value.trim().toLowerCase();
          for (const { item, label } of targetRows) item.hidden = !label.toLowerCase().includes(filter);
        });
      } else if (page === "skills") {
        menu.append(header("Skills"));
        if (!skills) menu.append(row(skillsError ? "Could not load skills" : "Loading skills…", glyphs.skills, () => {}, { hint: skillsError ? "Try again later" : "", disabled: true }));
        else if (!skills.length) menu.append(row("No skills available", glyphs.skills, () => {}, { hint: "Check the FNF skill registry", disabled: true }));
        else {
          skills.slice(0, 16).forEach((skill) => {
            const slug = String(skill.slug || "").replace(/[^a-z0-9-]/g, "");
            if (!slug) return;
            menu.append(row(skill.name || slug, glyphs.skills, () => { addMention(input, "/" + slug); close(); }, { hint: skill.description ? String(skill.description).slice(0, 65) : "Add skill to prompt" }));
          });
        }
        menu.append(divider(), row("Create new skill", "+", () => {
          onNotice("Creating skills requires the authorized write API; existing skills are available above.");
        }, { hint: "Not available in this version" }));
      } else if (page === "apps") {
        menu.append(header("Apps"));
        if (!status) menu.append(row(statusLoaded ? "Connection status unavailable" : "Checking connections…", glyphs.apps, () => {}, { disabled: true }));
        const apps = Array.isArray(status?.mcp_servers) ? status.mcp_servers : [];
        if (status && !apps.length) menu.append(row("No linked app tools", glyphs.apps, () => {}, { hint: "No verified integrations available", disabled: true }));
        for (const app of apps) {
          const connected = Boolean(app.connected);
          menu.append(row(app.display_name || app.slug || "Integration", connected ? glyphs.connected : glyphs.apps, () => {
            if (!connected) { onNotice("This app requires its own authorized connection."); return; }
            addMention(input, "@" + String(app.slug || "app").replace(/[^a-z0-9_-]/gi, ""));
            close();
          }, { hint: connected ? "Connected · mention in prompt" : "Needs connection" }));
        }
        menu.append(divider(), row("About connections", "ⓘ", () => onNotice("ChatGPT plugin authorization and FNF app authorization are separate connections.")));
      }
      place();
    }
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!menu.hidden) { close(); return; }
      page = "root";
      menu.hidden = false;
      button.setAttribute("aria-expanded", "true");
      render();
      menu.querySelector("button:not([disabled])")?.focus();
    });
    document.addEventListener("pointerdown", (event) => {
      if (!menu.hidden && !menu.contains(event.target) && !button.contains(event.target)) close();
    });
    document.addEventListener("keydown", (event) => {
      if (menu.hidden) return;
      if (event.key === "Escape") { event.preventDefault(); close(); button.focus(); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const buttons = [...menu.querySelectorAll(".asm-menu-row:not(:disabled)")];
        if (!buttons.length) return;
        event.preventDefault();
        const index = buttons.indexOf(document.activeElement);
        buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length].focus();
      }
    });
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    button.dataset.agentMenuWired = "1";
    delete button.dataset.agentMenuInitializing;
    return { close, getAttachments: readyAttachments, context, clearFiles };
  }
  window.AgentSamComposerMenu = { mount: attach, draft, context, clearFiles, readyAttachments, notify };
})();
