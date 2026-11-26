import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bold, Code, Eye, Heading1, Heading2, Heading3, Italic, List, ListOrdered,
  Quote, X,
} from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  saveDisabled: boolean;
  error?: string;
};

function inlineMarkdown(value: string): ReactNode[] {
  return value.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return <span key={index}>{part}</span>;
  });
}

function markdownPreview(markdown: string): ReactNode[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`code-${index}`}><code>{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const Tag = heading[1].length === 1 ? "h1" : heading[1].length === 2 ? "h2" : "h3";
      blocks.push(<Tag key={`heading-${index}`}>{inlineMarkdown(heading[2])}</Tag>);
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={`quote-${index}`}>{inlineMarkdown(quote.join(" "))}</blockquote>);
      continue;
    }
    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*+]\s+/.test(lines[index])) items.push(lines[index++].replace(/^[-*+]\s+/, ""));
      blocks.push(<ul key={`ul-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{inlineMarkdown(item)}</li>)}</ul>);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) items.push(lines[index++].replace(/^\d+\.\s+/, ""));
      blocks.push(<ol key={`ol-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{inlineMarkdown(item)}</li>)}</ol>);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,3}\s|>\s?|[-*+]\s+|\d+\.\s|```)/.test(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={`p-${index}`}>{inlineMarkdown(paragraph.join(" "))}</p>);
  }
  return blocks;
}

export function AgentInstructionsEditor({ open, title, value, onChange, onClose, onSave, saving, saveDisabled, error }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPreview(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  function wrapSelection(before: string, after = before) {
    const input = textareaRef.current;
    if (!input || preview) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = value.slice(start, end);
    const placeholder = selected || "text";
    const replacement = `${before}${placeholder}${after}`;
    const next = value.slice(0, start) + replacement + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + before.length, start + before.length + placeholder.length);
    });
  }

  function prefixLines(prefix: string) {
    const input = textareaRef.current;
    if (!input || preview) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const endBreak = value.indexOf("\n", end);
    const lineEnd = endBreak < 0 ? value.length : endBreak;
    const selectedLines = value.slice(lineStart, lineEnd).split("\n");
    const replacement = selectedLines.map((line) => `${prefix}${line.replace(/^(#{1,3}\s+|[-*+]\s+|\d+\.\s+|>\s?)/, "")}`).join("\n");
    const next = value.slice(0, lineStart) + replacement + value.slice(lineEnd);
    onChange(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(lineStart, lineStart + replacement.length);
    });
  }

  if (!open) return null;

  return (
    <div className="agent-instructions-canvas" role="dialog" aria-modal="true" aria-label={`Edit ${title}`}>
      <header className="agent-instructions-canvas__header">
        <button type="button" className="agent-instructions-canvas__icon" onClick={onClose} aria-label="Close document editor" title="Close">
          <X size={19} />
        </button>
        <div className="agent-instructions-canvas__file">
          <strong>{title}</strong>
          <span>Agent profile · draft changes</span>
        </div>
        <div className="agent-instructions-canvas__toolbar" role="toolbar" aria-label="Document formatting">
          <button type="button" onClick={() => wrapSelection("**")} disabled={preview} aria-label="Bold" title="Bold"><Bold size={17} /></button>
          <button type="button" onClick={() => wrapSelection("*")} disabled={preview} aria-label="Italic" title="Italic"><Italic size={17} /></button>
          <span className="agent-instructions-canvas__separator" />
          <button type="button" onClick={() => prefixLines("# ")} disabled={preview} aria-label="Heading 1" title="Heading 1"><Heading1 size={17} /></button>
          <button type="button" onClick={() => prefixLines("## ")} disabled={preview} aria-label="Heading 2" title="Heading 2"><Heading2 size={17} /></button>
          <button type="button" onClick={() => prefixLines("### ")} disabled={preview} aria-label="Heading 3" title="Heading 3"><Heading3 size={17} /></button>
          <span className="agent-instructions-canvas__separator" />
          <button type="button" onClick={() => prefixLines("- ")} disabled={preview} aria-label="Bulleted list" title="Bulleted list"><List size={17} /></button>
          <button type="button" onClick={() => prefixLines("1. ")} disabled={preview} aria-label="Numbered list" title="Numbered list"><ListOrdered size={17} /></button>
          <button type="button" onClick={() => prefixLines("> ")} disabled={preview} aria-label="Quote" title="Quote"><Quote size={17} /></button>
          <button type="button" onClick={() => wrapSelection("`")} disabled={preview} aria-label="Inline code" title="Inline code"><Code size={17} /></button>
        </div>
        <div className="agent-instructions-canvas__actions">
          <button type="button" className="agent-instructions-canvas__preview" onClick={() => setPreview((current) => !current)}>
            <Eye size={15} /> {preview ? "Edit" : "Preview"}
          </button>
          <button type="button" className="agent-instructions-canvas__save" onClick={onSave} disabled={saving || saveDisabled}>
            {saving ? "Saving…" : "Save agent"}
          </button>
        </div>
      </header>
      <main className="agent-instructions-canvas__scroll">
        <article className="agent-instructions-canvas__page">
          <p className="agent-instructions-canvas__note">
            About this document. These instructions define how this account-owned agent should approach its work. Changes remain in this profile draft until you select <strong>Save agent</strong>.
          </p>
          <h1>{title}</h1>
          <p className="agent-instructions-canvas__subtitle">Identity · responsibilities · operating rules</p>
          {error ? <p className="agent-instructions-canvas__error" role="alert">{error}</p> : null}
          {preview ? (
            <div className="agent-instructions-canvas__preview-content">{markdownPreview(value)}</div>
          ) : (
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              className="agent-instructions-canvas__editor"
              aria-label="Agent instructions document"
              spellCheck
              autoFocus
              placeholder="Describe the agent's role, responsibilities, working habits, boundaries and safeguards…"
            />
          )}
        </article>
      </main>
    </div>
  );
}
