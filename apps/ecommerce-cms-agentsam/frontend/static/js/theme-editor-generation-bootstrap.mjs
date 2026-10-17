import "./agentsam-composer.js";
import { createGenerationLock } from "./generation-lock.mjs";
import { createGenerationSession } from "./generation-stream.mjs";
import {
  createGenerationFlow,
  mountAssistantHeader,
  mountComposer,
} from "./generation-surfaces.mjs";

function waitFor(resolve, timeout = 8000) {
  const started = Date.now();
  return new Promise((done, reject) => {
    function tick() {
      const value = resolve();
      if (value) return done(value);
      if (Date.now() - started > timeout) return reject(new Error("generation surface not ready"));
      requestAnimationFrame(tick);
    }
    tick();
  });
}

async function consumeSse(response, handlers = {}) {
  if (!response.ok || !response.body) {
    let detail = {};
    try { detail = await response.json(); } catch {}
    throw new Error(detail.error || "generation request failed");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let provider = null;

  function dispatchFrame(frame) {
    let name = "message";
    let data = "";
    frame.split(/\r?\n/).forEach((line) => {
      if (line.startsWith("event:")) name = line.slice(6).trim();
      if (line.startsWith("data:")) data += line.slice(5).trim();
    });
    if (!data) return;
    let payload;
    try { payload = JSON.parse(data); } catch { payload = { text: data }; }

    if (name === "chunk") handlers.onChunk?.(payload.text || "");
    else if (name === "phase") handlers.onPhase?.(payload.label || "");
    else if (name === "provider") {
      provider = payload;
      handlers.onProvider?.(payload);
    } else if (name === "patch") handlers.onPatch?.(payload);
    else if (name === "error") throw new Error(payload.error || "generation failed");
    else if (name === "abort") throw new DOMException("Aborted", "AbortError");
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = pending.indexOf("\n\n")) >= 0) {
      const frame = pending.slice(0, boundary);
      pending = pending.slice(boundary + 2);
      if (frame.trim()) dispatchFrame(frame);
    }
  }
  if (pending.trim()) dispatchFrame(pending);
  return provider;
}

function selectionLabel(context) {
  if (!context) return "Theme";
  const path = [context.page ? "/" + context.page : "Theme"];
  const type = context.block_type || context.section_type;
  if (type) path.push(type.replace(/-/g, " "));
  if (context.field_key) path.push(context.field_key.split(".").pop());
  return path.join(" › ");
}

