/**
 * Read-only streaming preview. Never parse generated code as DOM.
 * Syntax categories reuse the editor token CSS contract; callers append raw text.
 */
(function () {
  if (customElements.get("miniagentsam-codepreview")) return;
  const TOKEN = /(<!--[\s\S]*?-->|\/\*.*?\*\/|\/\/.*$|\{\{.*?\}\}|\{%.*?%\}|<\/?[a-z][\w:-]*|[a-zA-Z_:][-\w:.]*(?=\s*=)|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|(?:--)?[a-zA-Z][\w-]*(?=\s*:))/g;
  function category(text, line, offset) {
    if (text.startsWith("<!--") || text.startsWith("/*") || text.startsWith("//")) return "comment";
    if (text.startsWith("{{") || text.startsWith("{%")) return "template";
    if (text.startsWith("<")) return "tag";
    if (/^["']/.test(text)) return "string";
    if (/^(?:--)?[a-zA-Z]/.test(text) && /^\s*:/.test(line.slice(offset + text.length))) return "prop";
    if (/=\s*/.test(line.slice(offset + text.length))) return "attr";
    return "";
  }
  class MiniAgentSamCodePreview extends HTMLElement {
    constructor() {
      super();
      const root = this.attachShadow({mode:"open"});
      root.innerHTML = `<style>
        :host { display:block;min-width:0;color:var(--te-text);font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace }
        .phase { font:600 11px/1.4 system-ui;margin-bottom:6px;color:var(--te-muted) }
        pre { box-sizing:border-box;margin:0;max-height:13lh;min-height:0;overflow:auto;white-space:pre;tab-size:2;
          scrollbar-gutter:stable;overscroll-behavior:contain;scroll-behavior:auto; }
        pre.is-follow { -webkit-mask-image:linear-gradient(transparent,#000 12%,#000 88%,transparent);
          mask-image:linear-gradient(transparent,#000 12%,#000 88%,transparent); }
        .token-tag { color:var(--te-token-tag,var(--te-accent)) }
        .token-attr { color:var(--te-token-attr,var(--te-text)) }
        .token-string { color:var(--te-token-string,var(--te-success)) }
        .token-template { color:var(--te-token-template,var(--te-accent)) }
        .token-prop { color:var(--te-token-prop,var(--te-success)) }
        .token-comment { color:var(--te-token-comment,var(--te-muted)) }
        .token-streaming { opacity:.55 }
        @media(prefers-reduced-motion:reduce) { pre { scroll-behavior:auto } }
      </style><div class="phase" aria-live="polite"></div><pre tabindex="0" aria-label="Streaming generated code"></pre>`;
      this.pre = root.querySelector("pre");
      this.phaseEl = root.querySelector(".phase");
      this.following = true;
      this.buffer = "";
      this.pre.classList.add("is-follow");
      this.pre.addEventListener("scroll", () => {
        const remaining = this.pre.scrollHeight - this.pre.scrollTop - this.pre.clientHeight;
        this.following = remaining < 12;
        this.pre.classList.toggle("is-follow", this.following);
      });
    }
    setPhase(label) { this.phaseEl.textContent = String(label || ""); }
    appendText(chunk) {
      this.buffer += String(chunk == null ? "" : chunk);
      const rows = this.buffer.split("\n");
      const fragment = this.ownerDocument.createDocumentFragment();
      rows.forEach((line, lineIndex) => {
        const wrapper = this.ownerDocument.createElement("span");
        wrapper.setAttribute("data-code-line", String(lineIndex + 1));
        if (lineIndex >= rows.length - 2) wrapper.classList.add("token-streaming");
        let previous = 0;
        TOKEN.lastIndex = 0;
        let result;
        while ((result = TOKEN.exec(line))) {
          const pos = result.index;
          if (pos > previous) wrapper.append(this.ownerDocument.createTextNode(line.slice(previous,pos)));
          const token = this.ownerDocument.createElement("span");
          const role = category(result[0],line,pos);
          if (role) token.className = "token-" + role;
          token.textContent = result[0];
          wrapper.append(token);
          previous = pos + result[0].length;
          if (TOKEN.lastIndex <= pos) TOKEN.lastIndex = pos+1;
        }
        if (previous < line.length) wrapper.append(this.ownerDocument.createTextNode(line.slice(previous)));
        fragment.append(wrapper);
        if (lineIndex < rows.length-1) fragment.append(this.ownerDocument.createTextNode("\n"));
      });
      // Full text is never inserted through innerHTML, including partial tags.
      this.pre.textContent = "";
      this.pre.append(fragment);
      if (this.following) this.pre.scrollTop = this.pre.scrollHeight;
    }
    clear() {
      this.buffer = "";
      this.pre.textContent = "";
      this.setPhase("");
      this.following = true;
      this.pre.classList.add("is-follow");
    }
  }
  customElements.define("miniagentsam-codepreview", MiniAgentSamCodePreview);
})();
