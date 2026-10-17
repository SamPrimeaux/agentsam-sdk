/* Home assistant workspace — one chat endpoint and one conversation shared with the side/focus modes. */
(function () {
  "use strict";
  function initHomeAgent() {
    const form = document.getElementById("home-agent-form");
    const input = document.getElementById("home-agent-input");
    const send = document.getElementById("home-agent-send");
    const open = document.getElementById("home-agent-open");
    if (!form || !input || !send || form.dataset.ready) return;
    form.dataset.ready = "1";

    const plus = document.getElementById("home-agent-plus");
    // A visible + with an optional-chained initializer was a silent dead control
    // when the shared script had not loaded or an asset deploy was stale.
    // Keep the first click and open the menu as soon as initialization completes.
    let firstClickRequested = false;
    let menuBooting = false;
    const onUnboundClick = (event) => {
      if (plus.dataset.agentMenuWired === "1") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      firstClickRequested = true;
      ensureMenuMounted();
    };
    plus?.addEventListener("click", onUnboundClick);
    function showMenuFailure(message) {
      report(message);
      plus?.setAttribute("aria-invalid", "true");
      plus?.setAttribute("title", message);
    }
    function mountMenuNow() {
      if (!plus || typeof window.AgentSamComposerMenu?.mount !== "function") return false;
      window.AgentSamComposerMenu.mount(form, plus, input);
      if (plus.dataset.agentMenuWired !== "1") return false;
      plus.removeEventListener("click", onUnboundClick);
      plus.removeAttribute("aria-invalid");
      plus.setAttribute("title", "Add files, resources, skills or apps");
      if (firstClickRequested) {
        firstClickRequested = false;
        plus.click();
      }
      return true;
    }
    function ensureMenuMounted() {
      if (mountMenuNow() || menuBooting) return;
      menuBooting = true;
      // Reuse the head script if still loading; otherwise load with a new tag.
      // This explicitly handles script failure instead of silently ignoring it.
      const load = document.getElementById("agent-composer-menu-script")
        || document.querySelector('script[src="/admin/js/agent-composer-menu.js"]');
      const script = load || document.createElement("script");
      let settled = false;
      const complete = () => {
        if (settled) return;
        settled = true;
        menuBooting = false;
        if (!mountMenuNow()) showMenuFailure("AgentSam tools did not load. Please refresh and try again.");
      };
      script.addEventListener("load", complete, { once: true });
      script.addEventListener("error", complete, { once: true });
      if (!load) {
        script.id = "agent-composer-menu-script";
        script.src = "/admin/js/agent-composer-menu.js";
        document.head.appendChild(script);
      }
      // The script tag may already have finished loading before we attached
      // listeners (especially on a soft-navigation or cached page).
      window.setTimeout(complete, 4500);
    }
    ensureMenuMounted();
    function pending(value) {
      send.disabled = value;
      input.setAttribute("aria-busy", String(value));
    }
    let active = false;
    async function waitForAgent() {
      if (typeof window.sendAgentsamMessage === "function") return;
      await new Promise((resolve) => {
        let ticks = 0;
        function retry() {
          if (typeof window.sendAgentsamMessage === "function" || ticks++ > 80) resolve();
          else requestAnimationFrame(retry);
        }
        retry();
      });
      if (typeof window.sendAgentsamMessage !== "function") throw new Error("AgentSam has not loaded. Please refresh the page.");
    }
    function report(message) {
      let feedback = form.querySelector(".fnf-home-composer__feedback");
      if (!feedback) {
        feedback = document.createElement("div");
        feedback.className = "fnf-home-composer__feedback";
        feedback.setAttribute("role", "status");
        form.append(feedback);
      }
      feedback.textContent = message;
    }
    async function launch(message, { focus = true } = {}) {
      const prompt = String(message || "").trim();
      if ((!prompt && !window.AgentSamDraft?.attachments?.length) || active) return;
      active = true;
      pending(true);
      report("");
      try {
        await waitForAgent();
        window.openAgentsamDrawer?.();
        if (focus) window.focusAgentsamDrawer?.();
        const draft = window.AgentSamDraft || { attachments: [] };
        const attachments = await window.AgentSamComposerMenu?.readyAttachments?.() || [];
        await window.sendAgentsamMessage(prompt, {
          attachments,
          context: draft.selected_resource ? { selected_resource: draft.selected_resource } : {},
          propagateError: true
        });
        if (input.value.trim() === prompt) input.value = "";
      } catch (error) {
        report(error.message || "Could not send the message; your draft is still here.");
      } finally {
        active = false;
        pending(false);
      }
    }
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      launch(input.value);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        launch(input.value);
      }
    });
    open?.addEventListener("click", async () => {
      try {
        await waitForAgent();
        window.openAgentsamDrawer?.();
      } catch (error) { report(error.message); }
    });
    document.querySelectorAll("[data-home-suggestion]").forEach((button) => {
      button.addEventListener("click", () => {
        const message = button.getAttribute("data-home-suggestion") || "";
        input.value = message;
        launch(message);
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initHomeAgent, { once: true });
  else initHomeAgent();
})();
