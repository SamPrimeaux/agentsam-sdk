/**
 * Compact miniAgentSam composer. One authoritative element for dock-pill and
 * in-editor placement; the host handles request routing and all generation.
 */
(function () {
  if (customElements.get("agentsam-composer")) return;
  class AgentSamComposer extends HTMLElement {
    constructor() {
      super();
      const root = this.attachShadow({mode:"open"});
      root.innerHTML = `<style>
        :host{display:block;min-width:0;max-width:100%;font:inherit;color:var(--te-text,var(--text-primary,currentColor))}
        .pill{display:flex;align-items:center;box-sizing:border-box;min-width:0;width:100%;gap:6px;
          border:1px solid var(--te-border,var(--border-color,currentColor));border-radius:999px;
          padding:5px 7px;background:var(--te-panel,var(--surface,transparent))}
        .pill:focus-within{border-color:var(--te-accent,currentColor);outline:2px solid transparent}
        .context{max-width:min(33%,190px);min-width:0;overflow:hidden;text-overflow:ellipsis;
          white-space:nowrap;font:500 11px/1.5 system-ui;color:var(--te-muted,currentColor)}
        textarea{display:block;min-width:0;width:0;flex:1 1 0;box-sizing:border-box;max-height:32px;
          height:24px;min-height:24px;margin:0;padding:3px 1px;border:0;outline:0;background:transparent;
          resize:none;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;
          font:inherit;line-height:18px;color:inherit}
        textarea::placeholder{color:var(--te-muted,currentColor);opacity:.85}
        :host([expanded]) .pill{border-radius:16px;align-items:flex-start}
        :host([expanded]) textarea{height:76px;max-height:124px;white-space:pre-wrap;overflow:auto;text-overflow:clip}
        button{display:grid;place-items:center;flex:none;box-sizing:border-box;min-width:24px;min-height:24px;
          padding:1px 5px;border:0;border-radius:999px;background:transparent;color:inherit;
          font:inherit;cursor:pointer}
        button:hover{background:var(--te-soft,var(--surface-hover,transparent))}
        .send{color:var(--te-accent,currentColor);font-size:19px;line-height:1}
        .expand{font-size:12px}
        @media(max-width:430px){.pill{gap:3px;padding:4px}.context{max-width:24%}button{min-width:23px;padding:0 3px}}
        @media(prefers-reduced-motion:reduce){.pill,button{transition:none}}
      </style>
      <div class="pill">
        <button type="button" data-add aria-label="Add capability">+</button>
        <span class="context" data-chip></span>
        <textarea data-input rows="1" aria-label="Ask AgentSam" placeholder="Describe a section"></textarea>
        <button type="button" data-expand class="expand" aria-label="Expand composer" title="Expand composer">⤢</button>
        <button type="button" data-panel aria-label="Open Side Assistant" title="Open Side Assistant">▣</button>
        <button type="button" data-send class="send" aria-label="Send to Side Assistant">↑</button>
      </div>`;
      this.input = root.querySelector("[data-input]");
      this.chip = root.querySelector("[data-chip]");
      root.querySelector("[data-panel]").addEventListener("click", () =>
        this.dispatchEvent(new CustomEvent("open-assistant", {bubbles:true})));
      root.querySelector("[data-expand]").addEventListener("click", (event) => {
        const expanded = !this.hasAttribute("expanded");
        this.toggleAttribute("expanded",expanded);
        event.currentTarget.setAttribute("aria-label",expanded?"Collapse composer":"Expand composer");
        event.currentTarget.setAttribute("aria-expanded",String(expanded));
        this.input.focus();
      });
      const submit = () => {
        const text = String(this.input.value || "").trim();
        if(!text) return;
        this.dispatchEvent(new CustomEvent("submit-request",{bubbles:true,detail:{text}}));
        this.input.value = "";
      };
      root.querySelector("[data-send]").addEventListener("click", submit);
      this.input.addEventListener("keydown", event => {
        if(event.key==="Enter" && !(this.hasAttribute("expanded") && event.shiftKey)){
          event.preventDefault();
          submit();
        }
      });
    }
    setChip(label){this.chip.textContent=String(label||"");}
    setPlaceholder(text){this.input.placeholder=String(text||"Describe the change");}
  }
  customElements.define("agentsam-composer",AgentSamComposer);
})();
