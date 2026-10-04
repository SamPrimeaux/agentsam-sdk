import { useEffect, useMemo, useRef } from 'react';
import type { FormFieldState } from '../types.js';

export interface AbsGeneratedPreviewProps {
  htmlContent: string;
  onNavigate: (href: string, linkText: string, formState?: FormFieldState[]) => void;
  onAction: (intent: string, payload?: string, formState?: FormFieldState[]) => void;
}

function createShellHtml(nonce: string) {
  const encodedNonce = JSON.stringify(nonce);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'unsafe-inline' https://cdn.tailwindcss.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: blob:; connect-src 'none'; frame-src 'none';">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    const ABS_NONCE = ${encodedNonce};

    function post(message) {
      window.parent.postMessage({ __agentsamAbs: 1, nonce: ABS_NONCE, ...message }, '*');
    }

    function getFormState() {
      const fields = [];
      document.querySelectorAll('input, textarea, select').forEach((el) => {
        const name = el.getAttribute('name') || el.getAttribute('id') || el.getAttribute('placeholder') || '';
        const tag = el.tagName.toLowerCase();
        const type = tag === 'select' ? 'select' : tag === 'textarea' ? 'textarea' : (el.getAttribute('type') || 'text');
        let value = '';
        if (tag === 'select') value = el.options[el.selectedIndex]?.text || el.value;
        else if (type === 'checkbox' || type === 'radio') value = el.checked ? 'checked' : 'unchecked';
        else value = el.value;
        if (value && value !== 'unchecked') fields.push({ name, type, value });
      });
      return fields;
    }

    window.AgentSamABS = {
      navigate(url, text) {
        post({ type: 'NAVIGATE', url, text, formState: getFormState() });
      },
      performAction(intent, payload) {
        post({ type: 'ACTION', intent, payload, formState: getFormState() });
      }
    };

    document.addEventListener('click', (event) => {
      const link = event.target.closest('a');
      if (!link) return;
      if (link.onclick || link.getAttribute('onclick')) return;
      event.preventDefault();
      const href = link.getAttribute('href') || '';
      const text = link.innerText || href;
      window.AgentSamABS.navigate(href, text);
    });

    window.addEventListener('message', (event) => {
      if (event.source !== window.parent) return;
      const data = event.data;
      if (!data || data.__agentsamAbs !== 1 || data.nonce !== ABS_NONCE) return;
      if (data.type !== 'CONTENT_UPDATE') return;

      document.body.innerHTML = data.html || '';
      document.body.className = 'min-h-screen ' + (data.bodyClasses || '');
      document.body.setAttribute('style', data.bodyStyle || '');
      document.documentElement.style.colorScheme = data.colorScheme || 'light';

      document.head.querySelectorAll('link[data-agentsam-abs-font]').forEach((el) => el.remove());
      (data.linkTags || []).forEach((href) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.setAttribute('data-agentsam-abs-font', 'true');
        document.head.appendChild(link);
      });
    });

    post({ type: 'SANDBOX_READY' });
  </script>
  <style>
    html { font-family: Helvetica, Arial, sans-serif; }
    body { margin: 0; -webkit-font-smoothing: antialiased; }
    input, textarea, select, button { color: inherit; }
    ::placeholder { opacity: .5; }
  </style>
</head>
<body></body>
</html>`;
}

function extractPayload(htmlContent: string) {
  const isDark = /<meta\s+name=["']color-scheme["']\s+content=["']dark["']/i.test(htmlContent);
  const headMatch = htmlContent.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const linkTags: string[] = [];

  if (headMatch) {
    const links = headMatch[1].match(/<link[^>]*>/gi) || [];
    for (const tag of links) {
      const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
      const href = hrefMatch?.[1];
      if (href?.startsWith('https://fonts.googleapis.com/')) linkTags.push(href);
    }
  }

  const bodyClassMatch =
    htmlContent.match(/<body[^>]*class=["']([^"']*)["']/i);
  const bodyStyleMatch =
    htmlContent.match(/<body[^>]*style=["']([^"']*)["']/i);
  const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);

  const html = bodyMatch
    ? bodyMatch[1]
    : htmlContent
        .replace(/<\/?html[^>]*>/gi, '')
        .replace(/<head>[\s\S]*?<\/head>/gi, '')
        .replace(/<title>[^<]*<\/title>/gi, '')
        .replace(/<meta[^>]*>/gi, '')
        .replace(/<\/?body[^>]*>/gi, '');

  return {
    html,
    bodyClasses: bodyClassMatch?.[1] || '',
    bodyStyle:
      `background-color:${isDark ? '#111' : '#fff'};color:${isDark ? '#e8eaed' : '#1a1a1a'};${bodyStyleMatch?.[1] || ''}`,
    colorScheme: isDark ? 'dark' : 'light',
    linkTags,
  };
}

export function AbsGeneratedPreview({
  htmlContent,
  onNavigate,
  onAction,
}: AbsGeneratedPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<object | null>(null);
  const nonce = useMemo(
    () => `abs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    [],
  );
  const shellHtml = useMemo(() => createShellHtml(nonce), [nonce]);

  useEffect(() => {
    if (!htmlContent) return;
    const message = {
      __agentsamAbs: 1,
      nonce,
      type: 'CONTENT_UPDATE',
      ...extractPayload(htmlContent),
    };
    if (readyRef.current && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(message, '*');
    } else {
      pendingRef.current = message;
    }
  }, [htmlContent, nonce]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || data.__agentsamAbs !== 1 || data.nonce !== nonce) return;

      if (data.type === 'SANDBOX_READY') {
        readyRef.current = true;
        if (pendingRef.current) {
          iframeRef.current?.contentWindow?.postMessage(pendingRef.current, '*');
          pendingRef.current = null;
        }
        return;
      }

      if (data.type === 'NAVIGATE') {
        onNavigate(
          typeof data.url === 'string' ? data.url : '',
          typeof data.text === 'string' ? data.text : 'Navigate',
          Array.isArray(data.formState) ? data.formState : undefined,
        );
      }

      if (data.type === 'ACTION' && typeof data.intent === 'string') {
        onAction(
          data.intent,
          typeof data.payload === 'string' ? data.payload : undefined,
          Array.isArray(data.formState) ? data.formState : undefined,
        );
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [nonce, onNavigate, onAction]);

  return (
    <iframe
      ref={iframeRef}
      className="abs-generated-preview"
      srcDoc={shellHtml}
      sandbox="allow-scripts allow-forms"
      title="AgentSam generated preview"
    />
  );
}
