import { insertGeneratingNode, removeGeneratingNode } from "./generation-inspector.mjs";
import { presentAgentsamProposal, renderAssistantHeader, renderProvenanceCard } from "./side-assistant.mjs";

export function mountComposer(slot, placement) {
  const composer = slot.ownerDocument.createElement("agentsam-composer");
  composer.setAttribute("data-placement", placement);
  composer.setAttribute("data-composer", "agentsam");
  slot.replaceChildren(composer);
  return composer;
}

export function mountAssistantHeader(dock, state) {
  const header = renderAssistantHeader(state);
  const head = dock.querySelector(".agentsam-head") || dock;
  let actions = head.querySelector("[data-assistant-actions]");
  if (!actions) {
    actions = dock.ownerDocument.createElement("div");
    actions.setAttribute("data-assistant-actions", "true");
    head.appendChild(actions);
  }
  actions.replaceChildren();
  const labels = { "New chat": "Start a new chat", Expand: "Expand Side Assistant", Collapse: "Dock Side Assistant" };
  const iconPaths = {
    "New chat": ["M12 20h9", "M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z"],
    Expand: ["M8 3H5a2 2 0 0 0-2 2v3", "M16 3h3a2 2 0 0 1 2 2v3", "M3 16v3a2 2 0 0 0 2 2h3", "M21 16v3a2 2 0 0 1-2 2h-3"],
    Collapse: ["M8 8 3 3", "M16 8 21 3", "M8 16 3 21", "M16 16 21 21", "M8 3v5H3", "M16 3v5h5", "M8 21v-5H3", "M16 21v-5h5"],
  };
  header.actions.forEach(function(label) {
    const button = dock.ownerDocument.createElement("button");
    button.type = "button";
    const svg = dock.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    for (const pathData of iconPaths[label] || []) {
      const path = dock.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathData);
      svg.append(path);
    }
    button.append(svg);
    button.title = labels[label] || label;
    button.setAttribute("aria-label", labels[label] || label);
    button.setAttribute("data-assistant-action", label);
    actions.appendChild(button);
  });
  const chip = dock.querySelector("[data-context-chip]") || dock.ownerDocument.createElement("span");
  chip.setAttribute("data-context-chip", "true");
  chip.textContent = header.chip;
  if (!chip.parentNode) head.appendChild(chip);
  const input = dock.querySelector("#agentsam-input");
  if (input) input.placeholder = header.placeholder;
  dock.setAttribute("data-surface", "right");
  return header;
}

function appendMessage(doc, container, role, text) {
  const item = doc.createElement("div");
  item.className = "agentsam-msg agentsam-msg--" + role;
  item.textContent = String(text);
  container.appendChild(item);
  return item;
}

