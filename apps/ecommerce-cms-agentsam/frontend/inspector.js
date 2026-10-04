/* Ember Supply host adapter. miniAgentSam owns reusable UI. */
(() => {
  let instance;
  let active = false;
  let mounted = false;
  let button;
  const watched = new WeakSet();

  function cleanText(value, limit = 180) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
  }

  function ignored(element) {
    return !element ||
      element.closest?.('[data-inspect-toggle]') ||
      element.closest?.('#agentsam-drawer, #agentsam-dock, .agentsam-drawer, .agentsam-dock');
  }

  function boundsFor(element, frame) {
    return () => {
      const rect = element.getBoundingClientRect();
      const frameRect = frame?.getBoundingClientRect();
      return {
        left: rect.left + (frameRect?.left || 0),
        top: rect.top + (frameRect?.top || 0),
        width: rect.width,
        height: rect.height,
      };
    };
  }

  function pageFor(frame) {
    if (!frame) return location.pathname;
    try {
      return new URL(frame.src, location.href).pathname;
    } catch {
      return location.pathname;
    }
  }

  function describe(element, frame) {
    const cms = element.closest?.('[data-section-id], [data-cms-section], [data-cms]');
    const editable = element.matches?.('input,textarea,select,[contenteditable="true"]');
    const label = cleanText(
      element.getAttribute?.('aria-label') ||
      element.getAttribute?.('alt') ||
      (editable ? '' : element.textContent) ||
      element.tagName ||
      'Selected element',
    );

    if (cms && frame) {
      const sourceId = String(
        cms.getAttribute('data-section-id') ||
        cms.getAttribute('data-cms-section') ||
        cms.getAttribute('data-cms') ||
        '',
      ).split('.')[0];

      if (sourceId) {
        return {
          type: 'section',
          id: sourceId,
          label: label || 'Selected section',
          page: pageFor(frame),
          surface: 'theme-studio',
        };
      }
    }

    return {
      type: 'ui_element',
      id: cleanText(
        element.getAttribute?.('data-agentsam-resource') ||
        element.id ||
        element.getAttribute?.('name') ||
        element.tagName?.toLowerCase() ||
        'element',
        100,
      ),
      label: label || 'Selected interface element',
      page: pageFor(frame),
      surface: frame ? 'store-preview' : 'admin-ui',
      tag: element.tagName?.toLowerCase(),
      role: element.getAttribute?.('role') || undefined,
      text: editable ? '[editable field; value withheld]' : cleanText(element.textContent, 300),
    };
  }

  function deactivate({ close = false } = {}) {
    active = false;
    button?.setAttribute('aria-pressed', 'false');
    if (close) instance?.close();
    else instance?.stopSelecting();
  }

  function isEligiblePreviewFrame(frame) {
    try {
      const url = new URL(frame?.src || '', location.href);
      return Boolean(
        frame &&
        url.origin === location.origin &&
        !url.pathname.startsWith('/admin') &&
        frame.contentDocument
      );
    } catch {
      return false;
    }
  }

  function refreshAvailability() {
    if (!button) return;
    const available = Array.from(document.querySelectorAll('iframe')).some(isEligiblePreviewFrame);
    button.disabled = !available;
    button.title = available
      ? 'Inspect & annotate storefront preview'
      : 'Open a customer-facing storefront preview to annotate';
    button.setAttribute('aria-label', button.title);
    if (!available && active) deactivate({ close: true });
  }

  function activate() {
    if (!instance || !button || button.disabled) return;
    active = true;
    button.setAttribute('aria-pressed', 'true');
    instance.startSelecting('Click a storefront preview element to annotate · Esc to exit');
  }

  function watch(doc, frame) {
    if (!doc || watched.has(doc)) return;
    watched.add(doc);

    doc.addEventListener('pointerover', (event) => {
      if (!active || ignored(event.target)) return;
      instance.highlight(boundsFor(event.target, frame));
    }, true);

    doc.addEventListener('pointerout', (event) => {
      if (!active || ignored(event.target)) return;
      instance.clearHighlight();
    }, true);

    doc.addEventListener('click', (event) => {
      if (!active || ignored(event.target)) return;
      const element = event.target;
      event.preventDefault();
      event.stopImmediatePropagation();

      const resource = describe(element, frame);
      active = false;
      button.setAttribute('aria-pressed', 'false');
      instance.select(resource, boundsFor(element, frame));
    }, true);

    doc.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (active) deactivate({ close: true });
      else instance?.close();
    });
  }

  function watchFrames() {
    for (const frame of document.querySelectorAll('iframe')) {
      if (frame.dataset.miniBound) continue;
      frame.dataset.miniBound = 'true';

      const attach = () => {
        try {
          if (!isEligiblePreviewFrame(frame)) return;
          watch(frame.contentDocument, frame);
        } catch {
          /* Cross-origin previews are intentionally not inspectable. */
        }
      };

      frame.addEventListener('load', () => {
        instance?.close();
        attach();
      });
      attach();
    }
    refreshAvailability();
  }

  async function init() {
    if (
      mounted ||
      !location.pathname.startsWith('/admin/') ||
      location.pathname === '/admin/login'
    ) return;

    const bar = document.querySelector('.console-topbar-actions');
    if (!bar) return;

    mounted = true;
    const { createMiniAgentSam, createAttachmentController } =
      await import('/admin/workbench/index.js');

    button = document.createElement('button');
    button.className = 'console-icon-btn';
    button.dataset.inspectToggle = 'true';
    button.textContent = '⌖';
    button.title = 'Open a customer-facing storefront preview to annotate';
    button.setAttribute('aria-label', button.title);
    button.disabled = true;
    button.setAttribute('aria-pressed', 'false');

    const attachments = createAttachmentController({
      upload: async (file) => {
        const form = new FormData();
        form.append('file', file);
        const response = await fetch('/api/admin/agentsam/files/upload', {
          method: 'POST',
          credentials: 'include',
          body: form,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Upload failed');
        return data.file || data.attachment || data;
      },
    });

    instance = createMiniAgentSam({
      attachments,
      capabilities: {
        list: async () => {
          const response = await fetch('/api/admin/agentsam/mcp/status', {
            credentials: 'include',
          });
          if (!response.ok) return [];
          const data = await response.json();
          return (data.mcp_servers || [])
            .filter((server) => server.connected)
            .map((server) => ({
              id: server.slug,
              label: server.display_name || server.slug,
            }));
        },
      },
      generationMount: () =>
        document.querySelector('.theme-editor-panel, .ps-panel, .console-main'),
      onClose: () => {
        active = false;
        button?.setAttribute('aria-pressed', 'false');
      },
      send: async ({ prompt, resource, capabilities, attachments: files, signal }) => {
        if (!window.sendAgentsamMessage) {
          throw new Error('AgentSam is unavailable. Your instructions are retained.');
        }

        const context = {
          active_mcp_connections: capabilities,
          annotation_surface: resource.surface,
        };

        // Only store-owned CMS sections enter the editable-resource resolver.
        // Generic admin selections remain contextual annotations, never authority.
        if (resource.type === 'section' && resource.surface === 'theme-studio') {
          context.selected_resource = resource;
        } else {
          context.annotation = resource;
        }

        window.openAgentsamDrawer?.();
        return await window.sendAgentsamMessage(prompt, {
          context,
          attachments: files,
          signal,
          propagateError: true,
        });
      },
    });

    button.onclick = () => {
      if (active) deactivate({ close: true });
      else activate();
    };
    bar.prepend(button);

    // Never bind annotation selection to the admin shell itself.
    // Only same-origin, non-/admin storefront preview iframes are inspectable.
    watchFrames();
    new MutationObserver(watchFrames).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  window.initEcommerceInspector = init;
  window.startEcommerceInspector = () => {
    if (!mounted) {
      init().then(activate).catch((error) => {
        console.error('miniAgentSam could not load', error.message);
      });
      return;
    }
    activate();
  };

  init().catch((error) => {
    console.error('miniAgentSam could not load', error.message);
  });
})();
