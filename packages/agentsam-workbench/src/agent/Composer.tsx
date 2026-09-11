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
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    textareaProps?.onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!streaming && !disabled && value.trim()) void onSend();
    }
  }

  return (
    <div className={containerClassName} data-agent-composer="">
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
        {streaming
          ? cancelControl ?? <button type="button" onClick={() => void onCancel?.()}>Stop</button>
          : sendControl ?? <button type="button" disabled={disabled || !value.trim()} onClick={() => void onSend()}>Send</button>}
      </div>
    </div>
  );
}