async function init() {
  const editorSlot = await waitFor(() => document.querySelector('[data-composer-slot="editor"]'));
  const panel = await waitFor(() => document.getElementById("te-block-panel"));
  const tree = await waitFor(() => document.getElementById("te-tree"));
  const inspector = await waitFor(() => document.getElementById("te-inspector-body"));
  const drawer = await waitFor(() => document.getElementById("agentsam-drawer"));
  const messages = await waitFor(() => document.getElementById("agentsam-messages"));
  const bridge = await waitFor(() => window.AgentSamEditorGeneration);

  const composer = mountComposer(editorSlot, "editor");
  composer.setPlaceholder("Describe a section to create");
  const context = bridge.context?.() || {};
  composer.setChip(selectionLabel(context));
  mountAssistantHeader(drawer, {
    selection: selectionLabel(context),
    expanded: false,
  });

  const flow = createGenerationFlow({
    assistant: drawer,
    messages,
    panel,
    tree,
    inspector,
    wrapper: () => bridge.wrapper?.(),
  });
  const lock = createGenerationLock();
  let activeSession = null;

  // The same portable composer element also powers a dock placement when
  // the host supplies one. Neither placement generates code or opens the left
  // panel until the user explicitly approves the action card.
  const mounted = [composer];
  const dockSlot = document.querySelector('[data-composer-slot="dock"]');
  if (dockSlot && dockSlot !== editorSlot) {
    const dockComposer = mountComposer(dockSlot, "dock");
    dockComposer.setPlaceholder("Ask AgentSam about this page");
    dockComposer.setChip(selectionLabel(context));
    mounted.push(dockComposer);
  }
  for (const input of mounted) {
    input.addEventListener("open-assistant", () => window.openAgentsamDrawer?.());
    input.addEventListener("submit-request", event => {
      const text = String(event.detail?.text || "").trim();
      if (!text) return;
      window.openAgentsamDrawer?.();
      flow.handoff(text);
    });
  }

  async function openVersionHistory() {
    const selected = bridge.context?.();
    if (!selected?.generated || !selected.section_key) return;
    const dialog = document.createElement("dialog");
    dialog.className = "te-section-menu te-generated-history";
    dialog.setAttribute("aria-label", "Generated section versions");
    const heading = document.createElement("h2");
    heading.textContent = "Section history";
    const help = document.createElement("p");
    help.textContent = "Restore a previous version into your private draft. The published storefront stays unchanged.";
    const list = document.createElement("div");
    list.className = "te-generated-revision-list";
    list.textContent = "Loading versions…";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => dialog.remove());
    dialog.append(heading,help,list,close);
    document.body.append(dialog);
    dialog.showModal();
    try {
      const base = '/api/admin/cms/pages/' + encodeURIComponent(selected.page) +
        '/sections/' + encodeURIComponent(selected.section_key);
      const response = await fetch(base + '/generated-revisions',{credentials:"include"});
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Version history unavailable");
      list.replaceChildren();
      for (const revision of payload.revisions || []) {
        const item = document.createElement("div");
        item.className = "te-generated-revision";
        const detail = document.createElement("span");
        detail.textContent = "Revision " + revision.number + (revision.createdAt ? " · " + revision.createdAt : "") +
          (revision.metadata?.restoredFrom ? " · restored from " + revision.metadata.restoredFrom : "");
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Restore privately";
        button.addEventListener("click", async () => {
          button.disabled = true;
          button.textContent = "Restoring…";
          try {
            const latest = bridge.context?.();
            if (!latest?.generated || latest.section_key !== selected.section_key) {
              throw new Error("The editor selection changed. Reopen version history.");
            }
            await bridge.restoreGenerated(revision.number,latest.version);
            dialog.close();
          } catch(error) {
            help.textContent = error.message || String(error);
            help.setAttribute("role","alert");
            button.disabled = false;
            button.textContent = "Restore privately";
          }
        });
        item.append(detail,button);
        list.append(item);
      }
      if (!list.childNodes.length) list.textContent = "No saved revisions yet.";
    } catch (error) {
      list.textContent = error.message || String(error);
      list.setAttribute("role","alert");
    }
  }

  function showHistoryAction(selection) {
    inspector.querySelector('[data-generated-history]')?.remove();
    if (!selection?.generated) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "te-generated-history-action";
    button.dataset.generatedHistory = "true";
    button.textContent = "Version history / Restore";
    button.addEventListener("click",openVersionHistory);
    inspector.prepend(button);
  }

  document.addEventListener("theme-editor:selection", (event) => {
    const next = event.detail || {};
    for (const input of mounted) input.setChip(selectionLabel(next));
    showHistoryAction(next);
    mountAssistantHeader(drawer, {
      selection: selectionLabel(next),
      expanded: drawer.hasAttribute("data-expanded"),
    });
  });

  showHistoryAction(bridge.context?.());

  // Explicit action from the real Add Section catalog. The left workspace
  // uses the existing generation endpoint, review gate and D1/R2 install.
  window.addEventListener("theme-editor:generate-request", event => {
    if (event.detail?.kind !== "section") return;
    const sectionsButton = document.querySelector('[data-drawer-mode="sections"]');
    if (sectionsButton && sectionsButton.getAttribute("aria-pressed") !== "true") {
      sectionsButton.click();
    }
    flow.openRequest();
  });

  panel.addEventListener("agentsam-generation-stop", () => {
    activeSession?.abort();
  });

  panel.addEventListener("agentsam-generation-request", async (event) => {
    const requestText = String(event.detail?.request || "").trim();
    const preview = event.detail?.preview;
    const phase = event.detail?.phase;
    if (!requestText || !preview) return;

    const blockId = "generated-" + crypto.randomUUID().slice(0, 8);
    const contextNow = bridge.context?.() || {};
    const transport = async ({ signal, promptPrefix, onChunk, onPhase }) => {
      let provider = null;
      const response = await fetch("/api/admin/agentsam/generate-block", {
        method: "POST",
        credentials: "include",
        signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          capability: "code.generate",
          request: requestText,
          promptPrefix,
          context: {
            ...contextNow,
            ...(contextNow.generated ? { existingSection: bridge.currentGenerated?.() || null } : {}),
          },
          output_contract: "cms.generated-definition.v1",
        }),
      });
      provider = await consumeSse(response, {
        onChunk,
        onPhase(label) {
          phase.textContent = label;
          preview.setPhase?.(label);
          onPhase?.(label);
        },
        onProvider(value) {
          provider = value;
        },
      });
      return {
        chunks: [],
        provenance: {
          generator: "agentsam",
          provider: provider?.provider || "",
          model: provider?.model || "",
          prompt: requestText,
        },
      };
    };

    activeSession = createGenerationSession({
      id: "theme-editor:" + blockId,
      blockId,
      namespace: "agentsam",
      lock,
      prompt: requestText,
      sink: {
        append(chunk) {
          preview.appendText?.(chunk);
        },
      },
      transport,
      onPhase(label) {
        phase.textContent = label;
        preview.setPhase?.(label);
      },
    });

    try {
      const result = await activeSession.run();
      if (result?.aborted) {
        flow.fail("Generation stopped.");
        return;
      }
      if (!result?.ok || !result.record) {
        flow.fail(result?.error || "Generation failed.");
        return;
      }
      const provenance = {
        ...result.record.provenance,
        prompt: requestText,
        definition: result.record.definition,
      };
      // The model output is NOT an installed section. Show a sandboxed,
      // non-executing review before a separate authenticated D1/R2 commit.
      flow.review(result.record, () => bridge.acceptGenerated(result.record, provenance, {
        sectionKey: contextNow.generated ? contextNow.section_key : undefined,
        expectedVersion: contextNow.generated ? contextNow.version : undefined,
      }), provenance);
    } catch (error) {
      if (error?.name === "AbortError") flow.fail("Generation stopped.");
      else flow.fail(error?.message || "Generation failed.");
    } finally {
      activeSession = null;
    }
  });
}

init().catch((error) => {
  console.warn("[theme-editor-generation]", error?.message || error);
});
