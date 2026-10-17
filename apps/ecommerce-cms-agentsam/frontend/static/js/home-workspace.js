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

(function initHomeTemplates(){
 "use strict";
 const rail=document.getElementById("home-templates-rail");if(!rail||rail.dataset.ready)return;rail.dataset.ready="1";
 // Preset identity is lifted from IAM's TEMPLATE_CARDS. Actual authoring capabilities
 // are resolved separately: the current Studio only supports supplier-backed designs.
 const cards=[
 ["start-anywhere","Start anywhere","Add a file and design","plus",true],
 ["card-slides","Slides","Decks & reviews","slides",false],
 ["card-prototype","Prototype","Clickable & interactive","cursor",false],
 ["card-wireframe","Product wireframe","Lo-fi screens & flows","square",false],
 ["card-doc","Doc","Resumes, PDFs, etc.","file",false],
 ["card-animation","Animation","Motion & video","film",false],
 ["card-blank-canvas","Blank canvas","Start from scratch","square",false],
 ["card-flowchart","Flowchart","Diagrams & maps","flow",false],
 ["card-component-set","Component set","Reusable UI pieces","spark",false]];
 const icons={plus:'<path d="M12 4v16M4 12h16"/>',slides:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9h8M8 13h5"/>',cursor:'<path d="m5 3 14 9-7 1-3 7z"/>',square:'<rect x="4" y="4" width="16" height="16" rx="2"/>',file:'<path d="M6 3h8l5 5v13H6zM14 3v6h5"/>',film:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14m10-14v14"/>',flow:'<rect x="2" y="3" width="8" height="6" rx="1"/><rect x="14" y="15" width="8" height="6" rx="1"/><path d="M6 9v9h8"/>',spark:'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/>'};
 const feedback=document.getElementById("home-templates-feedback");
 for(const [slug,name,description,icon,supported] of cards){
 const btn=document.createElement("button");btn.className="fnf-home-template";btn.type="button";btn.dataset.templateSlug=slug;btn.setAttribute("aria-label",name+": "+description);
 btn.innerHTML='<span class="fnf-home-template__icon"><svg viewBox="0 0 24 24" aria-hidden="true">'+icons[icon]+'</svg></span>';
 const label=document.createElement("span");label.className="fnf-home-template__name";label.textContent=name;
 const sub=document.createElement("span");sub.className="fnf-home-template__description";sub.textContent=description;btn.append(label,sub);
 btn.onclick=()=>{if(supported){location.assign("/admin/products/create?template="+encodeURIComponent(slug));}else{feedback.textContent=name+" is not available in Product Studio yet.";}};rail.append(btn);
 }
 let frame=0,direction=0;const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
 const stop=()=>{direction=0;cancelAnimationFrame(frame)};
 const tick=()=>{if(!direction)return;rail.scrollLeft+=direction*6;frame=requestAnimationFrame(tick)};
 document.querySelectorAll("[data-template-scroll]").forEach(edge=>{edge.onpointerenter=()=>{if(reduced)return;stop();direction=Number(edge.dataset.templateScroll);frame=requestAnimationFrame(tick)};edge.onpointerleave=stop});
 rail.onpointerdown=stop;
 for(const [id,delta] of [["home-templates-back",-1],["home-templates-forward",1]])document.getElementById(id).onclick=()=>rail.scrollBy({left:delta*rail.clientWidth*.75,behavior:reduced?"auto":"smooth"});
 const update=()=>{document.getElementById("home-templates-back").disabled=rail.scrollLeft<=2;document.getElementById("home-templates-forward").disabled=rail.scrollLeft+rail.clientWidth>=rail.scrollWidth-2};
 rail.addEventListener("scroll",update,{passive:true});window.addEventListener("resize",update);update();
})();
