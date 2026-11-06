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
  const glyphs = {
    files: "files", upload: "upload", target: "target", mention: "mention", skills: "skills",
    apps: "apps", arrow: "›", back: "back", connected: "connected", create: "create",
  };
  const icons = {
    files: '<path d="M5 5h9l5 5v9H5z"/><path d="M14 5v5h5M8 14h8M8 17h6"/>',
    upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 17v3h16v-3"/>',
    target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
    mention: '<circle cx="12" cy="12" r="9"/><path d="M16 16c-2 1-3-1-3-2m0 0a4 4 0 1 0-3-1 3 3 0 0 0 3 1l1-5"/>',
    skills: '<path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2Z"/>',
    apps: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M17.5 13v8m-4-4h8"/>',
    connected: '<circle cx="12" cy="12" r="7"/><path d="m8 12 3 3 5-6"/>',
    back: '<path d="m14 5-7 7 7 7M7 12h14"/>',
    create: '<path d="M12 5v14M5 12h14"/><rect x="3" y="3" width="18" height="18" rx="3"/>'
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
    menu.id = "asm-menu-" + (button.id || "composer");
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "AgentSam capabilities");
    menu.hidden = true;
    document.body.append(menu);
    button.setAttribute("aria-controls", menu.id);
    button.setAttribute("aria-haspopup", "menu");
    let page = "root";
    let status = null;
    let statusLoaded = false;
    let skills = null;
    let skillsError = false;
    let loading = false;
    let noticeTimeout = null;
    let skillDialog = null;
    let activeSearch = "";
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
      const width = Math.min(290, innerWidth - 16);
      const left = Math.max(8, Math.min(innerWidth - width - 8, rect.right - width + 20));
      menu.style.left = left + "px";
      const menuHeight = menu.getBoundingClientRect().height || 250;
      const spaceBelow = innerHeight - rect.bottom - 12;
      const top = spaceBelow >= menuHeight ? rect.bottom + 7 : rect.top - menuHeight - 8;
      menu.style.top = Math.max(8, Math.min(innerHeight - menuHeight - 8, top)) + "px";
    }
    function close() {
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
      page = "root";
      activeSearch = "";
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
      if (arrow) end.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
      btn.append(mark, content, end);
      btn.addEventListener("click", action);
      if (arrow) btn.setAttribute("aria-haspopup", "menu");
      return btn;
    }
    function header(title) {
      const back = row(title, glyphs.back, () => { page = "root"; render(); });
      back.classList.add("asm-menu-back");
      return back;
    }
    function sectionLabel(text) {
      const el = document.createElement("div");
      el.className = "asm-menu-section-label";
      el.textContent = text;
      return el;
    }
    function divider() {
      const el = document.createElement("div");
      el.className = "asm-menu-divider";
      el.setAttribute("role", "separator");
      return el;
    }
    async function getStatus() {
      statusLoaded = false;
      try {
        const res = await fetch("/api/admin/agentsam/status", { credentials: "include" });
        const obj = await res.json();
        if (res.ok && obj.ok) status = obj;
        else status = null;
      } catch { status = null; /* unavailable never means no plugins */ }
      finally { statusLoaded = true; }
    }
    async function getSkills(force = false) {
      if (loading || (skills && !force)) return;
      loading = true;
      try {
        skillsError = false;
        const res = await fetch("/api/admin/agentsam/skills", { credentials: "include", cache: "no-store" });
        const obj = await res.json();
        if (!res.ok || !obj.ok || !Array.isArray(obj.skills)) throw new Error("Skill registry unavailable");
        skills = obj.skills;
        skillsError = false;
      } catch { skills = null; skillsError = true; }
      finally {
        loading = false;
        if (!menu.hidden && page === "skills") {
          const focusWasSearch = document.activeElement === menu.querySelector(".asm-menu-search");
          render();
          if (focusWasSearch) menu.querySelector(".asm-menu-search")?.focus();
        }
      }
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
    function openSkillDialog() {
      close();
      if (skillDialog?.isConnected) return;
      const dialog = document.createElement("dialog");
      dialog.className = "asm-skill-dialog";
      dialog.setAttribute("aria-label", "Create an AgentSam skill");
      skillDialog = dialog;
      const form = document.createElement("form");
      form.method = "dialog";
      const top = document.createElement("header");
      const heading = document.createElement("h2");
      heading.textContent = "New AgentSam skill";
      const subtitle = document.createElement("p");
      subtitle.textContent = "Create a reusable, private skill for this account. It is not published or invoked until selected.";
      top.append(heading, subtitle);
      form.append(top);
      function field(label, key, { multiline = false, placeholder = "", required = true } = {}) {
        const wrap = document.createElement("label");
        wrap.className = "asm-skill-field";
        const caption = document.createElement("span");
        caption.textContent = label;
        const control = document.createElement(multiline ? "textarea" : "input");
        control.name = key;
        control.placeholder = placeholder;
        control.required = required;
        control.autocomplete = "off";
        if (key === "content") { control.rows = 9; control.maxLength = 40000; }
        if (key === "name") control.maxLength = 120;
        if (key === "description") control.maxLength = 1000;
        if (key === "trigger") {
          control.pattern = "/[a-z0-9][a-z0-9-]*";
          control.title = "Start with /, followed by lowercase letters, numbers or hyphens";
        }
        wrap.append(caption, control);
        form.append(wrap);
        return control;
      }
      const name = field("Name", "name", { placeholder: "e.g. Responsive review" });
      const trigger = field("Slash trigger", "trigger", { placeholder: "/responsive-review" });
      field("Description", "description", { placeholder: "When should AgentSam use this skill?", required: false });
      field("Instructions", "content", { multiline: true, placeholder: "What should AgentSam do? Include constraints, evidence and verification." });
      name.addEventListener("input", () => {
        if (trigger.dataset.edited === "1") return;
        trigger.value = "/" + name.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 45);
      });
      trigger.addEventListener("input", () => { trigger.dataset.edited = "1"; });
      const error = document.createElement("p");
      error.className = "asm-skill-error";
      error.setAttribute("role", "status");
      form.append(error);
      const footer = document.createElement("footer");
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "asm-skill-cancel";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => dialog.close());
      const save = document.createElement("button");
      save.type = "submit";
      save.className = "asm-skill-save";
      save.textContent = "Create skill";
      footer.append(cancel, save);
      form.append(footer);
      dialog.append(form);
      document.body.append(dialog);
      dialog.addEventListener("close", () => { dialog.remove(); skillDialog = null; }, { once: true });
      form.addEventListener("submit", async event => {
        event.preventDefault();
        if (!form.reportValidity() || save.disabled) return;
        save.disabled = true;
        save.textContent = "Creating…";
        error.textContent = "";
        try {
          const body = Object.fromEntries(new FormData(form).entries());
          const response = await fetch("/api/admin/agentsam/skills", {
            method: "POST", credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload.ok !== true || !payload.skill?.slug) {
            throw new Error(payload.error === "skill_trigger_conflict"
              ? "That slash trigger already exists. Choose a different one."
              : payload.error || "Skill creation failed.");
          }
          skills = null;
          skillsError = false;
          addMention(input, "/" + payload.skill.slug);
          dialog.close();
          showNotice(root, "Skill saved privately. Its slash command has been added to your message.");
          input.focus();
        } catch (failure) {
          error.textContent = failure?.message || "Could not save skill.";
        } finally {
          save.disabled = false;
          save.textContent = "Create skill";
        }
      });
      dialog.showModal();
      name.focus();
    }
    function connectionUrl(app) {
      const urls = { ...status?.connect_urls, ...app?.connect_urls };
      const raw = app?.slug === "github"
        ? (urls.github_oauth || urls.iam_github_oauth)
        : (urls.connection_url || urls.oauth_url || null);
      if (typeof raw !== "string") return null;
      try {
        const url = new URL(raw, location.origin);
        if (url.protocol !== "https:" && url.origin !== location.origin) return null;
        return url.href;
      } catch { return null; }
    }
    function navigate(next) {
      page = next;
      activeSearch = "";
      render();
      (menu.querySelector(".asm-menu-search") || menu.querySelector("button:not(:disabled)"))?.focus();
      if (next === "skills") void getSkills();
      if (next === "apps") void getStatus().then(() => { if (!menu.hidden && page === "apps") render(); });
    }
    function render() {
      menu.replaceChildren();
      menu.dataset.page = page;
      if (page === "root") {
        menu.append(
          sectionLabel("ADD TO MESSAGE"),
          row("Files", glyphs.files, () => navigate("files"), { hint: draft.attachments.length ? draft.attachments.length + " attached" : "Manage attachments", arrow: true }),
          row("Upload from device", glyphs.upload, () => { close(); fileInput.click(); }, { hint: "Images and text documents" }),
          divider(),
          sectionLabel("CONTEXT"),
          row("Target", glyphs.target, () => navigate("target"), { hint: "Select a resource to work on", arrow: true }),
          row("Mention", glyphs.mention, () => navigate("mention"), { hint: "Reference a workspace area", arrow: true }),
          row("Skills", glyphs.skills, () => navigate("skills"), { hint: "Find or create reusable instructions", arrow: true }),
          divider(),
          sectionLabel("INTEGRATIONS"),
          row("Apps", glyphs.apps, () => navigate("apps"), { hint: "Your verified connections", arrow: true })
        );
      } else if (page === "files") {
        menu.append(
          header("Files"),
          sectionLabel("ATTACHMENTS"),
          row("Upload from device", glyphs.upload, () => { close(); fileInput.click(); }, { hint: "PNG, JPEG, WebP, TXT, MD, JSON, CSV" })
        );
        if (draft.attachments.length) {
          menu.append(sectionLabel("ATTACHED NOW"));
          for (const item of draft.attachments) {
            const entry = row(item.name, glyphs.files, () => {
              const index = draft.attachments.indexOf(item);
              if (index >= 0) removeAttachment(index);
              render();
            }, { hint: item.uploading ? "Uploading…" : item.error ? "Upload failed · remove" : "Click to remove" });
            menu.append(entry);
          }
          menu.append(divider(), row("Remove all files", glyphs.files, () => { clearFiles(); render(); }));
        } else {
          menu.append(sectionLabel("No attachments yet"));
        }
      } else if (page === "target" || page === "mention") {
        menu.append(header(page === "target" ? "Target" : "Mention"));
        const search = document.createElement("input");
        search.type = "search";
        search.className = "asm-menu-search";
        search.placeholder = "Search resources…";
        search.value = activeSearch;
        search.setAttribute("aria-label", "Filter resource categories");
        menu.append(search, sectionLabel("WORKSPACE RESOURCES"));
        const available = targets.map(([label, id, hint]) => {
          const item = row(label, page === "target" ? glyphs.target : glyphs.mention, () => {
            if (page === "target") selectTarget(label, id);
            else { addMention(input, "@" + (id === "current" ? "page" : id)); close(); }
          }, { hint });
          menu.append(item);
          return { item, haystack: (label + " " + hint + " " + id).toLowerCase() };
        });
        function filter() {
          activeSearch = search.value.toLowerCase().trim();
          for (const { item, haystack } of available) item.hidden = !haystack.includes(activeSearch);
        }
        search.addEventListener("input", filter);
        filter();
      } else if (page === "skills") {
        menu.append(header("Skills"));
        const search = document.createElement("input");
        search.type = "search";
        search.className = "asm-menu-search";
        search.placeholder = "Search skills…";
        search.setAttribute("aria-label", "Search available AgentSam skills");
        search.value = activeSearch;
        menu.append(search);
        const results = document.createElement("div");
        results.className = "asm-menu-results";
        menu.append(results);
        function drawSkillResults() {
          activeSearch = search.value.toLowerCase().trim();
          results.replaceChildren();
          if (!skills) {
            results.append(skillsError
              ? row("Retry loading skills", glyphs.skills, () => { skillsError = false; void getSkills(true); render(); }, { hint: "The registry could not be reached" })
              : row("Loading skills…", glyphs.skills, () => {}, { disabled: true }));
            return;
          }
          const matches = skills.filter(skill => {
            const text = [skill.name, skill.slug, skill.slash_trigger, skill.description].join(" ").toLowerCase();
            return text.includes(activeSearch);
          });
          if (!matches.length) {
            results.append(row(activeSearch ? "No matching skills" : "No saved skills", glyphs.skills, () => {}, { disabled: true }));
            return;
          }
          results.append(sectionLabel(matches.length + " AVAILABLE"));
          for (const skill of matches.slice(0, 80)) {
            const slug = String(skill.slug || skill.slash_trigger || "").replace(/^\//, "").replace(/[^a-z0-9-]/g, "");
            if (!slug) continue;
            results.append(row(skill.name || slug, glyphs.skills, () => {
              addMention(input, "/" + slug);
              close();
            }, { hint: skill.description ? String(skill.description).slice(0, 88) : "/" + slug }));
          }
          if (matches.length > 80) results.append(sectionLabel("REFINE SEARCH TO SEE MORE"));
        }
        search.addEventListener("input", drawSkillResults);
        drawSkillResults();
        menu.append(divider(), row("New skill", glyphs.create, openSkillDialog, { hint: "Save private instructions to this account" }));
      } else if (page === "apps") {
        menu.append(header("Apps"));
        if (!status) {
          menu.append(statusLoaded
            ? row("Retry connections", glyphs.apps, () => { statusLoaded = false; render(); void getStatus().then(() => { if (page === "apps" && !menu.hidden) render(); }); }, { hint: "Unable to verify connected apps" })
            : row("Checking connections…", glyphs.apps, () => {}, { disabled: true }));
        } else {
          const apps = Array.isArray(status.mcp_servers) ? status.mcp_servers : [];
          const linked = apps.filter(app => app.connected === true);
          const unlinked = apps.filter(app => app.connected !== true);
          if (linked.length) {
            menu.append(sectionLabel("CONNECTED"));
            for (const app of linked) {
              const slug = String(app.slug || "").replace(/[^a-z0-9_-]/gi, "");
              menu.append(row(app.display_name || slug, glyphs.connected, () => {
                if (!slug) return;
                addMention(input, "@" + slug);
                close();
              }, { hint: "Connected · mention in prompt", disabled: !slug }));
            }
          }
          if (unlinked.length) {
            menu.append(sectionLabel("AVAILABLE CONNECTIONS"));
            for (const app of unlinked) {
              const url = connectionUrl(app);
              menu.append(row(app.display_name || app.slug || "Integration", glyphs.apps, () => {
                if (url) window.location.assign(url);
              }, { hint: url ? "Connect using authorized sign-in" : "Connection not available here", disabled: !url }));
            }
          }
          if (!apps.length) menu.append(row("No verified app integrations", glyphs.apps, () => {}, { hint: "Check available workspace plugins", disabled: true }));
          menu.append(divider(), row("Refresh connections", glyphs.apps, () => {
            status = null; statusLoaded = false; render();
            void getStatus().then(() => { if (!menu.hidden && page === "apps") render(); });
          }));
        }
      }
      place();
    }
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!menu.hidden) { close(); return; }
      if (skillDialog?.open) return;
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
      if (event.key === "Escape") {
        event.preventDefault();
        if (page !== "root") navigate("root");
        else { close(); button.focus(); }
      }
      if (event.key === "ArrowLeft" && page !== "root" &&
          document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        navigate("root");
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const buttons = [...menu.querySelectorAll(".asm-menu-row:not(:disabled):not([hidden])")];
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
