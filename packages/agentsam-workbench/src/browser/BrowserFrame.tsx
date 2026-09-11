import { useEffect, useState, type FormEvent } from 'react';

export interface BrowserFrameProps {
  url: string;
  srcDoc?: string | null;
  onNavigate?: (url: string) => void;
  className?: string;
  toolbarClassName?: string;
  inputClassName?: string;
  iframeClassName?: string;
}

export function normalizeBrowserInput(raw: string) {
  const value = raw.trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.includes(' ') || !value.includes('.')) return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
  return `https://${value}`;
}

export function BrowserFrame({ url, srcDoc, onNavigate, className, toolbarClassName, inputClassName, iframeClassName }: BrowserFrameProps) {
  const [draft, setDraft] = useState(url);
  useEffect(() => setDraft(url), [url]);
  function submit(event: FormEvent) {
    event.preventDefault();
    const next = normalizeBrowserInput(draft);
    if (next) onNavigate?.(next);
  }
  return (
    <div className={className} data-browser-frame="">
      <form className={toolbarClassName} onSubmit={submit}>
        <input className={inputClassName} value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Browser address" />
      </form>
      <iframe className={iframeClassName} title={url || 'Browser preview'} src={srcDoc ? undefined : url} srcDoc={srcDoc ?? undefined} />
    </div>
  );
}