/** The reusable visual flow never calls generation until the request panel's Send is clicked. */
export function createGenerationFlow(regions) {
  const state = { request: "", generating: false, calls: 0, installed: false };
  let placeholder = null;
  const doc = regions.panel.ownerDocument;
  const emit = (name, detail = {}) => regions.panel.dispatchEvent(
    new doc.defaultView.CustomEvent(name, { bubbles: true, detail }));

  // One generation workspace, physically anchored to the left rail so it
  // cannot disappear beneath a long section tree. The live code stream and
  // sandbox review reuse the installed flow; no second generator is created.
  function pinGenerationPreview() {
    if (regions.panel.dataset.userResized === "true" &&
        regions.panel.getBoundingClientRect().width > 120) return;
    const rail = regions.tree.closest('.theme-studio-tree');
    if (!rail) return;
    const rect = rail.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 120) return;
    const height = Math.min(510, Math.max(210, rect.height * .68));
    Object.assign(regions.panel.style, {
      position: 'fixed', left: (rect.left + 8) + 'px',
      top: (rect.bottom - height - 8) + 'px',
      width: (rect.width - 16) + 'px', maxHeight: height + 'px',
      overflowY: 'auto', zIndex: '130',
    });
  }
  doc.defaultView.addEventListener('resize', () => {
    if (!regions.panel.hidden && regions.panel.hasAttribute('data-panel-state')) pinGenerationPreview();
  }, { passive: true });


  function addResizeBar() {
    const bar = doc.createElement("button");
    bar.type = "button";
    bar.className = "te-generation-dragbar";
    bar.setAttribute("aria-label", "Resize AgentSam generation workspace");
    bar.title = "Drag upward to expand generation workspace";
    const handle = doc.createElement("span");
    handle.setAttribute("aria-hidden", "true");
    bar.append(handle);
    function resizeBy(delta, bottom) {
      const max = Math.max(240, Math.min(doc.defaultView.innerHeight * .82, bottom - 8));
      const height = Math.min(max, Math.max(215, delta));
      regions.panel.style.height = height + "px";
      regions.panel.style.top = (bottom - height) + "px";
      regions.panel.dataset.userResized = "true";
    }
    bar.addEventListener("pointerdown", event => {
      if (doc.defaultView.innerWidth <= 900 || !event.isPrimary) return;
      const rect = regions.panel.getBoundingClientRect();
      const startY = event.clientY, startHeight = rect.height, bottom = rect.bottom;
      bar.setPointerCapture?.(event.pointerId);
      const move = next => resizeBy(startHeight - (next.clientY - startY), bottom);
      const stop = () => {
        bar.removeEventListener("pointermove", move);
        bar.removeEventListener("pointerup", stop);
        bar.removeEventListener("pointercancel", stop);
      };
      bar.addEventListener("pointermove", move);
      bar.addEventListener("pointerup", stop);
      bar.addEventListener("pointercancel", stop);
      event.preventDefault();
    });
    bar.addEventListener("keydown", event => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      const rect = regions.panel.getBoundingClientRect();
      resizeBy(rect.height + (event.key === "ArrowUp" ? 42 : -42), rect.bottom);
      event.preventDefault();
    });
    regions.panel.prepend(bar);
  }

  const flow = {
    state,
    handoff(text) {
      state.request = String(text || "").trim();
      if (!state.request) return null;
      regions.assistant.hidden = false;
      appendMessage(doc, regions.messages, "user", state.request);
      appendMessage(doc, regions.messages, "assistant",
        "I can prepare this as an editable section. Review the request before starting generation.");
      const proposal = presentAgentsamProposal({
        title: "Create section", request: state.request, source: "miniAgentSam",
      });
      const card = doc.createElement("button");
      card.type = "button";
      card.className = "agentsam-action-card";
      card.setAttribute("data-action-card", "true");
      card.setAttribute("aria-label", "Review section creation request");
      const name = doc.createElement("strong");
      name.textContent = proposal.title;
      const summary = doc.createElement("small");
      summary.textContent = state.request;
      card.append(name, summary);
      regions.messages.appendChild(card);
      regions.messages.scrollTop = regions.messages.scrollHeight;
      card.addEventListener("click", () => flow.openRequest());
      return proposal;
    },
    openRequest() {
      if (state.generating) return;
      // Preserve the existing ephemeral placement marker in the preview.
      // This is not an installed CMS block: no D1/R2 write occurs until
      // the separate authenticated review and acceptance step.
      if (!placeholder || !placeholder.isConnected) placeholder = insertGeneratingNode(regions.tree);
      regions.panel.hidden = false;
      pinGenerationPreview();
      regions.panel.setAttribute("data-panel-state", "request");
      regions.panel.setAttribute("data-surface", "left");
      regions.panel.replaceChildren();
      const heading = doc.createElement("div");
      heading.className = "te-generation-head";
      const identity = doc.createElement("div");
      identity.className = "te-generation-identity";
      const mark = doc.createElement("img");
      mark.src = "/admin/brand/agentsam-gorilla-tiny.svg";
      mark.alt = "";
      mark.setAttribute("aria-hidden", "true");
      const title = doc.createElement("strong");
      title.textContent = "Generate section";
      identity.append(mark, title);
      const close = doc.createElement("button");
      close.type = "button";
      close.setAttribute("aria-label", "Close AgentSam generation workspace");
      close.textContent = "×";
      close.addEventListener("click", () => { regions.panel.hidden = true; });
      heading.append(identity, close);
      const explanation = doc.createElement("p");
      explanation.className = "te-generation-lead";
      explanation.textContent = "Describe the component you want. Review the live build, then choose whether to install it in your private CMS draft.";
      const label = doc.createElement("label");
      const requestId = "agentsam-generation-request-text";
      label.htmlFor = requestId;
      label.textContent = "Describe the section";
      const box = doc.createElement("textarea");
      box.id = requestId;
      box.setAttribute("data-request-box", "true");
      box.setAttribute("aria-label", "Editable section generation request");
      box.value = state.request;
      const actions = doc.createElement("div");
      actions.className = "te-generation-actions";
      const send = doc.createElement("button");
      send.type = "button";
      send.setAttribute("data-send-request", "true");
      send.setAttribute("aria-label", "Send section generation request");
      send.textContent = "Send →";
      send.addEventListener("click", () => flow.send());
      actions.append(send);
      regions.panel.append(heading, explanation, label, box, actions);
      addResizeBar();
      box.focus();
    },
    send() {
      if (state.generating) return null;
      const input = regions.panel.querySelector("[data-request-box]");
      if (!input) return null;
      const request = String(input.value || "").trim();
      if (!request) return null;
      state.request = request;
      state.generating = true;
      state.calls += 1;
      if (!placeholder || !placeholder.isConnected) placeholder = insertGeneratingNode(regions.tree);
      pinGenerationPreview();
      regions.panel.setAttribute("data-panel-state", "generating");
      regions.panel.setAttribute("data-surface", "left");
      regions.panel.replaceChildren();
      const head = doc.createElement("div");
      head.className = "te-generation-head";
      const phase = doc.createElement("div");
      phase.className = "te-phase";
      phase.setAttribute("aria-live", "polite");
      phase.textContent = "Preparing section";
      const stop = doc.createElement("button");
      stop.type = "button";
      stop.setAttribute("data-stop", "true");
      stop.setAttribute("aria-label", "Stop section generation");
      stop.textContent = "Stop";
      head.append(phase, stop);
      const progress = doc.createElement("div");
      progress.className = "te-generation-progress";
      const mark = doc.createElement("img");
      mark.src = "/admin/brand/agentsam-gorilla-tiny.svg";
      mark.alt = "";
      const explanation = doc.createElement("span");
      explanation.textContent = "AgentSam is preparing editable markup and styles. Progress below reports build stages, not private reasoning.";
      progress.append(mark, explanation);
      const codeHeading = doc.createElement("strong");
      codeHeading.className = "te-generation-code-label";
      codeHeading.textContent = "Building component · source preview";
      const preview = doc.createElement("miniagentsam-codepreview");
      preview.setAttribute("data-lines", "13");
      regions.panel.append(head, progress, codeHeading, preview);
      addResizeBar();
      stop.addEventListener("click", () => emit("agentsam-generation-stop"));
      const detail = { request, phase, stop, preview };
      emit("agentsam-generation-request", detail);
      return detail;
    },
    fail(message) {
      state.generating = false;
      removeGeneratingNode(regions.tree);
      placeholder = null;
      regions.panel.setAttribute("data-panel-state", "error");
      const error = doc.createElement("p");
      error.className = "te-generation-error";
      error.setAttribute("role", "alert");
      error.textContent = message || "Generation failed.";
      const retry = doc.createElement("button");
      retry.type = "button";
      retry.textContent = "Edit request";
      retry.addEventListener("click", () => flow.openRequest());
      regions.panel.replaceChildren(error, retry);
    },
    review(record, accept, provenance = {}) {
      state.generating = false;
      pinGenerationPreview();
      regions.panel.setAttribute("data-panel-state", "review");
      regions.panel.replaceChildren();
      const title = doc.createElement("strong");
      title.textContent = "Review " + (record.definition?.label || record.definition?.type || "generated section");
      const note = doc.createElement("p");
      note.textContent = "Script-disabled preview. This is not yet installed or published.";
      const preview = doc.createElement("iframe");
      preview.className = "te-generated-sandbox";
      preview.title = "Generated section preview";
      preview.setAttribute("sandbox", "");
      preview.referrerPolicy = "no-referrer";
      const section = String(record.canonical?.html || "").replaceAll("__UID__", "agentsam-gen-preview");
      const css = String(record.canonical?.css || "").replaceAll("__UID__", "agentsam-gen-preview");
      preview.srcdoc = '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:;"><style>' +
        css.replaceAll("</style", "<\\/style") + '</style></head><body>' + section + '</body></html>';
      const acceptButton = doc.createElement("button");
      acceptButton.type = "button";
      acceptButton.setAttribute("data-accept-generated", "true");
      acceptButton.textContent = "Accept into private draft";
      const edit = doc.createElement("button");
      edit.type = "button";
      edit.textContent = "Edit request";
      edit.addEventListener("click", () => flow.openRequest());
      acceptButton.addEventListener("click", async () => {
        acceptButton.disabled = true;
        acceptButton.textContent = "Installing…";
        try {
          const result = await accept();
          if (!result?.ok) throw new Error(result?.error || "Unable to install section");
          flow.complete(record.settings || {}, provenance);
        } catch (error) {
          acceptButton.disabled = false;
          acceptButton.textContent = "Retry installation";
          note.textContent = error?.message || String(error);
          note.setAttribute("role", "alert");
        }
      });
      const name = doc.createElement("small");
      name.className = "te-generation-review-kind";
      name.textContent = "Reusable CMS section · native inspector after installation";
      regions.panel.append(title, name, note, preview, acceptButton, edit);
      addResizeBar();
    },
    complete(settings = {}, provenance = {}) {
      state.generating = false;
      state.installed = true;
      removeGeneratingNode(regions.tree);
      placeholder = null;
      regions.panel.setAttribute("data-panel-state", "settings");
      regions.panel.replaceChildren();
      const message = doc.createElement("p");
      message.className = "te-generation-installed";
      message.textContent = "Installed in your private draft. Edit its settings in the inspector, or send a follow-up. Publish separately.";
      regions.panel.append(message);
      // The host's native inspector owns settings. Never render synthetic
      // fields from model output in parallel to the page's section schema.
      regions.inspector.querySelector("[data-ai-generated]")?.remove();
      regions.inspector.querySelector("[data-followup]")?.remove();
      const card = renderProvenanceCard(provenance, false);
      const details = doc.createElement("details");
      details.setAttribute("data-ai-generated", "true");
      const summary = doc.createElement("summary");
      summary.textContent = card.title;
      const prompt = doc.createElement("p");
      prompt.textContent = card.prompt;
      const source = doc.createElement("small");
      source.textContent = [provenance.provider, provenance.model].filter(Boolean).join(" · ") || "AgentSam";
      details.append(summary, prompt, source);
      const follow = doc.createElement("form");
      follow.setAttribute("data-followup", "true");
      const followInput = doc.createElement("textarea");
      followInput.rows = 2;
      followInput.setAttribute("data-followup-input", "true");
      followInput.setAttribute("aria-label", "Follow up on this generated section");
      followInput.placeholder = "Describe a change to this section";
      const followSend = doc.createElement("button");
      followSend.type = "submit";
      followSend.setAttribute("aria-label", "Review section follow-up");
      followSend.textContent = "Send →";
      follow.append(followInput, followSend);
      follow.addEventListener("submit", event => {
        event.preventDefault();
        const next = followInput.value.trim();
        if (!next) return;
        state.request = next;
        flow.openRequest(); // still no generation until explicit left-panel Send
      });
      regions.inspector.prepend(details);
      regions.inspector.append(follow);
    },
  };
  return flow;
}
