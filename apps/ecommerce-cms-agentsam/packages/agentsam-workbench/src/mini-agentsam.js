import { attachCapabilityMenu } from './composer.js';

// #NOTDONE: DUPLICATE SOURCE. This app-local copy is the one that SHIPS (bin/build-assets.mjs copies
// packages/agentsam-workbench/src to /admin/workbench so a release never depends on the monorepo).
// A second copy lives at packages/agentsam-workbench/src/mini-agentsam.js (used by repo tests).
// Real fix: publish @inneranimalmedia/agentsam-workbench and consume it via installed(), like
// revise-theme in build-assets. Until then keep both feature-aligned (tests/workbench-parity.test.mjs).
// See docs/AGENTSAM_MERCH_AND_TOOLS_AUDIT_20261015.md (F9).
export const miniAgentSamTokens = {
  accent: '#8b5cf6',
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
    :host{position:fixed;inset:0;z-index:10000;pointer-events:none;font:13px/1.4 system-ui;color:#f5f2fb;--accent:${miniAgentSamTokens.accent}}
    *{box-sizing:border-box}[hidden]{display:none!important}
    .outline{position:fixed;border:2px solid var(--accent);border-radius:6px;background:#8b5cf60c;box-shadow:0 0 0 1px #ffffff35 inset;pointer-events:none;transition:left .08s ease,top .08s ease,width .08s ease,height .08s ease}
    .hint{position:fixed;top:72px;left:50%;transform:translateX(-50%);max-width:min(520px,calc(100vw - 28px));padding:9px 14px;border:1px solid #ffffff2c;border-radius:999px;background:#211b30e8;backdrop-filter:blur(18px);box-shadow:0 10px 34px #160c3430;color:#eee7fb;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .composer{position:fixed;width:min(416px,calc(100vw - 24px));min-height:48px;padding:7px 9px;border:1px solid #ffffff2a;border-radius:24px;background:#211b30eb;backdrop-filter:blur(18px);box-shadow:0 12px 36px #160c342e;pointer-events:auto}
    .composer.message-expanded{border-radius:18px}
    .row{display:flex;align-items:center;gap:8px;min-width:0}.icon{width:26px;height:26px;border-radius:50%;flex:0 0 26px;object-fit:cover}
    textarea{font:13px/1.4 system-ui;color:inherit;background:transparent;border:0;resize:none;flex:1 1 auto;min-width:0;width:auto;height:32px;padding:7px 0;outline:none;white-space:nowrap;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-ms-overflow-style:none}textarea::-webkit-scrollbar{display:none;width:0;height:0}textarea::placeholder{color:#cac0dc}.message-expanded textarea{height:88px;white-space:pre-wrap;overflow-y:auto}
    button{border:0;background:transparent;color:#c5a5ff;cursor:pointer;flex:0 0 30px;min-width:30px;min-height:32px;border-radius:50%;font:inherit;padding:3px}.expand{font-size:15px;line-height:1;color:#d8caef}.more{font-size:17px;line-height:1;color:#d8caef}.send{background:var(--accent);color:white;width:32px;flex:0 0 32px}button:disabled{opacity:.45;cursor:wait}
    .tools{display:flex;align-items:center;gap:6px;margin-top:6px}.tools button{border-radius:8px}.tools .dismiss{margin-left:auto}.status{color:#d3bfff;margin:6px 8px 2px;overflow-wrap:anywhere}
    .thinking{background:linear-gradient(100deg,#b08aff 20%,#f3e9ff 45%,#a17bf7 70%);background-size:200%;color:transparent;background-clip:text;animation:shimmer 1.8s linear infinite}
    .attachments{display:flex;flex-wrap:wrap;gap:4px}.attachments button{font-size:11px;max-width:100%;overflow:hidden;text-overflow:ellipsis;border-radius:8px}
    :focus-visible{outline:2px solid #c1a3ff;outline-offset:2px}
    @keyframes shimmer{to{background-position:-200%}}
    @media(max-width:600px){.hint{top:62px}.composer{max-width:calc(100vw - 24px)}}
    @media(prefers-reduced-motion:reduce){${'*'}animation:none!important}}
  </style>
  <div class="outline" hidden></div>
  <div class="hint" role="status" aria-live="polite" hidden>Click an element to annotate · Esc to exit</div>
  <section class="composer" aria-label="miniAgentSam" hidden>
    <div class="row">
      <img class="icon" src="${host.iconUrl || miniAgentSamTokens.icon}" alt="AgentSam">
      <textarea aria-label="Ask for changes" placeholder="Ask for changes" rows="1" wrap="off"></textarea>
      <button class="expand" aria-label="Expand message preview" aria-expanded="false">↗</button>
      <button class="more" aria-label="More miniAgentSam tools" aria-expanded="false">…</button>
      <button class="send" aria-label="Send message">↑</button>
    </div>
    <div class="tools" hidden>
      <button class="attach" aria-label="Attach files">＋</button>
      <button class="mic" aria-label="Talk to type">Mic</button>
      <button class="dismiss" aria-label="Close miniAgentSam">×</button>
    </div>
    <div class="capabilities attachments"></div>
    <div class="files attachments"></div>
    <p class="status" role="status" aria-live="polite" hidden></p>
  </section>`;

  document.body.append(portal);

  const composer = root.querySelector('.composer');
  const input = root.querySelector('textarea');
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
    const leftEdge = valid ? Math.max(gap, region.left + gap) : gap;
    const topEdge = valid ? Math.max(gap, region.top + gap) : gap;
    const rightEdge = valid ? Math.min(innerWidth - gap, region.right - gap) : innerWidth - gap;
    const bottomEdge = valid ? Math.min(innerHeight - gap, region.bottom - gap) : innerHeight - gap;
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
    button.textContent = messageExpanded ? '↙' : '↗';
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
      input.placeholder = 'Ask for changes';
      showStatus('');
      position();
    },
    close,
    destroy() {
      close();
      menuCleanup();
      removeEventListener('resize', position);
      removeEventListener('scroll', position, true);
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
