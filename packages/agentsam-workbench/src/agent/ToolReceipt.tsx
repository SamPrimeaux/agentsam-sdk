import { useState, type ReactNode } from 'react';
import type { AgentToolCall } from '@inneranimalmedia/agentsam-contracts';

const ACTIVE = new Set(['queued', 'running', 'retrying', 'awaiting_input']);

export function AgentActivityLine({ label, active = false, icon, expanded, onToggle }: {
  label: string; active?: boolean; icon?: ReactNode; expanded?: boolean; onToggle?: () => void;
}) {
  const content = <>
    {icon ? <span className="as-activity-icon" aria-hidden="true">{icon}</span> : null}
    <span className="as-activity-label">{label}</span>
    {onToggle ? <svg className="as-activity-chevron" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d={expanded ? "m4 10 4-4 4 4" : "m4 6 4 4 4-4"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> : null}
  </>;
  return onToggle
    ? <button type="button" className="as-activity-line" data-active={active} aria-expanded={!!expanded} onClick={onToggle}>{content}</button>
    : <div className="as-activity-line" data-active={active} role={active ? "status" : undefined}>{content}</div>;
}

function preview(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 20000) + (value.length > 20000 ? '\n… Preview truncated' : '');
  try {
    const text = JSON.stringify(value, (key, item) => /^(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|cookie|client[_-]?secret)$/i.test(key) ? '[redacted]' : item, 2) ?? '';
    return text.slice(0, 20000) + (text.length > 20000 ? '\n… Preview truncated' : '');
  } catch { return 'Preview unavailable'; }
}

function SyntaxPreview({ value, label }: { value: unknown; label: string }) {
  const source = preview(value);
  // Highlight JSON tokens without injecting HTML. Plain text stays plain text.
  const parts = source.split(/("(?:\\.|[^"\\])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/g);
  return <div className="as-tool-preview-section">
    <div className="as-tool-preview-label">{label}</div>
    <pre tabIndex={0}><code>{parts.map((part, index) => <span key={index} className={/^"/.test(part) ? /:\s*$/.test(part) ? 'as-syntax-key' : 'as-syntax-string' : /^(?:true|false|null|-?\d)/.test(part) ? 'as-syntax-literal' : undefined}>{part}</span>)}</code></pre>
  </div>;
}

export function ToolReceipt({ call, className, icon, label }: { call: AgentToolCall; className?: string; icon?: ReactNode; label?: string }) {
  const [expanded, setExpanded] = useState(false);
  const active = ACTIVE.has(call.status);
  const hasPreview = call.input !== undefined || call.output !== undefined || !!call.error;
  const title = label || (typeof call.metadata?.label === 'string' ? call.metadata.label : call.name);
  const suffix = ['failed','cancelled','timed_out','awaiting_input','retrying'].includes(call.status) ? ' · ' + call.status.replaceAll('_', ' ') : '';
  return <div className={className} data-tool-status={call.status} data-tool-name={call.name}>
    <AgentActivityLine label={title + suffix} active={active} icon={icon} expanded={expanded} onToggle={hasPreview ? () => setExpanded(v => !v) : undefined}/>
    {expanded && hasPreview ? <div className="as-tool-preview">
      {call.input !== undefined ? <SyntaxPreview label="Input" value={call.input}/> : null}
      {call.output !== undefined ? <SyntaxPreview label="Output" value={call.output}/> : null}
      {call.error ? <SyntaxPreview label="Error" value={call.error}/> : null}
    </div> : null}
  </div>;
}
