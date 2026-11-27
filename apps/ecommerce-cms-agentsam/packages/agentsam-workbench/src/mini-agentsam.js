import { attachCapabilityMenu } from './composer.js';

// #SSOT: ecommerce-vanilla miniAgentSam (Batch 1 decision).
// This app-local vanilla JS module SHIPS via bin/build-assets.mjs → /admin/workbench.
// Canonical React/TS workbench lives at packages/agentsam-workbench (MiniAgentSam.tsx +
// ResourceCard). Do NOT invent a third copy. Convergence path: publish
// @inneranimalmedia/agentsam-workbench with a browser build (or installed() package like
// revise-theme), then point build-assets at node_modules and retire this file.
// Until that consumer swap lands, keep this ship copy; never delete it first.
// Status: Decide=packages React SSOT for Studio; this file remains Ecommerce release SSOT.
export const miniAgentSamTokens = {
  accent: 'var(--nav-accent, var(--te-accent, var(--primary, #737373)))',
  icon: 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail',
};

/**
 * Reusable contextual AgentSam UI.
 *
 * The host owns resource discovery/authorization and transport. This package
 * owns selection feedback, positioning, attachments, capabilities and composer
 * interaction. A DOM selection is context only; authorization stays server-side.
 */
export function createMiniAgentSam(host) {
  const portal = document.createElement('div');
  portal.dataset.miniAgentsam = 'true';
  const root = portal.attachShadow({ mode: 'open' });

  root.innerHTML = `<style>
    :host{position:fixed;inset:0;z-index:10000;pointer-events:none;font:14px/1.4 var(--nav-font,system-ui);--mini-surface:var(--nav-popover,var(--te-panel,var(--card,#292929)));--mini-text:var(--nav-text,var(--te-text,var(--foreground,#f5f5f5)));--mini-muted:var(--nav-muted,var(--te-muted,var(--muted-foreground,#a3a3a3)));--mini-border:var(--nav-border,var(--te-border,var(--border,#ffffff26)));--accent:${miniAgentSamTokens.accent};--accent-ink:var(--nav-accent-ink,var(--te-accent-ink,var(--primary-foreground,#fff)));color:var(--mini-text)}
    *{box-sizing:border-box}[hidden]{display:none!important}
    .outline{position:fixed;border:2px solid var(--accent);border-radius:6px;background:color-mix(in srgb,var(--accent) 6%,transparent);pointer-events:none;transition:left .08s ease,top .08s ease,width .08s ease,height .08s ease}
    .hint{position:fixed;top:72px;left:50%;transform:translateX(-50%);max-width:min(520px,calc(100vw - 28px));padding:9px 14px;border:1px solid var(--mini-border);border-radius:999px;background:color-mix(in srgb,var(--mini-surface) 88%,transparent);backdrop-filter:blur(24px) saturate(125%);box-shadow:0 10px 34px #0003;color:var(--mini-text);pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .composer{position:fixed;width:min(416px,calc(100vw - 24px));min-height:52px;padding:5px 6px 5px 10px;border:1px solid var(--mini-border);border-radius:999px;background:color-mix(in srgb,var(--mini-surface) 88%,transparent);backdrop-filter:blur(24px) saturate(125%);-webkit-backdrop-filter:blur(24px) saturate(125%);box-shadow:0 12px 36px #0003,inset 0 1px 0 #ffffff0a;pointer-events:auto}
    .composer.message-expanded,.composer:has(.attachments:not(:empty)),.composer:has(.status:not([hidden])){border-radius:22px}
    .row{display:flex;align-items:center;gap:4px;min-width:0;width:100%}.icon{width:24px;height:24px;border-radius:5px;flex:0 0 24px;object-fit:contain}
    textarea{font:inherit;color:inherit;background:transparent;border:0;resize:none;flex:1 1 0;min-width:0;width:0;height:40px;padding:10px 4px;outline:none;white-space:nowrap;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}textarea::-webkit-scrollbar{display:none;width:0;height:0}textarea::placeholder{color:var(--mini-muted)}.message-expanded textarea{height:88px;white-space:pre-wrap;overflow-y:auto}
    button{border:0;background:transparent;color:var(--mini-text);cursor:pointer;flex:0 0 36px;min-width:36px;min-height:36px;border-radius:50%;font:inherit;padding:4px;display:inline-flex;align-items:center;justify-content:center}button:hover{background:color-mix(in srgb,var(--mini-text) 8%,transparent)}button svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.send{background:var(--accent);color:var(--accent-ink);width:40px;height:40px;flex:0 0 40px}.send:hover{background:var(--accent)}button:disabled{opacity:.45;cursor:default}
    .tools{position:absolute;bottom:calc(100% + 8px);left:0;width:min(280px,100%);display:flex;flex-direction:column;gap:2px;padding:6px;border:1px solid var(--mini-border);border-radius:20px;background:color-mix(in srgb,var(--mini-surface) 92%,transparent);backdrop-filter:blur(24px);box-shadow:0 12px 36px #0004}.tools button{width:100%;min-height:44px;flex:auto;justify-content:flex-start;gap:12px;padding:8px 12px;border-radius:12px}.status{color:var(--mini-muted);margin:6px 8px 2px;overflow-wrap:anywhere}
    .thinking{background:linear-gradient(100deg,var(--mini-muted) 20%,var(--mini-text) 45%,var(--mini-muted) 70%);background-size:200%;color:transparent;background-clip:text;animation:shimmer 1.8s linear infinite}
    .attachments{display:flex;flex-wrap:wrap;gap:4px}.attachments button{font-size:11px;max-width:100%;overflow:hidden;text-overflow:ellipsis;border-radius:8px}
    :focus-visible{outline:2px solid var(--accent);outline-offset:2px}
    @keyframes shimmer{to{background-position:-200%}}
    @media(max-width:600px){.hint{top:62px}.composer{max-width:calc(100vw - 24px)}.row button{min-width:44px;min-height:44px;flex-basis:44px}.row .send{width:44px;height:44px}textarea{font-size:16px}.row .icon{width:20px;height:20px;flex-basis:20px}.row{gap:2px}}
    @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
  </style>
  <div class="outline" hidden></div>
  <div class="hint" role="status" aria-live="polite" hidden>Click an element to annotate · Esc to exit</div>
  <section class="composer" aria-label="miniAgentSam" hidden>
    <div class="row">
      <img class="icon" alt="" aria-hidden="true" hidden>
      <button class="more" aria-label="Add tools and plugins" aria-expanded="false"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>
      <textarea aria-label="Ask AgentSam" placeholder="Ask AgentSam" rows="1" wrap="off"></textarea>
      <button class="mic" aria-label="Talk to type"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg></button>
      <button class="send" aria-label="Send message"><svg viewBox="0 0 24 24"><path d="M12 19V5m-6 6 6-6 6 6"/></svg></button>
    </div>
    <div class="tools" hidden>
      <button class="attach" aria-label="Attach files"><span aria-hidden="true">＋</span> Files</button>
      <button class="plugins" aria-label="Browse plugins"><span aria-hidden="true">@</span> Plugins</button>
      <button class="expand" aria-label="Expand message preview" aria-expanded="false">Expand message</button>
      <button class="dismiss" aria-label="Close miniAgentSam">Close</button>
    </div>
    <div class="capabilities attachments"></div>
    <div class="files attachments"></div>
    <p class="status" role="status" aria-live="polite" hidden></p>
  </section>`;

  document.body.append(portal);

  const composer = root.querySelector('.composer');
  const input = root.querySelector('textarea');
  const icon = root.querySelector('.icon');
  function setIcon(url) {
    if (!url) { icon.hidden = true; icon.removeAttribute('src'); return true; }
    try {
      const resolved = new URL(url, document.baseURI);
      if (!['https:', 'http:'].includes(resolved.protocol)) return false;
      icon.src = resolved.href;
      icon.hidden = false;
      return true;
    } catch { return false; }
  }
  setIcon();
  const status = root.querySelector('.status');
  const outline = root.querySelector('.outline');
  const hint = root.querySelector('.hint');
  let resource = null;
  let rect = null;
  let busy = false;
  let request = null;
  let toolsExpanded = false;
  let messageExpanded = false;
  let preview = null;
  const capabilities = new Set();

  const resolveRect = () => {
    if (!rect) return null;
    try {
      return typeof rect === 'function' ? rect() : rect;
    } catch {
      return null;
    }
  };

  function positionOutline() {
    const r = resolveRect();
    if (!r) {
      outline.hidden = true;
      return null;
    }
    // A zero-size anchor (e.g. a composer pinned to a screen edge) has nothing to outline.
    if (!(r.width > 0 && r.height > 0)) {
      outline.hidden = true;
      return r;
    }
    Object.assign(outline.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    return r;
  }

  function position() {
    const r = positionOutline();
    if (!r || composer.hidden) return;

    const width = composer.offsetWidth;
    const height = composer.offsetHeight;
    const gap = 12;
    // An editor can reserve its toolbar, sheet, and bottom navigation. When
    // absent, preserve the normal full-viewport placement for every other
    // miniAgentSam consumer (Product Studio included).
    const region = typeof host.positionBounds === 'function' ? host.positionBounds() : null;
    const valid = region && [region.left, region.top, region.right, region.bottom].every(Number.isFinite);
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportRight = viewportLeft + (viewport?.width || innerWidth);
    const viewportBottom = viewportTop + (viewport?.height || innerHeight);
    const leftEdge = valid ? Math.max(viewportLeft + gap, region.left + gap) : viewportLeft + gap;
    const topEdge = valid ? Math.max(viewportTop + gap, region.top + gap) : viewportTop + gap;
    const rightEdge = valid ? Math.min(viewportRight - gap, region.right - gap) : viewportRight - gap;
    const bottomEdge = valid ? Math.min(viewportBottom - gap, region.bottom - gap) : viewportBottom - gap;
    const boundX = (x) => Math.max(leftEdge, Math.min(Math.max(leftEdge, rightEdge - width), x));
    const boundY = (y) => Math.max(topEdge, Math.min(Math.max(topEdge, bottomEdge - height), y));
    const centerX = r.left + r.width / 2;
    const centerY = r.top + r.height / 2;
    const xCenter = boundX(centerX - width / 2);
    const yCenter = boundY(centerY - height / 2);
    const candidates = [
      { left: xCenter, top: boundY(r.top - height - gap) },
      { left: xCenter, top: boundY(r.top + r.height + gap) },
      { left: boundX(r.left + r.width + gap), top: yCenter },
      { left: boundX(r.left - width - gap), top: yCenter },
    ];
    if (host.preferAbove !== true) [candidates[0], candidates[1]] = [candidates[1], candidates[0]];
    // Favor positions outside the selected element; when the selection fills
    // most of the viewport, choose the smallest overlap instead.
    const overlap = ({ left, top }) => Math.max(0, Math.min(left + width, r.left + r.width) - Math.max(left, r.left))
      * Math.max(0, Math.min(top + height, r.top + r.height) - Math.max(top, r.top));
    candidates.sort((a, b) => overlap(a) - overlap(b));
    const best = candidates[0];
    Object.assign(composer.style, { left: `${best.left}px`, top: `${best.top}px` });
  }

  const menuCleanup = attachCapabilityMenu(input, {
    list: () => host.capabilities?.list() || [],
    select: (item) => {
      capabilities.add(item.id);
      renderCapabilities();
    },
  });

  function renderCapabilities() {
    const tray = root.querySelector('.capabilities');
    tray.replaceChildren();
    for (const id of capabilities) {
      const button = document.createElement('button');
      button.textContent = `@${id} ×`;
      button.setAttribute('aria-label', `Remove ${id}`);
      button.onclick = () => {
        capabilities.delete(id);
        input.value = input.value.split(`@${id} `).join('');
        renderCapabilities();
      };
      tray.append(button);
    }
    position();
  }

  function setToolsExpanded(next) {
    toolsExpanded = Boolean(next);
    root.querySelector('.tools').hidden = !toolsExpanded;
    root.querySelector('.more').setAttribute('aria-expanded', String(toolsExpanded));
    position();
  }

  function setMessageExpanded(next) {
    messageExpanded = Boolean(next);
    composer.classList.toggle('message-expanded', messageExpanded);
    input.wrap = messageExpanded ? 'soft' : 'off';
    const button = root.querySelector('.expand');
    button.setAttribute('aria-expanded', String(messageExpanded));
    button.setAttribute('aria-label', messageExpanded ? 'Collapse message preview' : 'Expand message preview');
    button.textContent = messageExpanded ? 'Collapse message' : 'Expand message';
    position();
  }

  function stopSelecting() {
    hint.hidden = true;
    if (!resource) {
      rect = null;
      outline.hidden = true;
    }
  }

  function close() {
    request?.abort();
    setToolsExpanded(false);
    setMessageExpanded(false);
    composer.hidden = true;
    outline.hidden = true;
    hint.hidden = true;
    preview?.remove();
    preview = null;
    resource = null;
    rect = null;
    host.onClose?.();
  }

  function showStatus(text, thinking = false) {
    status.textContent = text;
    status.hidden = !text;
    status.classList.toggle('thinking', thinking);
    position();
  }

  function phase(event) {
    if (event?.phase !== 'generating') {
      preview?.remove();
      preview = null;
      return;
    }
    const mount = host.generationMount?.();
    if (mount && !preview) {
      preview = createCodePreview();
      mount.append(preview);
    }
  }

  function renderAttachments() {
    const tray = root.querySelector('.files');
    tray.replaceChildren();
    for (const item of host.attachments?.items || []) {
      const button = document.createElement('button');
      button.textContent = `${item.name || item.file_name || 'Attachment'} ×`;
      button.onclick = () => {
        host.attachments.remove(item.id || item.attachment_id);
        renderAttachments();
      };
      tray.append(button);
    }
    position();
  }

  async function send() {
    const prompt = input.value.trim();
    if (!prompt || !resource || busy) return;

    busy = true;
    const controller = new AbortController();
    request = controller;
    root.querySelector('.send').disabled = true;
    input.disabled = true;
    showStatus('Thinking…', true);

    try {
      const result = await host.send({
        prompt,
        resource,
        capabilities: [...capabilities],
        attachments: host.attachments?.items || [],
        signal: controller.signal,
        onPhase: phase,
      });
      if (controller.signal.aborted) return;
      input.value = '';
      input.placeholder = 'Add follow-up instructions…';
      host.attachments?.clear();
      renderAttachments();
      showStatus(host.resultStatus || 'Reply in AgentSam');
      host.onResult?.(result);
    } catch (error) {
      if (!controller.signal.aborted) {
        showStatus(error.message || 'Could not send. Try again.');
      }
    } finally {
      if (request === controller) {
        busy = false;
        input.disabled = false;
        root.querySelector('.send').disabled = false;
        status.classList.remove('thinking');
        phase({ phase: 'complete' });
      }
    }
  }

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
    if (event.key === 'Enter' && !event.isComposing) {
      if (event.shiftKey && !messageExpanded) {
        event.preventDefault();
        setMessageExpanded(true);
        input.value += '\n';
        return;
      }
      // The capsule is intentionally one-line: Enter must send, not silently
      // insert a line break into an input that can no longer display it.
      if (!messageExpanded || event.metaKey || event.ctrlKey) {
        event.preventDefault();
        void send();
      }
    }
  });

  root.querySelector('.send').onclick = send;
  root.querySelector('.expand').onclick = () => setMessageExpanded(!messageExpanded);
  root.querySelector('.more').onclick = () => setToolsExpanded(!toolsExpanded);
  root.querySelector('.dismiss').onclick = close;
  root.querySelector('.plugins').hidden = !host.capabilities;
  root.querySelector('.plugins').onclick = () => {
    setToolsExpanded(false);
    input.focus();
    const end = input.selectionStart ?? input.value.length;
    const prefix = input.value.slice(0, end);
    const mention = (prefix && !/\s$/.test(prefix) ? ' ' : '') + '@';
    input.setRangeText(mention, end, end, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  root.querySelector('.mic').hidden = !host.voice;
  root.querySelector('.mic').onclick = async () => {
    try {
      input.value += await host.voice.transcribe();
    } catch (error) {
      showStatus(error.message);
    }
  };
  root.querySelector('.attach').hidden = !host.attachments;
  root.querySelector('.attach').onclick = () => {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.multiple = true;
    picker.onchange = async () => {
      try {
        await host.attachments.add([...picker.files]);
        renderAttachments();
      } catch (error) {
        showStatus(error.message);
      }
    };
    picker.click();
  };

  addEventListener('resize', position);
  addEventListener('scroll', position, true);
  window.visualViewport?.addEventListener('resize', position);
  window.visualViewport?.addEventListener('scroll', position);

  return {
    startSelecting(message = 'Click an element to annotate · Esc to exit') {
      resource = null;
      rect = null;
      composer.hidden = true;
      outline.hidden = true;
      hint.textContent = message;
      hint.hidden = false;
    },
    stopSelecting,
    highlight(bounds) {
      if (resource || busy) return;
      rect = bounds;
      outline.hidden = false;
      positionOutline();
    },
    clearHighlight() {
      if (resource) return;
      rect = null;
      outline.hidden = true;
    },
    reposition: position,
    setIcon,
    select(selection, bounds) {
      if (busy) close();
      resource = selection;
      rect = bounds;
      hint.hidden = true;
      composer.hidden = false;
      outline.hidden = false;
      setToolsExpanded(false);
      setMessageExpanded(false);
      input.value = '';
      input.placeholder = 'Ask AgentSam';
      showStatus('');
      position();
    },
    close,
    destroy() {
      close();
      menuCleanup();
      removeEventListener('resize', position);
      removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
      portal.remove();
    },
    get expanded() {
      return messageExpanded || toolsExpanded;
    },
  };
}

export function createCodePreview() {
  const el = document.createElement('div');
  el.setAttribute('aria-label', 'AgentSam generating');
  el.setAttribute('role', 'status');
  const shadow = el.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>
    :host{display:block;width:min(230px,100%);height:230px;border-radius:18px;overflow:hidden;background:#201a2e;color:#ece4fb;padding:16px;box-sizing:border-box;font:12px system-ui}
    .lines{margin-top:22px;display:grid;gap:9px;mask-image:linear-gradient(transparent,#000 12%,#000 78%,transparent);animation:flow 3s ease-in-out infinite alternate}
    .lines i{height:5px;border-radius:4px;background:linear-gradient(90deg,#a78bfa,#c2e4ff,#e2a3d0,#9ce6dd)}
    @keyframes flow{to{transform:translateY(-12px)}}
    @media(prefers-reduced-motion:reduce){.lines{animation:none}}
  </style>
  <strong>AgentSam · Writing styles</strong>
  <div class="lines" aria-hidden="true">${[78,54,88,62,72,43,83,58,70,48,76,55].map((w,i)=>`<i style="width:${w}%;margin-left:${i%3*6}px"></i>`).join('')}</div>`;
  return el;
}
