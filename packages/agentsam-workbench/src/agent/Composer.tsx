import { useRef, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from 'react';

export interface AgentComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
  streaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  toolbarStart?: ReactNode;
  toolbarEnd?: ReactNode;
  sendControl?: ReactNode;
  cancelControl?: ReactNode;
  containerClassName?: string;
  inputClassName?: string;
  toolbarClassName?: string;
  textareaProps?: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'placeholder'>;
  maxHeight?: number;
}

/**
 * Presentation-only composer primitive.
 *
 * The host owns send/queue/cancel semantics. While streaming, a non-empty draft
 * can still be submitted (for example to a FIFO follow-up queue) and Stop stays
 * separately reachable.
 */
export function AgentComposer({
  value,
  onChange,
  onSend,
  onCancel,
  streaming = false,
  disabled = false,
  placeholder = 'Work with AgentSam',
  toolbarStart,
  toolbarEnd,
  sendControl,
  cancelControl,
  containerClassName,
  inputClassName,
  toolbarClassName,
  textareaProps,
  maxHeight = 220,
}: AgentComposerProps) {
  const areaRef = useRef<HTMLTextAreaElement>(null);

  function resize() {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = String(Math.min(el.scrollHeight, maxHeight)) + 'px';
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    textareaProps?.onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!disabled && value.trim()) void onSend();
    }
  }

  const defaultSend = <button type="button" disabled={disabled || !value.trim()} onClick={() => void onSend()}>Send</button>;
  const defaultStop = <button type="button" onClick={() => void onCancel?.()}>Stop</button>;

  return (
    <div className={containerClassName} data-agent-composer="" aria-busy={streaming || undefined}>
      <textarea
        {...textareaProps}
        ref={areaRef}
        value={value}
        rows={textareaProps?.rows ?? 1}
        placeholder={placeholder}
        disabled={disabled}
        className={inputClassName}
        aria-label={textareaProps?.['aria-label'] ?? placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          resize();
        }}
        onInput={(event) => {
          textareaProps?.onInput?.(event);
          resize();
        }}
        onKeyDown={onKeyDown}
      />
      <div className={toolbarClassName}>
        {toolbarStart}
        <span style={{ flex: 1 }} />
        {toolbarEnd}
        {streaming ? (
          <>
            {value.trim() ? (sendControl ?? defaultSend) : null}
            {cancelControl ?? defaultStop}
          </>
        ) : (sendControl ?? defaultSend)}
      </div>
    </div>
  );
}
